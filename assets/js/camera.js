import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CAM_DIST, TOP_H, FRUSTUM } from './config.js';
import { camera, canvas } from './scene.js';
import * as sceneModule from './scene.js';

// =====================================================
// SCROLL-BASED CAMERA (orbit + climb)
// =====================================================
export const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.enableZoom = false;
controls.maxPolarAngle = Math.PI * 0.85;
controls.minPolarAngle = 0.2;
controls.autoRotate = false;

// Scroll state — start above fade zone
const START_Y = 20;
export let scrollTarget = { y: START_Y, angle: 0 };
export let scrollCurrent = { y: START_Y, angle: 0 };
export const ORBIT_RADIUS = 12;

camera.position.set(ORBIT_RADIUS, START_Y + 4, 0);
controls.target.set(0, START_Y + 1, 0);
controls.update();
export const SCROLL_LERP = 0.06;

export let virtualScroll = START_Y;
let lastRawScroll = 0;
export const SCROLL_SENSITIVITY = 0.7;
export const FADE_ZONE = 14;
const fadeEl = document.getElementById('scroll-fade');

export function onScroll() {
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
// Start scroll at middle
window.scrollTo({ top: (document.body.scrollHeight - window.innerHeight) * 0.5, behavior: 'instant' });
lastRawScroll = window.scrollY;
onScroll();

// Touch-based scroll for mobile (OrbitControls eats touch → native scroll never fires)
controls.touches = { ONE: null, TWO: null }; // disable OrbitControls touch
let lastTouchY = null;

canvas.addEventListener('touchstart', (e) => {
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

let fadeOpacity = 0;

export function updateCam(dt) {
  const smooth = 1 - Math.exp(-SCROLL_LERP * 60 * dt);
  let dy = scrollTarget.y - scrollCurrent.y;
  if (dy > TOP_H / 2) dy -= TOP_H;
  if (dy < -TOP_H / 2) dy += TOP_H;
  scrollCurrent.y += dy * smooth;
  scrollCurrent.y = ((scrollCurrent.y % TOP_H) + TOP_H) % TOP_H;
  scrollCurrent.angle += (scrollTarget.angle - scrollCurrent.angle) * smooth;

  // Fade synced to actual camera height — only when actively scrolling near boundary
  const distToTop = TOP_H - scrollCurrent.y;
  const distToBottom = scrollCurrent.y;
  const nearestBoundary = Math.min(distToTop, distToBottom);
  const moving = Math.abs(dy) > 0.15;
  const t = Math.max(0, 1 - nearestBoundary / FADE_ZONE);
  const targetOp = (moving && t > 0) ? t * t * (3 - 2 * t) : 0;  // smoothstep
  fadeOpacity += (targetOp - fadeOpacity) * Math.min(1, dt * 14);
  fadeEl.style.opacity = fadeOpacity < 0.01 ? 0 : fadeOpacity;

  const cx = Math.cos(scrollCurrent.angle) * ORBIT_RADIUS;
  const cz = Math.sin(scrollCurrent.angle) * ORBIT_RADIUS;
  const cy = scrollCurrent.y + 4;

  const cam = sceneModule.camera;
  cam.position.set(cx, cy, cz);
  controls.target.set(0, scrollCurrent.y + 1, 0);
  controls.update();
}
