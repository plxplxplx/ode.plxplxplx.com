import * as THREE from 'three';
import { FRUSTUM } from './config.js';
import { renderer, scene, sunPos, sunMesh, sunOccMesh, keyLight, rimLight, sunLight, ambientLight, hemiLight, perspCamera, switchCamera, buildPlane, buildPlaneBottom } from './scene.js';
import * as sceneModule from './scene.js';
import { STAGE_MATS, matSteel, loadMarbleTextures, getMarbleTextures, applyMarbleTextures } from './materials.js';
import { cards, CARD_OPTS, rebuildCards, IMG_FILES } from './cards.js';
import { ZONES, sideTexts, rebuildRibbons } from './zones.js';
import { vineGroup, shrubGroup, flowerLight, stageGlowPlanes, backdropPanels, shroudPlanes } from './environment.js';
import { gridLights, fireflies, FF_COUNT } from './effects.js';
import { scaffold, floorMats, glassPanels, glassMat, scaffoldReady, applyGlassImages, removeGlassImages, getGlassImageMats, getGlassTexCache } from './scaffold.js';
import { composer, bloom, bokehPass, godRaysPass, colorGradePass, grainPass, smaaPass, setPostCamera } from './postprocessing.js';
import { setControlsCamera } from './camera.js';

// =====================================================
// PARAMS — available immediately (no Tweakpane needed)
// =====================================================
export const params = {
  frustum: FRUSTUM,
  bloomEnabled: false,
  bloomStrength: bloom.strength,
  bloomRadius: bloom.radius,
  bloomThreshold: bloom.threshold,
  dofEnabled: false,
  dofFocus: 1,
  dofAperture: 0.004,
  dofMaxBlur: 0.001,
  fogDensity: 0.04,
  fogLinear: true,
  fogNear: 0,
  fogFar: 20,
  gridLightIntensity: 1.5,
  gridLightDistance: 25,
  gridLightSpeed: 0.2,
  ambientIntensity: ambientLight.intensity,
  ambientColor: '#' + ambientLight.color.getHexString(),
  hemiIntensity: hemiLight.intensity,
  hemiSkyColor: '#' + hemiLight.color.getHexString(),
  hemiGroundColor: '#' + hemiLight.groundColor.getHexString(),
  keyLightIntensity: keyLight.intensity,
  keyLightColor: '#' + keyLight.color.getHexString(),
  keyLightX: keyLight.position.x,
  keyLightY: 18,
  keyLightZ: keyLight.position.z,
  rimLightIntensity: rimLight.intensity,
  rimLightColor: '#' + rimLight.color.getHexString(),
  rimLightX: rimLight.position.x,
  rimLightY: rimLight.position.y,
  rimLightZ: rimLight.position.z,
  sunLightIntensity: sunLight.intensity,
  sunLightColor: '#' + sunLight.color.getHexString(),
  cardsVisible: false,
  cardOpacity: 0.92,
  cardRadius: CARD_OPTS.radius,
  cardH: CARD_OPTS.cardH,
  cardRise: CARD_OPTS.cardRise,
  cardWaveAmp: CARD_OPTS.waveAmp,
  cardOrbitSpeed: CARD_OPTS.orbitSpeed,
  cardRadiusSpread: CARD_OPTS.radiusSpread,
  vinesVisible: true,
  shrubsVisible: true,
  flowersVisible: true,
  flowerLightIntensity: 1.8,
  textMaxOpacity: 1,
  textOrbitSpeed: 0.1,
  textBrightness: 1.0,
  textTintColor: '#ffffff',
  textBgColor: '#000000',
  textBgOpacity: 0,
  textBlending: 'Normal',
  textDepthWrite: false,
  textFadeRange: 30,
  textFadeOutMult: 4.8,
  textFlipX: true,
  textFlipY: false,
  textFlipZ: true,
  textRadius: 9.0,
  textArc: 295,
  textHeight: 5.5,
  textRise: 18,
  textYOffset: 3,
  textRotY: 0,
  textStartAngleOffset: 0,
  poleThickness: 1.0,
  scaffoldTint: '#8a8a8a',
  steelMetalness: matSteel.metalness,
  steelRoughness: matSteel.roughness,
  pixelRatio: renderer.getPixelRatio(),
  smaa: smaaPass.enabled,
  exposure: 0.75,
  godRaysEnabled: false,
  godRayExposure: godRaysPass.uniforms.exposure.value,
  godRayDecay: godRaysPass.uniforms.decay.value,
  godRayDensity: godRaysPass.uniforms.density.value,
  godRayWeight: godRaysPass.uniforms.weight.value,
  sunRadius: Math.sqrt(sunPos.x * sunPos.x + sunPos.z * sunPos.z),
  sunHeight: sunPos.y,
  sunAngleOffset: 0.25,
  tintR: colorGradePass.uniforms.tintR.value,
  tintG: colorGradePass.uniforms.tintG.value,
  tintB: colorGradePass.uniforms.tintB.value,
  grainIntensity: 0.015,
  colorSaturation: 1.0,
  colorContrast: 1.3,
  colorBrightness: 0.15,
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
  // Camera
  usePerspective: false,
  perspFov: 50,
  perspNear: 0.1,
  perspFar: 300,
  sunLocked: true,
  buildMode: false,
  buildOffset: 6,
  buildOffsetBottom: 6,
  // Stage atmosphere
  stageGlowEnabled: false,
  stageGlowIntensity: 0,
  backdropEnabled: false,
  backdropIntensity: 0,
  shroudEnabled: false,
  stageFloorsVisible: false,
  floorOpacity: 1.0,
  floorMetalness: 0.3,
  floorRoughness: 0.5,
  floorSlabSize: 120,
  // Texture
  texRepeatU: 0.5,
  texRepeatV: 0.5,
  texEnabled: false,
  normalScale: 1.0,
  // Glass Panels
  glassPanelVisible: true,
  glassPanelOpacity: 1.0,
  glassPanelImages: true,
  glassPanelImageOpacity: 1.0,
  glassPanelFlipImages: true,
};

// =====================================================
// INITIAL STATE (no Tweakpane needed)
// =====================================================
if (!params.buildMode) { buildPlane.constant = 99999; buildPlaneBottom.constant = 99999; }
sideTexts.forEach(st => {
  st.mesh.scale.x = params.textFlipX ? -1 : 1;
  st.mesh.scale.z = params.textFlipZ ? -1 : 1;
});
stageGlowPlanes.forEach(sg => { sg.mesh.visible = params.stageGlowEnabled; });
backdropPanels.forEach(bp => { bp.mesh.visible = params.backdropEnabled; });

// Defer until scaffold is built
scaffoldReady.then(() => { if (params.glassPanelImages) applyGlassImages(params); });

// FPS counter
const fpsEl = document.createElement('div');
fpsEl.style.cssText = 'position:fixed;top:12px;right:16px;color:rgba(255,240,220,0.35);font:11px monospace;z-index:20;pointer-events:none;display:none;';
fpsEl.setAttribute('aria-hidden', 'true');
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

// =====================================================
// LAZY TWEAKPANE — only loaded on Cmd+G / Ctrl+G
// =====================================================
let pane = null;

async function initPane() {
  const { Pane } = await import('tweakpane');
  pane = new Pane({ title: 'Installation Controls' });
  pane.element.style.position = 'fixed';
  pane.element.style.left = '0';
  pane.element.style.top = '0';
  pane.element.style.zIndex = '9000';

  // Helpers
  const setFloorsVisible = v => {
    scaffold.traverse(child => {
      if (child.isMesh && child.userData.componentType) {
        const t = child.userData.componentType;
        if (t === 'platform' || t === 'transitionSlab' || t === 'lookout') child.visible = v;
      }
    });
  };
  const applyPoleThickness = v => {
    scaffold.traverse(child => {
      if (child.isMesh && child.geometry.type === 'CylinderGeometry') child.scale.set(v, 1, v);
    });
  };

  const tab = pane.addTab({ pages: [{ title: 'Rendering' }, { title: 'Scene' }, { title: 'Objects' }] });
  const renderPage = tab.pages[0];
  const scenePage = tab.pages[1];
  const objectsPage = tab.pages[2];

  // -- Camera --
  const camFolder = renderPage.addFolder({ title: 'Camera', expanded: false });
  camFolder.addBinding(params, 'usePerspective', { label: 'Perspective' }).on('change', ev => {
    const cam = switchCamera(ev.value);
    setControlsCamera(cam);
    setPostCamera(cam);
  });
  camFolder.addBinding(params, 'frustum', { label: 'Ortho Frustum', min: 5, max: 50 }).on('change', ev => {
    const v = ev.value;
    const { orthoCamera } = sceneModule;
    const a = window.innerWidth / window.innerHeight;
    orthoCamera.left = -v*a/2; orthoCamera.right = v*a/2;
    orthoCamera.top = v/2; orthoCamera.bottom = -v/2;
    orthoCamera.updateProjectionMatrix();
  });
  camFolder.addBinding(params, 'perspFov', { label: 'FOV', min: 20, max: 120, step: 1 }).on('change', ev => {
    perspCamera.fov = ev.value; perspCamera.updateProjectionMatrix();
  });
  camFolder.addBinding(params, 'perspNear', { label: 'Near', min: 0.01, max: 5, step: 0.01 }).on('change', ev => {
    perspCamera.near = ev.value; perspCamera.updateProjectionMatrix();
  });
  camFolder.addBinding(params, 'perspFar', { label: 'Far', min: 50, max: 1000, step: 10 }).on('change', ev => {
    perspCamera.far = ev.value; perspCamera.updateProjectionMatrix();
  });
  camFolder.addBinding(params, 'sunLocked', { label: 'Lock Sun to View' });
  camFolder.addBinding(params, 'buildMode', { label: 'Build Mode' }).on('change', ev => {
    if (!ev.value) { buildPlane.constant = 99999; buildPlaneBottom.constant = 99999; }
  });
  camFolder.addBinding(params, 'buildOffset', { label: 'Top Offset', min: 0, max: 40, step: 1 });
  camFolder.addBinding(params, 'buildOffsetBottom', { label: 'Bottom Offset', min: 0, max: 40, step: 1 });

  // -- Bloom --
  const bloomFolder = renderPage.addFolder({ title: 'Bloom', expanded: false });
  bloomFolder.addBinding(params, 'bloomEnabled', { label: 'Enable' }).on('change', ev => bloom.enabled = ev.value);
  bloom.enabled = params.bloomEnabled;
  bloomFolder.addBinding(params, 'bloomStrength', { label: 'Strength', min: 0, max: 3, step: 0.01 }).on('change', ev => bloom.strength = ev.value);
  bloomFolder.addBinding(params, 'bloomRadius', { label: 'Radius', min: 0, max: 2, step: 0.01 }).on('change', ev => bloom.radius = ev.value);
  bloomFolder.addBinding(params, 'bloomThreshold', { label: 'Threshold', min: 0, max: 1, step: 0.01 }).on('change', ev => bloom.threshold = ev.value);

  // -- Depth of Field --
  const dofFolder = renderPage.addFolder({ title: 'Depth of Field', expanded: false });
  dofFolder.addBinding(params, 'dofEnabled', { label: 'Enable' }).on('change', ev => bokehPass.enabled = ev.value);
  dofFolder.addBinding(params, 'dofFocus', { label: 'Focus Distance', min: 0.1, max: 60, step: 0.1 }).on('change', ev => bokehPass.uniforms['focus'].value = ev.value);
  dofFolder.addBinding(params, 'dofAperture', { label: 'Aperture', min: 0, max: 0.01, step: 0.0001 }).on('change', ev => bokehPass.uniforms['aperture'].value = ev.value);
  dofFolder.addBinding(params, 'dofMaxBlur', { label: 'Max Blur', min: 0, max: 0.1, step: 0.001 }).on('change', ev => bokehPass.uniforms['maxblur'].value = ev.value);

  // -- Fog --
  const fogFolder = renderPage.addFolder({ title: 'Fog', expanded: false });
  fogFolder.addBinding(params, 'fogLinear', { label: 'Linear Fog' }).on('change', ev => {
    const color = scene.fog.color;
    if (ev.value) scene.fog = new THREE.Fog(color, params.fogNear, params.fogFar);
    else scene.fog = new THREE.FogExp2(color, params.fogDensity);
  });
  fogFolder.addBinding(params, 'fogDensity', { label: 'Density (Exp2)', min: 0, max: 0.5, step: 0.005 }).on('change', ev => {
    if (!params.fogLinear) scene.fog.density = ev.value;
  });
  fogFolder.addBinding(params, 'fogNear', { label: 'Near', min: 0, max: 100, step: 1 }).on('change', ev => {
    if (params.fogLinear) scene.fog.near = ev.value;
  });
  fogFolder.addBinding(params, 'fogFar', { label: 'Far', min: 10, max: 500, step: 5 }).on('change', ev => {
    if (params.fogLinear) scene.fog.far = ev.value;
  });

  // -- God Rays --
  const godRayFolder = renderPage.addFolder({ title: 'God Rays', expanded: false });
  godRayFolder.addBinding(params, 'godRaysEnabled', { label: 'Enable' }).on('change', ev => godRaysPass.enabled = ev.value);
  godRayFolder.addBinding(params, 'godRayExposure', { label: 'Exposure', min: 0, max: 1, step: 0.01 }).on('change', ev => godRaysPass.uniforms.exposure.value = ev.value);
  godRayFolder.addBinding(params, 'godRayDecay', { label: 'Decay', min: 0.8, max: 1, step: 0.005 }).on('change', ev => godRaysPass.uniforms.decay.value = ev.value);
  godRayFolder.addBinding(params, 'godRayDensity', { label: 'Density', min: 0, max: 2, step: 0.05 }).on('change', ev => godRaysPass.uniforms.density.value = ev.value);
  godRayFolder.addBinding(params, 'godRayWeight', { label: 'Weight', min: 0, max: 2, step: 0.05 }).on('change', ev => godRaysPass.uniforms.weight.value = ev.value);
  const sunFolder = godRayFolder.addFolder({ title: 'Sun Position', expanded: false });
  sunFolder.addBinding(params, 'sunRadius', { label: 'Distance', min: 15, max: 60, step: 1 });
  sunFolder.addBinding(params, 'sunHeight', { label: 'Height', min: 5, max: 40, step: 0.5 });
  sunFolder.addBinding(params, 'sunAngleOffset', { label: 'Angle Offset', min: -Math.PI, max: Math.PI, step: 0.05 });

  // -- Post FX --
  const fxFolder = renderPage.addFolder({ title: 'Post FX', expanded: false });
  fxFolder.addBinding(params, 'grainIntensity', { label: 'Film Grain', min: 0, max: 0.3, step: 0.005 }).on('change', ev => grainPass.uniforms.intensity.value = ev.value);
  fxFolder.addBinding(params, 'colorSaturation', { label: 'Saturation', min: 0, max: 2, step: 0.01 }).on('change', ev => colorGradePass.uniforms.saturation.value = ev.value);
  fxFolder.addBinding(params, 'colorContrast', { label: 'Contrast', min: 0.5, max: 2, step: 0.01 }).on('change', ev => colorGradePass.uniforms.contrast.value = ev.value);
  fxFolder.addBinding(params, 'colorBrightness', { label: 'Brightness', min: -0.3, max: 0.3, step: 0.01 }).on('change', ev => colorGradePass.uniforms.brightness.value = ev.value);
  const tintFolder = fxFolder.addFolder({ title: 'Color Tint', expanded: false });
  tintFolder.addBinding(params, 'tintR', { label: 'R', min: 0.5, max: 1.5, step: 0.01 }).on('change', ev => colorGradePass.uniforms.tintR.value = ev.value);
  tintFolder.addBinding(params, 'tintG', { label: 'G', min: 0.5, max: 1.5, step: 0.01 }).on('change', ev => colorGradePass.uniforms.tintG.value = ev.value);
  tintFolder.addBinding(params, 'tintB', { label: 'B', min: 0.5, max: 1.5, step: 0.01 }).on('change', ev => colorGradePass.uniforms.tintB.value = ev.value);

  // -- Tone Mapping --
  const toneFolder = renderPage.addFolder({ title: 'Tone Mapping Exposure', expanded: false });
  toneFolder.addBinding(params, 'exposure', { label: 'Exposure', min: 0.1, max: 3, step: 0.05 }).on('change', ev => renderer.toneMappingExposure = ev.value);

  // -- Quality --
  const qualityFolder = renderPage.addFolder({ title: 'Quality', expanded: false });
  qualityFolder.addBinding(params, 'pixelRatio', { label: 'Pixel Ratio', min: 0.5, max: Math.min(window.devicePixelRatio, 3), step: 0.25 }).on('change', ev => {
    renderer.setPixelRatio(ev.value);
    composer.setSize(window.innerWidth, window.innerHeight);
    smaaPass.setSize(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio());
  });
  qualityFolder.addBinding(params, 'smaa', { label: 'SMAA' }).on('change', ev => smaaPass.enabled = ev.value);

  // -- Stage Atmosphere --
  const atmoFolder = scenePage.addFolder({ title: 'Stage Atmosphere', expanded: false });
  atmoFolder.addBinding(params, 'stageGlowEnabled', { label: 'Stage Glow' }).on('change', ev => {
    stageGlowPlanes.forEach(sg => { sg.mesh.visible = ev.value; });
  });
  atmoFolder.addBinding(params, 'stageGlowIntensity', { label: 'Glow Intensity', min: 0, max: 20, step: 0.1 });
  atmoFolder.addBinding(params, 'backdropEnabled', { label: 'Backdrop' }).on('change', ev => {
    backdropPanels.forEach(bp => { bp.mesh.visible = ev.value; });
  });
  atmoFolder.addBinding(params, 'backdropIntensity', { label: 'Backdrop Intensity', min: 0, max: 20, step: 0.1 });
  atmoFolder.addBinding(params, 'shroudEnabled', { label: 'Shroud' }).on('change', ev => {
    shroudPlanes.forEach(sp => { sp.mesh.visible = ev.value; });
  });
  const floorsFolder = atmoFolder.addFolder({ title: 'Floors', expanded: false });
  floorsFolder.addBinding(params, 'stageFloorsVisible', { label: 'Stage Floors' }).on('change', ev => setFloorsVisible(ev.value));
  setFloorsVisible(params.stageFloorsVisible);
  scaffoldReady.then(() => setFloorsVisible(params.stageFloorsVisible));
  floorsFolder.addBinding(params, 'floorOpacity', { label: 'Opacity', min: 0, max: 1, step: 0.01 }).on('change', ev => {
    floorMats.forEach(m => { m.opacity = ev.value; });
  });
  floorsFolder.addBinding(params, 'floorMetalness', { label: 'Metalness', min: 0, max: 1, step: 0.01 }).on('change', ev => {
    floorMats.forEach(m => { m.metalness = ev.value; });
  });
  floorsFolder.addBinding(params, 'floorRoughness', { label: 'Roughness', min: 0, max: 1, step: 0.01 }).on('change', ev => {
    floorMats.forEach(m => { m.roughness = ev.value; });
  });
  floorsFolder.addBinding(params, 'floorSlabSize', { label: 'Slab Size', min: 10, max: 500, step: 5 }).on('change', ev => {
    scaffold.traverse(child => {
      if (child.isMesh && child.userData.componentType === 'transitionSlab') {
        child.geometry.dispose();
        child.geometry = new THREE.BoxGeometry(ev.value, 0.12, ev.value);
      }
    });
  });

  // -- Lights --
  const lightFolder = scenePage.addFolder({ title: 'Lights', expanded: false });
  const ambientFolder = lightFolder.addFolder({ title: 'Ambient', expanded: false });
  ambientFolder.addBinding(params, 'ambientIntensity', { label: 'Intensity', min: 0, max: 5, step: 0.05 }).on('change', ev => ambientLight.intensity = ev.value);
  ambientFolder.addBinding(params, 'ambientColor', { label: 'Color' }).on('change', ev => ambientLight.color.set(ev.value));
  const hemiFolder = lightFolder.addFolder({ title: 'Hemisphere', expanded: false });
  hemiFolder.addBinding(params, 'hemiIntensity', { label: 'Intensity', min: 0, max: 5, step: 0.05 }).on('change', ev => hemiLight.intensity = ev.value);
  hemiFolder.addBinding(params, 'hemiSkyColor', { label: 'Sky Color' }).on('change', ev => hemiLight.color.set(ev.value));
  hemiFolder.addBinding(params, 'hemiGroundColor', { label: 'Ground Color' }).on('change', ev => hemiLight.groundColor.set(ev.value));
  const keyFolder = lightFolder.addFolder({ title: 'Key Light', expanded: false });
  keyFolder.addBinding(params, 'keyLightIntensity', { label: 'Intensity', min: 0, max: 20, step: 0.1 }).on('change', ev => keyLight.intensity = ev.value);
  keyFolder.addBinding(params, 'keyLightColor', { label: 'Color' }).on('change', ev => keyLight.color.set(ev.value));
  keyFolder.addBinding(params, 'keyLightX', { label: 'X', min: -30, max: 30, step: 0.5 }).on('change', ev => keyLight.position.x = ev.value);
  keyFolder.addBinding(params, 'keyLightY', { label: 'Y offset', min: 0, max: 50, step: 0.5 });
  keyFolder.addBinding(params, 'keyLightZ', { label: 'Z', min: -30, max: 30, step: 0.5 }).on('change', ev => keyLight.position.z = ev.value);
  const rimFolder = lightFolder.addFolder({ title: 'Rim Light', expanded: false });
  rimFolder.addBinding(params, 'rimLightIntensity', { label: 'Intensity', min: 0, max: 10, step: 0.1 }).on('change', ev => rimLight.intensity = ev.value);
  rimFolder.addBinding(params, 'rimLightColor', { label: 'Color' }).on('change', ev => rimLight.color.set(ev.value));
  rimFolder.addBinding(params, 'rimLightX', { label: 'X', min: -30, max: 30, step: 0.5 }).on('change', ev => rimLight.position.x = ev.value);
  rimFolder.addBinding(params, 'rimLightY', { label: 'Y', min: -30, max: 50, step: 0.5 }).on('change', ev => rimLight.position.y = ev.value);
  rimFolder.addBinding(params, 'rimLightZ', { label: 'Z', min: -30, max: 30, step: 0.5 }).on('change', ev => rimLight.position.z = ev.value);
  const sunLightFolder = lightFolder.addFolder({ title: 'Sun Light', expanded: false });
  sunLightFolder.addBinding(params, 'sunLightIntensity', { label: 'Intensity', min: 0, max: 10, step: 0.1 }).on('change', ev => sunLight.intensity = ev.value);
  sunLightFolder.addBinding(params, 'sunLightColor', { label: 'Color' }).on('change', ev => sunLight.color.set(ev.value));
  const gridFolder = lightFolder.addFolder({ title: 'Grid Lights', expanded: false });
  gridFolder.addBinding(params, 'gridLightIntensity', { label: 'Intensity', min: 0, max: 10, step: 0.1 }).on('change', ev => {
    gridLights.forEach(gl => gl.light.intensity = ev.value);
  });
  gridFolder.addBinding(params, 'gridLightDistance', { label: 'Distance', min: 1, max: 80, step: 1 }).on('change', ev => {
    gridLights.forEach(gl => gl.light.distance = ev.value);
  });
  gridFolder.addBinding(params, 'gridLightSpeed', { label: 'Speed', min: 0.01, max: 2, step: 0.01 }).on('change', ev => {
    gridLights.forEach(gl => gl.speed = ev.value);
  });

  // -- Materials --
  const matFolder = scenePage.addFolder({ title: 'Materials', expanded: false });
  matFolder.addBinding(params, 'poleThickness', { label: 'Pole Thickness', min: 0.5, max: 10, step: 0.1 }).on('change', ev => applyPoleThickness(ev.value));
  applyPoleThickness(params.poleThickness);
  scaffoldReady.then(() => applyPoleThickness(params.poleThickness));
  matFolder.addBinding(params, 'scaffoldTint', { label: 'Scaffold Tint' }).on('change', ev => {
    const c = new THREE.Color(ev.value);
    STAGE_MATS.forEach(sm => { sm.steel.color.copy(c); sm.deck.color.copy(c); });
    if (glassMat) glassMat.color.copy(c);
  });
  matFolder.addBinding(params, 'steelMetalness', { label: 'Steel Metalness', min: 0, max: 1, step: 0.01 }).on('change', ev => {
    STAGE_MATS.forEach(sm => sm.steel.metalness = ev.value);
  });
  matFolder.addBinding(params, 'steelRoughness', { label: 'Steel Roughness', min: 0, max: 1, step: 0.01 }).on('change', ev => {
    STAGE_MATS.forEach(sm => sm.steel.roughness = ev.value);
  });
  const vegFolder = matFolder.addFolder({ title: 'Vegetation', expanded: false });
  vegFolder.addBinding(params, 'vinesVisible', { label: 'Vines' }).on('change', ev => vineGroup.visible = ev.value);
  vegFolder.addBinding(params, 'shrubsVisible', { label: 'Shrubs' }).on('change', ev => shrubGroup.visible = ev.value);
  vegFolder.addBinding(params, 'flowersVisible', { label: 'Flowers' }).on('change', ev => {
    scene.traverse(o => { if (o.name === 'flowers') o.visible = ev.value; });
  });
  vegFolder.addBinding(params, 'flowerLightIntensity', { label: 'Flower Light', min: 0, max: 5, step: 0.1 }).on('change', ev => {
    flowerLight.intensity = ev.value;
  });

  // -- Glass Panels --
  const glassFolder = scenePage.addFolder({ title: 'Glass Panels', expanded: false });
  glassFolder.addBinding(params, 'glassPanelVisible', { label: 'Visible' }).on('change', ev => {
    glassPanels.forEach(m => { m.visible = ev.value; });
  });
  glassFolder.addBinding(params, 'glassPanelOpacity', { label: 'Color Opacity', min: 0, max: 1, step: 0.01 }).on('change', ev => {
    glassPanels.forEach(m => { if (!m.userData.imageMode) m.material.opacity = ev.value; });
  });
  glassFolder.addBinding(params, 'glassPanelImages', { label: 'Show Images' }).on('change', ev => {
    if (ev.value) applyGlassImages(params);
    else removeGlassImages(params);
  });
  glassFolder.addBinding(params, 'glassPanelImageOpacity', { label: 'Image Opacity', min: 0, max: 1, step: 0.01 }).on('change', ev => {
    const mats = getGlassImageMats();
    if (mats) mats.forEach(m => { m.opacity = ev.value; });
  });
  glassFolder.addBinding(params, 'glassPanelFlipImages', { label: 'Flip Images' }).on('change', ev => {
    for (const [, tex] of getGlassTexCache()) {
      tex.repeat.x = ev.value ? -1 : 1;
      tex.offset.x = ev.value ? 1 : 0;
    }
  });

  // -- Texture --
  const texFolder = scenePage.addFolder({ title: 'Texture', expanded: false });
  texFolder.addBinding(params, 'texEnabled', { label: 'Marble Texture' }).on('change', ev => {
    if (ev.value) loadMarbleTextures().then(() => applyMarbleTextures(true));
    else applyMarbleTextures(false);
  });
  texFolder.addBinding(params, 'texRepeatU', { label: 'Repeat U', min: 0.1, max: 10, step: 0.1 }).on('change', ev => {
    const tex = getMarbleTextures();
    if (tex) Object.values(tex).forEach(t => { t.repeat.x = ev.value; });
  });
  texFolder.addBinding(params, 'texRepeatV', { label: 'Repeat V', min: 0.1, max: 10, step: 0.1 }).on('change', ev => {
    const tex = getMarbleTextures();
    if (tex) Object.values(tex).forEach(t => { t.repeat.y = ev.value; });
  });
  texFolder.addBinding(params, 'normalScale', { label: 'Normal Strength', min: 0, max: 3, step: 0.05 }).on('change', ev => {
    STAGE_MATS.forEach(sm => {
      sm.steel.normalScale.set(ev.value, ev.value);
      sm.deck.normalScale.set(ev.value, ev.value);
    });
  });

  // -- Image Cards --
  const cardFolder = objectsPage.addFolder({ title: 'Image Cards', expanded: false });
  cardFolder.addBinding(params, 'cardsVisible', { label: 'Visible' }).on('change', ev => {
    cards.forEach(c => c.mesh.visible = ev.value);
  });
  cardFolder.addBinding(params, 'cardOpacity', { label: 'Opacity', min: 0, max: 1, step: 0.01 }).on('change', ev => {
    cards.forEach(c => c.mat.uniforms.opacity.value = ev.value);
  });
  cardFolder.addBinding(params, 'cardRadius', { label: 'Radius', min: 3, max: 20, step: 0.5 }).on('change', () => rebuildCards(params));
  cardFolder.addBinding(params, 'cardH', { label: 'Height', min: 1, max: 15, step: 0.5 }).on('change', () => rebuildCards(params));
  cardFolder.addBinding(params, 'cardRise', { label: 'Rise', min: 0, max: 30, step: 0.5 }).on('change', () => rebuildCards(params));
  cardFolder.addBinding(params, 'cardWaveAmp', { label: 'Wave Amp', min: 0, max: 3, step: 0.05 }).on('change', () => rebuildCards(params));
  cardFolder.addBinding(params, 'cardRadiusSpread', { label: 'Radius Spread', min: 0, max: 8, step: 0.5 }).on('change', () => rebuildCards(params));
  cardFolder.addBinding(params, 'cardOrbitSpeed', { label: 'Orbit Speed', min: 0, max: 0.05, step: 0.001 }).on('change', ev => {
    CARD_OPTS.orbitSpeed = ev.value;
  });

  // -- Typography --
  const textFolder = objectsPage.addFolder({ title: 'Typography', expanded: false });
  textFolder.addBinding(params, 'textMaxOpacity', { label: 'Max Opacity', min: 0, max: 1, step: 0.01 });
  textFolder.addBinding(params, 'textOrbitSpeed', { label: 'Orbit Speed', min: 0, max: 2, step: 0.01 });
  textFolder.addBinding(params, 'textBrightness', { label: 'Brightness', min: 0.5, max: 10, step: 0.1 }).on('change', ev => {
    sideTexts.forEach(st => st.mat.uniforms.brightness.value = ev.value);
  });
  textFolder.addBinding(params, 'textTintColor', { label: 'Text Color' }).on('change', ev => {
    const c = new THREE.Color(ev.value);
    sideTexts.forEach(st => st.mat.uniforms.tintColor.value.copy(c));
  });
  textFolder.addBinding(params, 'textBgColor', { label: 'Fabric Color' }).on('change', ev => {
    const c = new THREE.Color(ev.value);
    sideTexts.forEach(st => st.mat.uniforms.bgColor.value.copy(c));
  });
  textFolder.addBinding(params, 'textBgOpacity', { label: 'Fabric Opacity', min: 0, max: 1, step: 0.01 }).on('change', ev => {
    sideTexts.forEach(st => st.mat.uniforms.bgOpacity.value = ev.value);
  });
  const BLEND_MODES = { Normal: THREE.NormalBlending, Additive: THREE.AdditiveBlending, Multiply: THREE.MultiplyBlending, Subtractive: THREE.SubtractiveBlending };
  textFolder.addBinding(params, 'textBlending', { label: 'Blending', options: Object.keys(BLEND_MODES).map(k => ({ text: k, value: k })) }).on('change', ev => {
    sideTexts.forEach(st => { st.mat.blending = BLEND_MODES[ev.value]; st.mat.needsUpdate = true; });
  });
  textFolder.addBinding(params, 'textDepthWrite', { label: 'Depth Write' }).on('change', ev => {
    sideTexts.forEach(st => { st.mat.depthWrite = ev.value; st.mat.needsUpdate = true; });
  });
  textFolder.addBinding(params, 'textFadeRange', { label: 'Fade In Range', min: 2, max: 30, step: 0.5 });
  textFolder.addBinding(params, 'textFadeOutMult', { label: 'Fade Out Mult', min: 1, max: 5, step: 0.1 });
  const layoutFolder = textFolder.addFolder({ title: 'Layout', expanded: false });
  layoutFolder.addBinding(params, 'textRadius', { label: 'Radius', min: 3, max: 25, step: 0.5 }).on('change', () => rebuildRibbons(params));
  layoutFolder.addBinding(params, 'textArc', { label: 'Arc (deg)', min: 30, max: 360, step: 5 }).on('change', () => rebuildRibbons(params));
  layoutFolder.addBinding(params, 'textHeight', { label: 'Height', min: 1, max: 15, step: 0.5 }).on('change', () => rebuildRibbons(params));
  layoutFolder.addBinding(params, 'textRise', { label: 'Rise', min: 0, max: 30, step: 0.5 }).on('change', () => rebuildRibbons(params));
  layoutFolder.addBinding(params, 'textYOffset', { label: 'Y Offset', min: 0, max: 20, step: 0.5 }).on('change', () => rebuildRibbons(params));
  layoutFolder.addBinding(params, 'textRotY', { label: 'Rotation Y', min: -180, max: 180, step: 5 }).on('change', () => rebuildRibbons(params));
  layoutFolder.addBinding(params, 'textStartAngleOffset', { label: 'Start Angle', min: -180, max: 180, step: 5 }).on('change', () => rebuildRibbons(params));
  const flipFolder = textFolder.addFolder({ title: 'Flip Axes', expanded: false });
  flipFolder.addBinding(params, 'textFlipX', { label: 'Flip X' }).on('change', ev => {
    sideTexts.forEach(st => st.mesh.scale.x = ev.value ? -1 : 1);
  });
  flipFolder.addBinding(params, 'textFlipY', { label: 'Flip Y' }).on('change', ev => {
    sideTexts.forEach(st => st.mesh.scale.y = ev.value ? -1 : 1);
  });
  flipFolder.addBinding(params, 'textFlipZ', { label: 'Flip Z' }).on('change', ev => {
    sideTexts.forEach(st => st.mesh.scale.z = ev.value ? -1 : 1);
  });

  // -- Fireflies --
  const ffFolder = objectsPage.addFolder({ title: 'Fireflies', expanded: false });
  ffFolder.addBinding(params, 'ffIntensity', { label: 'Light Intensity', min: 0, max: 20, step: 0.1 }).on('change', ev => {
    fireflies.forEach(ff => ff.baseIntensity = ev.value);
  });
  ffFolder.addBinding(params, 'ffDistance', { label: 'Light Distance', min: 1, max: 100, step: 1 }).on('change', ev => {
    fireflies.forEach(ff => { if (ff.light) ff.light.distance = ev.value; });
  });
  ffFolder.addBinding(params, 'ffLightDecay', { label: 'Light Decay', min: 0, max: 5, step: 0.1 }).on('change', ev => {
    fireflies.forEach(ff => { if (ff.light) ff.light.decay = ev.value; });
  });
  ffFolder.addBinding(params, 'ffGlowSize', { label: 'Glow Size', min: 0.1, max: 5, step: 0.05 }).on('change', ev => {
    fireflies.forEach(ff => ff.sprite.geometry.dispose());
    const newGeo = new THREE.SphereGeometry(0.06 * ev.value, 6, 4);
    fireflies.forEach(ff => { ff.sprite.geometry = newGeo; });
  });
  ffFolder.addBinding(params, 'ffGlowOpacity', { label: 'Glow Opacity', min: 0, max: 1, step: 0.01 }).on('change', ev => {
    fireflies.forEach(ff => ff.mat.opacity = ev.value);
  });
  ffFolder.addBinding(params, 'ffRadius', { label: 'Spread Radius', min: 1, max: 30, step: 0.5 }).on('change', ev => {
    fireflies.forEach(ff => ff.radius = 1 + Math.random() * ev.value);
  });
  const ffSpeedFolder = ffFolder.addFolder({ title: 'Animation Speeds', expanded: false });
  ffSpeedFolder.addBinding(params, 'ffPulseSpeed', { label: 'Pulse Speed', min: 0.1, max: 8, step: 0.1 }).on('change', ev => {
    fireflies.forEach(ff => ff.pulseSpeed = (1.5 + Math.random() * 3) * ev.value);
  });
  ffSpeedFolder.addBinding(params, 'ffOrbitSpeed', { label: 'Orbit Speed', min: 0, max: 5, step: 0.05 }).on('change', ev => {
    fireflies.forEach(ff => ff.speed = (0.2 + Math.random() * 0.5) * ev.value);
  });
  ffSpeedFolder.addBinding(params, 'ffVerticalSpeed', { label: 'Vertical Speed', min: 0, max: 5, step: 0.05 }).on('change', ev => {
    fireflies.forEach(ff => ff.ySpeed = (0.1 + Math.random() * 0.3) * ev.value);
  });
  ffSpeedFolder.addBinding(params, 'ffVerticalRange', { label: 'Vertical Range', min: 1, max: 40, step: 1 }).on('change', ev => {
    fireflies.forEach(ff => ff.yOffset = THREE.MathUtils.clamp(ff.yOffset, -ev.value, ev.value));
  });

  return pane;
}

// Cmd+G to toggle GUI (lazy-loads Tweakpane on first press)
let paneLoading = false;
window.addEventListener('keydown', async e => {
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyG') {
    e.preventDefault();
    if (!pane && !paneLoading) {
      paneLoading = true;
      pane = await initPane();
      fpsEl.style.display = '';
    } else if (pane) {
      pane.hidden = !pane.hidden;
      fpsEl.style.display = pane.hidden ? 'none' : '';
    }
  }
});
