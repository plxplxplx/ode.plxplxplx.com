import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  GodRaysShader, VignetteShader,
  FilmGrainShader, ColorGradeShader,
} from './shaders.js';
import { renderer, scene, camera, occRT, occBlurRT, setOrtho } from './scene.js';
import { QUALITY } from './config.js';


// =====================================================
// POST-PROCESSING
// =====================================================
export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

export const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.3, 0.75
);
bloom.enabled = QUALITY.bloom;
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
vignettePass.enabled = QUALITY.vignette;
composer.addPass(vignettePass);

export const colorGradePass = new ShaderPass(ColorGradeShader);
colorGradePass.enabled = QUALITY.colorGrade;
composer.addPass(colorGradePass);

export const grainPass = new ShaderPass(FilmGrainShader);
grainPass.enabled = QUALITY.filmGrain;
composer.addPass(grainPass);

// FXAA — cheap screen-space anti-aliasing (compensates for EffectComposer losing native MSAA)
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
export const fxaaPass = new ShaderPass(FXAAShader);
fxaaPass.uniforms.resolution.value.set(1 / window.innerWidth, 1 / window.innerHeight);
fxaaPass.enabled = false;
composer.addPass(fxaaPass);

// OutputPass applies tone mapping + output color space to final render
composer.addPass(new OutputPass());

// Reference to the render pass for camera swap
const renderPass = composer.passes[0];

export function setPostCamera(cam) {
  renderPass.camera = cam;
  bokehPass.camera = cam;
}

// Resize handler — RAF-debounced to avoid redundant work
let _resizePending = false;
function onResize() {
  if (_resizePending) return;
  _resizePending = true;
  requestAnimationFrame(() => {
    _resizePending = false;
    setOrtho();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloom.resolution.set(window.innerWidth, window.innerHeight);
    bokehPass.setSize(window.innerWidth, window.innerHeight);
    fxaaPass.uniforms.resolution.value.set(1 / window.innerWidth, 1 / window.innerHeight);
    occRT.setSize(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2));
    occBlurRT.setSize(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2));
    // Repaint immediately so the canvas doesn't flash blank between resize events
    composer.render();
  });
}
window.addEventListener('resize', onResize, { passive: true });
