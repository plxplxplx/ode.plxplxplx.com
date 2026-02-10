import * as THREE from 'three';

// Config (must be first)
import { TOP_H, LEVEL_H, STAGES } from './config.js';

// Scene setup
import { renderer, scene, keyLight, sunPos, sunMesh, sunOccMesh, sunLight, occlusionScene, occlusionMat, occRT, buildPlane } from './scene.js';
import * as sceneModule from './scene.js';

// Materials (loaded by scaffold/environment)
import './materials.js';

// Structure
import './scaffold.js';

// Environment (fog, floor, vines, shrubs, stage glow)
import { transitionPlanes, shroudPlanes, vineGroup, stageGlowPlanes, backdropPanels } from './environment.js';

// Zones & typography
import { ZONES, sideTexts, ribbonOverlayScene } from './zones.js';

// Floating cards
import { cards, CARD_OPTS, cardGroup, cardRaycaster, cardPointer, hoveredCard, setHoveredCard, IMG_FILES } from './cards.js';

// Character
import { charGroup, orbCore, orbGlow, halo, charLight, updateChar } from './character.js';

// Effects (grid lights, particles, fireflies)
import { gridLights, pickLightTarget, fireflies, FF_STAGE_COLORS } from './effects.js';

// Caution tape
import { updateTape } from './tape.js';
import { gx, gz } from './config.js';

// Camera & scroll
import { controls, scrollCurrent, updateCam } from './camera.js';

// Audio
import { updateAudio } from './audio.js';

// Post-processing
import { composer, colorGradePass, grainPass, godRaysPass } from './postprocessing.js';

// GUI (must be last — reads from all modules)
import { params, updateFPS } from './gui.js';

// Loader
import { loaderReady } from './loader.js';

// Canvas ref for cursor
import { canvas } from './scene.js';

// =====================================================
// GAME LOOP
// =====================================================
const clock = new THREE.Clock();

// Reusable objects — avoids per-frame allocations / GC pressure
const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _ffColor = new THREE.Color();
const _baseSunDir = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _sunScreen = new THREE.Vector3();
const _occBlack = new THREE.Color(0x000000);
const _cardMeshes = cards.map(c => c.mesh);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.getElapsedTime();

  updateCam(dt);

  // Build-as-you-scroll — update clipping plane
  if (params.buildMode) {
    buildPlane.constant = scrollCurrent.y + params.buildOffset;
  }

  // Zone blending — interpolate atmosphere based on camera height
  const camH = scrollCurrent.y;
  let zoneA = ZONES[0], zoneB = ZONES[0], zoneFrac = 0;
  for (let z = 0; z < ZONES.length - 1; z++) {
    if (camH >= ZONES[z].y && camH < ZONES[z+1].y) {
      zoneA = ZONES[z]; zoneB = ZONES[z+1];
      zoneFrac = (camH - zoneA.y) / (zoneB.y - zoneA.y);
      break;
    }
    if (z === ZONES.length - 2) { zoneA = ZONES[z+1]; zoneB = ZONES[z+1]; zoneFrac = 0; }
  }
  // Lerp fog
  _colorA.set(zoneA.fogColor);
  _colorB.set(zoneB.fogColor);
  scene.fog.color.copy(_colorA).lerp(_colorB, zoneFrac);
  scene.background.copy(scene.fog.color);
  scene.fog.density = THREE.MathUtils.lerp(zoneA.fogDensity, zoneB.fogDensity, zoneFrac);
  // Lerp color grading tint
  colorGradePass.uniforms.tintR.value = THREE.MathUtils.lerp(zoneA.tint[0], zoneB.tint[0], zoneFrac);
  colorGradePass.uniforms.tintG.value = THREE.MathUtils.lerp(zoneA.tint[1], zoneB.tint[1], zoneFrac);
  colorGradePass.uniforms.tintB.value = THREE.MathUtils.lerp(zoneA.tint[2], zoneB.tint[2], zoneFrac);

  // Dynamic audio
  updateAudio(camH);

  // Fade side typography in/out + animate flag wave
  for (const st of sideTexts) {
    const diff = camH - st.zoneY;
    const fadeIn = params.textFadeRange;
    const fadeOut = params.textFadeRange * params.textFadeOutMult;
    const range = diff < 0 ? fadeIn : fadeOut;
    const dist = Math.abs(diff);
    st.mat.uniforms.opacity.value = Math.max(0, 1 - dist / range) * params.textMaxOpacity;
    st.mat.uniforms.time.value = t;
  }

  // Volumetric fog bands
  for (const tp of transitionPlanes) {
    const distToBoundary = Math.abs(camH - tp.y);
    const proximity = Math.max(0, 1 - distToBoundary / 10);
    tp.mesh.material.opacity = proximity * tp.bellCurve * 0.3;
  }

  // Dark shroud
  for (const sp of shroudPlanes) {
    const dist = Math.abs(camH - sp.layerY);
    const proximity = Math.max(0, 1 - dist / 15);
    sp.mesh.material.opacity = proximity * sp.maxOpacity;
  }

  // Stage glow floor planes — fade in when near each stage
  for (const sg of stageGlowPlanes) {
    const dist = Math.abs(camH - sg.stageY);
    const proximity = Math.max(0, 1 - dist / 20);
    sg.mat.uniforms.opacity.value = proximity * params.stageGlowIntensity;
  }

  // Distant backdrop fog panels — fade in near each stage
  for (const bp of backdropPanels) {
    const dist = Math.abs(camH - bp.stageY);
    const proximity = Math.max(0, 1 - dist / 22);
    bp.mat.uniforms.opacity.value = proximity * params.backdropIntensity;
    bp.mat.uniforms.time.value = t;
  }

  // Key light tracks scroll height
  keyLight.position.y = scrollCurrent.y + 18;
  keyLight.target.position.set(0, scrollCurrent.y, 0);
  keyLight.target.updateMatrixWorld();

  // Character orb animation
  const bob = Math.sin(t * 2.5) * 0.06;
  orbCore.position.y = 0.35 + bob;
  orbGlow.position.y = 0.35 + bob;
  orbGlow.scale.setScalar(1.0 + Math.sin(t * 3) * 0.15);
  halo.position.y = 0.35 + bob;
  halo.rotation.x = t * 0.8; halo.rotation.z = t * 0.5;
  charLight.position.y = 0.35 + bob;
  charLight.intensity = 1.3 + Math.sin(t * 2) * 0.3;

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

  for (const card of cards) {
    card.mat.uniforms.time.value = t;
  }

  // Caution tape flutter
  updateTape(t);

  // Fireflies
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
    ff.sprite.scale.setScalar(0.6 + pulse * 2.0);
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

  // Sun lock — keep sun at fixed screen position by counter-rotating with camera
  if (params.sunLocked) {
    const cam = sceneModule.camera;
    _baseSunDir.set(sunPos.x, 0, sunPos.z).normalize();
    _camDir.set(cam.position.x, 0, cam.position.z).normalize();
    const angle = Math.atan2(_camDir.z, _camDir.x) - Math.atan2(_baseSunDir.z, _baseSunDir.x);
    const sunR = Math.sqrt(sunPos.x * sunPos.x + sunPos.z * sunPos.z);
    const sunAngle = Math.atan2(sunPos.z, sunPos.x) + angle;
    const sx = Math.cos(sunAngle) * sunR;
    const sz = Math.sin(sunAngle) * sunR;
    const lockY = sunPos.y + (scrollCurrent.y - sunPos.y) * 0.5;
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

  // Render occlusion pass (only when god rays active)
  if (godRaysPass.enabled) {
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
    renderer.setRenderTarget(null);
  }

  // Update film grain time
  grainPass.uniforms.time.value = t + Math.random() * 100;

  composer.render();

  // Render ribbon text on top
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(ribbonOverlayScene, sceneModule.camera);
  renderer.autoClear = true;

  updateFPS();
}

// =====================================================
// START
// =====================================================
loaderReady.then(() => {
  // Warm up GPU — compile all shaders and generate shadow maps behind the overlay
  renderer.compile(scene, sceneModule.camera);
  renderer.render(scene, sceneModule.camera);

  document.getElementById('loader').classList.add('loaded');
  animate();
});
