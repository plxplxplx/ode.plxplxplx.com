import { ARTISTS } from './artists.js';

const panel = document.getElementById('artist-panel');
const nameEl = document.getElementById('artist-panel-name');
const bioEl = document.getElementById('artist-panel-bio');
const workEl = document.getElementById('artist-panel-work');
const workTitleEl = document.getElementById('artist-panel-work-title');
const workTextEl = document.getElementById('artist-panel-work-text');
const linksEl = document.getElementById('artist-panel-links');
const closeBtn = document.getElementById('artist-panel-close');

function makeLink(href, label) {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.className = 'artist-link';
  a.textContent = label;
  return a;
}

export function openArtistPanel(key) {
  const data = ARTISTS[key];
  if (!data) return;
  nameEl.textContent = data.name;
  bioEl.textContent = data.bio || '';

  workTitleEl.textContent = data.work || '';
  workTextEl.textContent = data.workText || '';
  workEl.hidden = !data.work && !data.workText;

  linksEl.replaceChildren();
  if (data.web) {
    const host = data.web.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    linksEl.appendChild(makeLink(data.web, host));
  }
  if (data.instagram) {
    const handle = data.instagram.replace(/^@/, '');
    linksEl.appendChild(makeLink(`https://instagram.com/${handle}`, `@${handle}`));
  }

  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
}

export function closeArtistPanel() {
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
}

closeBtn.addEventListener('click', closeArtistPanel);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && panel.classList.contains('open')) closeArtistPanel();
});
