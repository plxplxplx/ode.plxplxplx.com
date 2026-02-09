import * as THREE from 'three';
import GUI from 'lil-gui';
import { FRUSTUM } from './config.js';
import { renderer, scene, camera, sunPos, sunMesh, sunOccMesh, keyLight } from './scene.js';
import { STAGE_MATS, matSteel, lightColor, lightNormal, lightRoughness, darkColor, darkNormal, darkRoughness } from './materials.js';
import { cards, CARD_OPTS } from './cards.js';
import { ZONES, sideTexts, rebuildRibbons } from './zones.js';
import { vineGroup } from './environment.js';
import { shrubGroup } from './environment.js';
import { gridLights, fireflies, FF_COUNT } from './effects.js';
import { scaffold } from './scaffold.js';
import { bloom, bokehPass, godRaysPass, chromaPass, colorGradePass, grainPass } from './postprocessing.js';
import { bgMusic, audioCtx, masterGain } from './audio.js';

// =====================================================
// LIL-GUI
// =====================================================
export const params = {
  frustum: FRUSTUM,
  bloomStrength: bloom.strength,
  bloomRadius: bloom.radius,
  bloomThreshold: bloom.threshold,
  dofEnabled: true,
  dofFocus: 1,
  dofAperture: 0.004,
  dofMaxBlur: 0.001,
  fogDensity: scene.fog.density,
  gridLightIntensity: 1.5,
  gridLightDistance: 25,
  gridLightSpeed: 0.2,
  ambientIntensity: 0.35,
  keyLightIntensity: keyLight.intensity,
  cardsVisible: false,
  cardOpacity: 0.92,
  cardOrbitSpeed: 1.0,
  cardDriftAmp: CARD_OPTS.driftAmp,
  cardFlutter: CARD_OPTS.flutterAmp,
  cardRadiusMin: CARD_OPTS.radiusMin,
  cardRadiusMax: CARD_OPTS.radiusMax,
  vinesVisible: true,
  shrubsVisible: true,
  textMaxOpacity: 0.6,
  textBrightness: 1.5,
  textFadeRange: 30,
  textFlipX: true,
  textFlipY: false,
  textFlipZ: true,
  textRadius: 10,
  textArc: 270,
  textHeight: 5.5,
  textRise: 10,
  textYOffset: 6,
  textRotY: 0,
  textStartAngleOffset: 0,
  poleThickness: 1.5,
  steelMetalness: matSteel.metalness,
  steelRoughness: matSteel.roughness,
  exposure: renderer.toneMappingExposure,
  godRaysEnabled: false,
  godRayExposure: godRaysPass.uniforms.exposure.value,
  godRayDecay: godRaysPass.uniforms.decay.value,
  godRayDensity: godRaysPass.uniforms.density.value,
  godRayWeight: godRaysPass.uniforms.weight.value,
  sunX: sunPos.x,
  sunY: sunPos.y,
  sunZ: sunPos.z,
  chromaAmount: chromaPass.uniforms.amount.value,
  grainIntensity: grainPass.uniforms.intensity.value,
  colorSaturation: colorGradePass.uniforms.saturation.value,
  colorContrast: colorGradePass.uniforms.contrast.value,
  colorBrightness: colorGradePass.uniforms.brightness.value,
  tintR: colorGradePass.uniforms.tintR.value,
  tintG: colorGradePass.uniforms.tintG.value,
  tintB: colorGradePass.uniforms.tintB.value,
  ffIntensity: 4.0,
  ffDistance: 40,
  ffRadius: 8,
  ffPulseSpeed: 1.0,
  ffOrbitSpeed: 1.0,
  ffVerticalSpeed: 1.0,
  ffVerticalRange: 12,
  ffGlowSize: 1.0,
  ffGlowOpacity: 1.0,
  ffLightDecay: 2,
  musicVolume: bgMusic.volume,
  // Particles
  // Texture
  texRepeatU: 1,
  texRepeatV: 2,
  texEnabled: false,
  normalScale: 1.0,
};

export const gui = new GUI({ title: 'Installation Controls' });
gui.domElement.style.setProperty('--left', '0');
gui.domElement.style.position = 'fixed';
gui.domElement.style.left = '0';
gui.domElement.style.right = 'auto';

// FPS counter
export const fpsEl = document.createElement('div');
fpsEl.style.cssText = 'position:fixed;top:12px;right:16px;color:rgba(255,240,220,0.35);font:11px monospace;z-index:20;pointer-events:none;';
document.body.appendChild(fpsEl);
let fpsFrames = 0, fpsLast = performance.now();
export function updateFPS() {
  fpsFrames++;
  const now = performance.now();
  if (now - fpsLast >= 500) {
    fpsEl.textContent = Math.round(fpsFrames / ((now - fpsLast) / 1000)) + ' fps';
    fpsFrames = 0; fpsLast = now;
  }
}

const camFolder = gui.addFolder('Camera');
camFolder.add(params, 'frustum', 5, 50).onChange(v => {
  const a = window.innerWidth / window.innerHeight;
  camera.left = -v*a/2; camera.right = v*a/2;
  camera.top = v/2; camera.bottom = -v/2;
  camera.updateProjectionMatrix();
});

const bloomFolder = gui.addFolder('Bloom');
bloomFolder.add(params, 'bloomStrength', 0, 3, 0.01).onChange(v => bloom.strength = v);
bloomFolder.add(params, 'bloomRadius', 0, 2, 0.01).onChange(v => bloom.radius = v);
bloomFolder.add(params, 'bloomThreshold', 0, 1, 0.01).onChange(v => bloom.threshold = v);

const dofFolder = gui.addFolder('Depth of Field');
dofFolder.add(params, 'dofEnabled').name('Enable').onChange(v => bokehPass.enabled = v);
dofFolder.add(params, 'dofFocus', 0.1, 60, 0.1).name('Focus Distance').onChange(v => bokehPass.uniforms['focus'].value = v);
dofFolder.add(params, 'dofAperture', 0, 0.01, 0.0001).name('Aperture').onChange(v => bokehPass.uniforms['aperture'].value = v);
dofFolder.add(params, 'dofMaxBlur', 0, 0.1, 0.001).name('Max Blur').onChange(v => bokehPass.uniforms['maxblur'].value = v);

const fogFolder = gui.addFolder('Fog');
fogFolder.add(params, 'fogDensity', 0, 0.1, 0.001).onChange(v => scene.fog.density = v);

const lightFolder = gui.addFolder('Lights');
lightFolder.add(params, 'gridLightIntensity', 0, 10, 0.1).onChange(v => {
  gridLights.forEach(gl => gl.light.intensity = v);
});
lightFolder.add(params, 'gridLightDistance', 1, 80, 1).onChange(v => {
  gridLights.forEach(gl => gl.light.distance = v);
});
lightFolder.add(params, 'gridLightSpeed', 0.01, 2, 0.01).onChange(v => {
  gridLights.forEach(gl => gl.speed = v);
});
lightFolder.add(params, 'keyLightIntensity', 0, 20, 0.1).onChange(v => keyLight.intensity = v);
lightFolder.add(params, 'exposure', 0.1, 3, 0.05).onChange(v => renderer.toneMappingExposure = v);

const cardFolder = gui.addFolder('Image Cards');
cardFolder.add(params, 'cardsVisible').name('Visible').onChange(v => {
  cards.forEach(c => c.mesh.visible = v);
});
cardFolder.add(params, 'cardOpacity', 0, 1, 0.01).name('Opacity').onChange(v => {
  cards.forEach(c => c.mat.uniforms.opacity.value = v);
});
cardFolder.add(params, 'cardOrbitSpeed', 0, 3, 0.05).name('Orbit Speed').onChange(v => {
  cards.forEach(c => c.speed = Math.sign(c.speed) * THREE.MathUtils.lerp(CARD_OPTS.orbitSpeedMin, CARD_OPTS.orbitSpeedMax, Math.random()) * v);
});
cardFolder.add(params, 'cardDriftAmp', 0, 3, 0.05).name('Drift').onChange(v => { CARD_OPTS.driftAmp = v; });
cardFolder.add(params, 'cardFlutter', 0, 3, 0.05).name('Flutter').onChange(v => { CARD_OPTS.flutterAmp = v; });
cardFolder.add(params, 'cardRadiusMin', 3, 20, 0.5).name('Radius Min').onChange(v => {
  CARD_OPTS.radiusMin = v;
  cards.forEach(c => { c.radius = THREE.MathUtils.lerp(v, CARD_OPTS.radiusMax, Math.random()); });
});
cardFolder.add(params, 'cardRadiusMax', 5, 30, 0.5).name('Radius Max').onChange(v => {
  CARD_OPTS.radiusMax = v;
  cards.forEach(c => { c.radius = THREE.MathUtils.lerp(CARD_OPTS.radiusMin, v, Math.random()); });
});

const godRayFolder = gui.addFolder('God Rays');
godRayFolder.add(params, 'godRaysEnabled').name('Enable').onChange(v => godRaysPass.enabled = v);
godRayFolder.add(params, 'godRayExposure', 0, 1, 0.01).onChange(v => godRaysPass.uniforms.exposure.value = v);
godRayFolder.add(params, 'godRayDecay', 0.8, 1, 0.005).onChange(v => godRaysPass.uniforms.decay.value = v);
godRayFolder.add(params, 'godRayDensity', 0, 2, 0.05).onChange(v => godRaysPass.uniforms.density.value = v);
godRayFolder.add(params, 'godRayWeight', 0, 2, 0.05).onChange(v => godRaysPass.uniforms.weight.value = v);
const updateSun = () => {
  sunPos.set(params.sunX, params.sunY, params.sunZ);
  sunMesh.position.copy(sunPos);
  sunOccMesh.position.copy(sunPos);
};
godRayFolder.add(params, 'sunX', -40, 40, 0.5).onChange(updateSun);
godRayFolder.add(params, 'sunY', 0, 50, 0.5).onChange(updateSun);
godRayFolder.add(params, 'sunZ', -40, 40, 0.5).onChange(updateSun);

const fxFolder = gui.addFolder('Post FX');
fxFolder.add(params, 'chromaAmount', 0, 0.02, 0.001).name('Chroma Aberr.').onChange(v => chromaPass.uniforms.amount.value = v);
fxFolder.add(params, 'grainIntensity', 0, 0.3, 0.005).name('Film Grain').onChange(v => grainPass.uniforms.intensity.value = v);
fxFolder.add(params, 'colorSaturation', 0, 2, 0.01).name('Saturation').onChange(v => colorGradePass.uniforms.saturation.value = v);
fxFolder.add(params, 'colorContrast', 0.5, 2, 0.01).name('Contrast').onChange(v => colorGradePass.uniforms.contrast.value = v);
fxFolder.add(params, 'colorBrightness', -0.3, 0.3, 0.01).name('Brightness').onChange(v => colorGradePass.uniforms.brightness.value = v);
fxFolder.add(params, 'tintR', 0.5, 1.5, 0.01).name('Tint R').onChange(v => colorGradePass.uniforms.tintR.value = v);
fxFolder.add(params, 'tintG', 0.5, 1.5, 0.01).name('Tint G').onChange(v => colorGradePass.uniforms.tintG.value = v);
fxFolder.add(params, 'tintB', 0.5, 1.5, 0.01).name('Tint B').onChange(v => colorGradePass.uniforms.tintB.value = v);

const ffFolder = gui.addFolder('Fireflies');
ffFolder.add(params, 'ffIntensity', 0, 20, 0.1).name('Light Intensity').onChange(v => {
  fireflies.forEach(ff => ff.baseIntensity = v);
});
ffFolder.add(params, 'ffDistance', 1, 100, 1).name('Light Distance').onChange(v => {
  fireflies.forEach(ff => { if (ff.light) ff.light.distance = v; });
});
ffFolder.add(params, 'ffLightDecay', 0, 5, 0.1).name('Light Decay').onChange(v => {
  fireflies.forEach(ff => { if (ff.light) ff.light.decay = v; });
});
ffFolder.add(params, 'ffGlowSize', 0.1, 5, 0.05).name('Glow Size').onChange(v => {
  fireflies.forEach(ff => ff.sprite.geometry.dispose());
  const newGeo = new THREE.SphereGeometry(0.06 * v, 6, 4);
  fireflies.forEach(ff => { ff.sprite.geometry = newGeo; });
});
ffFolder.add(params, 'ffGlowOpacity', 0, 1, 0.01).name('Glow Opacity').onChange(v => {
  fireflies.forEach(ff => ff.mat.opacity = v);
});
ffFolder.add(params, 'ffRadius', 1, 30, 0.5).name('Spread Radius').onChange(v => {
  fireflies.forEach(ff => ff.radius = 1 + Math.random() * v);
});
ffFolder.add(params, 'ffPulseSpeed', 0.1, 8, 0.1).name('Pulse Speed').onChange(v => {
  fireflies.forEach(ff => ff.pulseSpeed = (1.5 + Math.random() * 3) * v);
});
ffFolder.add(params, 'ffOrbitSpeed', 0, 5, 0.05).name('Orbit Speed').onChange(v => {
  fireflies.forEach(ff => ff.speed = (0.2 + Math.random() * 0.5) * v);
});
ffFolder.add(params, 'ffVerticalSpeed', 0, 5, 0.05).name('Vertical Speed').onChange(v => {
  fireflies.forEach(ff => ff.ySpeed = (0.1 + Math.random() * 0.3) * v);
});
ffFolder.add(params, 'ffVerticalRange', 1, 40, 1).name('Vertical Range').onChange(v => {
  fireflies.forEach(ff => ff.yOffset = THREE.MathUtils.clamp(ff.yOffset, -v, v));
});

const matFolder = gui.addFolder('Materials');
const applyPoleThickness = v => {
  scaffold.traverse(child => {
    if (child.isMesh && child.geometry.type === 'CylinderGeometry') {
      child.scale.set(v, 1, v);
    }
  });
};
matFolder.add(params, 'poleThickness', 0.5, 10, 0.1).name('Pole Thickness').onChange(applyPoleThickness);
applyPoleThickness(params.poleThickness);
matFolder.add(params, 'steelMetalness', 0, 1, 0.01).onChange(v => {
  STAGE_MATS.forEach(sm => sm.steel.metalness = v);
});
matFolder.add(params, 'steelRoughness', 0, 1, 0.01).onChange(v => {
  STAGE_MATS.forEach(sm => sm.steel.roughness = v);
});
matFolder.add(params, 'vinesVisible').name('Vines').onChange(v => vineGroup.visible = v);
matFolder.add(params, 'shrubsVisible').name('Shrubs').onChange(v => shrubGroup.visible = v);

const allMarbleTex = [lightColor, lightNormal, lightRoughness, darkColor, darkNormal, darkRoughness];
const texFolder = gui.addFolder('Texture');
texFolder.add(params, 'texEnabled').name('Marble Texture').onChange(v => {
  STAGE_MATS.forEach(sm => {
    sm.steel.map = v ? sm.steel.userData.origMap : null;
    sm.steel.normalMap = v ? sm.steel.userData.origNormal : null;
    sm.steel.roughnessMap = v ? sm.steel.userData.origRough : null;
    sm.steel.needsUpdate = true;
    sm.deck.map = v ? sm.deck.userData.origMap : null;
    sm.deck.normalMap = v ? sm.deck.userData.origNormal : null;
    sm.deck.roughnessMap = v ? sm.deck.userData.origRough : null;
    sm.deck.needsUpdate = true;
  });
});
texFolder.add(params, 'texRepeatU', 0.1, 10, 0.1).name('Repeat U').onChange(v => {
  allMarbleTex.forEach(tex => { tex.repeat.x = v; });
});
texFolder.add(params, 'texRepeatV', 0.1, 10, 0.1).name('Repeat V').onChange(v => {
  allMarbleTex.forEach(tex => { tex.repeat.y = v; });
});
texFolder.add(params, 'normalScale', 0, 3, 0.05).name('Normal Strength').onChange(v => {
  STAGE_MATS.forEach(sm => {
    sm.steel.normalScale.set(v, v);
    sm.deck.normalScale.set(v, v);
  });
});
// Store original texture refs for toggle, then strip (off by default)
STAGE_MATS.forEach(sm => {
  sm.steel.userData.origMap = sm.steel.map;
  sm.steel.userData.origNormal = sm.steel.normalMap;
  sm.steel.userData.origRough = sm.steel.roughnessMap;
  sm.steel.map = null; sm.steel.normalMap = null; sm.steel.roughnessMap = null;
  sm.steel.needsUpdate = true;
  sm.deck.userData.origMap = sm.deck.map;
  sm.deck.userData.origNormal = sm.deck.normalMap;
  sm.deck.userData.origRough = sm.deck.roughnessMap;
  sm.deck.map = null; sm.deck.normalMap = null; sm.deck.roughnessMap = null;
  sm.deck.needsUpdate = true;
});

const textFolder = gui.addFolder('Typography');
textFolder.add(params, 'textMaxOpacity', 0, 1, 0.01).name('Max Opacity');
textFolder.add(params, 'textBrightness', 0.5, 5, 0.1).name('Brightness').onChange(v => {
  sideTexts.forEach(st => st.mat.uniforms.brightness.value = v);
});
textFolder.add(params, 'textFadeRange', 2, 30, 0.5).name('Fade Range');
textFolder.add(params, 'textRadius', 3, 25, 0.5).name('Radius').onChange(() => rebuildRibbons(params));
textFolder.add(params, 'textArc', 30, 360, 5).name('Arc (deg)').onChange(() => rebuildRibbons(params));
textFolder.add(params, 'textHeight', 1, 15, 0.5).name('Height').onChange(() => rebuildRibbons(params));
textFolder.add(params, 'textRise', 0, 20, 0.5).name('Rise').onChange(() => rebuildRibbons(params));
textFolder.add(params, 'textYOffset', 0, 20, 0.5).name('Y Offset').onChange(() => rebuildRibbons(params));
textFolder.add(params, 'textRotY', -180, 180, 5).name('Rotation Y').onChange(() => rebuildRibbons(params));
textFolder.add(params, 'textStartAngleOffset', -180, 180, 5).name('Start Angle').onChange(() => rebuildRibbons(params));
textFolder.add(params, 'textFlipX', false).name('Flip X').onChange(v => {
  sideTexts.forEach(st => st.mesh.scale.x = v ? -1 : 1);
});
textFolder.add(params, 'textFlipY', false).name('Flip Y').onChange(v => {
  sideTexts.forEach(st => st.mesh.scale.y = v ? -1 : 1);
});
textFolder.add(params, 'textFlipZ', false).name('Flip Z').onChange(v => {
  sideTexts.forEach(st => st.mesh.scale.z = v ? -1 : 1);
});

const audioFolder = gui.addFolder('Audio');
audioFolder.add({ play() { audioCtx.resume(); bgMusic.play().catch(() => {}); } }, 'play').name('Play Music');
audioFolder.add({ pause() { bgMusic.pause(); } }, 'pause').name('Pause');
audioFolder.add(params, 'musicVolume', 0, 1, 0.01).name('Volume').onChange(v => {
  masterGain.gain.setTargetAtTime(v, audioCtx.currentTime, 0.05);
});

// Apply initial flips
sideTexts.forEach(st => {
  st.mesh.scale.x = params.textFlipX ? -1 : 1;
  st.mesh.scale.z = params.textFlipZ ? -1 : 1;
});

// Close all folders by default
gui.children.forEach(c => { if (c.close) c.close(); });

// Cmd+G to toggle GUI
window.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyG') {
    e.preventDefault();
    const d = gui.domElement.style.display;
    gui.domElement.style.display = d === 'none' ? '' : 'none';
  }
});
