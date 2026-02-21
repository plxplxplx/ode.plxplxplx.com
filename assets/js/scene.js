import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FRUSTUM, TOP_H, isMobile } from './config.js';

// =====================================================
// RENDERER + SCENE
// =====================================================
export const canvas = document.getElementById('viewport');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile });
renderer.setPixelRatio(isMobile ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.8;
renderer.shadowMap.enabled = !isMobile;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;

// Build clipping plane — clips everything above (normal points down)
// Starts disabled (constant far above tower)
export const buildPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 99999);

export const scene = new THREE.Scene();
export const fogColor = 0x140e08;
scene.background = new THREE.Color(0x140e08);
scene.fog = new THREE.FogExp2(fogColor, 0.04);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

const aspect = window.innerWidth / window.innerHeight;
export const orthoCamera = new THREE.OrthographicCamera(
  -FRUSTUM * aspect / 2, FRUSTUM * aspect / 2, FRUSTUM / 2, -FRUSTUM / 2, 0.1, 300
);
export const perspCamera = new THREE.PerspectiveCamera(50, aspect, 0.1, 300);
export let camera = orthoCamera;
export let usePerspective = false;

export function switchCamera(toPerspective) {
  usePerspective = toPerspective;
  const prev = camera;
  camera = toPerspective ? perspCamera : orthoCamera;
  camera.position.copy(prev.position);
  camera.quaternion.copy(prev.quaternion);
  updateProjection();
  return camera;
}

// =====================================================
// LIGHTS
// =====================================================
scene.add(new THREE.AmbientLight(0x3a2a1a, 1.0));
export const keyLight = new THREE.DirectionalLight(0xffe8d0, 5.0);
keyLight.position.set(-5, 25, -12);
keyLight.castShadow = !isMobile;
keyLight.shadow.mapSize.set(isMobile ? 512 : 2048, isMobile ? 512 : 2048);
keyLight.shadow.camera.left = -15; keyLight.shadow.camera.right = 15;
keyLight.shadow.camera.top = 70; keyLight.shadow.camera.bottom = -5;
keyLight.shadow.camera.far = 150;
scene.add(keyLight);

// Cool rim light from sun side
export const rimLight = new THREE.DirectionalLight(0xffe0c0, 0.8);
rimLight.position.set(-10, 20, -15);
scene.add(rimLight);
scene.add(new THREE.HemisphereLight(0xffddaa, 0x1a1008, 0.7));

// Sun — behind the scaffold, above and off-screen for bird's-eye god rays
export const sunPos = new THREE.Vector3(-3, 12, -20);
export const sunLight = new THREE.DirectionalLight(0xffe0b0, 0.8);
sunLight.position.copy(sunPos);
scene.add(sunLight);

// Large sun mesh (golden glow behind the structure)
export const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(4, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
sunMesh.position.copy(sunPos);
scene.add(sunMesh);

// Occlusion scene — renders scene as black silhouettes, sun as bright white
export const occlusionScene = new THREE.Scene();
export const occlusionMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
export const sunOccMesh = new THREE.Mesh(
  new THREE.SphereGeometry(8, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
sunOccMesh.position.copy(sunPos);
occlusionScene.add(sunOccMesh);

export const occRT = new THREE.WebGLRenderTarget(
  Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2)
);
export const occBlurRT = new THREE.WebGLRenderTarget(
  Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2)
);

// =====================================================
// PROJECTION HELPER
// =====================================================
export function updateProjection() {
  const a = window.innerWidth / window.innerHeight;
  orthoCamera.left = -FRUSTUM*a/2; orthoCamera.right = FRUSTUM*a/2;
  orthoCamera.top = FRUSTUM/2; orthoCamera.bottom = -FRUSTUM/2;
  orthoCamera.updateProjectionMatrix();
  perspCamera.aspect = a;
  perspCamera.updateProjectionMatrix();
}
// Keep backward compat alias
export const setOrtho = updateProjection;
