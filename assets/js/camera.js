import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CAM_DIST, TOP_H, FRUSTUM } from './config.js';
import { camera, canvas } from './scene.js';
import * as sceneModule from './scene.js';
import { audioCtx, bgMusic } from './audio.js';

// Start music on first user interaction (scroll or touch)
let _musicStarted = false;
function startMusic() {
  if (_musicStarted) return;
  _musicStarted = true;
  audioCtx.resume();
  bgMusic.play().catch(() => {});
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
export let scrollTarget = { y: START_Y, angle: 0 };
export let scrollCurrent = { y: START_Y, angle: 0 };
export const ORBIT_RADIUS = 12;

// Intro animation — twirl around scaffold into position
const INTRO_DURATION = 3.5;
const INTRO_START_Y = START_Y + 5;
const INTRO_START_ANGLE = -Math.PI * 2;
let introElapsed = 0;
let introActive = true;

camera.position.set(
  Math.cos(INTRO_START_ANGLE) * ORBIT_RADIUS,
  INTRO_START_Y + 4,
  Math.sin(INTRO_START_ANGLE) * ORBIT_RADIUS
);
controls.target.set(0, INTRO_START_Y + 1, 0);
controls.update();
export const SCROLL_LERP = 0.06;

export let virtualScroll = START_Y;
let lastRawScroll = 0;
export const SCROLL_SENSITIVITY = 0.7;
export let wrapFogBoost = 0;

export function onScroll() {
  startMusic();
  const maxScroll = document.body.scrollHeight - window.innerHeight;
  const rawScroll = window.scrollY;
  const rawFrac = rawScroll / maxScroll;

  const deltaFrac = rawFrac - lastRawScroll / maxScroll;
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

// Touch-based scroll for mobile (OrbitControls eats touch → native scroll never fires)
controls.touches = { ONE: null, TWO: null }; // disable OrbitControls touch
let lastTouchY = null;

canvas.addEventListener('touchstart', (e) => {
  startMusic();
  if (e.touches.length === 1) lastTouchY = e.touches[0].clientY;
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 1 && lastTouchY !== null) {
    const touchY = e.touches[0].clientY;
    const deltaPixels = lastTouchY - touchY;
    lastTouchY = touchY;
    const deltaFrac = deltaPixels / window.innerHeight;
    virtualScroll += deltaFrac * TOP_H * SCROLL_SENSITIVITY * 0.5;
    virtualScroll = ((virtualScroll % TOP_H) + TOP_H) % TOP_H;
    scrollTarget.y = virtualScroll;
    scrollTarget.angle += deltaFrac * Math.PI * 3 * SCROLL_SENSITIVITY * 0.5;
  }
}, { passive: true });

canvas.addEventListener('touchend', () => { lastTouchY = null; }, { passive: true });

// =====================================================
// CAMERA UPDATE (scroll-driven orbit)
// =====================================================
export function setControlsCamera(cam) {
  controls.object = cam;
}

// Ease-out cubic
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

export function updateCam(dt) {
  const cam = sceneModule.camera;

  // Intro descent animation
  if (introActive) {
    introElapsed += dt;
    const t = Math.min(introElapsed / INTRO_DURATION, 1);
    const e = easeOut(t);

    const introAngle = INTRO_START_ANGLE + e * (0 - INTRO_START_ANGLE);
    const introY = INTRO_START_Y + e * (START_Y - INTRO_START_Y);
    const cx = Math.cos(introAngle) * ORBIT_RADIUS;
    const cz = Math.sin(introAngle) * ORBIT_RADIUS;

    cam.position.set(cx, introY + 4, cz);
    controls.target.set(0, introY + 1, 0);
    controls.update();

    if (t >= 1) {
      introActive = false;
      scrollCurrent.y = START_Y;
      scrollCurrent.angle = 0;
    }
    return;
  }

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
