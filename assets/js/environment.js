import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import {
  BAYS_X, BAYS_Z, BAY_W, BAY_D, LEVEL_H, TOP_H, NUM_LEVELS,
  STAGES, ZONES_COLORS, PLAT_H, TOTAL_W, TOTAL_D,
  gx, gz,
} from './config.js';
import { scene, fogColor } from './scene.js';
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
// VINES & GRASS (organic overgrowth)
// =====================================================
export const vineGroup = new THREE.Group();
vineGroup.name = 'vines';
const vineColors = [0x2d5a1e, 0x1e4a16, 0x3a6828, 0x1a3f12];
const leafColors = [0x3a7a28, 0x4a9a32, 0x2e6820, 0x5aaa3a];
const leafGeoSm = new THREE.PlaneGeometry(0.12, 0.18, 1, 1);
const leafGeoLg = new THREE.PlaneGeometry(0.22, 0.30, 1, 1);

export const vineData = [];
for (let v = 0; v < 20; v++) {
  const gi = Math.floor(Math.random() * (BAYS_X + 1));
  const gj = Math.floor(Math.random() * (BAYS_Z + 1));
  const baseX = gx(gi), baseZ = gz(gj);
  const maxH = (2 + Math.floor(Math.random() * (NUM_LEVELS - 1))) * LEVEL_H;
  const segs = Math.floor(maxH / 0.15);
  const pts = [];
  const vineCol = vineColors[Math.floor(Math.random() * vineColors.length)];
  const vMat = new THREE.MeshStandardMaterial({ color: vineCol, metalness: 0.0, roughness: 0.85 });
  let cx = baseX, cz = baseZ;
  const spiralTurns = 2 + Math.random() * 6;
  const spiralWobble = 0.02 + Math.random() * 0.04;
  for (let s = 0; s <= segs; s++) {
    const f = s / segs;
    const y = f * maxH;
    const spiralAngle = f * Math.PI * spiralTurns + v * 2.1;
    const spiralR = 0.05 + Math.sin(f * Math.PI) * 0.12 + Math.sin(f * 13) * spiralWobble;
    pts.push(new THREE.Vector3(
      cx + Math.cos(spiralAngle) * spiralR,
      y,
      cz + Math.sin(spiralAngle) * spiralR
    ));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const thickness = 0.008 + Math.random() * 0.014;
  const tubeGeo = new THREE.TubeGeometry(curve, segs, thickness, 5, false);
  const vineMesh = new THREE.Mesh(tubeGeo, vMat);
  vineMesh.castShadow = true;
  vineGroup.add(vineMesh);

  const nLeaves = 6 + Math.floor(Math.random() * 14);
  const leaves = [];
  const lCol = leafColors[Math.floor(Math.random() * leafColors.length)];
  const lMat = new THREE.MeshStandardMaterial({ color: lCol, metalness: 0.0, roughness: 0.7, side: THREE.DoubleSide });
  for (let l = 0; l < nLeaves; l++) {
    const lt = 0.1 + Math.random() * 0.8;
    const lp = curve.getPointAt(lt);
    const useLarge = Math.random() > 0.6;
    const leaf = new THREE.Mesh(useLarge ? leafGeoLg : leafGeoSm, lMat);
    leaf.position.copy(lp);
    leaf.rotation.set(
      -0.3 + Math.random() * 0.6,
      Math.random() * Math.PI * 2,
      -0.2 + Math.random() * 0.4
    );
    leaf.scale.setScalar(0.5 + Math.random() * 1.0);
    vineGroup.add(leaf);
    leaves.push({ mesh: leaf, phase: Math.random() * Math.PI * 2 });
  }

  if (Math.random() > 0.4) {
    const tendrilCount = 1 + Math.floor(Math.random() * 3);
    for (let tt = 0; tt < tendrilCount; tt++) {
      const tStart = 0.3 + Math.random() * 0.5;
      const tp = curve.getPointAt(tStart);
      const hangLen = 0.4 + Math.random() * 1.2;
      const tPts = [];
      for (let ts = 0; ts <= 6; ts++) {
        const tf = ts / 6;
        tPts.push(new THREE.Vector3(
          tp.x + Math.sin(tf * 3 + v) * 0.05,
          tp.y - tf * hangLen,
          tp.z + Math.cos(tf * 3 + v) * 0.05
        ));
      }
      const tCurve = new THREE.CatmullRomCurve3(tPts);
      const tendril = new THREE.Mesh(
        new THREE.TubeGeometry(tCurve, 6, 0.005, 4, false), vMat
      );
      vineGroup.add(tendril);
    }
  }

  vineData.push({ leaves, maxH });
}

// Grass patches
const grassMat = new THREE.MeshStandardMaterial({
  color: 0x4a8a2a, metalness: 0.0, roughness: 0.9, side: THREE.DoubleSide,
});
const grassBladeGeo = new THREE.PlaneGeometry(0.03, 0.25, 1, 3);
for (let g = 0; g < 350; g++) {
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.random() * 6;
  const blade = new THREE.Mesh(grassBladeGeo, grassMat);
  blade.position.set(Math.cos(angle) * dist, 0.12, Math.sin(angle) * dist);
  blade.rotation.y = Math.random() * Math.PI;
  blade.rotation.x = -0.1 - Math.random() * 0.15;
  blade.scale.y = 0.4 + Math.random() * 1.2;
  vineGroup.add(blade);
}
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

  for (let lv = 0; lv < totalLevels; lv++) {
    if (Math.random() > 0.25) continue;
    const y = lv * LEVEL_H;
    const isX = Math.random() > 0.5;
    if (isX) {
      const i = Math.floor(Math.random() * BAYS_X);
      const j = Math.floor(Math.random() * (BAYS_Z + 1));
      const mx = (gx(i) + gx(i + 1)) / 2;
      placeIvy(mx, y, gz(j), { scale: 0.2 + Math.random() * 0.4 });
    } else {
      const i = Math.floor(Math.random() * (BAYS_X + 1));
      const j = Math.floor(Math.random() * BAYS_Z);
      const mz = (gz(j) + gz(j + 1)) / 2;
      placeIvy(gx(i), y, mz, { scale: 0.2 + Math.random() * 0.4 });
    }
  }

  for (let si = 0; si < STAGES.length; si++) {
    const y = STAGES[si].floorY;
    const edgeCount = 8 + Math.floor(Math.random() * 6);
    for (let e = 0; e < edgeCount; e++) {
      const side = Math.floor(Math.random() * 4);
      let ex, ez;
      if (side === 0) { ex = gx(0) - 0.1; ez = gz(Math.random() * BAYS_Z); }
      else if (side === 1) { ex = gx(BAYS_X) + 0.1; ez = gz(Math.random() * BAYS_Z); }
      else if (side === 2) { ex = gx(Math.random() * BAYS_X); ez = gz(0) - 0.1; }
      else { ex = gx(Math.random() * BAYS_X); ez = gz(BAYS_Z) + 0.1; }
      placeIvy(ex, y, ez, {
        xRot: Math.PI * (0.35 + Math.random() * 0.3),
        scale: 0.3 + Math.random() * 0.6,
      });
    }
  }

  for (const i of [0, BAYS_X]) {
    for (let j = 0; j < BAYS_Z; j++) {
      const patches = 2 + Math.floor(Math.random() * 3);
      for (let p = 0; p < patches; p++) {
        const y = Math.random() * TOP_H * 0.9;
        const mz = (gz(j) + gz(j + 1)) / 2 + (Math.random() - 0.5) * BAY_D * 0.6;
        placeIvy(gx(i), y, mz, {
          yRot: i === 0 ? Math.PI : 0,
          scale: 0.25 + Math.random() * 0.5,
        });
      }
    }
  }
  for (const j of [0, BAYS_Z]) {
    for (let i = 0; i < BAYS_X; i++) {
      const patches = 2 + Math.floor(Math.random() * 3);
      for (let p = 0; p < patches; p++) {
        const y = Math.random() * TOP_H * 0.9;
        const mx = (gx(i) + gx(i + 1)) / 2 + (Math.random() - 0.5) * BAY_W * 0.6;
        placeIvy(mx, y, gz(j), {
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
