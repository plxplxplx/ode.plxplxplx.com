import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import {
  GodRaysShader, VignetteShader, ChromaticAberrationShader,
  FilmGrainShader, ColorGradeShader,
} from './shaders.js';
import { renderer, scene, camera, occRT, occBlurRT, setOrtho } from './scene.js';
import { isMobile } from './config.js';

// =====================================================
// POST-PROCESSING
// =====================================================
export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

export const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.3, 0.75
);
bloom.enabled = !isMobile;
composer.addPass(bloom);

export const bokehPass = new BokehPass(scene, camera, {
  focus: 1,
  aperture: 0.004,
  maxblur: 0.001,
});
bokehPass.enabled = false;
composer.addPass(bokehPass);

export const godRaysPass = new ShaderPass(GodRaysShader);
godRaysPass.uniforms.tOcclusion.value = occRT.texture;
godRaysPass.enabled = false;
composer.addPass(godRaysPass);

const vignettePass = new ShaderPass(VignetteShader);
composer.addPass(vignettePass);

export const chromaPass = new ShaderPass(ChromaticAberrationShader);
chromaPass.enabled = !isMobile;
composer.addPass(chromaPass);

export const colorGradePass = new ShaderPass(ColorGradeShader);
composer.addPass(colorGradePass);

export const grainPass = new ShaderPass(FilmGrainShader);
grainPass.enabled = !isMobile;
composer.addPass(grainPass);

// Reference to the render pass for camera swap
const renderPass = composer.passes[0];

export function setPostCamera(cam) {
  renderPass.camera = cam;
  bokehPass.camera = cam;
}

// Resize handler — update projection immediately, defer expensive RT resizes
function onResize() {
  setOrtho();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.resolution.set(window.innerWidth, window.innerHeight);
  bokehPass.setSize(window.innerWidth, window.innerHeight);
  occRT.setSize(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2));
  occBlurRT.setSize(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2));
}
window.addEventListener('resize', onResize);
