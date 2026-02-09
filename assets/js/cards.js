import * as THREE from 'three';
import { TOP_H } from './config.js';
import { leafletVert, leafletFrag } from './shaders.js';
import { scene, canvas } from './scene.js';

// =====================================================
// FLOATING IMAGE CARDS (spherical orbit + drift + billboarding)
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
const texLoader = new THREE.TextureLoader();
const imgTextures = IMG_FILES.map(f => texLoader.load('assets/img/' + f));

export const CARD_OPTS = {
  radiusMin: 7,
  radiusMax: 14,
  orbitSpeedMin: 0.003,
  orbitSpeedMax: 0.012,
  driftAmp: 1.8,
  driftFreq: 0.15,
  bobAmp: 0.4,
  bobFreq: 0.25,
  cardW: 2.8,
  cardH: 1.75,
  sizeVariation: 0.4,
  flutterAmp: 1.0,
};

export const cards = [];

for (let i = 0; i < CARD_COUNT; i++) {
  const scale = 1.0 + (Math.random() - 0.5) * 2 * CARD_OPTS.sizeVariation;
  const phase = Math.random() * Math.PI * 2;
  const tex = imgTextures[i % imgTextures.length];
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      image: { value: tex },
      time: { value: 0 },
      phase: { value: phase },
      curviness: { value: 0.06 + Math.random() * 0.08 },
      bendAmount: { value: 0.02 + Math.random() * 0.04 },
      opacity: { value: 0.92 },
    },
    vertexShader: leafletVert,
    fragmentShader: leafletFrag,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
  const w = CARD_OPTS.cardW * scale;
  const h = CARD_OPTS.cardH * scale;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 10, 6), mat);

  const theta = (i / CARD_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
  const radius = THREE.MathUtils.lerp(CARD_OPTS.radiusMin, CARD_OPTS.radiusMax, Math.random());
  const baseY = 2 + (i / CARD_COUNT) * (TOP_H - 4) + (Math.random() - 0.5) * 4;
  const speed = THREE.MathUtils.lerp(CARD_OPTS.orbitSpeedMin, CARD_OPTS.orbitSpeedMax, Math.random());
  const direction = Math.random() > 0.5 ? 1 : -1;

  mesh.position.set(Math.cos(theta) * radius, baseY, Math.sin(theta) * radius);
  mesh.renderOrder = i;
  scene.add(mesh);

  cards.push({
    mesh, mat,
    theta, radius, baseY,
    speed: speed * direction,
    phase,
    s1: Math.random() * 100,
    s2: Math.random() * 100,
    s3: Math.random() * 100,
    bobSpd: 0.15 + Math.random() * 0.25,
    bobAmp: 0.2 + Math.random() * 0.5,
    hovered: false,
    baseScale: scale,
    currentScale: scale,
  });
}

// Cards hidden by default
cards.forEach(c => c.mesh.visible = false);

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
