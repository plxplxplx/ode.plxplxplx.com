import * as THREE from 'three';
import { MOVE_SPEED, JUMP_VEL, GRAVITY, STEP_UP, TOTAL_W, TOTAL_D, cellCx, cellCz, LEVEL_H, TOP_H, MARGIN, gx } from './config.js';
import { scene } from './scene.js';
import { collidables, stairPath } from './scaffold.js';

// =====================================================
// CHARACTER (floating light orb)
// =====================================================
export const charGroup = new THREE.Group();
export const orbCore = new THREE.Mesh(
  new THREE.SphereGeometry(0.12, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xffeedd })
);
orbCore.position.y = 0.35;
charGroup.add(orbCore);

export const orbGlow = new THREE.Mesh(
  new THREE.SphereGeometry(0.25, 16, 12),
  new THREE.MeshBasicMaterial({
    color: 0xffaa44, transparent: true, opacity: 0.15,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })
);
orbGlow.position.y = 0.35;
charGroup.add(orbGlow);

export const halo = new THREE.Mesh(
  new THREE.RingGeometry(0.18, 0.28, 24),
  new THREE.MeshBasicMaterial({
    color: 0xffcc66, transparent: true, opacity: 0.1,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  })
);
halo.position.y = 0.35;
charGroup.add(halo);

export const charLight = new THREE.PointLight(0xffaa44, 1.5, 10);
charLight.position.y = 0.35;
charGroup.add(charLight);
charGroup.add(new THREE.PointLight(0xff6622, 0.4, 15));

// Character hidden in scroll mode (cinematic view)
charGroup.visible = false;
charGroup.position.set(cellCx(0), 0.05, cellCz(0));
scene.add(charGroup);

// =====================================================
// STAIRCASE WALKER (autonomous + WASD in FPV)
// =====================================================
const totalLevels = Math.ceil(TOP_H / LEVEL_H);
export let fpvMode = false;
export const walkerPos = new THREE.Vector3();
export const walkerLookDir = new THREE.Vector3();

const walker = { t: 0, dir: 1 };    // t = 0..totalLevels (fractional)
const AUTO_SPEED = 0.25;             // levels per second (meditative)
const WASD_SPEED = 0.4;             // slightly faster under manual control
const LANDING_T = 0.25;             // fraction of each level spent walking across platform
let smoothDir = 1;                   // smoothed direction for organic look

export function updateWalker(dt) {
  if (fpvMode) {
    const moving = inp.fwd || inp.back;
    if (inp.fwd)  walker.dir = 1;
    if (inp.back) walker.dir = -1;
    if (moving) walker.t += dt * WASD_SPEED * walker.dir;
  } else {
    walker.t += dt * AUTO_SPEED * walker.dir;
  }

  if (walker.t >= totalLevels) { walker.t = totalLevels; walker.dir = -1; }
  if (walker.t <= 0)           { walker.t = 0;           walker.dir = 1;  }

  smoothDir += (walker.dir - smoothDir) * Math.min(1, dt * 3);

  const level = THREE.MathUtils.clamp(Math.floor(walker.t), 0, totalLevels - 1);
  const frac = THREE.MathUtils.clamp(walker.t - level, 0, 1);

  // current + previous stair bay from the exported path
  const sp = stairPath[level] || stairPath[stairPath.length - 1];
  const prev = level > 0 ? stairPath[level - 1] : sp;
  const hasBridge = prev.i !== sp.i || prev.j !== sp.j;

  const sx0 = gx(sp.i) + MARGIN;
  const sx1 = gx(sp.i + 1) - MARGIN;
  const sz = cellCz(sp.j);
  const baseY = level * LEVEL_H;
  const topY = Math.min((level + 1) * LEVEL_H, TOP_H);
  const flip = level % 2 === 0;
  const fx0 = flip ? sx0 : sx1;
  const fx1 = flip ? sx1 : sx0;

  if (frac < LANDING_T && level > 0 && hasBridge) {
    // Walk across connecting platform from previous bay to current bay
    const lt = frac / LANDING_T;
    const fromX = cellCx(prev.i);
    const fromZ = cellCz(prev.j);
    const toX = cellCx(sp.i);
    const toZ = cellCz(sp.j);
    walkerPos.set(
      THREE.MathUtils.lerp(fromX, toX, lt),
      baseY,
      THREE.MathUtils.lerp(fromZ, toZ, lt)
    );
    const dx = toX - fromX, dz = toZ - fromZ;
    const dl = Math.sqrt(dx * dx + dz * dz) || 1;
    walkerLookDir.set((dx / dl) * smoothDir, 0, (dz / dl) * smoothDir);
  } else {
    // Climb the flight
    const st = (level > 0 && hasBridge)
      ? (frac - LANDING_T) / (1 - LANDING_T)
      : frac;
    walkerPos.set(
      THREE.MathUtils.lerp(fx0, fx1, st),
      THREE.MathUtils.lerp(baseY, topY, st),
      sz
    );
    const lookX = fx1 - fx0;
    const lookY = topY - baseY;
    const len = Math.sqrt(lookX * lookX + lookY * lookY) || 1;
    walkerLookDir.set((lookX / len) * smoothDir, (lookY / len) * smoothDir, 0);
  }
}

// =====================================================
// INPUT
// =====================================================
export const inp = { left: false, right: false, fwd: false, back: false, jump: false };
export const jp = { jump: false };

window.addEventListener('keydown', e => {
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault();
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': inp.left = true; break;
    case 'ArrowRight': case 'KeyD': inp.right = true; break;
    case 'ArrowUp': case 'KeyW': inp.fwd = true; break;
    case 'ArrowDown': case 'KeyS': inp.back = true; break;
    case 'Space': if (!inp.jump) jp.jump = true; inp.jump = true; break;
    case 'KeyC': fpvMode = !fpvMode; break;
  }
});
window.addEventListener('keyup', e => {
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': inp.left = false; break;
    case 'ArrowRight': case 'KeyD': inp.right = false; break;
    case 'ArrowUp': case 'KeyW': inp.fwd = false; break;
    case 'ArrowDown': case 'KeyS': inp.back = false; break;
    case 'Space': inp.jump = false; break;
  }
});

// =====================================================
// CHARACTER PHYSICS
// =====================================================
let charVelY = 0, isGrounded = false;
const rc = new THREE.Raycaster();
const _ro = new THREE.Vector3(), _rd = new THREE.Vector3(0, -1, 0);

function probeGround(x, y, z) {
  _ro.set(x, y + 2.0, z);
  rc.set(_ro, _rd); rc.far = 50;
  const hits = rc.intersectObjects(collidables, false);
  for (const h of hits) if (h.point.y <= y + STEP_UP) return h.point.y;
  return null;
}

export function updateChar(dt, controls) {
  const p = charGroup.position;
  const camAngle = controls.getAzimuthalAngle();
  const rx = Math.cos(camAngle), rz = -Math.sin(camAngle);
  const fx = Math.sin(camAngle), fz = Math.cos(camAngle);
  if (inp.left)  { p.x -= rx * MOVE_SPEED * dt; p.z += rz * MOVE_SPEED * dt; }
  if (inp.right) { p.x += rx * MOVE_SPEED * dt; p.z -= rz * MOVE_SPEED * dt; }
  if (inp.fwd)   { p.x -= fx * MOVE_SPEED * dt; p.z -= fz * MOVE_SPEED * dt; }
  if (inp.back)  { p.x += fx * MOVE_SPEED * dt; p.z += fz * MOVE_SPEED * dt; }
  if (jp.jump && isGrounded) { charVelY = JUMP_VEL; isGrounded = false; }
  const gy = probeGround(p.x, p.y, p.z);
  if (isGrounded && charVelY <= 0) {
    if (gy !== null && p.y - gy < 0.8) { p.y = gy; charVelY = 0; }
    else isGrounded = false;
  }
  if (!isGrounded) {
    charVelY += GRAVITY * dt; p.y += charVelY * dt;
    if (charVelY <= 0) {
      const ly = probeGround(p.x, p.y, p.z);
      if (ly !== null && p.y <= ly + 0.08) { p.y = ly; charVelY = 0; isGrounded = true; }
    }
  }
  if (p.y < 0) { p.y = 0; charVelY = 0; isGrounded = true; }
  if (p.y < -20) { p.set(cellCx(0), 1, cellCz(0)); charVelY = 0; isGrounded = true; }
  p.x = THREE.MathUtils.clamp(p.x, -TOTAL_W/2 - 5, TOTAL_W/2 + 5);
  p.z = THREE.MathUtils.clamp(p.z, -TOTAL_D/2 - 5, TOTAL_D/2 + 5);
}
