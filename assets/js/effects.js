import * as THREE from 'three';
import { BAYS_X, BAYS_Z, NUM_LEVELS, TOP_H, LEVEL_H, STAGES, gx, gz, isMobile } from './config.js';
import { scene } from './scene.js';

// =====================================================
// TRAVELING GRID LIGHTS
// =====================================================
export const gridLights = [];
const lColors = [0x00ff88, 0xff2d9b, 0x00e5ff, 0xb388ff, 0xffff00, 0xff6600];
const GRID_LIGHT_COUNT = isMobile ? 2 : 6;
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
export const FF_COUNT = isMobile ? 4 : 10;
export const fireflies = [];
const ffGlowGeo = new THREE.SphereGeometry(0.06, 6, 4);
const FF_LIGHT_COUNT = isMobile ? 0 : 4;

export const FF_STAGE_COLORS = [
  new THREE.Color(0xc8ff00), // GROUND — electric lime
  new THREE.Color(0xff2d9b), // SECOND — hot pink
  new THREE.Color(0x00e5ff), // THIRD — cyan
  new THREE.Color(0xb388ff), // SUMMIT — violet
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
  sprite.position.set(Math.cos(angle) * r, yOffset, Math.sin(angle) * r);

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
    speed: 0.2 + Math.random() * 0.5,
    ySpeed: 0.1 + Math.random() * 0.3,
    phase: Math.random() * Math.PI * 2,
    pulseSpeed: 1.5 + Math.random() * 3,
    baseIntensity: 4.0,
  });
}
