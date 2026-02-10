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

// Scroll state
export let scrollTarget = { y: 0, angle: 0 };
export let scrollCurrent = { y: 0, angle: 0 };
export const ORBIT_RADIUS = 12;

// Start on the first floor at orbit distance
camera.position.set(ORBIT_RADIUS, 4, 0);
controls.target.set(0, 1, 0);
controls.update();
export const SCROLL_LERP = 0.04;

export let virtualScroll = 0;
let lastRawScroll = 0;
export const SCROLL_SENSITIVITY = 1.2;
export const FADE_ZONE = 6;
const fadeEl = document.getElementById('scroll-fade');
let isFading = false;
let fadeTimer = null;

export function onScroll() {
  const maxScroll = document.body.scrollHeight - window.innerHeight;
  const rawScroll = window.scrollY;
  const rawFrac = rawScroll / maxScroll;

  const deltaFrac = rawFrac - lastRawScroll / maxScroll;
  lastRawScroll = rawScroll;

  const prevScroll = virtualScroll;
  virtualScroll += deltaFrac * TOP_H * SCROLL_SENSITIVITY;

  const didWrap = (prevScroll > TOP_H - FADE_ZONE && virtualScroll > TOP_H) ||
                  (prevScroll < FADE_ZONE && virtualScroll < 0);

  virtualScroll = ((virtualScroll % TOP_H) + TOP_H) % TOP_H;

  if (didWrap && !isFading) {
    isFading = true;
    fadeEl.classList.add('active');
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      fadeEl.classList.remove('active');
      setTimeout(() => { isFading = false; }, 400);
    }, 350);
  }

  if (rawFrac > 0.85 || rawFrac < 0.15) {
    const midY = maxScroll * 0.5;
    lastRawScroll = midY;
    window.scrollTo({ top: midY, behavior: 'instant' });
  }

  const distToTop = TOP_H - virtualScroll;
  const distToBottom = virtualScroll;
  const nearestBoundary = Math.min(distToTop, distToBottom);
  if (nearestBoundary < FADE_ZONE && !isFading) {
    const fade = 1 - nearestBoundary / FADE_ZONE;
    fadeEl.style.opacity = fade * 0.7;
  } else if (!isFading) {
    fadeEl.style.opacity = 0;
  }

  scrollTarget.y = virtualScroll;
  scrollTarget.angle += deltaFrac * Math.PI * 3 * SCROLL_SENSITIVITY;
}
window.addEventListener('scroll', onScroll, { passive: true });
// Start scroll at middle
window.scrollTo({ top: (document.body.scrollHeight - window.innerHeight) * 0.5, behavior: 'instant' });
lastRawScroll = window.scrollY;
onScroll();

// =====================================================
// CAMERA UPDATE (scroll-driven orbit)
// =====================================================
export function setControlsCamera(cam) {
  controls.object = cam;
}

export function updateCam(dt) {
  const smooth = 1 - Math.exp(-SCROLL_LERP * 60 * dt);
  let dy = scrollTarget.y - scrollCurrent.y;
  if (dy > TOP_H / 2) dy -= TOP_H;
  if (dy < -TOP_H / 2) dy += TOP_H;
  scrollCurrent.y += dy * smooth;
  scrollCurrent.y = ((scrollCurrent.y % TOP_H) + TOP_H) % TOP_H;
  scrollCurrent.angle += (scrollTarget.angle - scrollCurrent.angle) * smooth;

  const cx = Math.cos(scrollCurrent.angle) * ORBIT_RADIUS;
  const cz = Math.sin(scrollCurrent.angle) * ORBIT_RADIUS;
  const cy = scrollCurrent.y + 4;

  const cam = sceneModule.camera;
  cam.position.set(cx, cy, cz);
  controls.target.set(0, scrollCurrent.y + 1, 0);
  controls.update();
}
