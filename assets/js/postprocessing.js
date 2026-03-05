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
import { renderer, scene, camera, occRT, occBlurRT, setOrtho, occlusionMat, occlusionScene } from './scene.js';
import { QUALITY } from './config.js';


// =====================================================
// POST-PROCESSING
// =====================================================
const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
  samples: QUALITY.antialias ? 8 : 0,
});
export const composer = new EffectComposer(renderer, rt);
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

// SMAA — high-quality sub-pixel anti-aliasing (better than FXAA for thin geometry)
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
export const smaaPass = new SMAAPass(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio());
smaaPass.enabled = true;
composer.addPass(smaaPass);

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
    smaaPass.setSize(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio());
    occRT.setSize(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2));
    occBlurRT.setSize(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2));
    // Repaint immediately so the canvas doesn't flash blank between resize events
    composer.render();
  });
}
window.addEventListener('resize', onResize, { passive: true });

// =====================================================
// OCCLUSION PASS + BLUR (god rays)
// =====================================================
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

const _occBlack = new THREE.Color(0x000000);

export function renderOcclusion(cam, occFrame) {
  if (!godRaysPass.enabled || !(occFrame & 1)) return;

  const origBg = scene.background;
  const origFog = scene.fog;
  scene.background = _occBlack;
  scene.fog = null;
  scene.overrideMaterial = occlusionMat;
  renderer.setRenderTarget(occRT);
  renderer.clear();
  renderer.render(scene, cam);
  scene.overrideMaterial = null;
  scene.background = origBg;
  scene.fog = origFog;
  // Sun sphere on top (white, additive)
  renderer.autoClear = false;
  renderer.render(occlusionScene, cam);
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
