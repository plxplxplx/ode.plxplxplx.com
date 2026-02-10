import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import {
  BAYS_X, BAYS_Z, BAY_W, BAY_D, LEVEL_H, TOP_H,
  STAGES, ZONES_COLORS, PLAT_H, TOTAL_W, TOTAL_D,
  gx, gz,
} from './config.js';
import { scene, fogColor } from './scene.js';
import { stageGlowVert, stageGlowFrag, backdropFogVert, backdropFogFrag } from './shaders.js';
import { totalLevels, LOOKOUTS, collidables } from './scaffold.js';

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
const shroudColor = new THREE.Color(0x0a0604);
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

// =====================================================
// MARBLE FLOOR
// =====================================================
function makeMarbleTex(size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e8e0d4';
  ctx.fillRect(0, 0, size, size);
  for (let pass = 0; pass < 6; pass++) {
    const veinColor = pass < 3 ? 'rgba(160,145,130,' : 'rgba(100,90,80,';
    const alpha = 0.04 + Math.random() * 0.06;
    ctx.strokeStyle = veinColor + alpha + ')';
    ctx.lineWidth = 0.5 + Math.random() * 2;
    for (let v = 0; v < 30; v++) {
      ctx.beginPath();
      let x = Math.random() * size, y = Math.random() * size;
      ctx.moveTo(x, y);
      const segs = 6 + Math.floor(Math.random() * 12);
      for (let s = 0; s < segs; s++) {
        x += (Math.random() - 0.5) * 120;
        y += (Math.random() - 0.3) * 80;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 12;
    img.data[i] += noise; img.data[i+1] += noise; img.data[i+2] += noise;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(180,170,160,0.15)';
  ctx.lineWidth = 1;
  const tileSize = size / 4;
  for (let g = 0; g <= 4; g++) {
    ctx.beginPath(); ctx.moveTo(g * tileSize, 0); ctx.lineTo(g * tileSize, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, g * tileSize); ctx.lineTo(size, g * tileSize); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  return tex;
}

const marbleTex = makeMarbleTex();
export const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100),
  new THREE.MeshStandardMaterial({
    map: marbleTex, color: 0xc0a890,
    metalness: 0.1, roughness: 0.3,
  })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
ground.receiveShadow = true;
scene.add(ground);
collidables.push(ground);

// Ground fog — dense at the base, fading upward
const fogGeo = new THREE.PlaneGeometry(300, 300);
for (let i = 0; i < 14; i++) {
  const fp = new THREE.Mesh(fogGeo, new THREE.MeshBasicMaterial({
    color: fogColor, transparent: true, opacity: 0.5 * Math.pow(1 - i / 14, 2),
    depthWrite: false, side: THREE.DoubleSide,
  }));
  fp.rotation.x = -Math.PI / 2;
  fp.position.y = i * 0.5 + 0.05;
  scene.add(fp);
}

// =====================================================
// VEGETATION GROUP (GLB models placed below)
// =====================================================
export const vineGroup = new THREE.Group();
vineGroup.name = 'vines';
export const vineData = []; // kept for main.js leaf-sway compatibility
scene.add(vineGroup);

// =====================================================
// VINE GLB MODEL
// =====================================================
const gltfLoader = new GLTFLoader();
gltfLoader.load('assets/models/vine.glb', (gltf) => {
  const vineModel = gltf.scene;
  vineModel.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  function placeVine(x, y, z, opts = {}) {
    const clone = vineModel.clone();
    clone.position.set(x, y, z);
    clone.rotation.y = opts.yRot ?? Math.random() * Math.PI * 2;
    clone.rotation.z = opts.zRot ?? 0;
    clone.rotation.x = opts.xRot ?? 0;
    const s = opts.scale ?? (0.3 + Math.random() * 0.6);
    const sy = opts.scaleY ?? s * (0.8 + Math.random() * 0.8);
    clone.scale.set(s, sy, s);
    vineGroup.add(clone);
  }

  for (let i = 0; i <= BAYS_X; i++) {
    for (let j = 0; j <= BAYS_Z; j++) {
      if (Math.random() > 0.4) continue;
      const px = gx(i), pz = gz(j);
      const count = 1 + Math.floor(Math.random() * 3);
      for (let n = 0; n < count; n++) {
        const y = Math.random() * TOP_H * 0.85;
        placeVine(px, y, pz, { scale: 0.25 + Math.random() * 0.5, scaleY: 0.6 + Math.random() * 1.2 });
      }
    }
  }

  for (let lv = 0; lv < totalLevels; lv++) {
    if (Math.random() > 0.2) continue;
    const y = lv * LEVEL_H;
    const i = Math.floor(Math.random() * BAYS_X);
    const j = Math.floor(Math.random() * (BAYS_Z + 1));
    const mx = (gx(i) + gx(i + 1)) / 2;
    placeVine(mx, y, gz(j), {
      xRot: 0,
      zRot: Math.PI / 2 * (0.8 + Math.random() * 0.4),
      scale: 0.2 + Math.random() * 0.35,
      scaleY: 0.4 + Math.random() * 0.6,
    });
  }

  for (let si = 0; si < STAGES.length; si++) {
    const y = STAGES[si].floorY + 1.0;
    const hangCount = 3 + Math.floor(Math.random() * 4);
    for (let h = 0; h < hangCount; h++) {
      const side = Math.floor(Math.random() * 4);
      let hx, hz;
      if (side === 0) { hx = gx(0); hz = gz(Math.random() * BAYS_Z); }
      else if (side === 1) { hx = gx(BAYS_X); hz = gz(Math.random() * BAYS_Z); }
      else if (side === 2) { hx = gx(Math.random() * BAYS_X); hz = gz(0); }
      else { hx = gx(Math.random() * BAYS_X); hz = gz(BAYS_Z); }
      placeVine(hx, y, hz, {
        xRot: Math.PI * (0.4 + Math.random() * 0.3),
        scale: 0.2 + Math.random() * 0.4,
        scaleY: 0.5 + Math.random() * 1.0,
      });
    }
  }

  for (const lo of LOOKOUTS) {
    const stage = STAGES[lo.stageIdx];
    for (let b = 1; b <= lo.bays; b++) {
      if (Math.random() > 0.4) continue;
      const ox = lo.dir[0] * b * BAY_W;
      const oz = lo.dir[1] * b * BAY_D;
      placeVine(ox, stage.floorY + Math.random() * 2, oz, {
        scale: 0.3 + Math.random() * 0.4,
      });
    }
  }

  for (let si = 0; si < STAGES.length; si++) {
    const y = STAGES[si].floorY;
    for (let i = 0; i <= BAYS_X; i++) {
      for (let j = 0; j <= BAYS_Z; j++) {
        if (Math.random() > 0.35) continue;
        placeVine(gx(i), y + Math.random() * 0.5, gz(j), {
          scale: 0.15 + Math.random() * 0.3,
          scaleY: 0.3 + Math.random() * 0.5,
        });
      }
    }
  }
}, undefined, (err) => console.warn('vine.glb load error:', err));

// =====================================================
// IVY GLB MODEL
// =====================================================
gltfLoader.load('assets/models/Ivy.glb', (gltf) => {
  const ivyModel = gltf.scene;
  ivyModel.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  function placeIvy(x, y, z, opts = {}) {
    const clone = ivyModel.clone();
    clone.position.set(x, y, z);
    clone.rotation.y = opts.yRot ?? Math.random() * Math.PI * 2;
    clone.rotation.z = opts.zRot ?? 0;
    clone.rotation.x = opts.xRot ?? 0;
    const s = opts.scale ?? (0.3 + Math.random() * 0.5);
    clone.scale.setScalar(s);
    vineGroup.add(clone);
  }

  // On vertical columns — anchored to grid nodes
  for (let lv = 0; lv < totalLevels; lv++) {
    if (Math.random() > 0.25) continue;
    const y = lv * LEVEL_H;
    const i = Math.floor(Math.random() * (BAYS_X + 1));
    const j = Math.floor(Math.random() * (BAYS_Z + 1));
    placeIvy(gx(i), y, gz(j), { scale: 0.2 + Math.random() * 0.4 });
  }

  // At stage floor column bases
  for (let si = 0; si < STAGES.length; si++) {
    const y = STAGES[si].floorY;
    for (let i = 0; i <= BAYS_X; i++) {
      for (let j = 0; j <= BAYS_Z; j++) {
        if (Math.random() > 0.4) continue;
        placeIvy(gx(i), y, gz(j), {
          scale: 0.3 + Math.random() * 0.5,
        });
      }
    }
  }

  // On outer edge columns — anchored to grid nodes
  for (const i of [0, BAYS_X]) {
    for (let j = 0; j <= BAYS_Z; j++) {
      const patches = 2 + Math.floor(Math.random() * 3);
      for (let p = 0; p < patches; p++) {
        const y = Math.random() * TOP_H * 0.9;
        placeIvy(gx(i), y, gz(j), {
          yRot: i === 0 ? Math.PI : 0,
          scale: 0.25 + Math.random() * 0.5,
        });
      }
    }
  }
  for (const j of [0, BAYS_Z]) {
    for (let i = 0; i <= BAYS_X; i++) {
      const patches = 2 + Math.floor(Math.random() * 3);
      for (let p = 0; p < patches; p++) {
        const y = Math.random() * TOP_H * 0.9;
        placeIvy(gx(i), y, gz(j), {
          yRot: j === 0 ? -Math.PI / 2 : Math.PI / 2,
          scale: 0.25 + Math.random() * 0.5,
        });
      }
    }
  }

  for (const lo of LOOKOUTS) {
    const stage = STAGES[lo.stageIdx];
    for (let b = 0; b <= lo.bays; b++) {
      if (Math.random() > 0.45) continue;
      const ox = lo.dir[0] * b * BAY_W;
      const oz = lo.dir[1] * b * BAY_D;
      placeIvy(ox, stage.floorY + Math.random() * 1.5, oz, {
        scale: 0.2 + Math.random() * 0.45,
      });
    }
  }
}, undefined, (err) => console.warn('Ivy.glb load error:', err));

// =====================================================
// IVY 2 GLB MODEL (denser variant)
// =====================================================
gltfLoader.load('assets/models/Ivy 2.glb', (gltf) => {
  const ivy2Model = gltf.scene;
  ivy2Model.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  function placeIvy2(x, y, z, opts = {}) {
    const clone = ivy2Model.clone();
    clone.position.set(x, y, z);
    clone.rotation.y = opts.yRot ?? Math.random() * Math.PI * 2;
    clone.rotation.x = opts.xRot ?? 0;
    const s = opts.scale ?? (0.25 + Math.random() * 0.45);
    clone.scale.setScalar(s);
    vineGroup.add(clone);
  }

  // Scatter on vertical columns alongside existing ivy
  for (let i = 0; i <= BAYS_X; i++) {
    for (let j = 0; j <= BAYS_Z; j++) {
      if (Math.random() > 0.6) continue;
      const patches = 1 + Math.floor(Math.random() * 2);
      for (let p = 0; p < patches; p++) {
        const y = Math.random() * TOP_H * 0.85;
        placeIvy2(gx(i), y, gz(j), { scale: 0.2 + Math.random() * 0.4 });
      }
    }
  }

  // Drape on stage platform edges — anchored to column nodes
  for (let si = 0; si < STAGES.length; si++) {
    const y = STAGES[si].floorY;
    for (let i = 0; i <= BAYS_X; i++) {
      for (let j = 0; j <= BAYS_Z; j++) {
        if (Math.random() > 0.35) continue;
        placeIvy2(gx(i), y, gz(j), {
          xRot: Math.PI * (0.3 + Math.random() * 0.35),
          scale: 0.25 + Math.random() * 0.5,
        });
      }
    }
  }

  // On lookout arms
  for (const lo of LOOKOUTS) {
    const stage = STAGES[lo.stageIdx];
    for (let b = 0; b <= lo.bays; b++) {
      if (Math.random() > 0.5) continue;
      const ox = lo.dir[0] * b * BAY_W;
      const oz = lo.dir[1] * b * BAY_D;
      placeIvy2(ox, stage.floorY + Math.random() * 1.5, oz, {
        scale: 0.2 + Math.random() * 0.4,
      });
    }
  }
}, undefined, (err) => console.warn('Ivy 2.glb load error:', err));

// =====================================================
// SHRUB BILLBOARDS
// =====================================================
const shrubAlbedo = new THREE.TextureLoader().load('assets/textures/shrub/TCom_Shrub_Blueberry01_512_albedo.png');
const shrubAlpha = new THREE.TextureLoader().load('assets/textures/shrub/TCom_Shrub_Blueberry01_512_alpha.png');
const shrubNormal = new THREE.TextureLoader().load('assets/textures/shrub/TCom_Shrub_Blueberry01_512_normal.png');
const shrubRough = new THREE.TextureLoader().load('assets/textures/shrub/TCom_Shrub_Blueberry01_512_roughness.png');

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

function placeShrub(x, y, z, scale) {
  const s = new THREE.Mesh(shrubGeo, shrubMat);
  s.position.set(x, y + scale * 0.45, z);
  s.rotation.y = Math.random() * Math.PI * 2;
  s.scale.setScalar(scale);
  s.castShadow = true;
  s.receiveShadow = true;
  shrubGroup.add(s);
  const s2 = s.clone();
  s2.rotation.y += Math.PI / 2;
  shrubGroup.add(s2);
}

for (let si = 0; si < STAGES.length; si++) {
  const y = STAGES[si].floorY + PLAT_H;
  for (let i = 0; i <= BAYS_X; i++) {
    for (let j = 0; j <= BAYS_Z; j++) {
      if (Math.random() > 0.4) continue;
      const sc = 0.2 + Math.random() * 0.45;
      placeShrub(gx(i) + (Math.random() - 0.5) * 0.3, y, gz(j) + (Math.random() - 0.5) * 0.3, sc);
    }
  }
  for (let e = 0; e < 6; e++) {
    const edgeSide = Math.floor(Math.random() * 4);
    let ex, ez;
    if (edgeSide === 0) { ex = gx(0) + Math.random() * TOTAL_W; ez = gz(0); }
    else if (edgeSide === 1) { ex = gx(0) + Math.random() * TOTAL_W; ez = gz(BAYS_Z); }
    else if (edgeSide === 2) { ex = gx(0); ez = gz(0) + Math.random() * TOTAL_D; }
    else { ex = gx(BAYS_X); ez = gz(0) + Math.random() * TOTAL_D; }
    placeShrub(ex, y, ez, 0.25 + Math.random() * 0.5);
  }
}

for (let lv = 0; lv < totalLevels; lv++) {
  if (Math.random() > 0.12) continue;
  const y = lv * LEVEL_H;
  const i = Math.floor(Math.random() * (BAYS_X + 1));
  const j = Math.floor(Math.random() * (BAYS_Z + 1));
  placeShrub(gx(i), y, gz(j), 0.15 + Math.random() * 0.35);
}

for (const lo of LOOKOUTS) {
  const stage = STAGES[lo.stageIdx];
  const y = stage.floorY + PLAT_H;
  const endX = lo.dir[0] * lo.bays * BAY_W;
  const endZ = lo.dir[1] * lo.bays * BAY_D;
  if (Math.random() > 0.3) {
    placeShrub(endX, y, endZ, 0.3 + Math.random() * 0.5);
  }
  for (let b = 1; b < lo.bays; b++) {
    if (Math.random() > 0.35) continue;
    placeShrub(lo.dir[0] * b * BAY_W, y, lo.dir[1] * b * BAY_D, 0.2 + Math.random() * 0.35);
  }
}

for (let g = 0; g < 15; g++) {
  const i = Math.floor(Math.random() * (BAYS_X + 1));
  const j = Math.floor(Math.random() * (BAYS_Z + 1));
  const ox = (Math.random() - 0.5) * 1.0;
  const oz = (Math.random() - 0.5) * 1.0;
  placeShrub(gx(i) + ox, 0, gz(j) + oz, 0.3 + Math.random() * 0.6);
}

scene.add(shrubGroup);

// =====================================================
// FIGURE — standing in SUMMIT stage corner against railing
// =====================================================
const fbxLoader = new FBXLoader();
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
// VINES GLB MODEL (new dense variant)
// =====================================================
gltfLoader.load('assets/models/Vines.glb', (gltf) => {
  const vinesModel = gltf.scene;
  vinesModel.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  function placeVines(x, y, z, opts = {}) {
    const clone = vinesModel.clone();
    clone.position.set(x, y, z);
    clone.rotation.y = opts.yRot ?? Math.random() * Math.PI * 2;
    clone.rotation.x = opts.xRot ?? 0;
    clone.rotation.z = opts.zRot ?? 0;
    const s = opts.scale ?? (0.3 + Math.random() * 0.5);
    const sy = opts.scaleY ?? s * (0.8 + Math.random() * 0.6);
    clone.scale.set(s, sy, s);
    vineGroup.add(clone);
  }

  // Scatter across vertical columns
  for (let i = 0; i <= BAYS_X; i++) {
    for (let j = 0; j <= BAYS_Z; j++) {
      if (Math.random() > 0.5) continue;
      const count = 1 + Math.floor(Math.random() * 2);
      for (let n = 0; n < count; n++) {
        placeVines(gx(i), Math.random() * TOP_H * 0.8, gz(j), {
          scale: 0.2 + Math.random() * 0.4,
          scaleY: 0.5 + Math.random() * 1.0,
        });
      }
    }
  }

  // Drape at stage edges
  for (let si = 0; si < STAGES.length; si++) {
    const y = STAGES[si].floorY;
    const count = 2 + Math.floor(Math.random() * 3);
    for (let c = 0; c < count; c++) {
      const side = Math.floor(Math.random() * 4);
      let vx, vz;
      if (side === 0) { vx = gx(0); vz = gz(Math.random() * BAYS_Z); }
      else if (side === 1) { vx = gx(BAYS_X); vz = gz(Math.random() * BAYS_Z); }
      else if (side === 2) { vx = gx(Math.random() * BAYS_X); vz = gz(0); }
      else { vx = gx(Math.random() * BAYS_X); vz = gz(BAYS_Z); }
      placeVines(vx, y + Math.random() * 2, vz, {
        xRot: Math.PI * (0.3 + Math.random() * 0.4),
        scale: 0.25 + Math.random() * 0.4,
        scaleY: 0.4 + Math.random() * 0.8,
      });
    }
  }
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
  const flowerModel = gltf.scene;
  flowerModel.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  function placeFlower(x, y, z, opts = {}) {
    const clone = flowerModel.clone();
    clone.position.set(x, y, z);
    clone.rotation.y = opts.yRot ?? Math.random() * Math.PI * 2;
    const s = opts.scale ?? (0.15 + Math.random() * 0.3);
    clone.scale.setScalar(s);
    flowerGroup.add(clone);
  }

  const groundY = STAGES[0].floorY + PLAT_H;

  // Along scaffolding grid nodes at ground level
  for (let i = 0; i <= BAYS_X; i++) {
    for (let j = 0; j <= BAYS_Z; j++) {
      if (Math.random() > 0.5) continue;
      const cluster = 1 + Math.floor(Math.random() * 3);
      for (let c = 0; c < cluster; c++) {
        const ox = (Math.random() - 0.5) * BAY_W * 0.6;
        const oz = (Math.random() - 0.5) * BAY_D * 0.6;
        placeFlower(gx(i) + ox, groundY, gz(j) + oz, {
          scale: 0.12 + Math.random() * 0.25,
        });
      }
    }
  }

  // Along edges of the ground platform
  for (let e = 0; e < 12; e++) {
    const side = Math.floor(Math.random() * 4);
    let fx, fz;
    if (side === 0) { fx = gx(0) + Math.random() * TOTAL_W; fz = gz(0); }
    else if (side === 1) { fx = gx(0) + Math.random() * TOTAL_W; fz = gz(BAYS_Z); }
    else if (side === 2) { fx = gx(0); fz = gz(0) + Math.random() * TOTAL_D; }
    else { fx = gx(BAYS_X); fz = gz(0) + Math.random() * TOTAL_D; }
    placeFlower(fx, groundY, fz, {
      scale: 0.15 + Math.random() * 0.3,
    });
  }

  // A few on the first couple of scaffolding levels
  for (let lv = 1; lv <= 4; lv++) {
    if (Math.random() > 0.6) continue;
    const y = lv * LEVEL_H;
    const i = Math.floor(Math.random() * (BAYS_X + 1));
    const j = Math.floor(Math.random() * (BAYS_Z + 1));
    placeFlower(gx(i), y, gz(j), {
      scale: 0.1 + Math.random() * 0.2,
    });
  }
}, undefined, (err) => console.warn('Flowers.glb load error:', err));

scene.add(flowerGroup);

// =====================================================
// ANCIENT PILLARS — placed on THIRD stage (Y=60)
// =====================================================
gltfLoader.load('assets/models/ancient_pillars.glb', (gltf) => {
  const pillarsModel = gltf.scene;
  pillarsModel.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  function placePillars(x, y, z, opts = {}) {
    const clone = pillarsModel.clone();
    clone.position.set(x, y, z);
    clone.rotation.y = opts.yRot ?? Math.random() * Math.PI * 2;
    const s = opts.scale ?? (0.4 + Math.random() * 0.3);
    clone.scale.setScalar(s);
    scene.add(clone);
  }

  const pillarStage = STAGES[2]; // THIRD stage
  const y = pillarStage.floorY + PLAT_H;

  // Place pillars at scaffolding grid corners
  for (let i = 0; i <= BAYS_X; i++) {
    for (let j = 0; j <= BAYS_Z; j++) {
      if (Math.random() > 0.45) continue;
      placePillars(gx(i), y, gz(j), {
        scale: 0.3 + Math.random() * 0.25,
      });
    }
  }

  // A few along the edges of the platform
  for (let e = 0; e < 6; e++) {
    const side = Math.floor(Math.random() * 4);
    let px, pz;
    if (side === 0) { px = gx(0) - 0.5; pz = gz(Math.random() * BAYS_Z); }
    else if (side === 1) { px = gx(BAYS_X) + 0.5; pz = gz(Math.random() * BAYS_Z); }
    else if (side === 2) { px = gx(Math.random() * BAYS_X); pz = gz(0) - 0.5; }
    else { px = gx(Math.random() * BAYS_X); pz = gz(BAYS_Z) + 0.5; }
    placePillars(px, y, pz, {
      scale: 0.25 + Math.random() * 0.35,
    });
  }

  // A couple of broken/tilted ones for variety
  for (let t = 0; t < 3; t++) {
    const ti = Math.floor(Math.random() * BAYS_X);
    const tj = Math.floor(Math.random() * BAYS_Z);
    const cx = (gx(ti) + gx(ti + 1)) / 2;
    const cz = (gz(tj) + gz(tj + 1)) / 2;
    const clone = pillarsModel.clone();
    clone.position.set(cx, y, cz);
    clone.rotation.y = Math.random() * Math.PI * 2;
    clone.rotation.z = (Math.random() - 0.5) * 0.15; // slight tilt
    clone.rotation.x = (Math.random() - 0.5) * 0.1;
    const s = 0.2 + Math.random() * 0.25;
    clone.scale.setScalar(s);
    scene.add(clone);
  }
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
