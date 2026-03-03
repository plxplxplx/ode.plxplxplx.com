// =====================================================
// AUDIO — simple HTML5 playback, no Web Audio processing
// =====================================================
export const TRACKS = {
  'Martinaise':          'assets/audio/Disco Elysium - Martinaise District Theme 1.mp3',
  'Årsmöte I':           'assets/audio/anton-ingvarsson-arsmote-del-1.mp3',
  'Årsmöte II':          'assets/audio/anton-ingvarsson-arsmote-del-2.mp3',
  'Dance Dunce':         'assets/audio/anton-ingvarsson-dance-dunce-ambient.mp3',
  'Dance Dunce ODE':     'assets/audio/anton-ingvarsson-dance-dunce-ode.mp3',
  'Dance Dunce ODE ♫':   'assets/audio/anton-ingvarsson-dance-dunce-ode-mono.mp3',
  'Dance Dunce 8-bit':   'assets/audio/anton-ingvarsson-dance-dunce-ode-8-bit-mono.mp3',
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

export const bgMusic = new Audio(TRACKS['Dance Dunce ODE ♫']);
bgMusic.loop = true;
bgMusic.volume = 0.4;

export function switchTrack(name) {
  const wasPlaying = !bgMusic.paused;
  bgMusic.pause();
  bgMusic.src = TRACKS[name];
  bgMusic.load();
  if (wasPlaying) bgMusic.play().catch(() => {});
}
