import * as THREE from 'three';
import { TOP_H, STAGES, prefersReducedMotion } from './config.js';
import { cardArcVert, cardArcFrag } from './shaders.js';
import { scene, canvas } from './scene.js';
import { manager } from './loader.js';
import { buildRibbonGeo } from './zones.js';

// =====================================================
// ARC IMAGE CARDS (curved around tower like flags)
// =====================================================
export const IMG_FILES = [
  'HqQQT9mTcL-1920.jpeg','IZ18TVsRAN-1920.jpeg','Iu6VuT-ElC-2400.jpeg',
  'HM8Dvcqtnd-2400.jpeg','XQiztaN26N-2000.jpeg','BqR9NVWOMV-1920.jpeg',
  'C_QJwm4AcV-2400.jpeg','BEvnYvtByD-2400.jpeg','AjRWcfMMCI-2400.jpeg',
  'ghPutsDdTy-2048.jpeg','U45Puxr6Ci-2400.jpeg','AzdaZvnRUH-2400.jpeg',
  'f9I4EJZnoa-2400.jpeg','eU0NJu8KEc-2400.jpeg','Wh1Sy6D4_o-2400.jpeg',
  'yMsnqWOtUi-2400.jpeg','DPW9CtXPXi-2400.jpeg','GqH5ave7rI-2400.jpeg',
  '8gA1qoMXow-2400.jpeg','A0MBXh2Gyn-2400.jpeg','4523HBjZCE-2400.jpeg',
  'dwuKC2SCjT-2400.jpeg','l7pfxJcCIr-1920.jpeg','746RjWk9uw-2400.jpeg',
  '6kN6nvLZio-1920.jpeg','_DSpGAYZ4W-1920.jpeg','dzZHLTzuHv-1920.jpeg',
  'iz30Ho2Gku-1920.jpeg','LnLVhxBU-J-2400.jpeg','QGqfYT3OLI-2400.jpeg',
];
export const CARD_COUNT = 30;
const texLoader = new THREE.TextureLoader(manager);

export const CARD_OPTS = {
  radius: 12.5,
  radiusSpread: 4,      // spread across 3 radius bands
  cardH: 2,             // vertical height of each card
  cardRise: 2.5,        // vertical rise across the arc
  waveAmp: prefersReducedMotion ? 0 : 3,
  sizeVariation: 0.2,
  orbitSpeed: 0.008,    // slow rotation of the whole ring
};

const CARD_SEGS = 24;

export const cards = [];
export const cardGroup = new THREE.Group();
cardGroup.name = 'cardGroup';

// Stage boundaries for constraining cards
const stageBounds = STAGES.map((s, i) => ({
  floor: s.floorY,
  ceil: i < STAGES.length - 1 ? STAGES[i + 1].floorY : TOP_H,
}));
const CARDS_PER_STAGE = Math.ceil(CARD_COUNT / STAGES.length);

for (let i = 0; i < CARD_COUNT; i++) {
  const stageIdx = Math.min(Math.floor(i / CARDS_PER_STAGE), STAGES.length - 1);
  const bound = stageBounds[stageIdx];
  const stageRange = bound.ceil - bound.floor;

  // Position within stage — evenly spaced with padding
  const inStageIdx = i - stageIdx * CARDS_PER_STAGE;
  const inStageCount = Math.min(CARDS_PER_STAGE, CARD_COUNT - stageIdx * CARDS_PER_STAGE);
  const pad = 2;
  const baseY = bound.floor + pad + (inStageIdx / Math.max(inStageCount - 1, 1)) * (stageRange - pad * 2);

  const scale = 1.0 + (Math.random() - 0.5) * 2 * CARD_OPTS.sizeVariation;
  const phase = Math.random() * Math.PI * 2;

  // Load texture with aspect ratio callback
  const imgFile = IMG_FILES[i % IMG_FILES.length];
  const tex = texLoader.load('assets/img/' + imgFile, (loadedTex) => {
    const aspect = loadedTex.image.width / loadedTex.image.height;
    card.aspect = aspect;
    // Recompute arc from aspect ratio: arcLength = cardH * aspect, arcAngle = arcLength / radius
    const h = CARD_OPTS.cardH * card.scale;
    const arcAngle = (h * aspect) / card.radius;
    const rise = CARD_OPTS.cardRise * card.scale * card.riseSign;
    // Clamp rise so card stays within stage
    const maxRise = (bound.ceil - bound.floor) - h - pad;
    const clampedRise = Math.min(Math.abs(rise), maxRise) * card.riseSign;
    const newGeo = buildRibbonGeo(card.radius, arcAngle, h, CARD_SEGS, card.startAngle, clampedRise);
    card.mesh.geometry.dispose();
    card.mesh.geometry = newGeo;
    card.arcRad = arcAngle;
  });

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      image: { value: tex },
      time: { value: 0 },
      phase: { value: phase },
      waveAmp: { value: CARD_OPTS.waveAmp },
      opacity: { value: 0.92 },
    },
    vertexShader: cardArcVert,
    fragmentShader: cardArcFrag,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
  });

  // Initial geometry with fallback 1.5 aspect ratio (will be rebuilt on texture load)
  const fallbackAspect = 1.5;
  const startAngle = (i / CARD_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
  const h = CARD_OPTS.cardH * scale;
  const arcRad = (h * fallbackAspect) / CARD_OPTS.radius;
  const riseSign = 1;
  const rise = CARD_OPTS.cardRise * scale * riseSign;
  const bandIdx = i % 3;
  const radiusJitter = (Math.random() - 0.5) * 0.5;
  const radius = CARD_OPTS.radius + (bandIdx - 1) * CARD_OPTS.radiusSpread + radiusJitter;

  const geo = buildRibbonGeo(radius, arcRad, h, CARD_SEGS, startAngle, rise);
  const mesh = new THREE.Mesh(geo, mat);

  mesh.position.y = baseY;
  mesh.renderOrder = i;
  cardGroup.add(mesh);

  const card = {
    mesh, mat, phase,
    startAngle,
    baseY,
    radius,
    bandIdx,
    radiusJitter,
    arcRad,
    cardH: h,
    rise,
    riseSign,
    scale,
    aspect: fallbackAspect,
    stageIdx,
    hovered: false,
    baseScale: scale,
    currentScale: scale,
  };
  cards.push(card);
}

// Cards hidden by default
cards.forEach(c => c.mesh.visible = false);
scene.add(cardGroup);

// Rebuild all card geometries (called from GUI)
export function rebuildCards(opts) {
  const baseRadius = opts.cardRadius ?? CARD_OPTS.radius;
  const spread = opts.cardRadiusSpread ?? CARD_OPTS.radiusSpread;
  const waveAmp = opts.cardWaveAmp ?? CARD_OPTS.waveAmp;
  for (const card of cards) {
    const h = (opts.cardH ?? CARD_OPTS.cardH) * card.scale;
    const radius = baseRadius + (card.bandIdx - 1) * spread + card.radiusJitter;
    const arcRad = (h * card.aspect) / radius;
    const rise = (opts.cardRise ?? CARD_OPTS.cardRise) * card.scale * card.riseSign;
    const newGeo = buildRibbonGeo(radius, arcRad, h, CARD_SEGS, card.startAngle, rise);
    card.mesh.geometry.dispose();
    card.mesh.geometry = newGeo;
    card.radius = radius;
    card.mat.uniforms.waveAmp.value = waveAmp;
  }
}

// Raycaster for hover / click interaction
export const cardRaycaster = new THREE.Raycaster();
export const cardPointer = new THREE.Vector2();
export let hoveredCard = null;

export function setHoveredCard(card) {
  hoveredCard = card;
}

canvas.addEventListener('pointermove', e => {
  cardPointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  cardPointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

canvas.addEventListener('click', () => {
  if (hoveredCard) {
    const idx = cards.indexOf(hoveredCard);
    console.log('[card click]', idx, IMG_FILES[idx % IMG_FILES.length]);
  }
});
