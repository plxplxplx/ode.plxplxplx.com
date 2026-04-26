import { ARTISTS, artistUrl } from './artists.js';
import { canvas } from './scene.js';

const panel = document.getElementById('artist-panel');
const nameEl = document.getElementById('artist-panel-name');
const bioEl = document.getElementById('artist-panel-bio');
const workEl = document.getElementById('artist-panel-work');
const workTitleEl = document.getElementById('artist-panel-work-title');
const workTextEl = document.getElementById('artist-panel-work-text');

let openedAt = 0;

export function openArtistPanel(key) {
  const data = ARTISTS[key];
  if (!data) return;

  // The name itself is the link — to the artist's URL (music platform if
  // available via `web`, otherwise Instagram). No URL → plain text.
  nameEl.replaceChildren();
  const url = artistUrl(data.name);
  if (url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = data.name;
    nameEl.appendChild(a);
  } else {
    nameEl.textContent = data.name;
  }

  bioEl.textContent = data.bio || '';

  workTitleEl.textContent = data.work || '';
  workTextEl.textContent = data.workText || '';
  workEl.hidden = !data.work && !data.workText;

  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  openedAt = performance.now();
}

export function closeArtistPanel() {
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && panel.classList.contains('open')) closeArtistPanel();
});

// Click anywhere outside the panel dismisses it. Bubble-phase listener so
// any open-handlers (cards, glass panels) run first; the openedAt guard
// keeps the opening click itself from immediately closing the panel.
document.addEventListener('click', (e) => {
  if (!panel.classList.contains('open')) return;
  if (panel.contains(e.target)) return;
  if (performance.now() - openedAt < 150) return;
  closeArtistPanel();
});

// Any scroll/touch-drag on the 3D scene dismisses the panel — it should
// only ever be visible while the visitor is parked on an artist.
canvas.addEventListener('wheel', () => {
  if (panel.classList.contains('open')) closeArtistPanel();
}, { passive: true });
canvas.addEventListener('touchmove', () => {
  if (panel.classList.contains('open')) closeArtistPanel();
}, { passive: true });
