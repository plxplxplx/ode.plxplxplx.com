import * as THREE from 'three';
import { STAGES, LEVEL_H, TOP_H } from './config.js';
import { ribbonVert, ribbonFrag } from './shaders.js';

// =====================================================
// ATMOSPHERE ZONES (different vibes as you ascend)
// =====================================================
export const ZONES = [
  { name: 'GROUND',    y: STAGES[0].floorY, fogColor: 0x1a2808, fogDensity: 0.06,  tint: [1.1, 1.2, 0.7],
    title: '',
    text: 'PLX ODE JOY 15–16 MAJ' },
  { name: 'SECOND',    y: STAGES[1].floorY, fogColor: 0x2a1408, fogDensity: 0.055, tint: [1.3, 0.9, 0.6],
    title: '',
    text: 'PLX ODE JOY 15–16 MAJ' },
  { name: 'THIRD',     y: STAGES[2].floorY, fogColor: 0x221808, fogDensity: 0.05,  tint: [1.2, 0.95, 0.7],
    title: '',
    text: 'PLX ODE JOY 15–16 MAJ' },
  { name: 'SUMMIT',    y: STAGES[3].floorY, fogColor: 0x1e1008, fogDensity: 0.04,  tint: [1.3, 0.85, 0.6],
    title: '',
    text: 'PLX ODE JOY 15–16 MAJ' },
];

// =====================================================
// TYPOGRAPHY RIBBONS
// =====================================================
export const sideTexts = [];

function makeRibbonTex(title, body, width = 4096, height = 512) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  const bannerPad = 40;
  const font = "'NHaas Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif";

  // Measure total content width
  const bodySize = Math.floor(height * 0.22);
  ctx.font = `300 ${bodySize}px ${font}`;
  const lines = body.split('\n');
  let maxBodyW = 0;
  for (const line of lines) maxBodyW = Math.max(maxBodyW, ctx.measureText(line).width);

  let titleW = 0, titleSize = 0, titleGap = 0;
  if (title) {
    titleSize = Math.floor(height * 0.4);
    ctx.font = `300 ${titleSize}px ${font}`;
    titleW = ctx.measureText(title).width;
    titleGap = 180;
  }

  const contentW = titleW + titleGap + maxBodyW;
  const textH = lines.length * bodySize * 1.45;

  // Center everything on the canvas
  const cx = (width - contentW) / 2;
  const cy = (height - textH) / 2;

  // Banner region: black rectangle at full alpha — shader reads as fabric area
  ctx.fillStyle = '#000000';
  ctx.fillRect(cx - bannerPad, cy - bannerPad, contentW + bannerPad * 2, textH + bannerPad * 2);

  // Title text (white on black banner)
  if (title) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `300 ${titleSize}px ${font}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(title, cx, cy);

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + titleW + 40, cy + titleSize * 0.5);
    ctx.lineTo(cx + titleW + 160, cy + titleSize * 0.5);
    ctx.stroke();
  }

  // Body text (white on black banner)
  const bodyX = cx + titleW + titleGap;
  ctx.fillStyle = '#ffffff';
  ctx.font = `300 ${bodySize}px ${font}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  let by = cy;
  for (const line of lines) {
    ctx.fillText(line, bodyX, by);
    by += bodySize * 1.45;
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function buildRibbonGeo(radius, arcAngle, ribbonH, segments, startAngle, rise) {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const angle = startAngle + f * arcAngle;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const yOff = f * rise;

    positions.push(x, -ribbonH / 2 + yOff, z);
    uvs.push(f, 1);
    positions.push(x, ribbonH / 2 + yOff, z);
    uvs.push(f, 0);

    if (i < segments) {
      const base = i * 2;
      indices.push(base, base + 2, base + 1);
      indices.push(base + 1, base + 2, base + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Overlay scene for ribbons — rendered after DOF so text stays crisp
export const ribbonOverlayScene = new THREE.Scene();

const RIBBON_SEGS = 64;

ZONES.forEach((zone, i) => {
  const tex = makeRibbonTex(zone.title, zone.text);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex },
      time: { value: 0 },
      phase: { value: i * 2.5 },
      opacity: { value: 0.0 },
      brightness: { value: 1.0 },
      tintColor: { value: new THREE.Color(1, 1, 1) },
      bgColor: { value: new THREE.Color(0, 0, 0) },
      bgOpacity: { value: 0.0 },
    },
    vertexShader: ribbonVert,
    fragmentShader: ribbonFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });

  const startAngle = i * Math.PI * 0.6;
  const geo = buildRibbonGeo(9.0, 295 * Math.PI / 180, 5.5, RIBBON_SEGS, startAngle, 18);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = zone.y + 3;
  ribbonOverlayScene.add(mesh);
  sideTexts.push({ mesh, mat, zoneY: zone.y, zoneIdx: i, startAngle });
});

export function rebuildRibbons(params) {
  const arc = params.textArc * Math.PI / 180;
  for (const st of sideTexts) {
    const angle = st.startAngle + params.textStartAngleOffset * Math.PI / 180;
    const newGeo = buildRibbonGeo(params.textRadius, arc, params.textHeight, RIBBON_SEGS, angle, params.textRise);
    st.mesh.geometry.dispose();
    st.mesh.geometry = newGeo;
    st.mesh.position.y = st.zoneY + params.textYOffset;
    st.mesh.rotation.y = params.textRotY * Math.PI / 180;
  }
}

// =====================================================
// PER-FRAME UPDATES
// =====================================================
function wDist(a, b) { const d = Math.abs(a - b); return Math.min(d, TOP_H - d); }

const _colorA = new THREE.Color();
const _colorB = new THREE.Color();

export function updateZones(camH, scene, wrapFogBoost) {
  let zoneA = ZONES[0], zoneB = ZONES[0], zoneFrac = 0;
  const zLen = ZONES.length;
  for (let z = 0; z < zLen; z++) {
    const curr = ZONES[z];
    const next = ZONES[(z + 1) % zLen];
    const currY = curr.y;
    const nextY = next.y;
    if (nextY > currY) {
      if (camH >= currY && camH < nextY) {
        zoneA = curr; zoneB = next;
        zoneFrac = (camH - currY) / (nextY - currY);
        break;
      }
    } else {
      if (camH >= currY || camH < nextY) {
        zoneA = curr; zoneB = next;
        const span = (TOP_H - currY) + nextY;
        const pos = camH >= currY ? (camH - currY) : (TOP_H - currY + camH);
        zoneFrac = span > 0 ? pos / span : 0;
        break;
      }
    }
  }
  _colorA.set(zoneA.fogColor);
  _colorB.set(zoneB.fogColor);
  scene.fog.color.copy(_colorA).lerp(_colorB, zoneFrac);
  scene.background.copy(scene.fog.color);
  scene.fog.density = THREE.MathUtils.lerp(zoneA.fogDensity, zoneB.fogDensity, zoneFrac) + wrapFogBoost;
}

export function updateSideTexts(dt, t, camH, params) {
  for (const st of sideTexts) {
    const dist = wDist(camH, st.zoneY);
    const range = params.textFadeRange * params.textFadeOutMult;
    st.mat.uniforms.opacity.value = Math.max(0, 1 - dist / range) * params.textMaxOpacity;
    st.mat.uniforms.time.value = t;
    st.mesh.rotation.y += params.textOrbitSpeed * dt;
  }
}
