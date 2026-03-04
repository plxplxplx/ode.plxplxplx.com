import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CAM_DIST, TOP_H, FRUSTUM } from './config.js';
import { camera, canvas } from './scene.js';
import * as sceneModule from './scene.js';
import { audioCtx, playStems } from './audio.js';
import { IMG_FILES } from './cards.js';
import { setPostCamera } from './postprocessing.js';

// Start music on any user interaction
let _musicStarted = false;
function startMusic() {
  if (_musicStarted) return;
  _musicStarted = true;
  if (audioCtx) audioCtx.resume();
  playStems().then(() => {
    for (const evt of _musicEvents) window.removeEventListener(evt, startMusic);
  }).catch(() => { _musicStarted = false; });
}
const _musicEvents = ['click', 'touchend', 'pointerdown', 'keydown'];
for (const evt of _musicEvents) {
  window.addEventListener(evt, startMusic, { passive: true });
}

// =====================================================
// SCROLL-BASED CAMERA (orbit + climb)
// =====================================================
export const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.enableZoom = false;
controls.enableRotate = false;
controls.maxPolarAngle = Math.PI * 0.85;
controls.minPolarAngle = 0.2;
controls.autoRotate = false;

// Scroll state — start above fade zone
const START_Y = 20;
const INITIAL_ANGLE = Math.PI * 0.15;
export let scrollTarget = { y: START_Y, angle: INITIAL_ANGLE };
export let scrollCurrent = { y: START_Y, angle: INITIAL_ANGLE };
export const ORBIT_RADIUS = 12;

// Auto-scroll — gentle upward drift, stops on user interaction
const AUTO_SCROLL_SPEED = 0.1;   // units per second
const AUTO_ANGLE_SPEED = 0.03;  // radians per second
let autoScrollActive = true;

// Start camera at orbit position, angled slightly
camera.position.set(
  Math.cos(INITIAL_ANGLE) * ORBIT_RADIUS,
  START_Y + 4,
  Math.sin(INITIAL_ANGLE) * ORBIT_RADIUS
);
controls.target.set(0, START_Y + 1, 0);
controls.update();
export const SCROLL_LERP = 0.06;

export let virtualScroll = START_Y;
let lastRawScroll = 0;
export const SCROLL_SENSITIVITY = 0.7;
const MAX_DELTA_FRAC = 0.04; // cap per-event scroll jump (prevents lag spikes from fast swipes)
export let wrapFogBoost = 0;

// Panel zoom state
export let panelZoomed = false;
let _panelZoomGoal = 0;     // 0 = normal, 1 = zoomed
let _panelZoomLerp = 0;     // smoothed interpolation factor
let _panelImgFile = '';      // current panel's filename for caption
let _panelCaptionShown = false;
const PANEL_ZOOM_FRUSTUM = 3.5; // tight ortho zoom on the panel
const _panelFromCamPos = new THREE.Vector3();  // animation "from" position (changes on navigate)
const _panelFromTarget = new THREE.Vector3();
let _panelFromFrustum = FRUSTUM;
const _panelOriginCamPos = new THREE.Vector3(); // original orbit view (for exit)
const _panelOriginTarget = new THREE.Vector3();
let _panelOriginFrustum = FRUSTUM;
const _panelTargetCamPos = new THREE.Vector3();
const _panelTargetLookAt = new THREE.Vector3();

let _userScrolled = false;
export function onScroll() {
  if (_userScrolled) {
    startMusic();
  }
  if (panelZoomed) { exitPanelZoom(); return; }
  const maxScroll = document.body.scrollHeight - window.innerHeight;
  const rawScroll = window.scrollY;
  const rawFrac = rawScroll / maxScroll;

  const deltaFrac = Math.max(-MAX_DELTA_FRAC, Math.min(MAX_DELTA_FRAC, rawFrac - lastRawScroll / maxScroll));
  lastRawScroll = rawScroll;

  virtualScroll += deltaFrac * TOP_H * SCROLL_SENSITIVITY;
  virtualScroll = ((virtualScroll % TOP_H) + TOP_H) % TOP_H;

  if (rawFrac > 0.85 || rawFrac < 0.15) {
    const midY = maxScroll * 0.5;
    lastRawScroll = midY;
    window.scrollTo({ top: midY, behavior: 'instant' });
  }

  scrollTarget.y = virtualScroll;
  scrollTarget.angle += deltaFrac * Math.PI * 3 * SCROLL_SENSITIVITY;
}
window.addEventListener('scroll', onScroll, { passive: true });
// Prevent browser from restoring old scroll position on refresh
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
// Start scroll at middle
window.scrollTo({ top: (document.body.scrollHeight - window.innerHeight) * 0.5, behavior: 'instant' });
lastRawScroll = window.scrollY;
onScroll();
// Delay flag so async scroll events from scrollTo don't kill auto-scroll
requestAnimationFrame(() => { _userScrolled = true; });

// Touch-based scroll for mobile (OrbitControls eats touch → native scroll never fires)
controls.touches = { ONE: null, TWO: null }; // disable OrbitControls touch
let lastTouchY = null;

canvas.addEventListener('touchstart', (e) => {
  startMusic();
  if (e.touches.length === 1) lastTouchY = e.touches[0].clientY;
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
  if (panelZoomed) { exitPanelZoom(); return; }
  if (e.touches.length === 1 && lastTouchY !== null) {
    const touchY = e.touches[0].clientY;
    const deltaPixels = lastTouchY - touchY;
    lastTouchY = touchY;
    const deltaFrac = Math.max(-MAX_DELTA_FRAC, Math.min(MAX_DELTA_FRAC, deltaPixels / window.innerHeight));
    virtualScroll += deltaFrac * TOP_H * SCROLL_SENSITIVITY * 0.5;
    virtualScroll = ((virtualScroll % TOP_H) + TOP_H) % TOP_H;
    scrollTarget.y = virtualScroll;
    scrollTarget.angle += deltaFrac * Math.PI * 3 * SCROLL_SENSITIVITY * 0.5;
  }
}, { passive: true });

canvas.addEventListener('touchend', () => { lastTouchY = null; }, { passive: true });

// =====================================================
// PANEL ZOOM (click image → fly in)
// =====================================================
const _panelNormal = new THREE.Vector3();
const _camToPanel = new THREE.Vector3();
const _panelWorldPos = new THREE.Vector3();

const PANEL_Y_OFFSET = 0.8; // shift view up so image sits below the heading
function _computePanelGoal(panelMesh, cam) {
  panelMesh.getWorldPosition(_panelWorldPos);
  _panelTargetLookAt.copy(_panelWorldPos);
  _panelTargetLookAt.y += PANEL_Y_OFFSET;
  _panelNormal.set(0, 0, -1).applyQuaternion(panelMesh.quaternion);
  _panelTargetCamPos.copy(_panelWorldPos).addScaledVector(_panelNormal, ORBIT_RADIUS);
  _panelTargetCamPos.y += PANEL_Y_OFFSET;
}

export function startPanelZoom(panelMesh) {
  if (panelZoomed) return;

  const cam = sceneModule.camera;
  _panelOriginCamPos.copy(cam.position);
  _panelOriginTarget.copy(controls.target);
  _panelOriginFrustum = (cam.top - cam.bottom) || FRUSTUM;
  _panelFromCamPos.copy(cam.position);
  _panelFromTarget.copy(controls.target);
  _panelFromFrustum = _panelOriginFrustum;

  _computePanelGoal(panelMesh, cam);

  _panelZoomLerp = 0;
  _panelZoomGoal = 1;
  panelZoomed = true;

  _showPanelUI(panelMesh);
}

export function navigatePanelZoom(panelMesh) {
  if (!panelZoomed) return;

  const cam = sceneModule.camera;
  _panelFromCamPos.copy(cam.position);
  _panelFromTarget.copy(controls.target);
  _panelFromFrustum = PANEL_ZOOM_FRUSTUM;

  _computePanelGoal(panelMesh, cam);

  _panelZoomLerp = 0;
  _panelZoomGoal = 1;

  _showPanelUI(panelMesh);
}

function _showPanelUI(panelMesh) {
  // Hide caption until zoom animation settles
  _panelImgFile = (panelMesh.userData.imgFile || '');
  _panelCaptionShown = false;
  const cap = document.getElementById('panel-caption');
  if (cap) cap.style.display = 'none';
}

function _hidePanelUI() {
  for (const id of ['panel-close', 'panel-prev', 'panel-next', 'panel-caption']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
}

export function exitPanelZoom() {
  if (!panelZoomed || _panelZoomGoal === 0) return;
  // Animate from current position back to original orbit view
  const cam = sceneModule.camera;
  _panelFromCamPos.copy(cam.position);
  _panelFromTarget.copy(controls.target);
  _panelFromFrustum = PANEL_ZOOM_FRUSTUM;
  _panelTargetCamPos.copy(_panelOriginCamPos);
  _panelTargetLookAt.copy(_panelOriginTarget);
  _panelZoomLerp = 0;
  _panelZoomGoal = 0;
  _hidePanelUI();
  document.getElementById('viewport').focus();
}

// Block arrow/space keys from scrolling the page while viewing an image
window.addEventListener('keydown', (e) => {
  if (!panelZoomed) return;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
  if (e.code === 'Escape') exitPanelZoom();
});

// =====================================================
// CAMERA UPDATE (scroll-driven orbit)
// =====================================================
export function setControlsCamera(cam) {
  controls.object = cam;
}

export function updateCam(dt) {
  const cam = sceneModule.camera;

  // Panel zoom — smooth fly-in / navigate / fly-out
  if (panelZoomed) {
    const speed = 4;
    const target = 1; // always animate toward 1 (fully arrived)
    _panelZoomLerp += (target - _panelZoomLerp) * (1 - Math.exp(-speed * dt));

    let arrived = false;
    if (_panelZoomLerp > 0.998) {
      _panelZoomLerp = 1;
      arrived = true;
    }

    cam.position.lerpVectors(_panelFromCamPos, _panelTargetCamPos, _panelZoomLerp);
    controls.target.lerpVectors(_panelFromTarget, _panelTargetLookAt, _panelZoomLerp);

    // Animate ortho frustum
    const targetFrustum = _panelZoomGoal === 0 ? _panelOriginFrustum : PANEL_ZOOM_FRUSTUM;
    const f = THREE.MathUtils.lerp(_panelFromFrustum, targetFrustum, _panelZoomLerp);
    const a = window.innerWidth / window.innerHeight;
    cam.left = -f * a / 2; cam.right = f * a / 2;
    cam.top = f / 2; cam.bottom = -f / 2;
    cam.updateProjectionMatrix();

    controls.update();

    if (arrived && _panelZoomGoal === 0) {
      panelZoomed = false;
    }
    return;
  }

  // Auto-scroll drift
  if (autoScrollActive) {
    scrollTarget.y += AUTO_SCROLL_SPEED * dt;
    scrollTarget.y = ((scrollTarget.y % TOP_H) + TOP_H) % TOP_H;
    scrollTarget.angle += AUTO_ANGLE_SPEED * dt;
    virtualScroll = scrollTarget.y;
  }

  // Normal scroll-orbit camera
  const smooth = 1 - Math.exp(-SCROLL_LERP * 60 * dt);
  let dy = scrollTarget.y - scrollCurrent.y;
  if (dy > TOP_H / 2) dy -= TOP_H;
  if (dy < -TOP_H / 2) dy += TOP_H;
  scrollCurrent.y += dy * smooth;
  scrollCurrent.y = ((scrollCurrent.y % TOP_H) + TOP_H) % TOP_H;
  scrollCurrent.angle += (scrollTarget.angle - scrollCurrent.angle) * smooth;

  // Fog density boost during scroll-wrap — hides seam naturally
  const rawDy = scrollTarget.y - scrollCurrent.y;
  const isWrapping = Math.abs(rawDy) > TOP_H / 2;
  const boostTarget = isWrapping ? 0.18 : 0;
  wrapFogBoost += (boostTarget - wrapFogBoost) * Math.min(1, dt * 6);

  const cx = Math.cos(scrollCurrent.angle) * ORBIT_RADIUS;
  const cz = Math.sin(scrollCurrent.angle) * ORBIT_RADIUS;
  const cy = scrollCurrent.y + 4;

  cam.position.set(cx, cy, cz);
  controls.target.set(0, scrollCurrent.y + 1, 0);
  controls.update();
}
