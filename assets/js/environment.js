import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { manager } from './loader.js';
import {
  BAYS_X, BAYS_Z, BAY_W, BAY_D, LEVEL_H, TOP_H,
  STAGES, ZONES_COLORS, PLAT_H, TOTAL_W, TOTAL_D,
  gx, gz, cellCx, cellCz, QUALITY,
} from './config.js';
import { scene, ktx2Loader, buildPlane, buildPlaneBottom } from './scene.js';
import { stageGlowVert, stageGlowFrag, backdropFogVert, backdropFogFrag } from './shaders.js';
import { totalLevels, LOOKOUTS } from './scaffold.js';
import { seededPRNG } from './utils.js';

let seededRandom = seededPRNG(12345);

// =====================================================
// INSTANCED MESH HELPER
// =====================================================
function createInstancedMeshes(model, transforms, targetGroup) {
  if (transforms.length === 0) return;
  model.updateMatrixWorld(true);
  const modelInverse = new THREE.Matrix4().copy(model.matrixWorld).invert();

  const meshChildren = [];
  model.traverse(child => {
    if (child.isMesh) {
      const relativeMatrix = new THREE.Matrix4().multiplyMatrices(modelInverse, child.matrixWorld);
      meshChildren.push({ geometry: child.geometry, material: child.material, relativeMatrix });
    }
  });

  const parentMatrix = new THREE.Matrix4();
  const instanceMatrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();

  for (const { geometry, material, relativeMatrix } of meshChildren) {
    const instMesh = new THREE.InstancedMesh(geometry, material, transforms.length);
    instMesh.frustumCulled = false;
    instMesh.castShadow = true;
    instMesh.receiveShadow = true;

    for (let i = 0; i < transforms.length; i++) {
      const t = transforms[i];
      quat.setFromEuler(t.rotation);
      parentMatrix.compose(t.position, quat, t.scale);
      instanceMatrix.multiplyMatrices(parentMatrix, relativeMatrix);
      instMesh.setMatrixAt(i, instanceMatrix);
    }
    instMesh.instanceMatrix.needsUpdate = true;
    targetGroup.add(instMesh);
  }
}

// =====================================================
// VOLUMETRIC FOG BANDS between stages
// =====================================================
export const transitionPlanes = [];
const volFogGeo = new THREE.PlaneGeometry(60, 60);
const VOL_FOG_LAYERS = QUALITY.volFogLayers;
const VOL_FOG_SPREAD = 4;

for (let si = 1; si < STAGES.length; si++) {
  const boundaryY = STAGES[si].floorY;
  const colBelow = new THREE.Color(ZONES_COLORS[si - 1]);
  const colAbove = new THREE.Color(ZONES_COLORS[si]);
  const blended = colBelow.clone().lerp(colAbove, 0.5);

  for (let li = 0; li < VOL_FOG_LAYERS; li++) {
    const f = (li / (VOL_FOG_LAYERS - 1)) * 2 - 1;
    const yOff = f * VOL_FOG_SPREAD;
    const bellCurve = Math.exp(-f * f * 2);
    const plane = new THREE.Mesh(volFogGeo, new THREE.MeshBasicMaterial({
      color: blended, transparent: true, opacity: 0.0,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = boundaryY + yOff;
    scene.add(plane);
    transitionPlanes.push({
      mesh: plane,
      y: boundaryY,
      layerY: boundaryY + yOff,
      bellCurve,
      stageIdx: si,
    });
  }
}

// Wrap-seam fog band — smooth transition from SUMMIT back to GROUND
{
  const colTop = new THREE.Color(ZONES_COLORS[STAGES.length - 1]);
  const colBot = new THREE.Color(ZONES_COLORS[0]);
  const wrapBlend = colTop.clone().lerp(colBot, 0.5);

  for (let li = 0; li < VOL_FOG_LAYERS; li++) {
    const f = VOL_FOG_LAYERS > 1 ? (li / (VOL_FOG_LAYERS - 1)) * 2 - 1 : 0;
    const yOff = f * VOL_FOG_SPREAD;
    const bellCurve = Math.exp(-f * f * 2);
    const plane = new THREE.Mesh(volFogGeo, new THREE.MeshBasicMaterial({
      color: wrapBlend, transparent: true, opacity: 0.0,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = TOP_H + yOff;
    scene.add(plane);
    transitionPlanes.push({
      mesh: plane,
      y: TOP_H,
      layerY: TOP_H + yOff,
      bellCurve,
      stageIdx: 0,
    });
  }
}

// Dark shroud at top and bottom of tower
const SHROUD_LAYERS = QUALITY.shroudLayers;
const SHROUD_DEPTH = 8;
const shroudColor = new THREE.Color(0x020202);
export const shroudPlanes = [];

for (let end = 0; end < 2; end++) {
  const baseY = end === 0 ? 0 : TOP_H;
  const dir = end === 0 ? -1 : 1;
  for (let li = 0; li < SHROUD_LAYERS; li++) {
    const f = li / (SHROUD_LAYERS - 1);
    const yOff = dir * f * SHROUD_DEPTH;
    const maxOpacity = 0.15 + f * 0.55;
    const plane = new THREE.Mesh(volFogGeo, new THREE.MeshBasicMaterial({
      color: shroudColor, transparent: true, opacity: 0.0,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = baseY + yOff;
    plane.visible = false;
    scene.add(plane);
    shroudPlanes.push({ mesh: plane, baseY, layerY: baseY + yOff, maxOpacity });
  }
}

// Ground floor removed — open bottom matches open top for seamless scroll wrap

// =====================================================
// VEGETATION GROUP (GLB models placed below)
// =====================================================
export const vineGroup = new THREE.Group();
vineGroup.name = 'vines';
export const vineData = []; // kept for main.js leaf-sway compatibility
scene.add(vineGroup);

// =====================================================
// VINE GLB MODEL — InstancedMesh
// =====================================================
const gltfLoader = new GLTFLoader(manager);

// On mobile, defer heavy model loads so scaffold init isn't starved
const rIC = typeof requestIdleCallback === 'function'
  ? requestIdleCallback
  : (fn, opts) => setTimeout(fn, opts?.timeout ?? 0);
const deferLoad = QUALITY.deferEnv ? (fn) => rIC(fn, { timeout: 5000 }) : (fn) => fn();

deferLoad(() => gltfLoader.load('assets/models/vine.glb', (gltf) => {
  seededRandom = seededPRNG(54321);
  const vineModel = gltf.scene;
  const vineTransforms = [];

  function collectVine(x, y, z, opts = {}) {

    const yRot = opts.yRot ?? seededRandom() * Math.PI * 2;
    const zRot = opts.zRot ?? 0;
    const xRot = opts.xRot ?? 0;
    const s = opts.scale ?? (0.3 + seededRandom() * 0.6);
    const sy = opts.scaleY ?? s * (0.8 + seededRandom() * 0.8);
    vineTransforms.push({
      position: new THREE.Vector3(x, y, z),
      rotation: new THREE.Euler(xRot, yRot, zRot),
      scale: new THREE.Vector3(s, sy, s),
    });
  }

  // Column vines — constrained to within each stage's scaffold range
  for (let i = 0; i <= BAYS_X; i++) {
    for (let j = 0; j <= BAYS_Z; j++) {
      if (seededRandom() > 0.4) continue;
      const px = gx(i), pz = gz(j);
      const count = 1 + Math.floor(seededRandom() * 3);
      for (let n = 0; n < count; n++) {
        const si = Math.floor(seededRandom() * STAGES.length);
        const stage = STAGES[si];
        const y = stage.floorY + seededRandom() * stage.scaffLevels * LEVEL_H;
        collectVine(px, y, pz, { scale: 0.25 + seededRandom() * 0.5, scaleY: 0.6 + seededRandom() * 1.2 });
      }
    }
  }

  // Horizontal vines
  for (let lv = 0; lv < totalLevels; lv++) {
    if (seededRandom() > 0.2) continue;
    const y = lv * LEVEL_H;
    const i = Math.floor(seededRandom() * BAYS_X);
    const j = Math.floor(seededRandom() * (BAYS_Z + 1));
    const mx = (gx(i) + gx(i + 1)) / 2;
    collectVine(mx, y, gz(j), {
      xRot: 0,
      zRot: Math.PI / 2 * (0.8 + seededRandom() * 0.4),
      scale: 0.2 + seededRandom() * 0.35,
      scaleY: 0.4 + seededRandom() * 0.6,
    });
  }

  // Stage edge drapes
  for (let si = 0; si < STAGES.length; si++) {
    const y = STAGES[si].floorY + 1.0;
    const hangCount = 3 + Math.floor(seededRandom() * 4);
    for (let h = 0; h < hangCount; h++) {
      const side = Math.floor(seededRandom() * 4);
      let hx, hz;
      if (side === 0) { hx = gx(0); hz = gz(seededRandom() * BAYS_Z); }
      else if (side === 1) { hx = gx(BAYS_X); hz = gz(seededRandom() * BAYS_Z); }
      else if (side === 2) { hx = gx(seededRandom() * BAYS_X); hz = gz(0); }
      else { hx = gx(seededRandom() * BAYS_X); hz = gz(BAYS_Z); }
      collectVine(hx, y, hz, {
        xRot: Math.PI * (0.4 + seededRandom() * 0.3),
        scale: 0.2 + seededRandom() * 0.4,
        scaleY: 0.5 + seededRandom() * 1.0,
      });
    }
  }

  // Lookout vines
  for (const lo of LOOKOUTS) {
    const stage = STAGES[lo.stageIdx];
    for (let b = 1; b <= lo.bays; b++) {
      if (seededRandom() > 0.4) continue;
      const ox = lo.dir[0] * b * BAY_W;
      const oz = lo.dir[1] * b * BAY_D;
      collectVine(ox, stage.floorY + seededRandom() * 2, oz, {
        scale: 0.3 + seededRandom() * 0.4,
      });
    }
  }

  // Stage base vines
  for (let si = 0; si < STAGES.length; si++) {
    const y = STAGES[si].floorY;
    for (let i = 0; i <= BAYS_X; i++) {
      for (let j = 0; j <= BAYS_Z; j++) {
        if (seededRandom() > 0.35) continue;
        collectVine(gx(i), y + seededRandom() * 0.5, gz(j), {
          scale: 0.15 + seededRandom() * 0.3,
          scaleY: 0.3 + seededRandom() * 0.5,
        });
      }
    }
  }

  createInstancedMeshes(vineModel, vineTransforms, vineGroup);
}, undefined, (err) => console.warn('vine.glb load error:', err)));

// =====================================================
// IVY GLB MODEL — InstancedMesh
// =====================================================
deferLoad(() => gltfLoader.load('assets/models/Ivy.glb', (gltf) => {
  seededRandom = seededPRNG(13579);
  const ivyModel = gltf.scene;
  const ivyTransforms = [];

  function collectIvy(x, y, z, opts = {}) {

    const yRot = opts.yRot ?? seededRandom() * Math.PI * 2;
    const zRot = opts.zRot ?? 0;
    const xRot = opts.xRot ?? 0;
    const s = opts.scale ?? (0.3 + seededRandom() * 0.5);
    ivyTransforms.push({
      position: new THREE.Vector3(x, y, z),
      rotation: new THREE.Euler(xRot, yRot, zRot),
      scale: new THREE.Vector3(s, s, s),
    });
  }

  // On vertical columns
  for (let lv = 0; lv < totalLevels; lv++) {
    if (seededRandom() > 0.25) continue;
    const y = lv * LEVEL_H;
    const i = Math.floor(seededRandom() * (BAYS_X + 1));
    const j = Math.floor(seededRandom() * (BAYS_Z + 1));
    collectIvy(gx(i), y, gz(j), { scale: 0.2 + seededRandom() * 0.4 });
  }

  // At stage floor column bases
  for (let si = 0; si < STAGES.length; si++) {
    const y = STAGES[si].floorY;
    for (let i = 0; i <= BAYS_X; i++) {
      for (let j = 0; j <= BAYS_Z; j++) {
        if (seededRandom() > 0.4) continue;
        collectIvy(gx(i), y, gz(j), {
          scale: 0.3 + seededRandom() * 0.5,
        });
      }
    }
  }

  // On outer edge columns — X edges (constrained to stages)
  for (const i of [0, BAYS_X]) {
    for (let j = 0; j <= BAYS_Z; j++) {
      const patches = 2 + Math.floor(seededRandom() * 3);
      for (let p = 0; p < patches; p++) {
        const si = Math.floor(seededRandom() * STAGES.length);
        const stage = STAGES[si];
        const y = stage.floorY + seededRandom() * stage.scaffLevels * LEVEL_H;
        collectIvy(gx(i), y, gz(j), {
          yRot: i === 0 ? Math.PI : 0,
          scale: 0.25 + seededRandom() * 0.5,
        });
      }
    }
  }
  // On outer edge columns — Z edges (constrained to stages)
  for (const j of [0, BAYS_Z]) {
    for (let i = 0; i <= BAYS_X; i++) {
      const patches = 2 + Math.floor(seededRandom() * 3);
      for (let p = 0; p < patches; p++) {
        const si = Math.floor(seededRandom() * STAGES.length);
        const stage = STAGES[si];
        const y = stage.floorY + seededRandom() * stage.scaffLevels * LEVEL_H;
        collectIvy(gx(i), y, gz(j), {
          yRot: j === 0 ? -Math.PI / 2 : Math.PI / 2,
          scale: 0.25 + seededRandom() * 0.5,
        });
      }
    }
  }

  // On lookout arms
  for (const lo of LOOKOUTS) {
    const stage = STAGES[lo.stageIdx];
    for (let b = 0; b <= lo.bays; b++) {
      if (seededRandom() > 0.45) continue;
      const ox = lo.dir[0] * b * BAY_W;
      const oz = lo.dir[1] * b * BAY_D;
      collectIvy(ox, stage.floorY + seededRandom() * 1.5, oz, {
        scale: 0.2 + seededRandom() * 0.45,
      });
    }
  }

  createInstancedMeshes(ivyModel, ivyTransforms, vineGroup);
}, undefined, (err) => console.warn('Ivy.glb load error:', err)));

// =====================================================
// IVY 2 GLB MODEL (denser variant) — InstancedMesh
// =====================================================
deferLoad(() => gltfLoader.load('assets/models/Ivy 2.glb', (gltf) => {
  seededRandom = seededPRNG(24680);
  const ivy2Model = gltf.scene;
  const ivy2Transforms = [];

  function collectIvy2(x, y, z, opts = {}) {

    const yRot = opts.yRot ?? seededRandom() * Math.PI * 2;
    const xRot = opts.xRot ?? 0;
    const s = opts.scale ?? (0.25 + seededRandom() * 0.45);
    ivy2Transforms.push({
      position: new THREE.Vector3(x, y, z),
      rotation: new THREE.Euler(xRot, yRot, 0),
      scale: new THREE.Vector3(s, s, s),
    });
  }

  // Scatter on vertical columns (constrained to stages)
  for (let i = 0; i <= BAYS_X; i++) {
    for (let j = 0; j <= BAYS_Z; j++) {
      if (seededRandom() > 0.6) continue;
      const patches = 1 + Math.floor(seededRandom() * 2);
      for (let p = 0; p < patches; p++) {
        const si = Math.floor(seededRandom() * STAGES.length);
        const stage = STAGES[si];
        const y = stage.floorY + seededRandom() * stage.scaffLevels * LEVEL_H;
        collectIvy2(gx(i), y, gz(j), { scale: 0.2 + seededRandom() * 0.4 });
      }
    }
  }

  // Drape on stage platform edges
  for (let si = 0; si < STAGES.length; si++) {
    const y = STAGES[si].floorY;
    for (let i = 0; i <= BAYS_X; i++) {
      for (let j = 0; j <= BAYS_Z; j++) {
        if (seededRandom() > 0.35) continue;
        collectIvy2(gx(i), y, gz(j), {
          xRot: Math.PI * (0.3 + seededRandom() * 0.35),
          scale: 0.25 + seededRandom() * 0.5,
        });
      }
    }
  }

  // On lookout arms
  for (const lo of LOOKOUTS) {
    const stage = STAGES[lo.stageIdx];
    for (let b = 0; b <= lo.bays; b++) {
      if (seededRandom() > 0.5) continue;
      const ox = lo.dir[0] * b * BAY_W;
      const oz = lo.dir[1] * b * BAY_D;
      collectIvy2(ox, stage.floorY + seededRandom() * 1.5, oz, {
        scale: 0.2 + seededRandom() * 0.4,
      });
    }
  }

  createInstancedMeshes(ivy2Model, ivy2Transforms, vineGroup);
}, undefined, (err) => console.warn('Ivy 2.glb load error:', err)));

// =====================================================
// SHRUB BILLBOARDS — InstancedMesh
// =====================================================
const shrubTexLoader = new THREE.TextureLoader(manager);
const shrubAlbedo = shrubTexLoader.load('assets/textures/shrub/TCom_Shrub_Blueberry01_512_albedo.webp');
const shrubAlpha = shrubTexLoader.load('assets/textures/shrub/TCom_Shrub_Blueberry01_512_alpha.webp');
const shrubNormal = shrubTexLoader.load('assets/textures/shrub/TCom_Shrub_Blueberry01_512_normal.webp');
const shrubRough = shrubTexLoader.load('assets/textures/shrub/TCom_Shrub_Blueberry01_512_roughness.webp');

const shrubMat = new THREE.MeshStandardMaterial({
  map: shrubAlbedo,
  alphaMap: shrubAlpha,
  normalMap: shrubNormal,
  roughnessMap: shrubRough,
  transparent: true,
  alphaTest: 0.3,
  side: THREE.DoubleSide,
  depthWrite: true,
  metalness: 0.0,
  roughness: 0.75,
});

const shrubGeo = new THREE.PlaneGeometry(1.5, 1.5);
export const shrubGroup = new THREE.Group();
shrubGroup.name = 'shrubs';

// Collect shrub transforms (seed already at initial value from synchronous execution)
const shrubTransforms = [];

function collectShrub(x, y, z, scale) {
  const rotY = seededRandom() * Math.PI * 2;
  shrubTransforms.push({
    position: new THREE.Vector3(x, y + scale * 0.45, z),
    rotY,
    scale,
  });
}

for (let si = 0; si < STAGES.length; si++) {
  const y = STAGES[si].floorY + PLAT_H;
  for (let i = 0; i <= BAYS_X; i++) {
    for (let j = 0; j <= BAYS_Z; j++) {
      if (seededRandom() > 0.4) continue;
      const sc = 0.2 + seededRandom() * 0.45;
      collectShrub(gx(i) + (seededRandom() - 0.5) * 0.3, y, gz(j) + (seededRandom() - 0.5) * 0.3, sc);
    }
  }
  for (let e = 0; e < 6; e++) {
    const edgeSide = Math.floor(seededRandom() * 4);
    let ex, ez;
    if (edgeSide === 0) { ex = gx(0) + seededRandom() * TOTAL_W; ez = gz(0); }
    else if (edgeSide === 1) { ex = gx(0) + seededRandom() * TOTAL_W; ez = gz(BAYS_Z); }
    else if (edgeSide === 2) { ex = gx(0); ez = gz(0) + seededRandom() * TOTAL_D; }
    else { ex = gx(BAYS_X); ez = gz(0) + seededRandom() * TOTAL_D; }
    collectShrub(ex, y, ez, 0.25 + seededRandom() * 0.5);
  }
}

for (let lv = 0; lv < totalLevels; lv++) {
  if (seededRandom() > 0.12) continue;
  const y = lv * LEVEL_H;
  const i = Math.floor(seededRandom() * (BAYS_X + 1));
  const j = Math.floor(seededRandom() * (BAYS_Z + 1));
  collectShrub(gx(i), y, gz(j), 0.15 + seededRandom() * 0.35);
}

for (const lo of LOOKOUTS) {
  const stage = STAGES[lo.stageIdx];
  const y = stage.floorY + PLAT_H;
  const endX = lo.dir[0] * lo.bays * BAY_W;
  const endZ = lo.dir[1] * lo.bays * BAY_D;
  if (seededRandom() > 0.3) {
    collectShrub(endX, y, endZ, 0.3 + seededRandom() * 0.5);
  }
  for (let b = 1; b < lo.bays; b++) {
    if (seededRandom() > 0.35) continue;
    collectShrub(lo.dir[0] * b * BAY_W, y, lo.dir[1] * b * BAY_D, 0.2 + seededRandom() * 0.35);
  }
}

for (let g = 0; g < 15; g++) {
  const i = Math.floor(seededRandom() * (BAYS_X + 1));
  const j = Math.floor(seededRandom() * (BAYS_Z + 1));
  const ox = (seededRandom() - 0.5) * 1.0;
  const oz = (seededRandom() - 0.5) * 1.0;
  collectShrub(gx(i) + ox, 0, gz(j) + oz, 0.3 + seededRandom() * 0.6);
}

// Build two InstancedMesh objects (perpendicular billboard planes)
{
  const count = shrubTransforms.length;
  const shrubInstanceA = new THREE.InstancedMesh(shrubGeo, shrubMat, count);
  const shrubInstanceB = new THREE.InstancedMesh(shrubGeo, shrubMat, count);
  shrubInstanceA.frustumCulled = false;
  shrubInstanceB.frustumCulled = false;
  shrubInstanceA.castShadow = true;
  shrubInstanceA.receiveShadow = true;
  shrubInstanceB.castShadow = true;
  shrubInstanceB.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sv = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const t = shrubTransforms[i];
    sv.setScalar(t.scale);

    q.setFromEuler(new THREE.Euler(0, t.rotY, 0));
    m.compose(t.position, q, sv);
    shrubInstanceA.setMatrixAt(i, m);

    q.setFromEuler(new THREE.Euler(0, t.rotY + Math.PI / 2, 0));
    m.compose(t.position, q, sv);
    shrubInstanceB.setMatrixAt(i, m);
  }

  shrubInstanceA.instanceMatrix.needsUpdate = true;
  shrubInstanceB.instanceMatrix.needsUpdate = true;
  shrubGroup.add(shrubInstanceA);
  shrubGroup.add(shrubInstanceB);
}

scene.add(shrubGroup);


// =====================================================
// STRING LIGHTS — catenary curves between scaffold poles
// =====================================================
const stringLightGroup = new THREE.Group();
stringLightGroup.name = 'stringLights';

const BULB_GEO = new THREE.SphereGeometry(0.04, 6, 6);
const BULB_MAT = new THREE.MeshStandardMaterial({
  color: 0xffd280,
  emissive: 0xffa030,
  emissiveIntensity: 2.0,
  metalness: 0.0,
  roughness: 0.3,
  clippingPlanes: [buildPlane, buildPlaneBottom],
});

function catenaryY(t, sag) {
  const x = (t - 0.5) * 2;
  return -sag * (1 - x * x);
}

{
  const slRand = seededPRNG(77777);
  const bulbTransforms = [];
  const stringCount = 20;

  for (let s = 0; s < stringCount; s++) {
    const si = Math.floor(slRand() * STAGES.length);
    const stage = STAGES[si];
    const lv = 2 + Math.floor(slRand() * (stage.scaffLevels - 3));
    const y = stage.floorY + lv * LEVEL_H;

    const alongX = slRand() > 0.5;
    let x0, z0, x1, z1;

    if (alongX) {
      const j = Math.floor(slRand() * (BAYS_Z + 1));
      const i0 = Math.floor(slRand() * BAYS_X);
      const span = 1 + Math.floor(slRand() * Math.min(2, BAYS_X - i0));
      x0 = gx(i0); x1 = gx(i0 + span);
      z0 = gz(j); z1 = gz(j);
    } else {
      const i = Math.floor(slRand() * (BAYS_X + 1));
      const j0 = Math.floor(slRand() * BAYS_Z);
      const span = 1 + Math.floor(slRand() * Math.min(2, BAYS_Z - j0));
      x0 = gx(i); x1 = gx(i);
      z0 = gz(j0); z1 = gz(j0 + span);
    }

    const bulbCount = 8 + Math.floor(slRand() * 5);
    const sag = 0.3 + slRand() * 0.4;

    for (let b = 0; b <= bulbCount; b++) {
      const t = b / bulbCount;
      const bx = THREE.MathUtils.lerp(x0, x1, t);
      const bz = THREE.MathUtils.lerp(z0, z1, t);
      const by = y + catenaryY(t, sag);
      bulbTransforms.push({
        position: new THREE.Vector3(bx, by, bz),
        scale: 0.8 + slRand() * 0.4,
      });
    }
  }

  const count = bulbTransforms.length;
  const bulbMesh = new THREE.InstancedMesh(BULB_GEO, BULB_MAT, count);
  bulbMesh.frustumCulled = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();

  for (let i = 0; i < count; i++) {
    const t = bulbTransforms[i];
    m.compose(t.position, q.identity(), new THREE.Vector3(t.scale, t.scale, t.scale));
    bulbMesh.setMatrixAt(i, m);
  }
  bulbMesh.instanceMatrix.needsUpdate = true;
  stringLightGroup.add(bulbMesh);
}

scene.add(stringLightGroup);


// =====================================================
// CANDLE LANTERNS — emissive spheres on platforms
// =====================================================
const lanternGroup = new THREE.Group();
lanternGroup.name = 'lanterns';

const LANTERN_GEO = new THREE.SphereGeometry(0.12, 8, 8);
const LANTERN_MAT = new THREE.MeshStandardMaterial({
  color: 0xffe0a0,
  emissive: 0xffb040,
  emissiveIntensity: 4.0,
  metalness: 0.0,
  roughness: 0.2,
  transparent: true,
  opacity: 0.9,
  clippingPlanes: [buildPlane, buildPlaneBottom],
});

{
  const lnRand = seededPRNG(88888);
  const lanternTransforms = [];

  for (let lv = 3; lv < totalLevels - 1; lv++) {
    const y = lv * LEVEL_H + PLAT_H + 0.06;
    if (lnRand() > 0.25) continue;

    const count = 1 + Math.floor(lnRand() * 3);
    for (let n = 0; n < count; n++) {
      const i = Math.floor(lnRand() * BAYS_X);
      const j = Math.floor(lnRand() * BAYS_Z);
      const ox = (lnRand() - 0.5) * BAY_W * 0.6;
      const oz = (lnRand() - 0.5) * BAY_D * 0.6;
      lanternTransforms.push({
        position: new THREE.Vector3(cellCx(i) + ox, y, cellCz(j) + oz),
        scale: 0.7 + lnRand() * 0.6,
      });
    }
  }

  const count = lanternTransforms.length;
  const lanternMesh = new THREE.InstancedMesh(LANTERN_GEO, LANTERN_MAT, count);
  lanternMesh.frustumCulled = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();

  for (let i = 0; i < count; i++) {
    const t = lanternTransforms[i];
    m.compose(t.position, q.identity(), new THREE.Vector3(t.scale, t.scale, t.scale));
    lanternMesh.setMatrixAt(i, m);
  }
  lanternMesh.instanceMatrix.needsUpdate = true;
  lanternGroup.add(lanternMesh);

  const lightCount = Math.min(5, count);
  for (let i = 0; i < lightCount; i++) {
    const idx = Math.floor(i * count / lightCount);
    const t = lanternTransforms[idx];
    const light = new THREE.PointLight(0xffa030, 0.4, 8, 2);
    light.position.copy(t.position);
    lanternGroup.add(light);
  }
}

scene.add(lanternGroup);


// =====================================================
// GRAPE CLUSTERS — hanging from ledgers near vines
// =====================================================
const grapeGroup = new THREE.Group();
grapeGroup.name = 'grapes';

const GRAPE_GEO = new THREE.SphereGeometry(0.06, 6, 6);
const GRAPE_MAT = new THREE.MeshStandardMaterial({
  color: 0x3a1060,
  emissive: 0x2a0845,
  emissiveIntensity: 0.5,
  metalness: 0.4,
  roughness: 0.3,
  clippingPlanes: [buildPlane, buildPlaneBottom],
});

{
  const grRand = seededPRNG(99999);
  const grapeTransforms = [];

  for (let si = 0; si < STAGES.length; si++) {
    const stage = STAGES[si];
    for (let lv = 1; lv < stage.scaffLevels; lv++) {
      if (grRand() > 0.25) continue;
      const y = stage.floorY + lv * LEVEL_H;

      const clusterCount = 1 + Math.floor(grRand() * 2);
      for (let c = 0; c < clusterCount; c++) {
        const pi = Math.floor(grRand() * (BAYS_X + 1));
        const pj = Math.floor(grRand() * (BAYS_Z + 1));
        const px = gx(pi) + (grRand() - 0.5) * 0.3;
        const pz = gz(pj) + (grRand() - 0.5) * 0.3;

        const grapeCount = 5 + Math.floor(grRand() * 4);
        const clusterScale = 0.8 + grRand() * 0.4;

        for (let g = 0; g < grapeCount; g++) {
          const t = g / grapeCount;
          const radius = (1 - t * 0.7) * 0.08 * clusterScale;
          const angle = grRand() * Math.PI * 2;
          const gx2 = px + Math.cos(angle) * radius;
          const gz2 = pz + Math.sin(angle) * radius;
          const gy = y - 0.05 - t * 0.15 * clusterScale;

          grapeTransforms.push({
            position: new THREE.Vector3(gx2, gy, gz2),
            scale: (0.8 + grRand() * 0.4) * clusterScale,
          });
        }
      }
    }
  }

  const count = grapeTransforms.length;
  if (count > 0) {
    const grapeMesh = new THREE.InstancedMesh(GRAPE_GEO, GRAPE_MAT, count);
    grapeMesh.frustumCulled = false;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();

    for (let i = 0; i < count; i++) {
      const t = grapeTransforms[i];
      m.compose(t.position, q.identity(), new THREE.Vector3(t.scale, t.scale, t.scale));
      grapeMesh.setMatrixAt(i, m);
    }
    grapeMesh.instanceMatrix.needsUpdate = true;
    grapeGroup.add(grapeMesh);
  }
}

scene.add(grapeGroup);


// =====================================================
// VINES GLB MODEL (dense variant) — InstancedMesh
// =====================================================
deferLoad(() => gltfLoader.load('assets/models/Vines.glb', (gltf) => {
  seededRandom = seededPRNG(97531);
  const vinesModel = gltf.scene;
  const vinesTransforms = [];

  function collectVines(x, y, z, opts = {}) {

    const yRot = opts.yRot ?? seededRandom() * Math.PI * 2;
    const xRot = opts.xRot ?? 0;
    const zRot = opts.zRot ?? 0;
    const s = opts.scale ?? (0.3 + seededRandom() * 0.5);
    const sy = opts.scaleY ?? s * (0.8 + seededRandom() * 0.6);
    vinesTransforms.push({
      position: new THREE.Vector3(x, y, z),
      rotation: new THREE.Euler(xRot, yRot, zRot),
      scale: new THREE.Vector3(s, sy, s),
    });
  }

  // Scatter across vertical columns — constrained to stage ranges
  for (let i = 0; i <= BAYS_X; i++) {
    for (let j = 0; j <= BAYS_Z; j++) {
      if (seededRandom() > 0.5) continue;
      const count = 1 + Math.floor(seededRandom() * 2);
      for (let n = 0; n < count; n++) {
        const si = Math.floor(seededRandom() * STAGES.length);
        const stage = STAGES[si];
        const y = stage.floorY + seededRandom() * stage.scaffLevels * LEVEL_H;
        collectVines(gx(i), y, gz(j), {
          scale: 0.2 + seededRandom() * 0.4,
          scaleY: 0.5 + seededRandom() * 1.0,
        });
      }
    }
  }

  // Drape at stage edges
  for (let si = 0; si < STAGES.length; si++) {
    const y = STAGES[si].floorY;
    const count = 2 + Math.floor(seededRandom() * 3);
    for (let c = 0; c < count; c++) {
      const side = Math.floor(seededRandom() * 4);
      let vx, vz;
      if (side === 0) { vx = gx(0); vz = gz(seededRandom() * BAYS_Z); }
      else if (side === 1) { vx = gx(BAYS_X); vz = gz(seededRandom() * BAYS_Z); }
      else if (side === 2) { vx = gx(seededRandom() * BAYS_X); vz = gz(0); }
      else { vx = gx(seededRandom() * BAYS_X); vz = gz(BAYS_Z); }
      collectVines(vx, y + seededRandom() * 2, vz, {
        xRot: Math.PI * (0.3 + seededRandom() * 0.4),
        scale: 0.25 + seededRandom() * 0.4,
        scaleY: 0.4 + seededRandom() * 0.8,
      });
    }
  }

  createInstancedMeshes(vinesModel, vinesTransforms, vineGroup);
}, undefined, (err) => console.warn('Vines.glb load error:', err)));

// =====================================================
// FLOWERS — scattered across GROUND stage scaffolding
// =====================================================
export const flowerLight = new THREE.DirectionalLight(0xffe4b0, 1.8);
flowerLight.position.set(4, 8, 3);
flowerLight.target.position.set(0, 0, 0);
flowerLight.castShadow = true;
flowerLight.shadow.bias = -0.0005;
flowerLight.shadow.normalBias = 0.02;
flowerLight.shadow.mapSize.set(1024, 1024);
flowerLight.shadow.camera.near = 0.5;
flowerLight.shadow.camera.far = 30;
flowerLight.shadow.camera.left = -10;
flowerLight.shadow.camera.right = 10;
flowerLight.shadow.camera.top = 10;
flowerLight.shadow.camera.bottom = -2;
scene.add(flowerLight);
scene.add(flowerLight.target);

const flowerGroup = new THREE.Group();
flowerGroup.name = 'flowers';

deferLoad(() => gltfLoader.load('assets/models/Flowers.glb', (gltf) => {
  seededRandom = seededPRNG(86420);
  const flowerModel = gltf.scene;
  const flowerTransforms = [];

  function collectFlower(x, y, z, opts = {}) {
    const yRot = opts.yRot ?? seededRandom() * Math.PI * 2;
    const s = opts.scale ?? (0.15 + seededRandom() * 0.3);
    flowerTransforms.push({
      position: new THREE.Vector3(x, y, z),
      rotation: new THREE.Euler(0, yRot, 0),
      scale: new THREE.Vector3(s, s, s),
    });
  }

  const groundY = STAGES[0].floorY + PLAT_H;

  // Along scaffolding grid nodes at ground level
  for (let i = 0; i <= BAYS_X; i++) {
    for (let j = 0; j <= BAYS_Z; j++) {
      if (seededRandom() > 0.5) continue;
      const cluster = 1 + Math.floor(seededRandom() * 3);
      for (let c = 0; c < cluster; c++) {
        const ox = (seededRandom() - 0.5) * BAY_W * 0.6;
        const oz = (seededRandom() - 0.5) * BAY_D * 0.6;
        collectFlower(gx(i) + ox, groundY, gz(j) + oz, {
          scale: 0.12 + seededRandom() * 0.25,
        });
      }
    }
  }

  // Along edges of the ground platform
  for (let e = 0; e < 12; e++) {
    const side = Math.floor(seededRandom() * 4);
    let fx, fz;
    if (side === 0) { fx = gx(0) + seededRandom() * TOTAL_W; fz = gz(0); }
    else if (side === 1) { fx = gx(0) + seededRandom() * TOTAL_W; fz = gz(BAYS_Z); }
    else if (side === 2) { fx = gx(0); fz = gz(0) + seededRandom() * TOTAL_D; }
    else { fx = gx(BAYS_X); fz = gz(0) + seededRandom() * TOTAL_D; }
    collectFlower(fx, groundY, fz, {
      scale: 0.15 + seededRandom() * 0.3,
    });
  }

  // A few on the first couple of scaffolding levels
  for (let lv = 1; lv <= 4; lv++) {
    if (seededRandom() > 0.6) continue;
    const y = lv * LEVEL_H;
    const i = Math.floor(seededRandom() * (BAYS_X + 1));
    const j = Math.floor(seededRandom() * (BAYS_Z + 1));
    collectFlower(gx(i), y, gz(j), {
      scale: 0.1 + seededRandom() * 0.2,
    });
  }

  createInstancedMeshes(flowerModel, flowerTransforms, flowerGroup);
}, undefined, (err) => console.warn('Flowers.glb load error:', err)));

scene.add(flowerGroup);

// =====================================================
// ANCIENT PILLARS — placed on THIRD stage (Y=60) — InstancedMesh
// =====================================================
/* HIDDEN FOR NOW
gltfLoader.load('assets/models/ancient_pillars.glb', (gltf) => {
  _seed = 11235;
  const pillarsModel = gltf.scene;
  const pillarTransforms = [];

  function collectPillar(x, y, z, opts = {}) {
    const yRot = opts.yRot ?? seededRandom() * Math.PI * 2;
    const xRot = opts.xRot ?? 0;
    const zRot = opts.zRot ?? 0;
    const s = opts.scale ?? (0.4 + seededRandom() * 0.3);
    pillarTransforms.push({
      position: new THREE.Vector3(x, y, z),
      rotation: new THREE.Euler(xRot, yRot, zRot),
      scale: new THREE.Vector3(s, s, s),
    });
  }

  const pillarStage = STAGES[2]; // THIRD stage
  const y = pillarStage.floorY + PLAT_H;

  // Place pillars at scaffolding grid corners
  for (let i = 0; i <= BAYS_X; i++) {
    for (let j = 0; j <= BAYS_Z; j++) {
      if (seededRandom() > 0.45) continue;
      collectPillar(gx(i), y, gz(j), {
        scale: 0.3 + seededRandom() * 0.25,
      });
    }
  }

  // A few along the edges of the platform
  for (let e = 0; e < 6; e++) {
    const side = Math.floor(seededRandom() * 4);
    let px, pz;
    if (side === 0) { px = gx(0) - 0.5; pz = gz(seededRandom() * BAYS_Z); }
    else if (side === 1) { px = gx(BAYS_X) + 0.5; pz = gz(seededRandom() * BAYS_Z); }
    else if (side === 2) { px = gx(seededRandom() * BAYS_X); pz = gz(0) - 0.5; }
    else { px = gx(seededRandom() * BAYS_X); pz = gz(BAYS_Z) + 0.5; }
    collectPillar(px, y, pz, {
      scale: 0.25 + seededRandom() * 0.35,
    });
  }

  // A couple of broken/tilted ones for variety
  for (let t = 0; t < 3; t++) {
    const ti = Math.floor(seededRandom() * BAYS_X);
    const tj = Math.floor(seededRandom() * BAYS_Z);
    const cx = (gx(ti) + gx(ti + 1)) / 2;
    const cz = (gz(tj) + gz(tj + 1)) / 2;
    collectPillar(cx, y, cz, {
      xRot: (seededRandom() - 0.5) * 0.1,
      zRot: (seededRandom() - 0.5) * 0.15,
      scale: 0.2 + seededRandom() * 0.25,
    });
  }

  createInstancedMeshes(pillarsModel, pillarTransforms, scene);
}, undefined, (err) => console.warn('ancient_pillars.glb load error:', err));
HIDDEN FOR NOW */

// =====================================================
// STAGE GLOW FLOORS — large radial gradient planes extending far out
// =====================================================
const STAGE_GLOW_COLORS = [
  new THREE.Color(0x4a5a10),  // GROUND — lime glow
  new THREE.Color(0x6a2810),  // SECOND — orange glow
  new THREE.Color(0x5a3810),  // THIRD — amber glow
  new THREE.Color(0x6a1e08),  // SUMMIT — deep orange glow
];

export const stageGlowPlanes = [];

for (let si = 0; si < STAGES.length; si++) {
  const glowGeo = new THREE.PlaneGeometry(160, 160);
  const glowMat = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: STAGE_GLOW_COLORS[si] },
      opacity: { value: 0.0 },
      innerRadius: { value: 0.05 },
      outerRadius: { value: 0.9 },
    },
    vertexShader: stageGlowVert,
    fragmentShader: stageGlowFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  glowMesh.rotation.x = -Math.PI / 2;
  glowMesh.position.y = STAGES[si].floorY + 0.1;
  scene.add(glowMesh);
  stageGlowPlanes.push({
    mesh: glowMesh,
    mat: glowMat,
    stageY: STAGES[si].floorY,
    baseColor: STAGE_GLOW_COLORS[si],
  });
}

// =====================================================
// DISTANT BACKDROP PANELS — vertical fog walls in a ring
// =====================================================
const BACKDROP_COLORS = [
  new THREE.Color(0x2a3008),  // GROUND — olive mist
  new THREE.Color(0x38180a),  // SECOND — amber mist
  new THREE.Color(0x2a1e0a),  // THIRD — warm mist
  new THREE.Color(0x381008),  // SUMMIT — orange mist
];

export const backdropPanels = [];

const BACKDROP_SEGMENTS = 12;   // panels per stage ring
const BACKDROP_RADIUS = 40;     // distance from center (closer = more visible)
const BACKDROP_HEIGHT = 45;     // height of each panel (tall for smooth overlap)
const BACKDROP_ARC = (Math.PI * 2) / BACKDROP_SEGMENTS;

for (let si = 0; si < STAGES.length; si++) {
  const color = BACKDROP_COLORS[si];
  for (let p = 0; p < BACKDROP_SEGMENTS; p++) {
    const angle = p * BACKDROP_ARC + si * 0.4; // offset per stage for variety
    const panelGeo = new THREE.PlaneGeometry(
      2 * BACKDROP_RADIUS * Math.sin(BACKDROP_ARC / 2), // width to fill arc
      BACKDROP_HEIGHT
    );
    const panelMat = new THREE.ShaderMaterial({
      uniforms: {
        fogColor: { value: color },
        opacity: { value: 0.0 },
        time: { value: 0 },
      },
      vertexShader: backdropFogVert,
      fragmentShader: backdropFogFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const panelMesh = new THREE.Mesh(panelGeo, panelMat);
    // Position on ring, facing inward
    const px = Math.cos(angle) * BACKDROP_RADIUS;
    const pz = Math.sin(angle) * BACKDROP_RADIUS;
    panelMesh.position.set(px, STAGES[si].floorY + BACKDROP_HEIGHT * 0.4, pz);
    panelMesh.lookAt(0, STAGES[si].floorY + BACKDROP_HEIGHT * 0.4, 0);
    scene.add(panelMesh);
    backdropPanels.push({
      mesh: panelMesh,
      mat: panelMat,
      stageY: STAGES[si].floorY,
      stageIdx: si,
    });
  }
}

// =====================================================
// PER-FRAME UPDATE
// =====================================================
function wDist(a, b) { const d = Math.abs(a - b); return Math.min(d, TOP_H - d); }

export function updateEnvironment(dt, t, camH, params) {
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
  // Stage glow floor planes (wrap-aware)
  for (const sg of stageGlowPlanes) {
    const proximity = Math.max(0, 1 - wDist(camH, sg.stageY) / 20);
    sg.mat.uniforms.opacity.value = proximity * params.stageGlowIntensity;
  }
  // Distant backdrop fog panels (wrap-aware)
  for (const bp of backdropPanels) {
    const proximity = Math.max(0, 1 - wDist(camH, bp.stageY) / 22);
    bp.mat.uniforms.opacity.value = proximity * params.backdropIntensity;
    bp.mat.uniforms.time.value = t;
  }
}
