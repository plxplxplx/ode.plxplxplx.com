import * as THREE from 'three';
import { BAYS_X, BAYS_Z, NUM_LEVELS, TOP_H, LEVEL_H, STAGES, gx, gz, QUALITY } from './config.js';
import { scene } from './scene.js';

// =====================================================
// TRAVELING GRID LIGHTS
// =====================================================
export const gridLights = [];
const lColors = [0xf05b30, 0xC8CC5A, 0xFF8844, 0xFFCC44, 0xE8A030, 0xCC6622];
const GRID_LIGHT_COUNT = QUALITY.gridLights;
for (let n = 0; n < GRID_LIGHT_COUNT; n++) {
  const lt = new THREE.PointLight(lColors[n], 1.5, 25);
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 8, 6),
    new THREE.MeshBasicMaterial({ color: lColors[n], transparent: true, opacity: 0.9 })
  );
  lt.add(orb);
  scene.add(lt);
  const si = Math.floor(Math.random() * (BAYS_X + 1));
  const sj = Math.floor(Math.random() * (BAYS_Z + 1));
  const sl = Math.floor(Math.random() * (NUM_LEVELS + 1));
  gridLights.push({
    light: lt, gi: si, gj: sj, lv: sl,
    ti: si, tj: sj, tlv: sl, progress: 0,
    speed: 0.15 + Math.random() * 0.2,
  });
}

export function pickLightTarget(gl) {
  const opts = [];
  if (gl.gi > 0) opts.push([gl.gi-1, gl.gj, gl.lv]);
  if (gl.gi < BAYS_X) opts.push([gl.gi+1, gl.gj, gl.lv]);
  if (gl.gj > 0) opts.push([gl.gi, gl.gj-1, gl.lv]);
  if (gl.gj < BAYS_Z) opts.push([gl.gi, gl.gj+1, gl.lv]);
  if (gl.lv > 0) opts.push([gl.gi, gl.gj, gl.lv-1]);
  if (gl.lv <= NUM_LEVELS) opts.push([gl.gi, gl.gj, gl.lv+1]);
  const p = opts[Math.floor(Math.random() * opts.length)];
  gl.ti = p[0]; gl.tj = p[1]; gl.tlv = p[2]; gl.progress = 0;
}


// =====================================================
// FIREFLIES
// =====================================================
export const FF_COUNT = QUALITY.fireflyCount;
export const fireflies = [];
const ffGlowGeo = new THREE.SphereGeometry(0.06, 16, 12);
const FF_LIGHT_COUNT = QUALITY.fireflyLights;

export const FF_STAGE_COLORS = [
  new THREE.Color(0xC8CC5A), // GROUND — poster lime
  new THREE.Color(0xf05b30), // SECOND — poster orange
  new THREE.Color(0xFFAA44), // THIRD — warm amber
  new THREE.Color(0xFF6630), // SUMMIT — deep orange
];

for (let i = 0; i < FF_COUNT; i++) {
  const ffMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 1.0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sprite = new THREE.Mesh(ffGlowGeo, ffMat);
  const angle = Math.random() * Math.PI * 2;
  const r = 1 + Math.random() * 8;
  const yOffset = (Math.random() - 0.5) * 20;
  const glowScale = 0.5 + Math.random() * 1.0; // varied glow sizes
  sprite.position.set(Math.cos(angle) * r, yOffset, Math.sin(angle) * r);
  sprite.scale.setScalar(glowScale);

  let light = null;
  if (i < FF_LIGHT_COUNT) {
    light = new THREE.PointLight(0xffffff, 4.0, 40);
    light.position.copy(sprite.position);
    scene.add(light);
  }
  scene.add(sprite);

  fireflies.push({
    sprite,
    light,
    mat: ffMat,
    angle,
    radius: r,
    yOffset,
    glowScale,
    speed: 0.2 + Math.random() * 0.5,
    ySpeed: 0.1 + Math.random() * 0.3,
    phase: Math.random() * Math.PI * 2,
    pulseSpeed: 1.5 + Math.random() * 3,
    baseIntensity: 4.0,
  });
}

// =====================================================
// PER-FRAME UPDATE
// =====================================================
const _ffColor = new THREE.Color();

export function updateEffects(dt, t, camH, params) {
  // Traveling grid lights
  for (const gl of gridLights) {
    gl.progress += gl.speed * dt;
    if (gl.progress >= 1) {
      gl.gi = gl.ti; gl.gj = gl.tj; gl.lv = gl.tlv;
      pickLightTarget(gl);
    }
    const p = gl.progress;
    gl.light.position.set(
      THREE.MathUtils.lerp(gx(gl.gi), gx(gl.ti), p),
      THREE.MathUtils.lerp(gl.lv * LEVEL_H, gl.tlv * LEVEL_H, p),
      THREE.MathUtils.lerp(gz(gl.gj), gz(gl.tj), p)
    );
    gl.light.intensity = 0.5 + 0.3 * Math.sin(t * 1.5 + gl.gi);
  }

  // Fireflies — simple sine pulse animation
  for (const ff of fireflies) {
    ff.angle += ff.speed * dt * 0.15;
    ff.yOffset += Math.sin(t * ff.ySpeed + ff.phase) * 0.005;
    const vr = params.ffVerticalRange;
    if (ff.yOffset > vr) ff.yOffset = vr;
    if (ff.yOffset < -vr) ff.yOffset = -vr;
    const fx = Math.cos(ff.angle) * ff.radius;
    const fz = Math.sin(ff.angle) * ff.radius;
    const fy = camH + ff.yOffset + Math.sin(t * ff.ySpeed + ff.phase) * 1.5;
    ff.sprite.position.set(fx, fy, fz);
    const pulse = Math.max(0, Math.sin(t * ff.pulseSpeed + ff.phase));
    ff.sprite.scale.setScalar((0.6 + pulse * 2.0) * ff.glowScale);
    _ffColor.copy(FF_STAGE_COLORS[0]);
    for (let si = STAGES.length - 1; si >= 0; si--) {
      if (fy >= STAGES[si].floorY) {
        const nextSi = Math.min(si + 1, STAGES.length - 1);
        const range = (STAGES[nextSi].floorY || TOP_H) - STAGES[si].floorY;
        const frac = range > 0 ? Math.min((fy - STAGES[si].floorY) / range, 1) : 0;
        _ffColor.copy(FF_STAGE_COLORS[si]).lerp(FF_STAGE_COLORS[nextSi], frac);
        break;
      }
    }
    ff.mat.color.copy(_ffColor);
    if (ff.light) {
      ff.light.position.set(fx, fy, fz);
      ff.light.color.copy(_ffColor);
      ff.light.intensity = ff.baseIntensity * (0.3 + pulse * pulse * 0.7);
    }
  }
}
