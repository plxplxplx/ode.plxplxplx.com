import * as THREE from "three";
import { CSS3DObject } from "three/addons/renderers/CSS3DRenderer.js";
import { STAGES, LEVEL_H, TOTAL_W, TOTAL_D } from "./config.js";
import { buildPlane, buildPlaneBottom } from "./scene.js";
import { registerBannerAngles } from "./camera.js";

// Artist → URL. Web link if present, else Instagram, else omitted.
// Source: PLX Ode Bokningsformuläret sheet.
const ARTIST_LINKS = {
  "Alexis": "https://blundar.co/",
  "Cecilia Sterner": "https://instagram.com/ceciliasterner",
  "Chris Shields": "https://instagram.com/lucky.goldstar",
  "DINA": "https://soundcloud.com/dinakhashan",
  "Eli Frankel": "https://instagram.com/eli_o_frankel",
  "Dmn7": "https://instagram.com/marikamadeleine",
  "Hannes Ferm": "https://instagram.com/hannes_ferm",
  "Ellinor Åslund": "https://ellinoraslund.com",
  "Emil Keller Skousen": "https://grillting.com/",
  "Fauna": "https://faunagbg.bandcamp.com/",
  "Francis Patrick Brady & TFK": "https://francispatrickbrady.com/",
  "Jonathan Sendborn Pohlin": "https://instagram.com/Sendborn",
  "Jules Reidy": "https://instagram.com/jules_reidy",
  "Kristoffer Grip": "https://kristoffergrip.com",
  "Mohammad Reza Mortazavi": "https://instagram.com/m_r_mortazavi",
  "Nils Bergendal": "https://nilsbergendal.com/",
  "Patrik Söderstam": "https://www.showstudio.com/contributors/patrik_soderstam",
  "Private Parts": "https://m.soundcloud.com/prvtprts",
  "Rebecca Moss": "https://instagram.com/_rebecca.moss",
  "SMiSK": "https://smisk.bandcamp.com",
  "Velvet Forever": "https://instagram.com/velvet__forever",
  "Wes Baggaley": "https://soundcloud.com/wes-baggaley",
  "Zoë Mc Pherson": "https://instagram.com/zoemcphers",
  "Alessandra Leone": "https://instagram.com/ale.byss",
};

// =====================================================
// SCROLL BANNERS — fixed to scaffold walls
// =====================================================

// Banner definitions: stage index, wall face, text lines
// face determines which wall + the camera angle needed to see it
const BANNERS = [
  {
    stage: 0,
    face: "front",
    yLevel: 2.89,
    height: 11.0,
    starSep: true,
    lines: [
      "PLX ODE JOY",
      "",
      "20 år av skapande",
      "verklighetsflykt, performance",
      "konst, musik, mat och umgänge.",
      "",
      "En tvådagars festival,",
      "ett musikaliskt kalejdoskop",
      "och en performativ karusell.",
      "",
      "Konstmuseet i Folkparken,",
      "gamla casinot",
      "",
      "ÖPPETTIDER",
      "15 MAJ 18:00–01:00",
      "16 MAJ 19:00–01:00",
      "",
      "DAGSÖPPET",
      "16 MAJ 14:00–17:00",
    ],
  },
  {
    stage: 1,
    face: "front",
    height: 10.5,
    starSep: true,
    lines: [
      "LINEUP",
      "Alexis, Amina Szecsödy",
      "Cecilia Sterner, Chris Shields, DINA",
      "Eli Frankel & Dmn7 & Hannes Ferm",
      "Ellinor Åslund, Emil Keller Skousen",
      "Fauna, Francis Patrick Brady & TFK",
      "Frans Felix Ahlberg Eriksson",
      "Jenny Palén, Johnny Essing",
      "Jonathan Sendborn Pohlin, Jules Reidy",
      "Kristoffer Grip, Mohammad Reza Mortazavi",
      "Nils Bergendal, One secret each",
      "Patrik Söderstam, Praktikantgruppen",
      "Private Parts, Rebecca Moss, SMiSK",
      "Snejina Latev, Stina Force",
      "Velvet Forever, Wes Baggaley",
      "Zoë Mc Pherson & Alessandra Leone",
    ],
  },
  {
    stage: 2,
    face: "front",
    lines: [
      "MIDDAG",
      "Långbord för 60 personer",
      "Konstverk av Ulf R med vänner",
      "",
      "Primörer med generösa såser",
      "Rå marinerad fisk",
      "Musslor och kyckling",
      "Brinnande pannkakstårtor",
      "",
      "Viss dryck ingår, 20:00–21:30",
      "Biljett till middagen köps",
      "i samband med entré",
    ],
  },
];

// The camera angle needed to look at each face
// Camera is at angle A, looking toward center → it sees the wall opposite its position
// To see 'front' (-Z wall), camera must be at -Z side → angle ~ -PI/2 or 3PI/2
// Camera at angle 0 is on +X axis looking toward center, seeing the +X (right) wall
export const FACE_ANGLES = {
  front: Math.PI * 1.5, // camera on -Z side to see -Z wall
  back: Math.PI * 0.5, // camera on +Z side
  left: 0, // camera on +X side to see -X wall
  right: Math.PI, // camera on -X side to see +X wall
};

// Scroll geometry config
const SCROLL_WIDTH = 2.5 * 2.57; // 2.5 scaffold bays wide (~6.4 units)
const SCROLL_HEIGHT = 8.0;
const CURL_ANGLE = Math.PI * 0.45;
const CURL_RADIUS = 0.25;
const BODY_SEGS = 20;
const CURL_SEGS = 8;
const H_SEGS = 1;

// Canvas text config
const TEX_W = 1024;
const TEX_H = 1024;
const FONT = "'NHaas Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif";

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
  const bodyZ = topEnd.z;
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
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// =====================================================
// CANVAS TEXT TEXTURE
// =====================================================
// Star shape points (from favicon.svg, normalised to ±0.5 around center)
const STAR_PTS = [
  [105.52, 52.81],
  [138.26, 10.71],
  [136.29, 64.01],
  [188.43, 52.81],
  [152.66, 92.37],
  [199.81, 117.31],
  [146.98, 124.62],
  [167.06, 174.03],
  [121.89, 145.67],
  [105.52, 196.43],
  [89.14, 145.67],
  [43.97, 174.03],
  [64.06, 124.62],
  [11.23, 117.31],
  [58.37, 92.37],
  [22.6, 52.81],
  [74.74, 64.01],
  [72.77, 10.71],
].map(([x, y]) => [(x - 105.52) / 207.83, (y - 103.57) / 207.83]);

function drawStar(ctx, cx, cy, size) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < STAR_PTS.length; i++) {
    const x = cx + STAR_PTS[i][0] * size;
    const y = cy + STAR_PTS[i][1] * size;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function makeScrollTexture(lines, useStars, heightScale) {
  const texH = Math.round(TEX_H * (heightScale || 1));
  const c = document.createElement("canvas");
  c.width = TEX_W;
  c.height = texH;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#0a0806";
  ctx.fillRect(0, 0, TEX_W, texH);

  const pad = 40;
  ctx.strokeStyle = "rgba(255, 220, 180, 0.15)";
  ctx.lineWidth = 2;
  ctx.strokeRect(pad, pad, TEX_W - pad * 2, texH - pad * 2);

  ctx.fillStyle = "#ffe8d0";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const titleSize = Math.floor(TEX_H * 0.08);
  const bodySize = Math.floor(TEX_H * 0.05);
  const lineGap = TEX_H * 0.06;
  const emptyGap = TEX_H * 0.035;
  const topPad = 120;

  // Hit-boxes for individual artist names, in canvas pixels.
  // Sub-names within an "&"-joined chunk get their own box.
  const hits = [];
  function addHit(name, xLeft, yPos, width) {
    const url = ARTIST_LINKS[name];
    if (!url) return;
    // Use measureText metrics to get the actual rendered glyph bounds rather
    // than the full EM-box, so the hit-box snugs the visible text. With
    // textBaseline='top', actualBoundingBoxAscent is signed (typically
    // negative because glyphs sit below the alignment point) and
    // actualBoundingBoxDescent is positive (down to glyph bottom).
    const m = ctx.measureText(name);
    const top = yPos - m.actualBoundingBoxAscent;
    const bottom = yPos + m.actualBoundingBoxDescent;
    hits.push({ name, url, x: xLeft, y: top, w: width, h: bottom - top });
  }
  function emitChunk(text, xStart, yPos) {
    // If the whole chunk is a registered artist (e.g. a "& TFK"-style group),
    // make it one big hit-box. Otherwise split on " & " into sub-names.
    if (ARTIST_LINKS[text]) {
      addHit(text, xStart, yPos, ctx.measureText(text).width);
      return;
    }
    const subs = text.split(" & ");
    if (subs.length === 1) {
      addHit(text, xStart, yPos, ctx.measureText(text).width);
      return;
    }
    const ampW = ctx.measureText(" & ").width;
    let sx = xStart;
    for (let s = 0; s < subs.length; s++) {
      const sw = ctx.measureText(subs[s]).width;
      addHit(subs[s], sx, yPos, sw);
      sx += sw + (s < subs.length - 1 ? ampW : 0);
    }
  }

  let yPos = topPad;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "") {
      yPos += emptyGap;
      continue;
    }
    const size = i === 0 ? titleSize : bodySize;
    const weight = i === 0 ? "500" : "300";
    ctx.font = `${weight} ${size}px ${FONT}`;

    // Replace commas with star icons (only when useStars is set)
    const parts = useStars && i > 0 ? lines[i].split(", ") : null;
    if (parts && parts.length > 1) {
      // Measure total width with star gaps
      const starSize = size * 0.7;
      const starGap = size * 0.4;
      const partWidths = parts.map((p) => ctx.measureText(p).width);
      const totalW = partWidths.reduce((a, b) => a + b, 0) + (parts.length - 1) * (starSize + starGap * 2);
      let xPos = (TEX_W - totalW) / 2;

      ctx.textAlign = "left";
      for (let j = 0; j < parts.length; j++) {
        ctx.fillText(parts[j], xPos, yPos);
        if (i > 0) emitChunk(parts[j], xPos, yPos);
        xPos += partWidths[j];
        if (j < parts.length - 1) {
          xPos += starGap;
          drawStar(ctx, xPos + starSize / 2, yPos + size * 0.45, starSize);
          xPos += starSize + starGap;
        }
      }
      ctx.textAlign = "center";
    } else {
      ctx.fillText(lines[i], TEX_W / 2, yPos);
      if (i > 0) {
        const w = ctx.measureText(lines[i]).width;
        emitChunk(lines[i], (TEX_W - w) / 2, yPos);
      }
    }
    yPos += i === 0 ? titleSize + lineGap : lineGap;
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return { tex, hits, texH };
}

// =====================================================
// CANVAS-PIXEL \u2192 MESH-LOCAL COORD CONVERSION
// =====================================================
// The body of the scroll is flat at z = bodyZ, with linear y mapping.
// Canvas y=0 maps to texture v=1 (top of mesh) and grows downward.
function buildCoordMapper(h, texH) {
  const curlArcLen = CURL_RADIUS * CURL_ANGLE;
  const bodyLen = h - 2 * CURL_RADIUS;
  const totalArc = bodyLen + 2 * curlArcLen;
  // Top curl ends (and body begins) at y = h/2 + r*sin(curlAngle): the curl
  // wraps upward+outward, so the body junction sits above h/2.
  const bodyTopY = h / 2 + CURL_RADIUS * Math.sin(CURL_ANGLE);
  // z just outside the body surface so hit-boxes float in front of the text
  const bodyZ = -CURL_RADIUS * (Math.cos(Math.PI - CURL_ANGLE) + 1);
  const surfaceZ = bodyZ - 0.01;
  return {
    surfaceZ,
    xToMesh: (xCanvas) => (0.5 - xCanvas / TEX_W) * SCROLL_WIDTH,
    yToMesh: (yCanvas) => bodyTopY - ((yCanvas / texH) * totalArc - curlArcLen),
    wToMesh: (wCanvas) => (wCanvas / TEX_W) * SCROLL_WIDTH,
    hToMesh: (hCanvas) => (hCanvas / texH) * totalArc,
  };
}

// =====================================================
// CSS3D LINK OVERLAYS
// =====================================================
// Pixels-per-world-unit for the invisible <a> elements. Larger = crisper hover
// rectangle but no visual difference since the elements are transparent.
const CSS_PX_PER_UNIT = 100;
const CSS_SCALE = 1 / CSS_PX_PER_UNIT;

function makeLinkObjects(hits, h, texH) {
  const map = buildCoordMapper(h, texH);
  const objects = [];
  for (const hit of hits) {
    const wMesh = map.wToMesh(hit.w);
    const hMesh = map.hToMesh(hit.h);
    // The text is left-anchored at hit.x and top-anchored at hit.y in canvas
    // coords. In mesh coords +x maps from the right side of the scroll, so
    // the hit-box's mesh-x center = leftEdge - width/2 of the text.
    const cxMesh = map.xToMesh(hit.x + hit.w / 2);
    const cyMesh = map.yToMesh(hit.y + hit.h / 2);

    const a = document.createElement("a");
    a.href = hit.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "banner-link";
    a.textContent = hit.name; // accessible label, hidden visually via CSS
    a.style.width = `${wMesh * CSS_PX_PER_UNIT}px`;
    a.style.height = `${hMesh * CSS_PX_PER_UNIT}px`;

    const obj = new CSS3DObject(a);
    obj.position.set(cxMesh, cyMesh, map.surfaceZ);
    obj.scale.setScalar(CSS_SCALE);
    objects.push(obj);
  }
  return objects;
}

// =====================================================
// POSITIONING — map face to world position & rotation
// =====================================================
function getBannerTransform(stageIdx, face, yLevel, height) {
  const stage = STAGES[stageIdx];
  const h = height || SCROLL_HEIGHT;
  // yLevel: ledger level from stage floor where top of banner rests
  // Default: 2 levels below stage top
  const level = yLevel != null ? yLevel : stage.scaffLevels - 2;
  const topLedgerY = stage.floorY + level * LEVEL_H;
  const midY = topLedgerY - h / 2;

  const hw = TOTAL_W / 2;
  const hd = TOTAL_D / 2;

  let x = 0,
    z = 0,
    rotY = 0;

  switch (face) {
    case "front":
      x = 0;
      z = -hd;
      rotY = 0;
      break;
    case "back":
      x = 0;
      z = hd;
      rotY = Math.PI;
      break;
    case "left":
      x = -hw;
      z = 0;
      rotY = -Math.PI / 2;
      break;
    case "right":
      x = hw;
      z = 0;
      rotY = Math.PI / 2;
      break;
  }

  return { x, y: midY, z, rotY };
}

// =====================================================
// BUILD & EXPORT
// =====================================================
export const bannerGroup = new THREE.Group();
bannerGroup.name = "banners";

const clipPlanes = [buildPlane, buildPlaneBottom];

for (const def of BANNERS) {
  const h = def.height || SCROLL_HEIGHT;
  const geo = buildScrollGeometry(SCROLL_WIDTH, h, CURL_RADIUS, CURL_ANGLE, BODY_SEGS, CURL_SEGS, H_SEGS);
  const heightScale = def.height ? def.height / SCROLL_HEIGHT : 1;
  const { tex, hits, texH } = makeScrollTexture(def.lines, def.starSep, heightScale);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    side: THREE.DoubleSide,
    metalness: 0.0,
    roughness: 0.8,
    clippingPlanes: clipPlanes,
    transparent: true,
    opacity: 0.95,
  });

  const mesh = new THREE.Mesh(geo, mat);
  const t = getBannerTransform(def.stage, def.face, def.yLevel, h);
  mesh.position.set(t.x, t.y, t.z);
  mesh.rotation.y = t.rotY;
  mesh.castShadow = false;
  mesh.receiveShadow = true;

  for (const linkObj of makeLinkObjects(hits, h, texH)) mesh.add(linkObj);

  bannerGroup.add(mesh);
}

// Register banner positions with camera for angle nudging
registerBannerAngles(
  BANNERS.map((def) => {
    const stage = STAGES[def.stage];
    const h = def.height || SCROLL_HEIGHT;
    const level = def.yLevel != null ? def.yLevel : stage.scaffLevels - 2;
    const topLedgerY = stage.floorY + level * LEVEL_H;
    const bannerMidY = topLedgerY - h / 2;
    return {
      y: bannerMidY,
      angle: FACE_ANGLES[def.face],
      range: stage.scaffLevels * LEVEL_H * 0.6,
    };
  }),
);

// Exclusion zones for plants — axis-aligned boxes around each banner
export const bannerExclusions = BANNERS.map((def) => {
  const stage = STAGES[def.stage];
  const level = def.yLevel != null ? def.yLevel : stage.scaffLevels - 2;
  const h = def.height || SCROLL_HEIGHT;
  const topY = stage.floorY + level * LEVEL_H;
  const botY = topY - h;
  const hw = SCROLL_WIDTH / 2 + 2.0; // wide padding to keep vines clear
  const depth = 3.0; // depth in front of and behind banner
  const t = getBannerTransform(def.stage, def.face, def.yLevel, h);

  // Compute bounds based on face orientation
  let minX, maxX, minZ, maxZ;
  if (def.face === "front" || def.face === "back") {
    minX = t.x - hw;
    maxX = t.x + hw;
    minZ = t.z - depth;
    maxZ = t.z + depth;
  } else {
    minX = t.x - depth;
    maxX = t.x + depth;
    minZ = t.z - hw;
    maxZ = t.z + hw;
  }
  return { minX, maxX, minY: botY, maxY: topY, minZ, maxZ };
});

export function isInBannerZone(x, y, z) {
  for (const b of bannerExclusions) {
    if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ) return true;
  }
  return false;
}

export { BANNERS };
