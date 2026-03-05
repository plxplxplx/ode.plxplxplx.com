import * as THREE from 'three';

// Config (must be first)
import { QUALITY } from './config.js';

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

// Camera & scroll
import { scrollCurrent, updateCam, wrapFogBoost, panelZoomed, startPanelZoom, exitPanelZoom, navigatePanelZoom } from './camera.js';

// Audio
import { updateAudio } from './audio.js';

// Post-processing
import { composer, grainPass, godRaysPass, renderOcclusion } from './postprocessing.js';

// GUI (must be last — reads from all modules)
import { params, updateFPS } from './gui.js';

// Loader
import { loaderReady } from './loader.js';

// Canvas ref for cursor
import { canvas } from './scene.js';

// Move ribbon text into the main scene so it gets depth-occluded by the scaffold
for (const st of sideTexts) scene.add(st.mesh);

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
  navigatePanelZoom(panels[_currentPanelIdx]);
}

canvas.addEventListener('click', (e) => {
  if (panelZoomed) { exitPanelZoom(); return; }
  if (!params.glassPanelImages) return;
  _panelPtr.x = (e.clientX / window.innerWidth) * 2 - 1;
  _panelPtr.y = -(e.clientY / window.innerHeight) * 2 + 1;
  _panelRC.setFromCamera(_panelPtr, sceneModule.camera);
  const hits = _panelRC.intersectObjects(glassPanels, false);
  if (hits.length > 0 && hits[0].object.userData.imageMode) {
    const panels = getImagePanels();
    _currentPanelIdx = panels.indexOf(hits[0].object);
    startPanelZoom(hits[0].object);
  }
});

// =====================================================
// INFO OVERLAY — toggle slide-up panel
// =====================================================
const infoBtn = document.getElementById('info-btn');
const infoOverlay = document.getElementById('info-overlay');
const siteHeader = document.getElementById('site-header');
function toggleInfo(forceClose) {
  const open = forceClose ? false : infoOverlay.classList.toggle('info-open');
  if (forceClose) infoOverlay.classList.remove('info-open');
  siteHeader.classList.toggle('info-active', open);
  infoBtn.setAttribute('aria-expanded', open);
  infoOverlay.setAttribute('aria-hidden', !open);
}

infoOverlay.addEventListener('click', (e) => {
  if (!e.target.closest('#info-content')) toggleInfo(true);
});

infoBtn.addEventListener('click', () => toggleInfo());

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (infoOverlay.classList.contains('info-open')) { toggleInfo(true); return; }
    if (panelZoomed) exitPanelZoom();
  }
});

const _closeBtn = document.getElementById('panel-close');
if (_closeBtn) _closeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  exitPanelZoom();
});

const _prevBtn = document.getElementById('panel-prev');
const _nextBtn = document.getElementById('panel-next');
if (_prevBtn) _prevBtn.addEventListener('click', (e) => { e.stopPropagation(); navigatePanel(-1); });
if (_nextBtn) _nextBtn.addEventListener('click', (e) => { e.stopPropagation(); navigatePanel(1); });

// =====================================================
// GAME LOOP
// =====================================================
const clock = new THREE.Clock();
let _occFrame = 0;

// Reusable objects — avoids per-frame allocations / GC pressure
const _sunScreen = new THREE.Vector3();
const _cardMeshes = cards.map(c => c.mesh);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.getElapsedTime();

  updateCam(dt);

  // Build-as-you-scroll — update clipping planes (top + bottom)
  if (params.buildMode) {
    buildPlane.constant = scrollCurrent.y + params.buildOffset;
    buildPlaneBottom.constant = -(scrollCurrent.y - params.buildOffsetBottom);
  }

  const camH = scrollCurrent.y;
  updateZones(camH, scene, wrapFogBoost);

  // Per-stage audio effects (throttle on mobile)
  if (QUALITY.cardRaycast || (_occFrame & 3) === 0) updateAudio(camH);

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
    sunMesh.visible = params.godRaysEnabled;
  }

  // God rays — project sun to screen space
  _sunScreen.copy(sunMesh.position).project(sceneModule.camera);
  godRaysPass.uniforms.lightPosition.value.set(
    (_sunScreen.x + 1) * 0.5,
    (_sunScreen.y + 1) * 0.5
  );

  renderOcclusion(sceneModule.camera, ++_occFrame);

  // Update film grain time
  grainPass.uniforms.time.value = t + Math.random() * 100;

  // On mobile all post-processing passes are disabled — skip composer overhead
  if (QUALITY.bloom || QUALITY.filmGrain || QUALITY.vignette || QUALITY.colorGrade) {
    composer.render();
  } else {
    renderer.render(scene, sceneModule.camera);
  }

  updateFPS();
}

// =====================================================
// START
// =====================================================
Promise.all([loaderReady, scaffoldReady]).then(() => {
  // Merge scaffold meshes by material on mobile (~93% draw call reduction)
  mergeScaffoldForMobile();

  // Warm up GPU — compile all shaders and generate shadow maps behind the overlay
  renderer.compile(scene, sceneModule.camera);
  renderer.render(scene, sceneModule.camera);

  document.getElementById('loader').classList.add('loaded');
  document.body.classList.add('site-loaded');
  animate();
});
