import * as THREE from 'three';
import { STAGES, LEVEL_H, TOTAL_W, TOTAL_D } from './config.js';
import { buildPlane, buildPlaneBottom } from './scene.js';
import { registerBannerAngles } from './camera.js';

// =====================================================
// SCROLL BANNERS — fixed to scaffold walls
// =====================================================

// Banner definitions: stage index, wall face, text lines
// face determines which wall + the camera angle needed to see it
const BANNERS = [
  { stage: 0, face: 'front', yLevel: 2, starSep: true, lines: [
    'PLX ODE JOY',
    '',
    '20 år av skapande',
    'verklighetsflykt, performance',
    'konst, musik, mat och umgänge.',
    '',
    'En tvådagars festival,',
    'ett musikaliskt kalejdoskop',
    'och en performativ karusell.',
    '',
    'ÖPPETTIDER',
    '15 MAJ 18:00–01:00',
    '16 MAJ 12:00–01:00',
  ]},
  { stage: 1, face: 'front', starSep: true, lines: [
    'LINEUP',
    'Alexis, Chris Shields, DINA',
    'Eli Frankel & Marika Markström & Hannes Ferm',
    'Ellinor Åslund, Emil Keller Skousen',
    'Fauna, Francis Patrick Brady & TFK',
    'Jonathan Sendborn Pohlin, Jules Reidy',
    'Mohammad Reza Mortazavi',
    'Nils Bergendal, Patrik Söderstam',
    'Private Parts, Rebecca Moss',
    'Snejina Latev, Stina Force',
    'Velvet Forever',
    'Zoë Mc Pherson & Alessandra Leone',
  ]},
  { stage: 2, face: 'front', lines: [
    'MIDDAG',
    'Långbord för 70 personer',
    'Konstverk av Ulf R med vänner',
    '',
    'Primörer med generösa såser',
    'Rå marinerad fisk',
    'Musslor och kyckling',
    'Brinnande pannkakstårtor',
    '',
    'Inkl 2 glas vin, 20:00–21:30',
  ]},
];

// The camera angle needed to look at each face
// Camera is at angle A, looking toward center → it sees the wall opposite its position
// To see 'front' (-Z wall), camera must be at -Z side → angle ~ -PI/2 or 3PI/2
// Camera at angle 0 is on +X axis looking toward center, seeing the +X (right) wall
export const FACE_ANGLES = {
  front: Math.PI * 1.5,  // camera on -Z side to see -Z wall
  back:  Math.PI * 0.5,  // camera on +Z side
  left:  0,              // camera on +X side to see -X wall
  right: Math.PI,        // camera on -X side to see +X wall
};

// Scroll geometry config
const SCROLL_WIDTH  = 2.5 * 2.57; // 2.5 scaffold bays wide (~6.4 units)
const SCROLL_HEIGHT = 8.0;
const CURL_ANGLE    = Math.PI * 0.45;
const CURL_RADIUS   = 0.25;
const BODY_SEGS     = 20;
const CURL_SEGS     = 8;
const H_SEGS        = 1;

// Canvas text config
const TEX_W = 1024;
const TEX_H = 1024;
const FONT  = "'NHaas Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif";

// =====================================================
// SCROLL GEOMETRY — curved top & bottom edges
// =====================================================
function buildScrollGeometry(width, height, curlRadius, curlAngle, bodySegs, curlSegs, hSegs) {
  const positions = [];
  const uvs = [];
  const indices = [];

  const profile = [];

  // Top curl — Z goes negative (outward) so front face points -Z
  for (let i = 0; i <= curlSegs; i++) {
    const t = i / curlSegs;
    const angle = Math.PI - t * curlAngle;
    const y = height / 2 + curlRadius * Math.sin(angle);
    const z = -curlRadius * (Math.cos(angle) + 1);
    profile.push({ y, z });
  }

  // Flat body
  const topEnd = profile[profile.length - 1];
  const bodyTop = topEnd.y;
  const bodyZ   = topEnd.z;
  const bodyLen = height - 2 * curlRadius;
  for (let i = 1; i <= bodySegs; i++) {
    const t = i / bodySegs;
    profile.push({ y: bodyTop - t * bodyLen, z: bodyZ });
  }

  // Bottom curl
  const botStart = profile[profile.length - 1];
  for (let i = 1; i <= curlSegs; i++) {
    const t = i / curlSegs;
    const angle = -t * curlAngle;
    const y = botStart.y + curlRadius * Math.sin(angle);
    const z = botStart.z - curlRadius * (Math.cos(angle) - 1);
    profile.push({ y, z });
  }

  // Arc lengths for UV mapping
  let totalArc = 0;
  const arcLengths = [0];
  for (let i = 1; i < profile.length; i++) {
    const dy = profile[i].y - profile[i - 1].y;
    const dz = profile[i].z - profile[i - 1].z;
    totalArc += Math.sqrt(dy * dy + dz * dz);
    arcLengths.push(totalArc);
  }

  const rows = profile.length;
  const cols = hSegs + 1;

  for (let r = 0; r < rows; r++) {
    const { y, z } = profile[r];
    const v = 1 - arcLengths[r] / totalArc;
    for (let c = 0; c < cols; c++) {
      const u = c / hSegs;
      const x = (u - 0.5) * width;
      positions.push(x, y, z);
      uvs.push(1 - u, v);
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < hSegs; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      indices.push(a, b, d);
      indices.push(b, e, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// =====================================================
// CANVAS TEXT TEXTURE
// =====================================================
// Star shape points (from favicon.svg, normalised to ±0.5 around center)
const STAR_PTS = [
  [105.52,52.81],[138.26,10.71],[136.29,64.01],[188.43,52.81],[152.66,92.37],
  [199.81,117.31],[146.98,124.62],[167.06,174.03],[121.89,145.67],[105.52,196.43],
  [89.14,145.67],[43.97,174.03],[64.06,124.62],[11.23,117.31],[58.37,92.37],
  [22.6,52.81],[74.74,64.01],[72.77,10.71],
].map(([x, y]) => [(x - 105.52) / 207.83, (y - 103.57) / 207.83]);

function drawStar(ctx, cx, cy, size) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < STAR_PTS.length; i++) {
    const x = cx + STAR_PTS[i][0] * size;
    const y = cy + STAR_PTS[i][1] * size;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function makeScrollTexture(lines, useStars) {
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#0a0806';
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  const pad = 40;
  ctx.strokeStyle = 'rgba(255, 220, 180, 0.15)';
  ctx.lineWidth = 2;
  ctx.strokeRect(pad, pad, TEX_W - pad * 2, TEX_H - pad * 2);

  ctx.fillStyle = '#ffe8d0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const titleSize = Math.floor(TEX_H * 0.08);
  const bodySize  = Math.floor(TEX_H * 0.05);
  const lineGap = TEX_H * 0.06;
  const emptyGap = TEX_H * 0.035;
  const topPad = 120;
  const starSep = ' \u2009\u2009 ';   // separator token: comma surrounded by thin spaces

  let yPos = topPad;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '') {
      yPos += emptyGap;
      continue;
    }
    const size = i === 0 ? titleSize : bodySize;
    const weight = i === 0 ? '500' : '300';
    ctx.font = `${weight} ${size}px ${FONT}`;

    // Replace commas with star icons (only when useStars is set)
    const parts = (useStars && i > 0) ? lines[i].split(', ') : null;
    if (parts && parts.length > 1) {
      // Measure total width with star gaps
      const starSize = size * 0.7;
      const starGap = size * 0.4;
      const partWidths = parts.map(p => ctx.measureText(p).width);
      const totalW = partWidths.reduce((a, b) => a + b, 0) + (parts.length - 1) * (starSize + starGap * 2);
      let xPos = (TEX_W - totalW) / 2;

      ctx.textAlign = 'left';
      for (let j = 0; j < parts.length; j++) {
        ctx.fillText(parts[j], xPos, yPos);
        xPos += partWidths[j];
        if (j < parts.length - 1) {
          xPos += starGap;
          drawStar(ctx, xPos + starSize / 2, yPos + size * 0.45, starSize);
          xPos += starSize + starGap;
        }
      }
      ctx.textAlign = 'center';
    } else {
      ctx.fillText(lines[i], TEX_W / 2, yPos);
    }
    yPos += i === 0 ? titleSize + lineGap : lineGap;
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// =====================================================
// POSITIONING — map face to world position & rotation
// =====================================================
function getBannerTransform(stageIdx, face, yLevel) {
  const stage = STAGES[stageIdx];
  // yLevel: ledger level from stage floor where top of banner rests
  // Default: 2 levels below stage top
  const level = yLevel != null ? yLevel : stage.scaffLevels - 2;
  const topLedgerY = stage.floorY + level * LEVEL_H;
  const midY = topLedgerY - SCROLL_HEIGHT / 2;

  const hw = TOTAL_W / 2;
  const hd = TOTAL_D / 2;

  let x = 0, z = 0, rotY = 0;

  switch (face) {
    case 'front':
      x = 0; z = -hd; rotY = 0;
      break;
    case 'back':
      x = 0; z = hd; rotY = Math.PI;
      break;
    case 'left':
      x = -hw; z = 0; rotY = -Math.PI / 2;
      break;
    case 'right':
      x = hw; z = 0; rotY = Math.PI / 2;
      break;
  }

  return { x, y: midY, z, rotY };
}

// =====================================================
// BUILD & EXPORT
// =====================================================
export const bannerGroup = new THREE.Group();
bannerGroup.name = 'banners';

const scrollGeo = buildScrollGeometry(
  SCROLL_WIDTH, SCROLL_HEIGHT, CURL_RADIUS, CURL_ANGLE, BODY_SEGS, CURL_SEGS, H_SEGS
);

const clipPlanes = [buildPlane, buildPlaneBottom];

for (const def of BANNERS) {
  const tex = makeScrollTexture(def.lines, def.starSep);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    side: THREE.DoubleSide,
    metalness: 0.0,
    roughness: 0.8,
    clippingPlanes: clipPlanes,
    transparent: true,
    opacity: 0.95,
  });

  const mesh = new THREE.Mesh(scrollGeo, mat);
  const t = getBannerTransform(def.stage, def.face, def.yLevel);
  mesh.position.set(t.x, t.y, t.z);
  mesh.rotation.y = t.rotY;
  mesh.castShadow = false;
  mesh.receiveShadow = true;

  bannerGroup.add(mesh);
}

// Register banner positions with camera for angle nudging
registerBannerAngles(BANNERS.map(def => {
  const stage = STAGES[def.stage];
  const level = def.yLevel != null ? def.yLevel : stage.scaffLevels - 2;
  const topLedgerY = stage.floorY + level * LEVEL_H;
  const bannerMidY = topLedgerY - SCROLL_HEIGHT / 2;
  return {
    y: bannerMidY,
    angle: FACE_ANGLES[def.face],
    range: stage.scaffLevels * LEVEL_H * 0.6,
  };
}));

// Exclusion zones for plants — axis-aligned boxes around each banner
export const bannerExclusions = BANNERS.map(def => {
  const stage = STAGES[def.stage];
  const level = def.yLevel != null ? def.yLevel : stage.scaffLevels - 2;
  const topY = stage.floorY + level * LEVEL_H;
  const botY = topY - SCROLL_HEIGHT;
  const hw = SCROLL_WIDTH / 2 + 0.5; // padding
  const t = getBannerTransform(def.stage, def.face, def.yLevel);

  // Compute bounds based on face orientation
  let minX, maxX, minZ, maxZ;
  if (def.face === 'front' || def.face === 'back') {
    minX = t.x - hw; maxX = t.x + hw;
    minZ = t.z - 1.0; maxZ = t.z + 1.0;
  } else {
    minX = t.x - 1.0; maxX = t.x + 1.0;
    minZ = t.z - hw; maxZ = t.z + hw;
  }
  return { minX, maxX, minY: botY, maxY: topY, minZ, maxZ };
});

export function isInBannerZone(x, y, z) {
  for (const b of bannerExclusions) {
    if (x >= b.minX && x <= b.maxX &&
        y >= b.minY && y <= b.maxY &&
        z >= b.minZ && z <= b.maxZ) return true;
  }
  return false;
}

export { BANNERS };
