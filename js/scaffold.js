import * as THREE from 'three';
import {
  BAYS_X, BAYS_Z, BAY_W, BAY_D, LEVEL_H, TOP_H, STAGES,
  gx, gz, cellCx, cellCz, STD_R, LED_R, BRACE_R, PLAT_H,
  MARGIN, N_TREADS,
} from './config.js';
import { STAGE_MATS, steelAt, deckAt, tube, box } from './materials.js';
import { scene } from './scene.js';

// =====================================================
// BUILD 4-STAGE TOWER
// =====================================================
export const scaffold = new THREE.Group();
scaffold.name = 'scaffold';
export const collidables = [];
const rampMat = new THREE.MeshBasicMaterial({ visible: false });

// Vertical standards — split per stage for different materials
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

// Scaffolding fill — ledgers, braces, stairs between stages
export const totalLevels = Math.ceil(TOP_H / LEVEL_H);
for (let lv = 0; lv <= totalLevels; lv++) {
  const y = lv * LEVEL_H;
  if (y > TOP_H) break;
  const sm = steelAt(y);
  // Horizontal ledgers
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
for (let lv = 0; lv < totalLevels; lv++) {
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

// Zigzag stairs running the full height (in bay 0,0)
for (let lv = 0; lv < totalLevels; lv++) {
  const y = lv * LEVEL_H;
  const y1 = Math.min(y + LEVEL_H, TOP_H);
  if (y1 - y < 0.5) break;
  const sm = steelAt(y);
  const dm = deckAt(y);
  const flip = lv % 2 === 0;
  const x0 = gx(0) + MARGIN, x1 = gx(1) - MARGIN;
  const sx0 = flip ? x0 : x1, sx1 = flip ? x1 : x0;
  const cz = cellCz(0);
  const sw = BAY_D - 2 * MARGIN;
  for (let s = 0; s <= N_TREADS; s++) {
    const f = s / N_TREADS;
    scaffold.add(box(
      THREE.MathUtils.lerp(sx0, sx1, f),
      THREE.MathUtils.lerp(y, y1, f),
      cz, 0.22, 0.03, sw, dm
    ));
  }
  for (const zOff of [-sw/2, sw/2]) {
    const t = tube(sx0,y,cz+zOff, sx1,y1,cz+zOff, 0.014, sm);
    if (t) scaffold.add(t);
  }
  // Guardrails
  for (const zOff of [-sw/2, sw/2]) {
    const t = tube(sx0,y+1.0,cz+zOff, sx1,y1+1.0,cz+zOff, 0.012, sm);
    if (t) scaffold.add(t);
  }
}

// =====================================================
// 4 MAIN FLOOR PLATFORMS (the stages)
// =====================================================
for (let si = 0; si < STAGES.length; si++) {
  const stage = STAGES[si];
  const y = stage.floorY;
  const dm = STAGE_MATS[si].deck;
  const sm = STAGE_MATS[si].steel;
  // Full floor platform across all bays (skip ground stage)
  if (si > 0) {
    for (let bi = 0; bi < BAYS_X; bi++) {
      for (let bj = 0; bj < BAYS_Z; bj++) {
        const p = box(cellCx(bi), y, cellCz(bj), BAY_W, PLAT_H, BAY_D, dm);
        p.userData = { componentType: 'platform', stage: stage.name };
        scaffold.add(p);
        collidables.push(p);
      }
    }
  }
  // Massive transition slab — extends far beyond the tower footprint
  if (si > 0) {
    const slabW = 120;
    const slabD = 120;
    const slabH = 0.12;
    const slabMat = new THREE.MeshStandardMaterial({
      color: dm.color, metalness: dm.metalness * 0.8, roughness: dm.roughness * 1.2,
      transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    });
    const slab = box(0, y, 0, slabW, slabH, slabD, slabMat);
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

// =====================================================
// LOOKOUT EXTENSIONS — cantilever arms jutting into the void
// =====================================================
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

for (const lo of LOOKOUTS) {
  const stage = STAGES[lo.stageIdx];
  const baseY = stage.floorY + lo.yOff;
  const armH = 3 * LEVEL_H;
  const dx = lo.dir[0], dz = lo.dir[1];
  const loSteel = STAGE_MATS[lo.stageIdx].steel;
  const loDeck  = STAGE_MATS[lo.stageIdx].deck;

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
        p.userData = { componentType: 'lookout' };
        scaffold.add(p); collidables.push(p);
      }
    } else {
      const pz = (bz0 + bz1) / 2;
      for (let bi = 0; bi < BAYS_X; bi++) {
        const p = box(cellCx(bi), baseY, pz, BAY_W, PLAT_H, BAY_D, loDeck);
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

scene.add(scaffold);
