import { STAGES, TOP_H, isMobile } from './config.js';

// =====================================================
// DYNAMIC AUDIO — Multi-stem layering with per-stage fades
// Uses Web Audio API on all platforms for reliable volume control
// Mobile: gain nodes only (no filters/reverb/delay)
// Desktop: full effects chain
// =====================================================

// Stem definitions: each stem has a file and per-stage volume (0-1)
// GROUND: strings | SECOND: + hihat | THIRD: + beat + whistle | SUMMIT: + shakuhachi + steel pan
const STEM_DEFS = [
  { name: 'beat',       src: 'assets/audio/ode-beat.mp3',       stages: [0.0, 0.0, 0.9, 0.9] },
  { name: 'strings',    src: 'assets/audio/ode-strings.mp3',    stages: [0.9, 0.9, 0.9, 0.9] },
  { name: 'hihat',      src: 'assets/audio/ode-hihat.mp3',      stages: [0.0, 0.9, 0.9, 0.9] },
  { name: 'whistle',    src: 'assets/audio/ode-whistle.mp3',     stages: [0.0, 0.0, 0.9, 0.9] },
  { name: 'shakuhachi', src: 'assets/audio/ode-shakuhachi.mp3', stages: [0.0, 0.0, 0.0, 0.9] },
  { name: 'steelpan',   src: 'assets/audio/ode-steelpan.mp3',   stages: [0.0, 0.0, 0.0, 0.9] },
];

export let audioCtx = null;
export let masterGain = null;
let lpFilter, hpFilter, reverbGain, delayGain, delayFeedback, delay;
let stemGains = [];   // per-stem GainNode
let stemBuffers = []; // decoded AudioBuffers
let stemSources = []; // active AudioBufferSourceNodes

// Fetch and decode all stems into AudioBuffers
async function loadStemBuffers() {
  if (!audioCtx) return;
  const fetches = STEM_DEFS.map(async (def) => {
    const res = await fetch(def.src);
    const arrayBuf = await res.arrayBuffer();
    return audioCtx.decodeAudioData(arrayBuf);
  });
  stemBuffers = await Promise.all(fetches);
}

// Lazy init — create AudioContext and node graph on first user gesture
function initAudioCtx() {
  if (audioCtx) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Master gain
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.4;

  if (isMobile) {
    // Mobile: stem gains → master → destination (no effects)
    for (const def of STEM_DEFS) {
      const gain = audioCtx.createGain();
      gain.gain.value = def.stages[0];
      gain.connect(masterGain);
      stemGains.push(gain);
    }
    masterGain.connect(audioCtx.destination);
  } else {
    // Desktop: stem gains → stemBus → LP → HP → master → destination + sends
    const stemBus = audioCtx.createGain();
    stemBus.gain.value = 1.0;

    for (const def of STEM_DEFS) {
      const gain = audioCtx.createGain();
      gain.gain.value = def.stages[0];
      gain.connect(stemBus);
      stemGains.push(gain);
    }

    lpFilter = audioCtx.createBiquadFilter();
    lpFilter.type = 'lowpass';
    lpFilter.frequency.value = 800;
    lpFilter.Q.value = 1.0;

    hpFilter = audioCtx.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.value = 20;
    hpFilter.Q.value = 0.5;

    function createImpulse(duration, decay) {
      const len = audioCtx.sampleRate * duration;
      const impulse = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = impulse.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
      }
      return impulse;
    }
    const convolver = audioCtx.createConvolver();
    convolver.buffer = createImpulse(3.0, 2.5);
    reverbGain = audioCtx.createGain();
    reverbGain.gain.value = 0.15;

    delay = audioCtx.createDelay(1.0);
    delay.delayTime.value = 0.35;
    delayFeedback = audioCtx.createGain();
    delayFeedback.gain.value = 0.0;
    delayGain = audioCtx.createGain();
    delayGain.gain.value = 0.0;

    stemBus.connect(lpFilter);
    lpFilter.connect(hpFilter);
    hpFilter.connect(masterGain);
    masterGain.connect(audioCtx.destination);

    hpFilter.connect(convolver);
    convolver.connect(reverbGain);
    reverbGain.connect(audioCtx.destination);

    hpFilter.connect(delay);
    delay.connect(delayFeedback);
    delayFeedback.connect(delay);
    delay.connect(delayGain);
    delayGain.connect(audioCtx.destination);
  }

  loadStemBuffers();
}

// Play all stems at the exact same time (sample-accurate)
export async function playStems() {
  initAudioCtx();

  // Wait for buffers if still loading
  if (stemBuffers.length === 0) await loadStemBuffers();

  // Stop any currently playing sources
  for (const src of stemSources) {
    try { src.stop(); } catch (_) {}
  }
  stemSources = [];

  // Create all BufferSourceNodes first, then start them at the same instant
  const startTime = audioCtx.currentTime;
  for (let i = 0; i < stemBuffers.length; i++) {
    const source = audioCtx.createBufferSource();
    source.buffer = stemBuffers[i];
    source.loop = true;
    source.connect(stemGains[i]);
    stemSources.push(source);
  }

  // Single start time = sample-accurate sync
  for (const source of stemSources) {
    source.start(startTime);
  }
}

// Per-stage audio presets (desktop effects chain)
export const STAGE_AUDIO = [
  { lpFreq: 2000,  hpFreq: 20,  reverbWet: 0.08, delayWet: 0.0,  delayFb: 0.0,  delayTime: 0.3,  playbackRate: 1.0 },
  { lpFreq: 5000,  hpFreq: 40,  reverbWet: 0.12, delayWet: 0.0,  delayFb: 0.0,  delayTime: 0.3,  playbackRate: 1.0 },
  { lpFreq: 10000, hpFreq: 60,  reverbWet: 0.18, delayWet: 0.06, delayFb: 0.12, delayTime: 0.35, playbackRate: 0.99 },
  { lpFreq: 16000, hpFreq: 80,  reverbWet: 0.25, delayWet: 0.12, delayFb: 0.2,  delayTime: 0.4,  playbackRate: 0.97 },
];

// Find stage blend — above last stage floor, crossfade back toward GROUND
const lastFloor = STAGES[STAGES.length - 1].floorY;
function getStageBlend(camH) {
  for (let i = 0; i < STAGES.length - 1; i++) {
    if (camH >= STAGES[i].floorY && camH < STAGES[i + 1].floorY) {
      return { aIdx: i, bIdx: i + 1,
        frac: (camH - STAGES[i].floorY) / (STAGES[i + 1].floorY - STAGES[i].floorY) };
    }
  }
  const last = STAGES.length - 1;
  const frac = (camH - lastFloor) / (TOP_H - lastFloor);
  return { aIdx: last, bIdx: 0, frac };
}

const lerp = (x, y, t) => x + (y - x) * t;

// Mobile: just fade stem gains. Desktop: fade stems + effects chain.
export const updateAudio = isMobile ? function(camH) {
  if (!audioCtx) return;
  const { aIdx, bIdx, frac } = getStageBlend(camH);
  const now = audioCtx.currentTime;
  for (let s = 0; s < STEM_DEFS.length; s++) {
    const vol = lerp(STEM_DEFS[s].stages[aIdx], STEM_DEFS[s].stages[bIdx], frac);
    stemGains[s].gain.setTargetAtTime(vol, now, 0.3);
  }
} : function(camH) {
  if (!audioCtx) return;
  const { aIdx, bIdx, frac } = getStageBlend(camH);
  const a = STAGE_AUDIO[aIdx], b = STAGE_AUDIO[bIdx];
  const now = audioCtx.currentTime;

  for (let s = 0; s < STEM_DEFS.length; s++) {
    const vol = lerp(STEM_DEFS[s].stages[aIdx], STEM_DEFS[s].stages[bIdx], frac);
    stemGains[s].gain.setTargetAtTime(vol, now, 0.3);
  }

  lpFilter.frequency.setTargetAtTime(lerp(a.lpFreq, b.lpFreq, frac), now, 0.3);
  hpFilter.frequency.setTargetAtTime(lerp(a.hpFreq, b.hpFreq, frac), now, 0.3);
  reverbGain.gain.setTargetAtTime(lerp(a.reverbWet, b.reverbWet, frac), now, 0.3);
  delayGain.gain.setTargetAtTime(lerp(a.delayWet, b.delayWet, frac), now, 0.3);
  delayFeedback.gain.setTargetAtTime(lerp(a.delayFb, b.delayFb, frac), now, 0.3);
  delay.delayTime.setTargetAtTime(lerp(a.delayTime, b.delayTime, frac), now, 0.3);

  const rate = lerp(a.playbackRate, b.playbackRate, frac);
  for (const src of stemSources) {
    src.playbackRate.setTargetAtTime(rate, now, 0.3);
  }
};
