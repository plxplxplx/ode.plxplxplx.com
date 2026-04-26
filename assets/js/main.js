import * as THREE from 'three';

// Config (must be first)
import { QUALITY, TOTAL_W, FRUSTUM, TOP_H, STAGES } from './config.js';

// Scene setup
import { renderer, scene, keyLight, sunMesh, sunOccMesh, sunLight, buildPlane, buildPlaneBottom } from './scene.js';
import * as sceneModule from './scene.js';

// Materials (loaded by scaffold/environment)
import './materials.js';

// Structure
import { glassPanels, scaffoldReady, mergeScaffoldForMobile } from './scaffold.js';

// Environment (fog, floor, vines, shrubs, stage glow)
import { updateEnvironment } from './environment.js';

// Zones & typography
import { sideTexts, updateZones, updateSideTexts } from './zones.js';

// Floating cards
import { cards, CARD_OPTS, cardGroup, cardRaycaster, cardPointer, hoveredCard, setHoveredCard } from './cards.js';

// Effects (grid lights, particles, fireflies)
import { updateEffects } from './effects.js';

// Scroll banners
import { bannerGroup, BANNERS } from './banners.js';

// CSS3D overlay (link hit-boxes on banners)
import { css3dRenderer } from './css3d.js';

// Artist info panel (opened from cards & glass panels)
import { openArtistPanel, closeArtistPanel } from './artist-panel.js';

// Camera & scroll
import { scrollCurrent, scrollTarget, updateCam, wrapFogBoost, panelZoomed, startPanelZoom, exitPanelZoom, navigatePanelZoom } from './camera.js';

// Audio
import { updateAudio } from './audio.js';

// Post-processing
import { composer, godRaysPass, renderOcclusion } from './postprocessing.js';

// GUI (must be last — reads from all modules)
import { params, updateFPS } from './gui.js';

// Loader
import { loaderReady, loadProgress } from './loader.js';

// Canvas ref for cursor
import { canvas } from './scene.js';

// Move ribbon text into the main scene so it gets depth-occluded by the scaffold
for (const st of sideTexts) scene.add(st.mesh);

// Add scroll banners to the scene
scene.add(bannerGroup);

// =====================================================
// PANEL ZOOM — click image to fly in, click/esc to exit
// =====================================================
const _panelRC = new THREE.Raycaster();
const _panelPtr = new THREE.Vector2();
let _currentPanelIdx = -1;

function getImagePanels() {
  return glassPanels.filter(m => m.userData.imageMode);
}

function navigatePanel(dir) {
  if (!panelZoomed) return;
  const panels = getImagePanels();
  if (panels.length === 0) return;
  _currentPanelIdx = ((_currentPanelIdx + dir) % panels.length + panels.length) % panels.length;
  const next = panels[_currentPanelIdx];
  navigatePanelZoom(next);
  if (next.userData.artist) openArtistPanel(next.userData.artist);
}

canvas.addEventListener('click', (e) => {
  if (panelZoomed) { exitPanelZoom(); closeArtistPanel(); return; }
  if (!params.glassPanelImages) return;
  _panelPtr.x = (e.clientX / window.innerWidth) * 2 - 1;
  _panelPtr.y = -(e.clientY / window.innerHeight) * 2 + 1;
  _panelRC.setFromCamera(_panelPtr, sceneModule.camera);
  const hits = _panelRC.intersectObjects(glassPanels, false);
  if (hits.length > 0 && hits[0].object.userData.imageMode) {
    const panels = getImagePanels();
    _currentPanelIdx = panels.indexOf(hits[0].object);
    startPanelZoom(hits[0].object);
    if (hits[0].object.userData.artist) openArtistPanel(hits[0].object.userData.artist);
  }
});

// =====================================================
// SCAFFOLD SCREEN-SPACE WIDTH → CSS variable
// =====================================================
function updateScaffoldVar() {
  const aspect = window.innerWidth / window.innerHeight;
  const visibleW = FRUSTUM * aspect;
  const scaffScreenFrac = TOTAL_W / visibleW; // fraction of screen the scaffold occupies
  const scaffLeftPx = (0.5 - scaffScreenFrac / 2) * window.innerWidth;
  document.documentElement.style.setProperty('--scaffold-left', `${scaffLeftPx}px`);
}
updateScaffoldVar();
window.addEventListener('resize', updateScaffoldVar, { passive: true });

// Nav buttons — scroll to relevant stage banners
// Snap angle to nearest equivalent of FRONT_ANGLE to avoid full spins
const FRONT_ANGLE = Math.PI * 1.5;
function snapToFront(currentAngle) {
  const turns = Math.round((currentAngle - FRONT_ANGLE) / (Math.PI * 2));
  return FRONT_ANGLE + turns * Math.PI * 2;
}
const lineupBtn = document.getElementById('lineup-btn');
const dinnerBtn = document.getElementById('dinner-btn');

function scrollToBanner(index) {
  const mesh = bannerGroup.children[index];
  if (!mesh) return;
  const targetY = mesh.position.y;
  let dy = targetY - scrollCurrent.y;
  if (dy < 0) dy += TOP_H;
  scrollTarget.y = scrollCurrent.y + dy;
  scrollTarget.angle = snapToFront(scrollTarget.angle);
}

if (lineupBtn) lineupBtn.addEventListener('click', () => scrollToBanner(1));
if (dinnerBtn) dinnerBtn.addEventListener('click', () => scrollToBanner(2));

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (panelZoomed) exitPanelZoom();
  }
});

const _closeBtn = document.getElementById('panel-close');
if (_closeBtn) _closeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  exitPanelZoom();
  closeArtistPanel();
});

const _prevBtn = document.getElementById('panel-prev');
const _nextBtn = document.getElementById('panel-next');
if (_prevBtn) _prevBtn.addEventListener('click', (e) => { e.stopPropagation(); navigatePanel(-1); });
if (_nextBtn) _nextBtn.addEventListener('click', (e) => { e.stopPropagation(); navigatePanel(1); });

// =====================================================
// GAME LOOP
// =====================================================
const clock = new THREE.Clock();
let _frame = 0;
// Build-reveal state: the scaffold grows from y=0 → TOP_H during loading,
// then eases past TOP_H to fully disable clipping.
let _buildReveal = 0;
let _buildTarget = 0;     // driven by loadProgress, then snapped open
let _buildDone = false;
const BUILD_OPEN = TOP_H + 40; // well past the top — effectively no clipping

// Reusable objects — avoids per-frame allocations / GC pressure
const _sunScreen = new THREE.Vector3();
const _cardMeshes = cards.map(c => c.mesh);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.getElapsedTime();

  updateCam(dt);

  // Build-plane reveal — smoothly grows the scaffold as assets load
  if (!_buildDone) {
    // Update target from live loadProgress unless we've entered the final ease-open
    if (_buildTarget < BUILD_OPEN) _buildTarget = loadProgress * TOP_H;
    _buildReveal += (_buildTarget - _buildReveal) * 0.08;
    buildPlane.constant = _buildReveal;
    buildPlaneBottom.constant = 99999;
    // Once we've eased close enough to the fully-open value, snap off
    if (_buildTarget >= BUILD_OPEN && _buildReveal > TOP_H) {
      _buildDone = true;
      if (!params.buildMode) { buildPlane.constant = 99999; buildPlaneBottom.constant = 99999; }
    }
  } else if (params.buildMode) {
    // Build-as-you-scroll — update clipping planes (top + bottom)
    buildPlane.constant = scrollCurrent.y + params.buildOffset;
    buildPlaneBottom.constant = -(scrollCurrent.y - params.buildOffsetBottom);
  }

  const camH = scrollCurrent.y;
  updateZones(camH, scene, wrapFogBoost);

  // Per-stage audio effects (throttle on mobile)
  if (QUALITY.cardRaycast || (_frame & 3) === 0) updateAudio(camH);

  updateSideTexts(dt, t, camH, params);
  updateEnvironment(dt, t, camH, params);

  // Key light tracks scroll height
  keyLight.position.set(params.keyLightX, scrollCurrent.y + params.keyLightY, params.keyLightZ);
  keyLight.target.position.set(0, scrollCurrent.y, 0);
  keyLight.target.updateMatrixWorld();

  updateEffects(dt, t, camH, params);

  // Arc image cards — slow group rotation + shader-driven wave
  cardGroup.rotation.y += CARD_OPTS.orbitSpeed * dt;
  if (QUALITY.cardRaycast) {
    const doRaycast = (Math.round(t * 60) % 3 === 0);
    if (doRaycast) {
      cardRaycaster.setFromCamera(cardPointer, sceneModule.camera);
      const hits = cardRaycaster.intersectObjects(_cardMeshes, false);
      const prevHovered = hoveredCard;
      const newHovered = hits.length > 0 ? cards.find(c => c.mesh === hits[0].object) : null;
      setHoveredCard(newHovered);
      if (prevHovered && prevHovered !== newHovered) prevHovered.hovered = false;
      if (newHovered) newHovered.hovered = true;
      canvas.style.cursor = newHovered ? 'pointer' : '';
    }
  }
  for (const card of cards) { card.mat.uniforms.time.value = t; }

  // Sun position — always behind scaffold relative to camera
  {
    const cam = sceneModule.camera;
    const camAngle = Math.atan2(cam.position.z, cam.position.x);
    const sunAngle = camAngle + Math.PI + params.sunAngleOffset;
    const sx = Math.cos(sunAngle) * params.sunRadius;
    const sz = Math.sin(sunAngle) * params.sunRadius;
    const sy = scrollCurrent.y + params.sunHeight;
    sunMesh.position.set(sx, sy, sz);
    sunOccMesh.position.set(sx, sy, sz);
    sunLight.position.set(sx, sy, sz);
    sunMesh.visible = false;
  }

  // God rays — project sun to screen space
  _sunScreen.copy(sunMesh.position).project(sceneModule.camera);
  godRaysPass.uniforms.lightPosition.value.set(
    (_sunScreen.x + 1) * 0.5,
    (_sunScreen.y + 1) * 0.5
  );

  ++_frame;
  renderOcclusion(sceneModule.camera);

  // On mobile all post-processing passes are disabled — skip composer overhead
  if (QUALITY.bloom || QUALITY.filmGrain || QUALITY.vignette || QUALITY.colorGrade) {
    composer.render();
  } else {
    renderer.render(scene, sceneModule.camera);
  }

  css3dRenderer.render(scene, sceneModule.camera);

  updateFPS();
}

// =====================================================
// START
// =====================================================
// Start rendering as soon as the scaffold geometry is ready — the tower
// will grow via the buildPlane as remaining assets stream in.
scaffoldReady.then(() => {
  mergeScaffoldForMobile();
  renderer.compile(scene, sceneModule.camera);
  renderer.render(scene, sceneModule.camera);
  animate();
});

// Once all assets are loaded, ease the clipping plane past the top and reveal the UI
loaderReady.then(() => {
  _buildTarget = BUILD_OPEN;
  document.getElementById('loader').classList.add('loaded');
  document.body.classList.add('site-loaded');
});
