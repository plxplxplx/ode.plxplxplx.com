import * as THREE from 'three';
import { MOVE_SPEED, JUMP_VEL, GRAVITY, STEP_UP, TOTAL_W, TOTAL_D, cellCx, cellCz } from './config.js';
import { scene } from './scene.js';
import { collidables } from './scaffold.js';

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
