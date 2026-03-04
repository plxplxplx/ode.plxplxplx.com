import { STAGES, isMobile } from './config.js';

// =====================================================
// DYNAMIC AUDIO — Multi-stem layering with per-stage fades
// Uses AudioBufferSourceNode for sample-accurate sync
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

// On mobile, skip the entire Web Audio API chain — Safari's implementation
// causes scroll jank even with just filters. Use HTML5 Audio volume instead.
export let audioCtx = null;
export let masterGain = null;
let lpFilter, hpFilter, reverbGain, delayGain, delayFeedback, delay;
let stemGains = [];   // per-stem GainNode
let stemBuffers = []; // decoded AudioBuffers
let stemSources = []; // active AudioBufferSourceNodes

// Mobile fallback — HTML5 Audio elements (no Web Audio)
let mobileStemEls = null;
if (isMobile) {
  mobileStemEls = STEM_DEFS.map(def => {
    const el = new Audio(def.src);
    el.loop = true;
    el.crossOrigin = 'anonymous';
    el.volume = def.stages[0] * 0.4;
    return el;
  });
}

// Fetch and decode all stems into AudioBuffers (desktop only)
async function loadStemBuffers() {
  if (!audioCtx) return;
  const fetches = STEM_DEFS.map(async (def) => {
    const res = await fetch(def.src);
    const arrayBuf = await res.arrayBuffer();
    return audioCtx.decodeAudioData(arrayBuf);
  });
  stemBuffers = await Promise.all(fetches);
}

if (!isMobile) {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Stem bus — all stems merge here before shared effects
  const stemBus = audioCtx.createGain();
  stemBus.gain.value = 1.0;

  // Create per-stem gain nodes and connect to bus
  for (const def of STEM_DEFS) {
    const gain = audioCtx.createGain();
    gain.gain.value = def.stages[0];
    gain.connect(stemBus);
    stemGains.push(gain);
  }

  // Master gain
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.4;

  // Low-pass filter
  lpFilter = audioCtx.createBiquadFilter();
  lpFilter.type = 'lowpass';
  lpFilter.frequency.value = 800;
  lpFilter.Q.value = 1.0;

  // High-pass filter
  hpFilter = audioCtx.createBiquadFilter();
  hpFilter.type = 'highpass';
  hpFilter.frequency.value = 20;
  hpFilter.Q.value = 0.5;

  // Reverb via convolver
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

  // Delay
  delay = audioCtx.createDelay(1.0);
  delay.delayTime.value = 0.35;
  delayFeedback = audioCtx.createGain();
  delayFeedback.gain.value = 0.0;
  delayGain = audioCtx.createGain();
  delayGain.gain.value = 0.0;

  // Signal chain: stemBus → LP → HP → master → destination
  stemBus.connect(lpFilter);
  lpFilter.connect(hpFilter);
  hpFilter.connect(masterGain);
  masterGain.connect(audioCtx.destination);

  // Reverb send
  hpFilter.connect(convolver);
  convolver.connect(reverbGain);
  reverbGain.connect(audioCtx.destination);

  // Delay send
  hpFilter.connect(delay);
  delay.connect(delayFeedback);
  delayFeedback.connect(delay);
  delay.connect(delayGain);
  delayGain.connect(audioCtx.destination);

  // Start loading buffers immediately
  loadStemBuffers();
}

// Play all stems at the exact same time (sample-accurate)
export async function playStems() {
  if (isMobile) {
    // Mobile: fire all plays together (best effort)
    return Promise.all(mobileStemEls.map(el => el.play().catch(() => {})));
  }

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

// Per-stage audio presets (effects chain)
export const STAGE_AUDIO = [
  { lpFreq: 2000,  hpFreq: 20,  reverbWet: 0.08, delayWet: 0.0,  delayFb: 0.0,  delayTime: 0.3,  playbackRate: 1.0 },
  { lpFreq: 5000,  hpFreq: 40,  reverbWet: 0.12, delayWet: 0.0,  delayFb: 0.0,  delayTime: 0.3,  playbackRate: 1.0 },
  { lpFreq: 10000, hpFreq: 60,  reverbWet: 0.18, delayWet: 0.06, delayFb: 0.12, delayTime: 0.35, playbackRate: 0.99 },
  { lpFreq: 16000, hpFreq: 80,  reverbWet: 0.25, delayWet: 0.12, delayFb: 0.2,  delayTime: 0.4,  playbackRate: 0.97 },
];

// On mobile, no Web Audio nodes exist — use HTML5 volume for stem fades
export const updateAudio = isMobile ? function(camH) {
  let aIdx = 0, bIdx = 0, frac = 0;
  for (let i = 0; i < STAGES.length - 1; i++) {
    if (camH >= STAGES[i].floorY && camH < STAGES[i + 1].floorY) {
      aIdx = i; bIdx = i + 1;
      frac = (camH - STAGES[i].floorY) / (STAGES[i + 1].floorY - STAGES[i].floorY);
      break;
    }
    if (i === STAGES.length - 2) { aIdx = bIdx = STAGES.length - 1; frac = 0; }
  }
  for (let s = 0; s < mobileStemEls.length; s++) {
    const volA = STEM_DEFS[s].stages[aIdx];
    const volB = STEM_DEFS[s].stages[bIdx];
    mobileStemEls[s].volume = (volA + (volB - volA) * frac) * 0.4;
  }
} : function(camH) {
  let aIdx = 0, bIdx = 0, frac = 0;
  for (let i = 0; i < STAGES.length - 1; i++) {
    if (camH >= STAGES[i].floorY && camH < STAGES[i + 1].floorY) {
      aIdx = i; bIdx = i + 1;
      frac = (camH - STAGES[i].floorY) / (STAGES[i + 1].floorY - STAGES[i].floorY);
      break;
    }
    if (i === STAGES.length - 2) { aIdx = bIdx = STAGES.length - 1; frac = 0; }
  }
  const a = STAGE_AUDIO[aIdx], b = STAGE_AUDIO[bIdx];
  const lerp = (x, y, t) => x + (y - x) * t;
  const now = audioCtx.currentTime;

  // Fade each stem's gain
  for (let s = 0; s < STEM_DEFS.length; s++) {
    const volA = STEM_DEFS[s].stages[aIdx];
    const volB = STEM_DEFS[s].stages[bIdx];
    stemGains[s].gain.setTargetAtTime(lerp(volA, volB, frac), now, 0.3);
  }

  // Shared effects chain
  lpFilter.frequency.setTargetAtTime(lerp(a.lpFreq, b.lpFreq, frac), now, 0.3);
  hpFilter.frequency.setTargetAtTime(lerp(a.hpFreq, b.hpFreq, frac), now, 0.3);
  reverbGain.gain.setTargetAtTime(lerp(a.reverbWet, b.reverbWet, frac), now, 0.3);
  delayGain.gain.setTargetAtTime(lerp(a.delayWet, b.delayWet, frac), now, 0.3);
  delayFeedback.gain.setTargetAtTime(lerp(a.delayFb, b.delayFb, frac), now, 0.3);
  delay.delayTime.setTargetAtTime(lerp(a.delayTime, b.delayTime, frac), now, 0.3);

  // Sync playback rate across all stems
  const rate = lerp(a.playbackRate, b.playbackRate, frac);
  for (const src of stemSources) {
    src.playbackRate.setTargetAtTime(rate, now, 0.3);
  }
};
