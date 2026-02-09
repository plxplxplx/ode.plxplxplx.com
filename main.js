import * as THREE from 'three';

// Config (must be first)
import { TOP_H, LEVEL_H, STAGES } from './config.js';

// Scene setup
import { renderer, scene, camera, keyLight, sunPos, occlusionScene, occRT } from './scene.js';

// Materials (loaded by scaffold/environment)
import './materials.js';

// Structure
import './scaffold.js';

// Environment (fog, floor, vines, shrubs)
import { transitionPlanes, shroudPlanes, vineData, vineGroup } from './environment.js';

// Zones & typography
import { ZONES, sideTexts, ribbonOverlayScene } from './zones.js';

// Floating cards
import { cards, CARD_OPTS, cardRaycaster, cardPointer, hoveredCard, setHoveredCard, IMG_FILES } from './cards.js';

// Character
import { charGroup, orbCore, orbGlow, halo, charLight, updateChar } from './character.js';

// Effects (grid lights, particles, fireflies)
import { gridLights, pickLightTarget, fireflies, FF_STAGE_COLORS } from './effects.js';
import { gx, gz } from './config.js';

// Camera & scroll
import { controls, scrollCurrent, updateCam } from './camera.js';

// Audio
import { updateAudio } from './audio.js';

// Post-processing
import { composer, colorGradePass, grainPass, godRaysPass } from './postprocessing.js';

// GUI (must be last — reads from all modules)
import { params, updateFPS } from './gui.js';

// Canvas ref for cursor
import { canvas } from './scene.js';

// =====================================================
// GAME LOOP
// =====================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.getElapsedTime();

  updateCam(dt);

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
  const cA = new THREE.Color(zoneA.fogColor), cB = new THREE.Color(zoneB.fogColor);
  scene.fog.color.copy(cA).lerp(cB, zoneFrac);
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
    const dist = Math.abs(camH - st.zoneY);
    st.mat.uniforms.opacity.value = Math.max(0, 1 - dist / params.textFadeRange) * params.textMaxOpacity;
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

  // Floating cards — orbit + noise drift + soft billboard
  const doRaycast = (Math.round(t * 60) % 3 === 0);
  if (doRaycast) {
    cardRaycaster.setFromCamera(cardPointer, camera);
    const cardMeshes = cards.map(c => c.mesh);
    const hits = cardRaycaster.intersectObjects(cardMeshes, false);
    const prevHovered = hoveredCard;
    const newHovered = hits.length > 0 ? cards.find(c => c.mesh === hits[0].object) : null;
    setHoveredCard(newHovered);
    if (prevHovered && prevHovered !== newHovered) prevHovered.hovered = false;
    if (newHovered) newHovered.hovered = true;
    canvas.style.cursor = newHovered ? 'pointer' : '';
  }

  for (const card of cards) {
    card.mat.uniforms.time.value = t;
    card.theta += card.speed * dt;
    const bx = Math.cos(card.theta) * card.radius;
    const bz = Math.sin(card.theta) * card.radius;
    const f = CARD_OPTS.driftFreq;
    const a = CARD_OPTS.driftAmp;
    const s1 = card.s1, s2 = card.s2, s3 = card.s3;
    const driftX = a * (
      Math.sin(t * f + s1) * 0.5 +
      Math.sin(t * f * 1.7 + s2 * 3) * 0.3 +
      Math.sin(t * f * 0.4 + s3) * 0.2
    );
    const driftZ = a * (
      Math.cos(t * f * 0.8 + s2) * 0.5 +
      Math.sin(t * f * 1.3 + s1 * 2) * 0.3 +
      Math.cos(t * f * 0.3 + s3 * 4) * 0.2
    );
    const cardBob = card.bobAmp * Math.sin(t * card.bobSpd + card.phase) +
                card.bobAmp * 0.3 * Math.sin(t * card.bobSpd * 1.6 + s1);
    const radiusDrift = Math.sin(t * f * 0.5 + s3 * 2) * 1.2;
    const finalR = card.radius + radiusDrift;
    card.mesh.position.set(
      Math.cos(card.theta) * finalR + driftX,
      card.baseY + cardBob,
      Math.sin(card.theta) * finalR + driftZ
    );
    const fl = CARD_OPTS.flutterAmp;
    const baseYaw = card.theta + Math.PI;
    const yawWander = (Math.sin(t * 0.15 + card.phase * 2.3) * 0.26 +
                       Math.sin(t * 0.08 + s2 * 3) * 0.12) * fl;
    const pitch = (Math.sin(t * 0.22 + card.phase) * 0.18 +
                   Math.sin(t * 0.11 + s1) * 0.1) * fl;
    const roll = (Math.sin(t * 0.17 + card.phase * 1.7) * 0.14 +
                  Math.cos(t * 0.09 + s3) * 0.08) * fl;
    card.mesh.rotation.set(pitch, baseYaw + yawWander, roll);
    const targetScale = card.hovered ? card.baseScale * 1.12 : card.baseScale;
    card.currentScale += (targetScale - card.currentScale) * 0.06;
    card.mesh.scale.setScalar(card.currentScale);
  }

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
    let stageCol = FF_STAGE_COLORS[0];
    for (let si = STAGES.length - 1; si >= 0; si--) {
      if (fy >= STAGES[si].floorY) {
        const nextSi = Math.min(si + 1, STAGES.length - 1);
        const range = (STAGES[nextSi].floorY || TOP_H) - STAGES[si].floorY;
        const frac = range > 0 ? Math.min((fy - STAGES[si].floorY) / range, 1) : 0;
        stageCol = FF_STAGE_COLORS[si].clone().lerp(FF_STAGE_COLORS[nextSi], frac);
        break;
      }
    }
    ff.mat.color.copy(stageCol);
    if (ff.light) {
      ff.light.position.set(fx, fy, fz);
      ff.light.color.copy(stageCol);
      ff.light.intensity = ff.baseIntensity * (0.3 + pulse * pulse * 0.7);
    }
  }

  // Vine leaves — gentle sway
  for (const vd of vineData) {
    for (const lv of vd.leaves) {
      lv.mesh.rotation.z = Math.sin(t * 1.2 + lv.phase) * 0.15;
      lv.mesh.rotation.x = Math.sin(t * 0.8 + lv.phase + 1) * 0.1;
    }
  }


  // God rays — project sun to screen space
  const sunScreen = sunPos.clone().project(camera);
  godRaysPass.uniforms.lightPosition.value.set(
    (sunScreen.x + 1) * 0.5,
    (sunScreen.y + 1) * 0.5
  );

  // Render occlusion pass
  occlusionScene.background = new THREE.Color(0x000000);
  renderer.setRenderTarget(occRT);
  renderer.clear();
  renderer.render(occlusionScene, camera);
  renderer.setRenderTarget(null);

  // Update film grain time
  grainPass.uniforms.time.value = t + Math.random() * 100;

  composer.render();

  // Render ribbon text on top
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(ribbonOverlayScene, camera);
  renderer.autoClear = true;

  updateFPS();
}

// =====================================================
// START
// =====================================================
animate();
