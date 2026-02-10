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
export const ZONES_COLORS = [0x050505, 0x060608, 0x060504, 0x050404];
export const NUM_LEVELS = Math.ceil(TOP_H / LEVEL_H);

export const gx = i => i * BAY_W - TOTAL_W / 2;
export const gz = j => j * BAY_D - TOTAL_D / 2;
export const cellCx = i => gx(i) + BAY_W / 2;
export const cellCz = j => gz(j) + BAY_D / 2;

// Mobile detection + quality tier
export const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;

// Character + camera config
export const MOVE_SPEED = 4.0, JUMP_VEL = 7.2, GRAVITY = -20, STEP_UP = 0.35;
export const FRUSTUM = 12, CAM_DIST = 60, CAM_SMOOTH = 0.07;
export const STD_R = 0.024, LED_R = 0.019, BRACE_R = 0.016, PLAT_H = 0.05;
export const MARGIN = 0.1, N_TREADS = 10;
