import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { manager } from './loader.js';
import {
  BAYS_X, BAYS_Z, BAY_W, BAY_D, LEVEL_H, TOP_H,
  STAGES, ZONES_COLORS, PLAT_H, TOTAL_W, TOTAL_D,
  gx, gz,
} from './config.js';
import { scene } from './scene.js';
import { stageGlowVert, stageGlowFrag, backdropFogVert, backdropFogFrag } from './shaders.js';
import { totalLevels, LOOKOUTS } from './scaffold.js';

// =====================================================
// SEEDED PRNG — deterministic vegetation placement
// =====================================================
let _seed = 12345;
function seededRandom() { _seed = (_seed * 16807) % 2147483647; return (_seed - 1) / 2147483646; }

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
const VOL_FOG_LAYERS = 8;
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

// Dark shroud at top and bottom of tower
const SHROUD_LAYERS = 12;
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
gltfLoader.load('assets/models/vine.glb', (gltf) => {
  _seed = 54321;
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

  // Column vines
  for (let i = 0; i <= BAYS_X; i++) {
    for (let j = 0; j <= BAYS_Z; j++) {
      if (seededRandom() > 0.4) continue;
      const px = gx(i), pz = gz(j);
      const count = 1 + Math.floor(seededRandom() * 3);
      for (let n = 0; n < count; n++) {
        const y = seededRandom() * TOP_H * 0.85;
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
}, undefined, (err) => console.warn('vine.glb load error:', err));

// =====================================================
// IVY GLB MODEL — InstancedMesh
// =====================================================
gltfLoader.load('assets/models/Ivy.glb', (gltf) => {
  _seed = 13579;
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

  // On outer edge columns — X edges
  for (const i of [0, BAYS_X]) {
    for (let j = 0; j <= BAYS_Z; j++) {
      const patches = 2 + Math.floor(seededRandom() * 3);
      for (let p = 0; p < patches; p++) {
        const y = seededRandom() * TOP_H * 0.9;
        collectIvy(gx(i), y, gz(j), {
          yRot: i === 0 ? Math.PI : 0,
          scale: 0.25 + seededRandom() * 0.5,
        });
      }
    }
  }
  // On outer edge columns — Z edges
  for (const j of [0, BAYS_Z]) {
    for (let i = 0; i <= BAYS_X; i++) {
      const patches = 2 + Math.floor(seededRandom() * 3);
      for (let p = 0; p < patches; p++) {
        const y = seededRandom() * TOP_H * 0.9;
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
}, undefined, (err) => console.warn('Ivy.glb load error:', err));

// =====================================================
// IVY 2 GLB MODEL (denser variant) — InstancedMesh
// =====================================================
gltfLoader.load('assets/models/Ivy 2.glb', (gltf) => {
  _seed = 24680;
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

  // Scatter on vertical columns
  for (let i = 0; i <= BAYS_X; i++) {
    for (let j = 0; j <= BAYS_Z; j++) {
      if (seededRandom() > 0.6) continue;
      const patches = 1 + Math.floor(seededRandom() * 2);
      for (let p = 0; p < patches; p++) {
        const y = seededRandom() * TOP_H * 0.85;
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
}, undefined, (err) => console.warn('Ivy 2.glb load error:', err));

// =====================================================
// SHRUB BILLBOARDS — InstancedMesh
// =====================================================
const shrubTexLoader = new THREE.TextureLoader(manager);
const shrubAlbedo = shrubTexLoader.load('assets/textures/shrub/TCom_Shrub_Blueberry01_512_albedo.png');
const shrubAlpha = shrubTexLoader.load('assets/textures/shrub/TCom_Shrub_Blueberry01_512_alpha.png');
const shrubNormal = shrubTexLoader.load('assets/textures/shrub/TCom_Shrub_Blueberry01_512_normal.png');
const shrubRough = shrubTexLoader.load('assets/textures/shrub/TCom_Shrub_Blueberry01_512_roughness.png');

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
// FIGURE — standing in SUMMIT stage corner against railing
// =====================================================
const fbxLoader = new FBXLoader(manager);
fbxLoader.load('assets/models/Male Standing Pose.fbx', (fbx) => {
  const boundingBox = new THREE.Box3().setFromObject(fbx);
  const height = boundingBox.max.y - boundingBox.min.y;
  const targetHeight = 1.8;
  const s = targetHeight / height;
  fbx.scale.setScalar(s);

  fbx.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // Apply built-in pose if the FBX contains animation clips
  if (fbx.animations && fbx.animations.length > 0) {
    const mixer = new THREE.AnimationMixer(fbx);
    const action = mixer.clipAction(fbx.animations[0]);
    action.play();
    mixer.update(0);
    action.paused = true;
  }

  // Place in SUMMIT stage (stage 4) corner, back against the railing
  const stageY = STAGES[3].floorY + PLAT_H;
  fbx.position.set(gx(BAYS_X) - 0.2, stageY, gz(BAYS_Z) - 0.2);
  fbx.rotation.y = -Math.PI * 0.75; // face inward diagonally from corner
  fbx.rotation.x = -0.05; // slight lean back against railing

  scene.add(fbx);
}, undefined, (err) => console.warn('FBX load error:', err));

// =====================================================
// VINES GLB MODEL (dense variant) — InstancedMesh
// =====================================================
gltfLoader.load('assets/models/Vines.glb', (gltf) => {
  _seed = 97531;
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

  // Scatter across vertical columns
  for (let i = 0; i <= BAYS_X; i++) {
    for (let j = 0; j <= BAYS_Z; j++) {
      if (seededRandom() > 0.5) continue;
      const count = 1 + Math.floor(seededRandom() * 2);
      for (let n = 0; n < count; n++) {
        collectVines(gx(i), seededRandom() * TOP_H * 0.8, gz(j), {
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
}, undefined, (err) => console.warn('Vines.glb load error:', err));

// =====================================================
// FLOWERS — scattered across GROUND stage scaffolding
// =====================================================
export const flowerLight = new THREE.DirectionalLight(0xffe4b0, 1.8);
flowerLight.position.set(4, 8, 3);
flowerLight.target.position.set(0, 0, 0);
flowerLight.castShadow = true;
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

gltfLoader.load('assets/models/Flowers.glb', (gltf) => {
  _seed = 86420;
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
}, undefined, (err) => console.warn('Flowers.glb load error:', err));

scene.add(flowerGroup);

// =====================================================
// ANCIENT PILLARS — placed on THIRD stage (Y=60) — InstancedMesh
// =====================================================
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

// =====================================================
// STAGE GLOW FLOORS — large radial gradient planes extending far out
// =====================================================
const STAGE_GLOW_COLORS = [
  new THREE.Color(0x4a3520),  // GROUND — warm amber
  new THREE.Color(0x253045),  // SECOND — cool blue-grey
  new THREE.Color(0x5a3a18),  // THIRD — golden hour
  new THREE.Color(0x6a4a20),  // SUMMIT — deep gold
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
  new THREE.Color(0x3a2515),  // GROUND — earthy warm
  new THREE.Color(0x1a2535),  // SECOND — dusky blue
  new THREE.Color(0x4a3010),  // THIRD — amber haze
  new THREE.Color(0x55380d),  // SUMMIT — sunset glow
];

export const backdropPanels = [];

const BACKDROP_SEGMENTS = 8;    // panels per stage ring
const BACKDROP_RADIUS = 55;     // distance from center
const BACKDROP_HEIGHT = 25;     // height of each panel
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
