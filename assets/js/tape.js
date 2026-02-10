import * as THREE from 'three';
import { TOTAL_W, TOTAL_D, STAGES } from './config.js';
import { tapeVert, tapeFrag } from './shaders.js';
import { scene, buildPlane } from './scene.js';

// =====================================================
// CAUTION TAPE — "ODE" construction tape on scaffold
// =====================================================

/** Generate caution tape canvas texture */
function makeTapeTexture(text = 'ODE', bgColor = '#FFD700', textColor = '#000000') {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const ctx = c.getContext('2d');

  // Yellow base
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 1024, 128);

  // Diagonal stripes
  ctx.save();
  ctx.strokeStyle = textColor;
  ctx.lineWidth = 18;
  for (let x = -128; x < 1200; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 128, 128);
    ctx.stroke();
  }
  ctx.restore();

  // Text panels — clear rectangles with bold text
  ctx.font = 'bold 60px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  const spacing = 256;
  for (let x = spacing / 2; x < 1024; x += spacing) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(x - tw / 2 - 16, 16, tw + 32, 96);
    ctx.fillStyle = textColor;
    ctx.fillText(text, x, 64);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Tape options (exposed for GUI)
export const TAPE_OPTS = {
  visible: true,
  color: '#FFD700',
  textColor: '#000000',
  text: 'ODE',
  opacity: 0.9,
  width: 0.4,
  waveAmount: 1.0,
};

const hw = TOTAL_W / 2;
const hd = TOTAL_D / 2;
const OFFSET = 0.06;

// Strip definitions — wraps at stage transitions + a few mid-level accents
function getStripDefs() {
  const strips = [];
  const transitionYs = STAGES.filter(s => s.floorY > 0).map(s => s.floorY);

  for (const y of transitionYs) {
    // Front face (Z = -hd)
    strips.push({ x: 0, y: y + 0.5, z: -hd - OFFSET, len: TOTAL_W + 0.5, rotY: 0 });
    // Back face (Z = +hd)
    strips.push({ x: 0, y: y - 0.3, z: hd + OFFSET, len: TOTAL_W + 0.5, rotY: Math.PI });
    // Left face (X = -hw)
    strips.push({ x: -hw - OFFSET, y: y + 0.2, z: 0, len: TOTAL_D + 0.5, rotY: Math.PI / 2 });
    // Right face (X = +hw)
    strips.push({ x: hw + OFFSET, y: y - 0.1, z: 0, len: TOTAL_D + 0.5, rotY: -Math.PI / 2 });
  }

  // Mid-level accent strips
  strips.push({ x: 0, y: 15, z: -hd - OFFSET, len: TOTAL_W * 0.7, rotY: 0, tilt: 0.15 });
  strips.push({ x: hw + OFFSET, y: 45, z: 0, len: TOTAL_D, rotY: -Math.PI / 2, tilt: -0.12 });
  strips.push({ x: 0, y: 75, z: hd + OFFSET, len: TOTAL_W * 0.6, rotY: Math.PI, tilt: 0.1 });

  return strips;
}

export const tapeGroup = new THREE.Group();
tapeGroup.name = 'tapeGroup';

const tapeMeshes = [];
let tapeTexture = null;

/** Build (or rebuild) all tape strip meshes */
export function buildTape(opts = TAPE_OPTS) {
  // Dispose old
  for (const m of tapeMeshes) {
    m.geometry.dispose();
    m.material.dispose();
    tapeGroup.remove(m);
  }
  tapeMeshes.length = 0;

  // Create texture
  if (tapeTexture) tapeTexture.dispose();
  tapeTexture = makeTapeTexture(opts.text, opts.color, opts.textColor);

  const stripDefs = getStripDefs();
  const repeatUnit = 2.0; // world units per texture repeat

  for (const def of stripDefs) {
    const segs = Math.max(16, Math.round(def.len * 8));
    const geo = new THREE.PlaneGeometry(def.len, opts.width, segs, 1);

    const repeats = def.len / repeatUnit;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tapeMap: { value: tapeTexture },
        opacity: { value: opts.opacity },
        time: { value: 0 },
        waveAmount: { value: opts.waveAmount },
        repeats: { value: repeats },
      },
      vertexShader: tapeVert,
      fragmentShader: tapeFrag,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      clipping: true,
    });
    mat.clippingPlanes = [buildPlane];

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(def.x, def.y, def.z);
    mesh.rotation.y = def.rotY;
    if (def.tilt) mesh.rotation.z = def.tilt;

    tapeGroup.add(mesh);
    tapeMeshes.push(mesh);
  }

  tapeGroup.visible = opts.visible;
}

/** Update time uniform on all tape meshes (call each frame) */
export function updateTape(t) {
  for (const m of tapeMeshes) {
    m.material.uniforms.time.value = t;
  }
}

// Build initial tape and add to scene
buildTape();
scene.add(tapeGroup);
