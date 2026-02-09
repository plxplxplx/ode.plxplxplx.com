import * as THREE from 'three';
import { STAGES } from './config.js';

// =====================================================
// MARBLE TEXTURES for scaffolding
// =====================================================
const texLoader = new THREE.TextureLoader();

// Light marble (Marble001) — for upper stages (THIRD + SUMMIT)
export const lightColor = texLoader.load('assets/textures/Marble001_1K-JPG/Marble001_1K-JPG_Color.jpg');
export const lightNormal = texLoader.load('assets/textures/Marble001_1K-JPG/Marble001_1K-JPG_NormalGL.jpg');
export const lightRoughness = texLoader.load('assets/textures/Marble001_1K-JPG/Marble001_1K-JPG_Roughness.jpg');
for (const tex of [lightColor, lightNormal, lightRoughness]) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2);
}

// Dark marble (Marble016) — for lower stages (GROUND + SECOND)
export const darkColor = texLoader.load('assets/textures/Marble016_1K-JPG/Marble016_1K-JPG_Color.jpg');
export const darkNormal = texLoader.load('assets/textures/Marble016_1K-JPG/Marble016_1K-JPG_NormalGL.jpg');
export const darkRoughness = texLoader.load('assets/textures/Marble016_1K-JPG/Marble016_1K-JPG_Roughness.jpg');
for (const tex of [darkColor, darkNormal, darkRoughness]) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2);
}

// =====================================================
// MATERIALS — one palette per stage (marble-textured)
// =====================================================
export const STAGE_MATS = [
  { // GROUND — dark marble, warm patina
    steel: new THREE.MeshStandardMaterial({ color: 0x8a7a68, metalness: 0.75, roughness: 0.4, map: darkColor, normalMap: darkNormal, roughnessMap: darkRoughness }),
    deck:  new THREE.MeshStandardMaterial({ color: 0x7a6a58, metalness: 0.25, roughness: 0.65, map: darkColor, normalMap: darkNormal, roughnessMap: darkRoughness }),
  },
  { // SECOND — dark marble, oxidised blue-grey
    steel: new THREE.MeshStandardMaterial({ color: 0x6a7a88, metalness: 0.8, roughness: 0.3, map: darkColor, normalMap: darkNormal, roughnessMap: darkRoughness }),
    deck:  new THREE.MeshStandardMaterial({ color: 0x5a6a78, metalness: 0.3, roughness: 0.55, map: darkColor, normalMap: darkNormal, roughnessMap: darkRoughness }),
  },
  { // THIRD — light marble, dark bronze / copper
    steel: new THREE.MeshStandardMaterial({ color: 0x9a7a5a, metalness: 0.85, roughness: 0.28, map: lightColor, normalMap: lightNormal, roughnessMap: lightRoughness }),
    deck:  new THREE.MeshStandardMaterial({ color: 0x8a6a4a, metalness: 0.35, roughness: 0.5, map: lightColor, normalMap: lightNormal, roughnessMap: lightRoughness }),
  },
  { // SUMMIT — light marble, pale silver
    steel: new THREE.MeshStandardMaterial({ color: 0xb0aca8, metalness: 0.9, roughness: 0.2, map: lightColor, normalMap: lightNormal, roughnessMap: lightRoughness }),
    deck:  new THREE.MeshStandardMaterial({ color: 0xa09c98, metalness: 0.3, roughness: 0.45, map: lightColor, normalMap: lightNormal, roughnessMap: lightRoughness }),
  },
];

// Helper: get material for a given Y height
export function steelAt(y) {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (y >= STAGES[i].floorY - 1) return STAGE_MATS[i].steel;
  }
  return STAGE_MATS[0].steel;
}
export function deckAt(y) {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (y >= STAGES[i].floorY - 1) return STAGE_MATS[i].deck;
  }
  return STAGE_MATS[0].deck;
}

// Legacy references for GUI compatibility
export const matSteel = STAGE_MATS[0].steel;
export const matDeck  = STAGE_MATS[0].deck;

// =====================================================
// GEOMETRY FACTORIES
// =====================================================
export const geoCache = new Map();
export function cylGeo(r, l) {
  const k = `c${r.toFixed(4)}_${l.toFixed(4)}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.CylinderGeometry(r, r, l, 8, 1));
  return geoCache.get(k);
}
export function boxGeo(w, h, d) {
  const k = `b${w.toFixed(4)}_${h.toFixed(4)}_${d.toFixed(4)}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
}
const _d = new THREE.Vector3(), _u = new THREE.Vector3(0, 1, 0);
export function tube(ax,ay,az,bx,by,bz,r,mat) {
  _d.set(bx-ax,by-ay,bz-az); const l=_d.length(); if(l<1e-4)return null;
  const m=new THREE.Mesh(cylGeo(r,l),mat);
  m.position.set((ax+bx)/2,(ay+by)/2,(az+bz)/2);
  const q=new THREE.Quaternion(); q.setFromUnitVectors(_u,_d.normalize()); m.quaternion.copy(q);
  m.castShadow=true; m.receiveShadow=true; return m;
}
export function box(cx,cy,cz,w,h,d,mat) {
  const m=new THREE.Mesh(boxGeo(w,h,d),mat);
  m.position.set(cx,cy,cz); m.castShadow=true; m.receiveShadow=true; return m;
}
