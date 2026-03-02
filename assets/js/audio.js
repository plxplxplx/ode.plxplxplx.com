import { STAGES } from './config.js';

// =====================================================
// DYNAMIC AUDIO — Web Audio API with per-stage effects
// =====================================================
export const TRACKS = {
  'Martinaise':          'assets/audio/Disco Elysium - Martinaise District Theme 1.mp3',
  'Årsmöte I':           'assets/audio/anton-ingvarsson-arsmote-del-1.mp3',
  'Årsmöte II':          'assets/audio/anton-ingvarsson-arsmote-del-2.mp3',
  'Dance Dunce':         'assets/audio/anton-ingvarsson-dance-dunce-ambient.mp3',
  'Free':                'assets/audio/anton-ingvarsson-free.mp3',
  'Havet':               'assets/audio/anton-ingvarsson-havet-ar-rattsagidddit.mp3',
  'Kyrkorgel':           'assets/audio/anton-ingvarsson-kyrkorgel-del-2.mp3',
  'PLX Freakzone':       'assets/audio/anton-ingvarsson-plx-freakzone.mp3',
  'Raga':                'assets/audio/anton-ingvarsson-raga-3.mp3',
  'Samsara':             'assets/audio/anton-ingvarsson-samsara.mp3',
  'Skogen':              'assets/audio/anton-ingvarsson-skogen.mp3',
  'Thanks':              'assets/audio/anton-ingvarsson-thanks.mp3',
  'The Story Continues': 'assets/audio/anton-ingvarsson-the-story-continues.mp3',
};

export const bgMusic = new Audio(TRACKS['PLX Freakzone']);
bgMusic.loop = true;
bgMusic.crossOrigin = 'anonymous';

export const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const sourceNode = audioCtx.createMediaElementSource(bgMusic);

// Master gain
export const masterGain = audioCtx.createGain();
masterGain.gain.value = 0.4;

// Low-pass filter
const lpFilter = audioCtx.createBiquadFilter();
lpFilter.type = 'lowpass';
lpFilter.frequency.value = 800;
lpFilter.Q.value = 1.0;

// High-pass filter
const hpFilter = audioCtx.createBiquadFilter();
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
const reverbGain = audioCtx.createGain();
reverbGain.gain.value = 0.15;

// Delay
const delay = audioCtx.createDelay(1.0);
delay.delayTime.value = 0.35;
const delayFeedback = audioCtx.createGain();
delayFeedback.gain.value = 0.0;
const delayGain = audioCtx.createGain();
delayGain.gain.value = 0.0;

// Analyser for audio-reactive visuals
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 256;
analyser.smoothingTimeConstant = 0.3;
const _timeDomain = new Uint8Array(analyser.fftSize);

export function getAmplitude() {
  analyser.getByteTimeDomainData(_timeDomain);
  let sum = 0;
  for (let i = 0; i < _timeDomain.length; i++) {
    const v = (_timeDomain[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / _timeDomain.length);
}

// Signal chain
sourceNode.connect(lpFilter);
lpFilter.connect(hpFilter);
hpFilter.connect(masterGain);
masterGain.connect(analyser);
analyser.connect(audioCtx.destination);

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

export function switchTrack(name) {
  const wasPlaying = !bgMusic.paused;
  bgMusic.pause();
  bgMusic.src = TRACKS[name];
  bgMusic.load();
  if (wasPlaying) bgMusic.play().catch(() => {});
}

// Per-stage audio presets
export const STAGE_AUDIO = [
  { lpFreq: 800,  hpFreq: 20,  reverbWet: 0.1,  delayWet: 0.0,  delayFb: 0.0,  delayTime: 0.3,  playbackRate: 1.0 },
  { lpFreq: 3000, hpFreq: 60,  reverbWet: 0.25, delayWet: 0.0,  delayFb: 0.0,  delayTime: 0.3,  playbackRate: 1.0 },
  { lpFreq: 8000, hpFreq: 100, reverbWet: 0.4,  delayWet: 0.15, delayFb: 0.25, delayTime: 0.4,  playbackRate: 0.98 },
  { lpFreq: 16000, hpFreq: 150, reverbWet: 0.55, delayWet: 0.3, delayFb: 0.4, delayTime: 0.55, playbackRate: 0.95 },
];

export function updateAudio(camH) {
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

  lpFilter.frequency.setTargetAtTime(lerp(a.lpFreq, b.lpFreq, frac), now, 0.3);
  hpFilter.frequency.setTargetAtTime(lerp(a.hpFreq, b.hpFreq, frac), now, 0.3);
  reverbGain.gain.setTargetAtTime(lerp(a.reverbWet, b.reverbWet, frac), now, 0.3);
  delayGain.gain.setTargetAtTime(lerp(a.delayWet, b.delayWet, frac), now, 0.3);
  delayFeedback.gain.setTargetAtTime(lerp(a.delayFb, b.delayFb, frac), now, 0.3);
  delay.delayTime.setTargetAtTime(lerp(a.delayTime, b.delayTime, frac), now, 0.3);
  bgMusic.playbackRate = lerp(a.playbackRate, b.playbackRate, frac);
}
