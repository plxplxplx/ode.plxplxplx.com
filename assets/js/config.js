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

// GPU tier detection — probe WebGL for GPU name
// ?quality=low / ?quality=high URL param overrides auto-detection
function detectGPUTier() {
  const urlQ = new URLSearchParams(window.location.search).get('quality');
  if (urlQ === 'low') return 'low';
  if (urlQ === 'high') return 'high';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return 'low';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      const gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL).toLowerCase();
      // Known low-end: Intel integrated, Mali 4xx/6xx, Adreno 3xx/4xx/5xx, Apple A9/A10
      if (/intel(?!.*arc)/.test(gpu) || /mali[- ]?[46]/.test(gpu)
        || /adreno[- ]?\d{3}(?!\d)/.test(gpu) && parseInt(gpu.match(/adreno[- ]?(\d)/)[1]) < 6
        || /apple a[89]|apple a10/.test(gpu) || /swiftshader|llvmpipe|mesa/.test(gpu)) {
        return 'low';
      }
    }
    // Fallback heuristic: low core count or small screen ≈ weaker GPU
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) return 'low';
  } catch (_) {}
  return 'high';
}

const gpuTier = isMobile ? 'mobile' : detectGPUTier();

// Centralised quality settings — 3 tiers: mobile / low desktop / high desktop
const QUALITY_MOBILE = {
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
};

const QUALITY_LOW = {
  pixelRatio:     Math.min(window.devicePixelRatio, 2.0),
  antialias:      true,
  shadows:        true,
  shadowMapSize:  2048,
  envMap:         true,
  bloom:          false,
  filmGrain:      true,
  vignette:       false,
  colorGrade:     true,
  smaa:           false,
  cardRaycast:    true,
  tubeSegments:   24,
  volFogLayers:   4,
  shroudLayers:   6,
  gridLights:     3,
  fireflyCount:   6,
  fireflyLights:  2,
  deferEnv:       false,
};

const QUALITY_HIGH = {
  pixelRatio:     Math.min(window.devicePixelRatio, 2.0),
  antialias:      true,
  shadows:        true,
  shadowMapSize:  2048,
  envMap:         true,
  bloom:          false,
  filmGrain:      true,
  vignette:       false,
  colorGrade:     true,
  smaa:           true,
  cardRaycast:    true,
  tubeSegments:   24,
  volFogLayers:   8,
  shroudLayers:   12,
  gridLights:     6,
  fireflyCount:   10,
  fireflyLights:  4,
  deferEnv:       false,
};

export const QUALITY = gpuTier === 'mobile' ? QUALITY_MOBILE
  : gpuTier === 'low' ? QUALITY_LOW : QUALITY_HIGH;

// Reduced motion preference (WCAG 2.3.3) — reactive
const _motionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
export let prefersReducedMotion = _motionMQ.matches;
_motionMQ.addEventListener('change', (e) => { prefersReducedMotion = e.matches; });

// Camera config
export const FRUSTUM = 12, CAM_DIST = 60, CAM_SMOOTH = 0.07;
export const STD_R = 0.036, LED_R = 0.0285, BRACE_R = 0.024, PLAT_H = 0.05;
export const MARGIN = 0.1, N_TREADS = 10;
