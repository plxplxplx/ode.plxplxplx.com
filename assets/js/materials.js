import * as THREE from 'three';
import { STAGES, QUALITY } from './config.js';
import { buildPlane, buildPlaneBottom, ktx2Loader } from './scene.js';

// =====================================================
// MARBLE TEXTURES for scaffolding (lazy-loaded, KTX2)
// =====================================================
const TEXTURE_PATHS = {
  lightColor:     'assets/textures/Marble001_1K-JPG/Marble001_1K-JPG_Color.ktx2',
  lightNormal:    'assets/textures/Marble001_1K-JPG/Marble001_1K-JPG_NormalGL.ktx2',
  lightRoughness: 'assets/textures/Marble001_1K-JPG/Marble001_1K-JPG_Roughness.ktx2',
  darkColor:      'assets/textures/Marble016_1K-JPG/Marble016_1K-JPG_Color.ktx2',
  darkNormal:     'assets/textures/Marble016_1K-JPG/Marble016_1K-JPG_NormalGL.ktx2',
  darkRoughness:  'assets/textures/Marble016_1K-JPG/Marble016_1K-JPG_Roughness.ktx2',
};

let marbleTextures = null;
let loadPromise = null;

/** Load all marble textures on demand. Returns a Promise. Subsequent calls return the same promise. */
export function loadMarbleTextures() {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve) => {
    const entries = Object.entries(TEXTURE_PATHS);
    let loaded = 0;
    const result = {};
    for (const [key, path] of entries) {
      ktx2Loader.load(path, (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(0.5, 0.5);
        result[key] = tex;
        loaded++;
        if (loaded === entries.length) {
          marbleTextures = result;
          resolve(result);
        }
      });
    }
  });
  return loadPromise;
}

/** Get cached textures (null if not yet loaded). */
export function getMarbleTextures() {
  return marbleTextures;
}

/** Apply or remove marble textures from all STAGE_MATS materials. */
export function applyMarbleTextures(enabled) {
  const tex = marbleTextures;
  STAGE_MATS.forEach((sm, i) => {
    const isLight = i >= 2; // THIRD + SUMMIT use light marble
    const color = enabled && tex ? (isLight ? tex.lightColor : tex.darkColor) : null;
    const normal = enabled && tex ? (isLight ? tex.lightNormal : tex.darkNormal) : null;
    const rough = enabled && tex ? (isLight ? tex.lightRoughness : tex.darkRoughness) : null;
    sm.steel.map = color; sm.steel.normalMap = normal; sm.steel.roughnessMap = rough;
    sm.steel.needsUpdate = true;
    sm.deck.map = color; sm.deck.normalMap = normal; sm.deck.roughnessMap = rough;
    sm.deck.needsUpdate = true;
  });
}

// =====================================================
// MATERIALS — one palette per stage (start without textures)
// =====================================================
export const STAGE_MATS = [
  { // GROUND — neutral gray steel
    steel: new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.1, roughness: 0.5 }),
    deck:  new THREE.MeshStandardMaterial({ color: 0x7a7a7a, metalness: 0.3, roughness: 0.55 }),
  },
  { // SECOND — neutral gray steel
    steel: new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.1, roughness: 0.5 }),
    deck:  new THREE.MeshStandardMaterial({ color: 0x7a7a7a, metalness: 0.35, roughness: 0.5 }),
  },
  { // THIRD — neutral gray steel
    steel: new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.1, roughness: 0.5 }),
    deck:  new THREE.MeshStandardMaterial({ color: 0x7a7a7a, metalness: 0.35, roughness: 0.45 }),
  },
  { // SUMMIT — neutral gray steel
    steel: new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.1, roughness: 0.5 }),
    deck:  new THREE.MeshStandardMaterial({ color: 0x7a7a7a, metalness: 0.35, roughness: 0.4 }),
  },
];

// Attach build clipping plane to all scaffold materials
const clipPlanes = [buildPlane, buildPlaneBottom];
STAGE_MATS.forEach(sm => {
  sm.steel.clippingPlanes = clipPlanes;
  sm.deck.clippingPlanes = clipPlanes;
});

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
const TUBE_SEGS = QUALITY.tubeSegments;
export function cylGeo(r, l) {
  // Thinner pipes get more radial segments to reduce facet-driven moiré
  const segs = r < 0.02 ? Math.ceil(TUBE_SEGS * 2) : r < 0.03 ? Math.ceil(TUBE_SEGS * 1.5) : TUBE_SEGS;
  const k = `c${r.toFixed(4)}_${l.toFixed(4)}`;
  if (!geoCache.has(k)) {
    const geo = new THREE.CylinderGeometry(r, r, l, segs, 1);
    // Scale UVs to world-space so marble tiles consistently
    const uv = geo.attributes.uv;
    const circ = 2 * Math.PI * r;
    for (let i = 0; i < uv.count; i++) {
      uv.setX(i, uv.getX(i) * circ);
      uv.setY(i, uv.getY(i) * l);
    }
    uv.needsUpdate = true;
    geoCache.set(k, geo);
  }
  return geoCache.get(k);
}
export function boxGeo(w, h, d) {
  const k = `b${w.toFixed(4)}_${h.toFixed(4)}_${d.toFixed(4)}`;
  if (!geoCache.has(k)) {
    const geo = new THREE.BoxGeometry(w, h, d);
    // Scale UVs to world-space based on each face's dimensions
    const uv = geo.attributes.uv;
    const norm = geo.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(norm.getX(i));
      const ny = Math.abs(norm.getY(i));
      const nz = Math.abs(norm.getZ(i));
      let su, sv;
      if (nx > ny && nx > nz) { su = d; sv = h; }       // ±X face
      else if (ny > nx && ny > nz) { su = w; sv = d; }   // ±Y face
      else { su = w; sv = h; }                            // ±Z face
      uv.setX(i, uv.getX(i) * su);
      uv.setY(i, uv.getY(i) * sv);
    }
    uv.needsUpdate = true;
    geoCache.set(k, geo);
  }
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
