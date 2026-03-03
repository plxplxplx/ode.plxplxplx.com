import * as THREE from 'three';
import {
  BAYS_X, BAYS_Z, BAY_W, BAY_D, LEVEL_H, TOP_H, STAGES,
  gx, gz, cellCx, cellCz, STD_R, LED_R, BRACE_R, PLAT_H,
  MARGIN, N_TREADS,
} from './config.js';
import { STAGE_MATS, steelAt, deckAt, tube, box } from './materials.js';
import { scene, buildPlane, buildPlaneBottom } from './scene.js';

// =====================================================
// BUILD 4-STAGE TOWER (async chunked to reduce TBT)
// =====================================================
export const scaffold = new THREE.Group();
scaffold.name = 'scaffold';
export const collidables = [];
export const floorMats = []; // cloned materials for floor planes (opacity/mirror control)
const rampMat = new THREE.MeshBasicMaterial({ visible: false });

// Computed synchronously so downstream modules can import at init
export const totalLevels = Math.ceil(TOP_H / LEVEL_H);
export const stairPath = []; // { i, j } per level
export const LOOKOUTS = [
  { stageIdx: 0, dir: [1, 0],  bays: 3, yOff: 0 },
  { stageIdx: 0, dir: [0, -1], bays: 2, yOff: 0 },
  { stageIdx: 1, dir: [0, 1],  bays: 3, yOff: 0 },
  { stageIdx: 1, dir: [-1, 0], bays: 2, yOff: 0 },
  { stageIdx: 1, dir: [1, 0],  bays: 2, yOff: 0 },
  { stageIdx: 2, dir: [0, -1], bays: 4, yOff: 0 },
  { stageIdx: 2, dir: [1, 0],  bays: 3, yOff: 0 },
  { stageIdx: 2, dir: [-1, 0], bays: 2, yOff: 0 },
  { stageIdx: 3, dir: [0, 1],  bays: 5, yOff: 0 },
  { stageIdx: 3, dir: [-1, 0], bays: 3, yOff: 0 },
];
export const glassPanels = [];

// Yield to main thread between sections
const yieldTick = () => new Promise(r => setTimeout(r, 0));

// The scaffold Group is added to scene immediately (meshes appear progressively)
scene.add(scaffold);

export const scaffoldReady = (async () => {
  // --- Section 1: Vertical standards ---
  for (let i = 0; i <= BAYS_X; i++) {
    for (let j = 0; j <= BAYS_Z; j++) {
      for (let si = 0; si < STAGES.length; si++) {
        const y0 = STAGES[si].floorY;
        const y1 = si < STAGES.length - 1 ? STAGES[si + 1].floorY : TOP_H;
        const t = tube(gx(i), y0, gz(j), gx(i), y1, gz(j), STD_R, STAGE_MATS[si].steel);
        if (t) scaffold.add(t);
      }
    }
  }

  await yieldTick();

  // --- Section 2: Ledgers + braces ---
  for (let lv = 0; lv <= totalLevels; lv++) {
    const y = lv * LEVEL_H;
    if (y > TOP_H) break;
    const sm = steelAt(y);
    for (let i = 0; i < BAYS_X; i++) for (let j = 0; j <= BAYS_Z; j++) {
      const t = tube(gx(i),y,gz(j), gx(i+1),y,gz(j), LED_R, sm);
      if (t) scaffold.add(t);
    }
    for (let i = 0; i <= BAYS_X; i++) for (let j = 0; j < BAYS_Z; j++) {
      const t = tube(gx(i),y,gz(j), gx(i),y,gz(j+1), LED_R, sm);
      if (t) scaffold.add(t);
    }
  }

  // Diagonal braces
  for (let lv = 0; lv < totalLevels; lv += 3) {
    const y0 = lv * LEVEL_H, y1 = Math.min(y0 + LEVEL_H, TOP_H);
    if (y1 - y0 < 0.5) break;
    const sm = steelAt(y0);
    for (const j of [0, BAYS_Z]) {
      for (let i = 0; i < BAYS_X; i++) {
        const t = tube(gx(i),y0,gz(j), gx(i+1),y1,gz(j), BRACE_R, sm);
        if (t) scaffold.add(t);
      }
    }
    for (const i of [0, BAYS_X]) {
      for (let j = 0; j < BAYS_Z; j++) {
        const t = tube(gx(i),y0,gz(j), gx(i),y1,gz(j+1), BRACE_R, sm);
        if (t) scaffold.add(t);
      }
    }
  }

  await yieldTick();

  // --- Section 3: Staircases + walkways ---
  {
    const STAIR_SW = BAY_D - 2 * MARGIN;
    const LAND_W = BAY_W - 2 * MARGIN;

    // seeded PRNG
    let _ss = 42;
    const srand = () => {
      _ss |= 0; _ss = _ss + 0x6D2B79F5 | 0;
      let t = Math.imul(_ss ^ _ss >>> 15, 1 | _ss);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    // shuffled bay cycle for maximum variety
    const bays = [];
    for (let i = 0; i < BAYS_X; i++)
      for (let j = 0; j < BAYS_Z; j++)
        bays.push([i, j]);
    const shuffle = () => {
      for (let k = bays.length - 1; k > 0; k--) {
        const r = Math.floor(srand() * (k + 1));
        [bays[k], bays[r]] = [bays[r], bays[k]];
      }
    };
    shuffle();
    let bayIdx = 0;

    // assign each level a bay, guaranteeing adjacent levels differ
    let ci = 0, cj = 0;
    for (let lv = 0; lv < totalLevels; lv++) {
      stairPath.push({ i: ci, j: cj });
      let ni = ci, nj = cj;
      for (let tries = 0; tries < bays.length; tries++) {
        [ni, nj] = bays[bayIdx];
        bayIdx++;
        if (bayIdx >= bays.length) { bayIdx = 0; shuffle(); }
        if (ni !== ci || nj !== cj) break;
      }
      ci = ni; cj = nj;
    }

    // build one flight + landing per level
    for (let lv = 0; lv < totalLevels; lv++) {
      const sp = stairPath[lv];
      const y = lv * LEVEL_H;
      const y1 = Math.min(y + LEVEL_H, TOP_H);
      if (y1 - y < 0.5) break;
      const sm = steelAt(y);
      const dm = deckAt(y);
      const sx0 = gx(sp.i) + MARGIN;
      const sx1 = gx(sp.i + 1) - MARGIN;
      const sz = cellCz(sp.j);
      const flip = lv % 2 === 0;
      const fx0 = flip ? sx0 : sx1;
      const fx1 = flip ? sx1 : sx0;

      // landing
      scaffold.add(box(cellCx(sp.i), y, sz, LAND_W, PLAT_H, STAIR_SW, dm));

      // treads
      for (let s = 0; s <= N_TREADS; s++) {
        const f = s / N_TREADS;
        scaffold.add(box(
          THREE.MathUtils.lerp(fx0, fx1, f),
          THREE.MathUtils.lerp(y, y1, f),
          sz, 0.22, 0.03, STAIR_SW, dm
        ));
      }
      // stringers
      for (const zOff of [-STAIR_SW / 2, STAIR_SW / 2]) {
        const t = tube(fx0, y, sz + zOff, fx1, y1, sz + zOff, 0.014, sm);
        if (t) scaffold.add(t);
      }
      // guardrails
      for (const zOff of [-STAIR_SW / 2, STAIR_SW / 2]) {
        const t = tube(fx0, y + 0.9, sz + zOff, fx1, y1 + 0.1, sz + zOff, 0.012, sm);
        if (t) scaffold.add(t);
      }
    }
    // top landing
    const lastSp = stairPath[stairPath.length - 1];
    scaffold.add(box(cellCx(lastSp.i), totalLevels * LEVEL_H, cellCz(lastSp.j),
      LAND_W, PLAT_H, STAIR_SW, deckAt(TOP_H)));

    // connecting walkways — bridge between adjacent levels' stair bays
    for (let lv = 1; lv < stairPath.length; lv++) {
      const prev = stairPath[lv - 1];
      const curr = stairPath[lv];
      if (prev.i === curr.i && prev.j === curr.j) continue;
      const y = lv * LEVEL_H;
      if (y > TOP_H) break;
      const cdm = deckAt(y);
      const connMat = cdm.clone();
      connMat.transparent = true;
      connMat.opacity = 1.0;
      connMat.side = THREE.DoubleSide;
      connMat.clippingPlanes = [buildPlane, buildPlaneBottom];
      floorMats.push(connMat);

      const minI = Math.min(prev.i, curr.i);
      const maxI = Math.max(prev.i, curr.i);
      const minJ = Math.min(prev.j, curr.j);
      const maxJ = Math.max(prev.j, curr.j);

      for (let bi = minI; bi <= maxI; bi++) {
        for (let bj = minJ; bj <= maxJ; bj++) {
          // skip bays that already have stair landings
          if (bi === prev.i && bj === prev.j) continue;
          if (bi === curr.i && bj === curr.j) continue;
          const p = box(cellCx(bi), y, cellCz(bj), BAY_W, PLAT_H, BAY_D, connMat);
          p.castShadow = false;
          p.userData = { componentType: 'stairConnection' };
          scaffold.add(p);
          collidables.push(p);
        }
      }
    }
  }

  await yieldTick();

  // --- Section 4: Floor platforms + slabs ---
  for (let si = 0; si < STAGES.length; si++) {
    const stage = STAGES[si];
    const y = stage.floorY;
    const dm = STAGE_MATS[si].deck;
    const sm = STAGE_MATS[si].steel;
    // Full floor platform across all bays (skip ground stage)
    if (si > 0) {
      const floorDm = dm.clone();
      floorDm.transparent = true;
      floorDm.opacity = 1.0;
      floorDm.side = THREE.DoubleSide;
      floorDm.clippingPlanes = [buildPlane, buildPlaneBottom];
      floorMats.push(floorDm);
      for (let bi = 0; bi < BAYS_X; bi++) {
        for (let bj = 0; bj < BAYS_Z; bj++) {
          const p = box(cellCx(bi), y, cellCz(bj), BAY_W, PLAT_H, BAY_D, floorDm);
          p.castShadow = false;
          p.userData = { componentType: 'platform', stage: stage.name };
          scaffold.add(p);
          collidables.push(p);
        }
      }
    }
    // Massive transition slab
    if (si > 0) {
      const slabW = 120;
      const slabD = 120;
      const slabH = 0.12;
      const slabMat = new THREE.MeshStandardMaterial({
        color: dm.color, metalness: dm.metalness * 0.8, roughness: dm.roughness * 1.2,
        transparent: true, opacity: 0.85, side: THREE.DoubleSide,
        clippingPlanes: [buildPlane, buildPlaneBottom],
      });
      floorMats.push(slabMat);
      const slab = box(0, y, 0, slabW, slabH, slabD, slabMat);
      slab.castShadow = false;
      slab.userData = { componentType: 'transitionSlab', stage: stage.name };
      scaffold.add(slab);
    }
    // Guardrails around each floor perimeter
    for (let i = 0; i < BAYS_X; i++) {
      for (const j of [0, BAYS_Z]) {
        const t = tube(gx(i),y+1.0,gz(j), gx(i+1),y+1.0,gz(j), 0.014, sm);
        if (t) scaffold.add(t);
      }
    }
    for (let j = 0; j < BAYS_Z; j++) {
      for (const i of [0, BAYS_X]) {
        const t = tube(gx(i),y+1.0,gz(j), gx(i),y+1.0,gz(j+1), 0.014, sm);
        if (t) scaffold.add(t);
      }
    }
  }

  await yieldTick();

  // --- Section 5: Scattered platforms ---
  {
    let _ps = 31;
    const prand = () => {
      _ps |= 0; _ps = _ps + 0x6D2B79F5 | 0;
      let t = Math.imul(_ps ^ _ps >>> 15, 1 | _ps);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    let lv = 3;
    while (lv < totalLevels - 1) {
      const y = lv * LEVEL_H;
      if (y > TOP_H - LEVEL_H) break;

      // skip within 2 levels of any stage floor
      let skip = false;
      for (const s of STAGES) {
        if (Math.abs(y - s.floorY) < LEVEL_H * 1.5) { skip = true; break; }
      }
      if (skip) { lv += 2; continue; }

      const sm = steelAt(y);
      const dm = deckAt(y);
      const platDm = dm.clone();
      platDm.transparent = true;
      platDm.opacity = 1.0;
      platDm.side = THREE.DoubleSide;
      platDm.clippingPlanes = [buildPlane, buildPlaneBottom];
      floorMats.push(platDm);

      // random subset of bays get platforms at this level
      const coverage = 0.25 + prand() * 0.45;
      let placed = false;

      for (let bi = 0; bi < BAYS_X; bi++) {
        for (let bj = 0; bj < BAYS_Z; bj++) {
          if (bi === 0 && bj === 0) continue; // avoid stair column
          if (prand() > coverage) continue;
          const p = box(cellCx(bi), y, cellCz(bj), BAY_W, PLAT_H, BAY_D, platDm);
          p.castShadow = false;
          p.userData = { componentType: 'scatteredPlatform' };
          scaffold.add(p);
          collidables.push(p);
          placed = true;
        }
      }

      // overhang — extend 1 bay outside the tower
      if (prand() < 0.35 && placed) {
        const side = Math.floor(prand() * 4); // 0=+X 1=-X 2=+Z 3=-Z
        let cx, cz;
        if (side === 0) {
          cx = gx(BAYS_X) + BAY_W / 2;
          cz = cellCz(Math.floor(prand() * BAYS_Z));
        } else if (side === 1) {
          cx = gx(0) - BAY_W / 2;
          cz = cellCz(Math.floor(prand() * BAYS_Z));
        } else if (side === 2) {
          cx = cellCx(Math.floor(prand() * BAYS_X));
          cz = gz(BAYS_Z) + BAY_D / 2;
        } else {
          cx = cellCx(Math.floor(prand() * BAYS_X));
          cz = gz(0) - BAY_D / 2;
        }

        const op = box(cx, y, cz, BAY_W, PLAT_H, BAY_D, platDm);
        op.castShadow = false;
        op.userData = { componentType: 'overhangPlatform' };
        scaffold.add(op);
        collidables.push(op);

        // supporting standards (1 level below → 1 level above)
        const oy0 = y - LEVEL_H, oy1 = y + LEVEL_H;
        if (side <= 1) {
          const ox = side === 0 ? gx(BAYS_X) + BAY_W : gx(0) - BAY_W;
          let t = tube(ox, oy0, cz - BAY_D / 2, ox, oy1, cz - BAY_D / 2, STD_R, sm);
          if (t) scaffold.add(t);
          t = tube(ox, oy0, cz + BAY_D / 2, ox, oy1, cz + BAY_D / 2, STD_R, sm);
          if (t) scaffold.add(t);
          t = tube(ox, y, cz - BAY_D / 2, ox, y, cz + BAY_D / 2, LED_R, sm);
          if (t) scaffold.add(t);
          // diagonal brace
          const baseX = side === 0 ? gx(BAYS_X) : gx(0);
          t = tube(baseX, oy0, cz, ox, y, cz, BRACE_R, sm);
          if (t) scaffold.add(t);
          // guardrail
          t = tube(ox, y + 1.0, cz - BAY_D / 2, ox, y + 1.0, cz + BAY_D / 2, 0.014, sm);
          if (t) scaffold.add(t);
        } else {
          const oz = side === 2 ? gz(BAYS_Z) + BAY_D : gz(0) - BAY_D;
          let t = tube(cx - BAY_W / 2, oy0, oz, cx - BAY_W / 2, oy1, oz, STD_R, sm);
          if (t) scaffold.add(t);
          t = tube(cx + BAY_W / 2, oy0, oz, cx + BAY_W / 2, oy1, oz, STD_R, sm);
          if (t) scaffold.add(t);
          t = tube(cx - BAY_W / 2, y, oz, cx + BAY_W / 2, y, oz, LED_R, sm);
          if (t) scaffold.add(t);
          const baseZ = side === 2 ? gz(BAYS_Z) : gz(0);
          t = tube(cx, oy0, baseZ, cx, y, oz, BRACE_R, sm);
          if (t) scaffold.add(t);
          t = tube(cx - BAY_W / 2, y + 1.0, oz, cx + BAY_W / 2, y + 1.0, oz, 0.014, sm);
          if (t) scaffold.add(t);
        }
      }

      // extra cross-brace in XZ plane for visual density
      if (prand() < 0.5) {
        const bi = Math.floor(prand() * BAYS_X);
        const bj = Math.floor(prand() * BAYS_Z);
        const t = tube(gx(bi), y, gz(bj), gx(bi + 1), y, gz(bj + 1), BRACE_R, sm);
        if (t) scaffold.add(t);
      }

      lv += 2 + Math.floor(prand() * 5); // 2-6 level gap before next cluster
    }
  }

  await yieldTick();

  // --- Section 6: Lookouts ---
  for (const lo of LOOKOUTS) {
    const stage = STAGES[lo.stageIdx];
    const baseY = stage.floorY + lo.yOff;
    const armH = 3 * LEVEL_H;
    const dx = lo.dir[0], dz = lo.dir[1];
    const loSteel = STAGE_MATS[lo.stageIdx].steel;
    const loDeckBase = STAGE_MATS[lo.stageIdx].deck;
    const loDeck = loDeckBase.clone();
    loDeck.transparent = true;
    loDeck.opacity = 1.0;
    loDeck.side = THREE.DoubleSide;
    loDeck.clippingPlanes = [buildPlane, buildPlaneBottom];
    floorMats.push(loDeck);

    const startX = dx > 0 ? gx(BAYS_X) : dx < 0 ? gx(0) : 0;
    const startZ = dz > 0 ? gz(BAYS_Z) : dz < 0 ? gz(0) : 0;

    for (let b = 0; b < lo.bays; b++) {
      const bx0 = startX + b * dx * BAY_W;
      const bx1 = startX + (b + 1) * dx * BAY_W;
      const bz0 = startZ + b * dz * BAY_D;
      const bz1 = startZ + (b + 1) * dz * BAY_D;

      if (dx !== 0) {
        for (const zp of [gz(0), gz(BAYS_Z)]) {
          const t = tube(bx1, baseY, zp, bx1, baseY + armH, zp, STD_R, loSteel);
          if (t) scaffold.add(t);
        }
      } else {
        for (const xp of [gx(0), gx(BAYS_X)]) {
          const t = tube(xp, baseY, bz1, xp, baseY + armH, bz1, STD_R, loSteel);
          if (t) scaffold.add(t);
        }
      }

      for (const yy of [baseY, baseY + armH]) {
        if (dx !== 0) {
          const t1 = tube(bx0, yy, gz(0), bx1, yy, gz(0), LED_R, loSteel);
          const t2 = tube(bx0, yy, gz(BAYS_Z), bx1, yy, gz(BAYS_Z), LED_R, loSteel);
          const t3 = tube(bx1, yy, gz(0), bx1, yy, gz(BAYS_Z), LED_R, loSteel);
          if (t1) scaffold.add(t1); if (t2) scaffold.add(t2); if (t3) scaffold.add(t3);
        } else {
          const t1 = tube(gx(0), yy, bz0, gx(0), yy, bz1, LED_R, loSteel);
          const t2 = tube(gx(BAYS_X), yy, bz0, gx(BAYS_X), yy, bz1, LED_R, loSteel);
          const t3 = tube(gx(0), yy, bz1, gx(BAYS_X), yy, bz1, LED_R, loSteel);
          if (t1) scaffold.add(t1); if (t2) scaffold.add(t2); if (t3) scaffold.add(t3);
        }
      }

      if (dx !== 0) {
        const t = tube(bx0, baseY, gz(0), bx1, baseY + armH, gz(0), BRACE_R, loSteel);
        if (t) scaffold.add(t);
      } else {
        const t = tube(gx(0), baseY, bz0, gx(0), baseY + armH, bz1, BRACE_R, loSteel);
        if (t) scaffold.add(t);
      }

      if (dx !== 0) {
        const px = (bx0 + bx1) / 2;
        for (let bj = 0; bj < BAYS_Z; bj++) {
          const p = box(px, baseY, cellCz(bj), BAY_W, PLAT_H, BAY_D, loDeck);
          p.castShadow = false;
          p.userData = { componentType: 'lookout' };
          scaffold.add(p); collidables.push(p);
        }
      } else {
        const pz = (bz0 + bz1) / 2;
        for (let bi = 0; bi < BAYS_X; bi++) {
          const p = box(cellCx(bi), baseY, pz, BAY_W, PLAT_H, BAY_D, loDeck);
          p.castShadow = false;
          p.userData = { componentType: 'lookout' };
          scaffold.add(p); collidables.push(p);
        }
      }
    }

    const endDist = lo.bays;
    if (dx !== 0) {
      const ex = startX + endDist * dx * BAY_W;
      const t = tube(ex, baseY + 1.0, gz(0), ex, baseY + 1.0, gz(BAYS_Z), 0.014, loSteel);
      if (t) scaffold.add(t);
    } else {
      const ez = startZ + endDist * dz * BAY_D;
      const t = tube(gx(0), baseY + 1.0, ez, gx(BAYS_X), baseY + 1.0, ez, 0.014, loSteel);
      if (t) scaffold.add(t);
    }
  }

  await yieldTick();

  // --- Section 7: Glass panels ---
  {
    // seeded PRNG for deterministic layout
    let _s = 7;
    const rand = () => {
      _s |= 0; _s = _s + 0x6D2B79F5 | 0;
      let t = Math.imul(_s ^ _s >>> 15, 1 | _s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    // white base material — neutral so image textures show true colour
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, transparent: true, opacity: 0.42,
      roughness: 0.05, metalness: 0.1,
      side: THREE.DoubleSide, depthWrite: false,
      clippingPlanes: [buildPlane, buildPlaneBottom],
    });

    // cached rect geometries (slightly inset from scaffold frame)
    const IN = 0.94;
    const rXZ = new THREE.PlaneGeometry(BAY_W * IN, LEVEL_H * IN);
    const rZY = new THREE.PlaneGeometry(BAY_D * IN, LEVEL_H * IN);

    const DENSITY = 0.20;

    function place(cx, cy, cz, xFacing) {
      if (rand() > DENSITY) return;
      const m = new THREE.Mesh(xFacing ? rZY : rXZ, glassMat);
      m.position.set(cx, cy, cz);
      if (xFacing) m.rotation.y = Math.PI / 2;
      m.userData.squareFrame = xFacing; // BAY_D === LEVEL_H → square
      m.renderOrder = 1;
      scaffold.add(m);
      glassPanels.push(m);
    }

    // — Main tower outer faces —
    for (let lv = 0; lv < totalLevels; lv++) {
      const cy = lv * LEVEL_H + LEVEL_H / 2;
      if (cy + LEVEL_H / 2 > TOP_H) break;
      for (let i = 0; i < BAYS_X; i++) {            // Z-facing (front & back)
        place(cellCx(i), cy, gz(0), false);
        place(cellCx(i), cy, gz(BAYS_Z), false);
      }
      for (let j = 0; j < BAYS_Z; j++) {            // X-facing (left & right)
        place(gx(0), cy, cellCz(j), true);
        place(gx(BAYS_X), cy, cellCz(j), true);
      }
    }

    // — Lookout arm faces —
    for (const lo of LOOKOUTS) {
      const baseY = STAGES[lo.stageIdx].floorY + lo.yOff;
      const dx = lo.dir[0], dz = lo.dir[1];
      const sx = dx > 0 ? gx(BAYS_X) : dx < 0 ? gx(0) : 0;
      const sz = dz > 0 ? gz(BAYS_Z) : dz < 0 ? gz(0) : 0;
      for (let lv = 0; lv < 3; lv++) {
        const cy = baseY + lv * LEVEL_H + LEVEL_H / 2;
        for (let b = 0; b < lo.bays; b++) {
          if (dx !== 0) {
            const bx = sx + (b + 0.5) * dx * BAY_W;
            place(bx, cy, gz(0), false);
            place(bx, cy, gz(BAYS_Z), false);
          } else {
            const bz = sz + (b + 0.5) * dz * BAY_D;
            place(gx(0), cy, bz, true);
            place(gx(BAYS_X), cy, bz, true);
          }
        }
      }
    }
  }
})();
