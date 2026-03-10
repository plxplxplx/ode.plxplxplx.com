import * as THREE from 'three';

// Shared loading manager for all asset loaders
export const manager = new THREE.LoadingManager();

// Loading progress (0–1) — consumed by main.js to drive build-plane reveal
export let loadProgress = 0;

export const loaderReady = new Promise((resolve) => {
  let resolved = false;
  const done = () => { if (!resolved) { resolved = true; loadProgress = 1; resolve(); } };

  manager.onProgress = (_url, loaded, total) => {
    loadProgress = loaded / total;
  };

  manager.onLoad = done;

  manager.onError = (url) => {
    console.warn('[loader] failed:', url);
  };

  // Fallback timeout so loading never hangs
  setTimeout(done, 15000);
});
