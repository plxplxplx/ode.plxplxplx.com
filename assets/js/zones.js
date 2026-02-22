import * as THREE from 'three';
import { STAGES, LEVEL_H } from './config.js';
import { ribbonVert, ribbonFrag } from './shaders.js';

// =====================================================
// ATMOSPHERE ZONES (different vibes as you ascend)
// =====================================================
export const ZONES = [
  { name: 'GROUND',    y: STAGES[0].floorY, fogColor: 0x1a2808, fogDensity: 0.06,  tint: [1.1, 1.2, 0.7],
    title: '',
    text: 'PLX ODE 15–16 MAJ' },
  { name: 'SECOND',    y: STAGES[1].floorY, fogColor: 0x2a1408, fogDensity: 0.055, tint: [1.3, 0.9, 0.6],
    title: '',
    text: 'PLX ODE 15–16 MAJ' },
  { name: 'THIRD',     y: STAGES[2].floorY, fogColor: 0x221808, fogDensity: 0.05,  tint: [1.2, 0.95, 0.7],
    title: '',
    text: 'PLX ODE 15–16 MAJ' },
  { name: 'SUMMIT',    y: STAGES[3].floorY, fogColor: 0x1e1008, fogDensity: 0.04,  tint: [1.3, 0.85, 0.6],
    title: '',
    text: 'PLX ODE 15–16 MAJ' },
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

  const pad = 80;
  let bodyX = pad;

  if (title) {
    const titleSize = Math.floor(height * 0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = `300 ${titleSize}px Georgia, serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(title, pad, pad * 0.35);

    const titleW = ctx.measureText(title).width;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad + titleW + 40, pad * 0.35 + titleSize * 0.5);
    ctx.lineTo(pad + titleW + 160, pad * 0.35 + titleSize * 0.5);
    ctx.stroke();
    bodyX = pad + titleW + 180;
  }

  const bodySize = Math.floor(height * 0.22);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `300 ${bodySize}px Georgia, serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const lines = body.split('\n');
  let by = pad * 0.3;
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
      brightness: { value: 4.3 },
    },
    vertexShader: ribbonVert,
    fragmentShader: ribbonFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  const startAngle = i * Math.PI * 0.6;
  const geo = buildRibbonGeo(6.5, 295 * Math.PI / 180, 5.5, RIBBON_SEGS, startAngle, 18);
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
