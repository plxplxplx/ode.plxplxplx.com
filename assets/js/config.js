// =====================================================
// VERTICAL TOWER CONFIG — 4 STAGE STRUCTURE
// =====================================================
export const BAYS_X = 3, BAYS_Z = 2;
export const BAY_W = 2.57, BAY_D = 2.0;
export const LEVEL_H = 2.0;
export const TOTAL_W = BAYS_X * BAY_W, TOTAL_D = BAYS_Z * BAY_D;

export const STAGES = [
  { name: 'GROUND',   floorY: 0,    scaffLevels: 14 },
  { name: 'SECOND',   floorY: 30,   scaffLevels: 16 },
  { name: 'THIRD',    floorY: 60,   scaffLevels: 18 },
  { name: 'SUMMIT',   floorY: 90,   scaffLevels: 22 },
];
export const TOP_H = 134;
export const ZONES_COLORS = [0x060504, 0x080604, 0x080504, 0x060404];
export const NUM_LEVELS = Math.ceil(TOP_H / LEVEL_H);

export const gx = i => i * BAY_W - TOTAL_W / 2;
export const gz = j => j * BAY_D - TOTAL_D / 2;
export const cellCx = i => gx(i) + BAY_W / 2;
export const cellCz = j => gz(j) + BAY_D / 2;

// Mobile detection + quality tier
export const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024)
  || window.innerWidth < 768;

// Centralised quality settings — tweak mobile values here
export const QUALITY = isMobile ? {
  pixelRatio:     Math.min(window.devicePixelRatio, 1.25),
  antialias:      false,
  shadows:        false,
  shadowMapSize:  512,
  envMap:         false,
  bloom:          false,
  filmGrain:      false,
  vignette:       false,
  colorGrade:     true,
  smaa:           true,
  cardRaycast:    false,
  tubeSegments:   8,
  volFogLayers:   1,
  shroudLayers:   4,
  gridLights:     1,
  fireflyCount:   5,
  fireflyLights:  0,
  deferEnv:       true,
} : {
  pixelRatio:     Math.min(window.devicePixelRatio, 2.5),
  antialias:      true,
  shadows:        true,
  shadowMapSize:  2048,
  envMap:         true,
  bloom:          true,
  filmGrain:      true,
  vignette:       true,
  colorGrade:     true,
  smaa:           true,
  cardRaycast:    true,
  tubeSegments:   16,
  volFogLayers:   8,
  shroudLayers:   12,
  gridLights:     6,
  fireflyCount:   10,
  fireflyLights:  4,
  deferEnv:       false,
};

// Reduced motion preference (WCAG 2.3.3) — reactive
const _motionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
export let prefersReducedMotion = _motionMQ.matches;
_motionMQ.addEventListener('change', (e) => { prefersReducedMotion = e.matches; });

// Camera config
export const FRUSTUM = 12, CAM_DIST = 60, CAM_SMOOTH = 0.07;
export const STD_R = 0.036, LED_R = 0.0285, BRACE_R = 0.024, PLAT_H = 0.05;
export const MARGIN = 0.1, N_TREADS = 10;
