import * as THREE from 'three';

// Config (must be first)
import { TOP_H, LEVEL_H, STAGES, prefersReducedMotion, QUALITY } from './config.js';

// Scene setup
import { renderer, scene, keyLight, sunPos, sunMesh, sunOccMesh, sunLight, occlusionScene, occlusionMat, occRT, occBlurRT, buildPlane, buildPlaneBottom } from './scene.js';
import * as sceneModule from './scene.js';

// Materials (loaded by scaffold/environment)
import './materials.js';

// Structure
import { glassPanels, scaffoldReady } from './scaffold.js';

// Environment (fog, floor, vines, shrubs, stage glow)
import { transitionPlanes, shroudPlanes, vineGroup, stageGlowPlanes, backdropPanels } from './environment.js';

// Zones & typography
import { ZONES, sideTexts } from './zones.js';

// Floating cards
import { cards, CARD_OPTS, cardGroup, cardRaycaster, cardPointer, hoveredCard, setHoveredCard, IMG_FILES } from './cards.js';


// Effects (grid lights, particles, fireflies)
import { gridLights, pickLightTarget, fireflies, FF_STAGE_COLORS } from './effects.js';

import { gx, gz } from './config.js';

// Camera & scroll
import { controls, scrollCurrent, updateCam, wrapFogBoost, panelZoomed, startPanelZoom, exitPanelZoom, navigatePanelZoom } from './camera.js';

// Audio
import './audio.js';

// Post-processing
import { composer, colorGradePass, grainPass, godRaysPass } from './postprocessing.js';

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

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && panelZoomed) exitPanelZoom();
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

// Wrapped distance — accounts for scroll cycling through TOP_H
function wDist(a, b) { const d = Math.abs(a - b); return Math.min(d, TOP_H - d); }

// Reusable objects — avoids per-frame allocations / GC pressure
const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _ffColor = new THREE.Color();
const _sunScreen = new THREE.Vector3();
const _occBlack = new THREE.Color(0x000000);
const _cardMeshes = cards.map(c => c.mesh);


// Gaussian blur for occlusion texture — smooths jagged god ray edges
const _blurCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const _blurScene = new THREE.Scene();
const _blurMat = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2() },
    direction: { value: new THREE.Vector2(1, 0) },
  },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform vec2 direction;
    varying vec2 vUv;
    void main(){
      vec2 texel = direction / resolution * 2.0;
      float r = 0.0;
      r += texture2D(tDiffuse, vUv - 4.0*texel).r * 0.016;
      r += texture2D(tDiffuse, vUv - 3.0*texel).r * 0.054;
      r += texture2D(tDiffuse, vUv - 2.0*texel).r * 0.122;
      r += texture2D(tDiffuse, vUv - 1.0*texel).r * 0.196;
      r += texture2D(tDiffuse, vUv).r * 0.227;
      r += texture2D(tDiffuse, vUv + 1.0*texel).r * 0.196;
      r += texture2D(tDiffuse, vUv + 2.0*texel).r * 0.122;
      r += texture2D(tDiffuse, vUv + 3.0*texel).r * 0.054;
      r += texture2D(tDiffuse, vUv + 4.0*texel).r * 0.016;
      gl_FragColor = vec4(vec3(r), 1.0);
    }
  `,
  depthTest: false, depthWrite: false,
});
_blurScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), _blurMat));

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

  // Zone blending — interpolate atmosphere on circular track (SUMMIT wraps to GROUND)
  const camH = scrollCurrent.y;
  let zoneA = ZONES[0], zoneB = ZONES[0], zoneFrac = 0;
  const zLen = ZONES.length;
  for (let z = 0; z < zLen; z++) {
    const curr = ZONES[z];
    const next = ZONES[(z + 1) % zLen];
    const currY = curr.y;
    const nextY = next.y;
    if (nextY > currY) {
      // Normal interval
      if (camH >= currY && camH < nextY) {
        zoneA = curr; zoneB = next;

        zoneFrac = (camH - currY) / (nextY - currY);
        break;
      }
    } else {
      // Wrapped interval (SUMMIT → GROUND, spanning 90→134→0)
      if (camH >= currY || camH < nextY) {
        zoneA = curr; zoneB = next;

        const span = (TOP_H - currY) + nextY;
        const pos = camH >= currY ? (camH - currY) : (TOP_H - currY + camH);
        zoneFrac = span > 0 ? pos / span : 0;
        break;
      }
    }
  }
  // Lerp fog
  _colorA.set(zoneA.fogColor);
  _colorB.set(zoneB.fogColor);
  scene.fog.color.copy(_colorA).lerp(_colorB, zoneFrac);
  scene.background.copy(scene.fog.color);
  scene.fog.density = THREE.MathUtils.lerp(zoneA.fogDensity, zoneB.fogDensity, zoneFrac) + wrapFogBoost;

  // Fade side typography in/out + animate flag wave + orbit (wrap-aware)
  for (const st of sideTexts) {
    const dist = wDist(camH, st.zoneY);
    const range = params.textFadeRange * params.textFadeOutMult;
    st.mat.uniforms.opacity.value = Math.max(0, 1 - dist / range) * params.textMaxOpacity;
    st.mat.uniforms.time.value = t;
    st.mesh.rotation.y += params.textOrbitSpeed * dt;
  }

  // Volumetric fog bands (wrap-aware)
  for (const tp of transitionPlanes) {
    const proximity = Math.max(0, 1 - wDist(camH, tp.y) / 10);
    tp.mesh.material.opacity = proximity * tp.bellCurve * 0.3;
  }

  // Dark shroud (wrap-aware)
  for (const sp of shroudPlanes) {
    const proximity = Math.max(0, 1 - wDist(camH, sp.layerY) / 15);
    sp.mesh.material.opacity = proximity * sp.maxOpacity;
  }

  // Stage glow floor planes — fade in when near each stage (wrap-aware)
  for (const sg of stageGlowPlanes) {
    const proximity = Math.max(0, 1 - wDist(camH, sg.stageY) / 20);
    sg.mat.uniforms.opacity.value = proximity * params.stageGlowIntensity;
  }

  // Distant backdrop fog panels — fade in near each stage (wrap-aware)
  for (const bp of backdropPanels) {
    const proximity = Math.max(0, 1 - wDist(camH, bp.stageY) / 22);
    bp.mat.uniforms.opacity.value = proximity * params.backdropIntensity;
    bp.mat.uniforms.time.value = t;
  }

  // Key light tracks scroll height
  keyLight.position.set(params.keyLightX, scrollCurrent.y + params.keyLightY, params.keyLightZ);
  keyLight.target.position.set(0, scrollCurrent.y, 0);
  keyLight.target.updateMatrixWorld();

  // Traveling grid lights
  for (const gl of gridLights) {
    gl.progress += gl.speed * dt;
    if (gl.progress >= 1) {
      gl.gi = gl.ti; gl.gj = gl.tj; gl.lv = gl.tlv;
      pickLightTarget(gl);
    }
    const p = gl.progress;
    gl.light.position.set(
      THREE.MathUtils.lerp(gx(gl.gi), gx(gl.ti), p),
      THREE.MathUtils.lerp(gl.lv * LEVEL_H, gl.tlv * LEVEL_H, p),
      THREE.MathUtils.lerp(gz(gl.gj), gz(gl.tj), p)
    );
    gl.light.intensity = 0.5 + 0.3 * Math.sin(t * 1.5 + gl.gi);
  }

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

  for (const card of cards) {
    card.mat.uniforms.time.value = t;
  }


  // Fireflies — simple sine pulse animation
  for (const ff of fireflies) {
    ff.angle += ff.speed * dt * 0.15;
    ff.yOffset += Math.sin(t * ff.ySpeed + ff.phase) * 0.005;
    const vr = params.ffVerticalRange;
    if (ff.yOffset > vr) ff.yOffset = vr;
    if (ff.yOffset < -vr) ff.yOffset = -vr;
    const fx = Math.cos(ff.angle) * ff.radius;
    const fz = Math.sin(ff.angle) * ff.radius;
    const fy = camH + ff.yOffset + Math.sin(t * ff.ySpeed + ff.phase) * 1.5;
    ff.sprite.position.set(fx, fy, fz);
    const pulse = Math.max(0, Math.sin(t * ff.pulseSpeed + ff.phase));
    ff.sprite.scale.setScalar((0.6 + pulse * 2.0) * ff.glowScale);
    _ffColor.copy(FF_STAGE_COLORS[0]);
    for (let si = STAGES.length - 1; si >= 0; si--) {
      if (fy >= STAGES[si].floorY) {
        const nextSi = Math.min(si + 1, STAGES.length - 1);
        const range = (STAGES[nextSi].floorY || TOP_H) - STAGES[si].floorY;
        const frac = range > 0 ? Math.min((fy - STAGES[si].floorY) / range, 1) : 0;
        _ffColor.copy(FF_STAGE_COLORS[si]).lerp(FF_STAGE_COLORS[nextSi], frac);
        break;
      }
    }
    ff.mat.color.copy(_ffColor);
    if (ff.light) {
      ff.light.position.set(fx, fy, fz);
      ff.light.color.copy(_ffColor);
      ff.light.intensity = ff.baseIntensity * (0.3 + pulse * pulse * 0.7);
    }
  }

  // Sun lock — place sun opposite camera so rays seep through scaffold
  if (params.sunLocked) {
    const cam = sceneModule.camera;
    const camAngle = Math.atan2(cam.position.z, cam.position.x);
    const sunR = Math.sqrt(sunPos.x * sunPos.x + sunPos.z * sunPos.z);
    // Sun on the far side of scaffold, offset ~15° for diagonal bird's-eye angle
    const sunAngle = camAngle + Math.PI + 0.25;
    const sx = Math.cos(sunAngle) * sunR;
    const sz = Math.sin(sunAngle) * sunR;
    const lockY = scrollCurrent.y + sunPos.y;
    sunMesh.position.set(sx, lockY, sz);
    sunOccMesh.position.set(sx, lockY, sz);
    sunLight.position.set(sx, lockY, sz);
  } else {
    sunMesh.position.copy(sunPos);
    sunOccMesh.position.copy(sunPos);
    sunLight.position.copy(sunPos);
  }

  // God rays — project sun to screen space
  _sunScreen.copy(sunMesh.position).project(sceneModule.camera);
  godRaysPass.uniforms.lightPosition.value.set(
    (_sunScreen.x + 1) * 0.5,
    (_sunScreen.y + 1) * 0.5
  );

  // Render occlusion pass + blur (only when god rays active, every 2nd frame)
  if (godRaysPass.enabled && (++_occFrame & 1)) {
    const origBg = scene.background;
    const origFog = scene.fog;
    scene.background = _occBlack;
    scene.fog = null;
    scene.overrideMaterial = occlusionMat;
    renderer.setRenderTarget(occRT);
    renderer.clear();
    renderer.render(scene, sceneModule.camera);
    scene.overrideMaterial = null;
    scene.background = origBg;
    scene.fog = origFog;
    // Sun sphere on top (white, additive)
    renderer.autoClear = false;
    renderer.render(occlusionScene, sceneModule.camera);
    renderer.autoClear = true;

    // Two-pass gaussian blur — smooths scaffold silhouette edges
    _blurMat.uniforms.resolution.value.set(occRT.width, occRT.height);
    // Horizontal blur: occRT → occBlurRT
    _blurMat.uniforms.tDiffuse.value = occRT.texture;
    _blurMat.uniforms.direction.value.set(1, 0);
    renderer.setRenderTarget(occBlurRT);
    renderer.render(_blurScene, _blurCam);
    // Vertical blur: occBlurRT → occRT
    _blurMat.uniforms.tDiffuse.value = occBlurRT.texture;
    _blurMat.uniforms.direction.value.set(0, 1);
    renderer.setRenderTarget(occRT);
    renderer.render(_blurScene, _blurCam);

    renderer.setRenderTarget(null);
  }

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
  // Warm up GPU — compile all shaders and generate shadow maps behind the overlay
  renderer.compile(scene, sceneModule.camera);
  renderer.render(scene, sceneModule.camera);

  document.getElementById('loader').classList.add('loaded');
  document.body.classList.add('site-loaded');
  animate();
});
