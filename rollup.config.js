import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const CSS_ENTRY = 'assets/css/styles.css';

function cssPlugin() {
  return {
    name: 'css-bundle',
    writeBundle() {
      const entry = readFileSync(CSS_ENTRY, 'utf8');
      const dir = CSS_ENTRY.replace(/[^/]+$/, '');
      const files = [];
      for (const line of entry.split('\n')) {
        const m = line.match(/@import\s+['"]([^'"]+)['"]/);
        if (m) files.push(dir + m[1]);
      }
      let css = files.map(f => readFileSync(f, 'utf8')).join('\n');
      css = css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*([{}:;,])\s*/g, '$1')
        .replace(/;}/g, '}')
        .trim();
      mkdirSync('docs/assets/css', { recursive: true });
      writeFileSync('docs/assets/css/styles.min.css', css);
    },
  };
}

function htmlPlugin() {
  return {
    name: 'html-bundle',
    writeBundle() {
      const hash = Date.now().toString(36);
      let html = readFileSync('index.html', 'utf8');
      html = html.replace(/\s*<link[^>]*href="assets\/css\/[^"]+\.css[^"]*"[^>]*\/?>/g, '');
      html = html.replace('</head>', `  <link rel="stylesheet" href="assets/css/styles.min.css?v=${hash}">\n</head>`);
      html = html.replace(/src="assets\/js\/main\.js[^"]*"/, `src="assets/js/main.min.js?v=${hash}"`);
      // Swap local vendor paths to CDN for production
      html = html.replace('"three": "./assets/js/vendor/three.module.min.js"', '"three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js"');
      html = html.replace('"three/addons/": "./assets/js/vendor/addons/"', '"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"');
      html = html.replace('"tweakpane": "./assets/js/vendor/tweakpane.min.js"', '"tweakpane": "https://cdn.jsdelivr.net/npm/tweakpane@4.0.5/dist/tweakpane.min.js"');
      writeFileSync('docs/index.html', html);
    },
  };
}

export default {
  input: 'assets/js/main.js',
  output: {
    file: 'docs/assets/js/main.min.js',
    format: 'es',
  },
  external: (id) => id === 'three' || id.startsWith('three/') || id === 'tweakpane',
  plugins: [
    terser(),
    copy({
      targets: [
        { src: 'assets/models', dest: 'docs/assets' },
        { src: 'assets/textures', dest: 'docs/assets' },
        { src: 'assets/img', dest: 'docs/assets' },
        { src: 'assets/audio', dest: 'docs/assets' },
        { src: 'assets/fonts', dest: 'docs/assets' },
        { src: 'assets/reference', dest: 'docs/assets' },
        { src: 'assets/favicon.svg', dest: 'docs/assets' },
        { src: 'favicon.ico', dest: 'docs' },
        { src: 'CNAME', dest: 'docs' },
        { src: '.nojekyll', dest: 'docs' },
        { src: 'robots.txt', dest: 'docs' },
        { src: 'sitemap.xml', dest: 'docs' },
      ],
    }),
    cssPlugin(),
    htmlPlugin(),
  ],
};
