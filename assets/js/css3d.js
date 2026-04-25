import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { canvas } from './scene.js';

export const css3dRenderer = new CSS3DRenderer();
css3dRenderer.setSize(window.innerWidth, window.innerHeight);

const dom = css3dRenderer.domElement;
dom.id = 'css3d';
canvas.parentNode.insertBefore(dom, canvas.nextSibling);

export function resizeCSS3D() {
  css3dRenderer.setSize(window.innerWidth, window.innerHeight);
}
