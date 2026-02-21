import * as THREE from 'three';

// Shared loading manager for all asset loaders
export const manager = new THREE.LoadingManager();

const pct = document.getElementById('loader-pct');

export const loaderReady = new Promise((resolve) => {
  let resolved = false;
  const done = () => { if (!resolved) { resolved = true; resolve(); } };

  manager.onProgress = (_url, loaded, total) => {
    const p = Math.round((loaded / total) * 100);
    if (pct) pct.textContent = `Loading ${p}%`;
  };

  manager.onLoad = done;

  manager.onError = (url) => {
    console.warn('[loader] failed:', url);
  };

  // Fallback timeout so loading never hangs
  setTimeout(done, 15000);
});
