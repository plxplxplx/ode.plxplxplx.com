import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const CSS_FILES = [
  'assets/css/reset.css',
  'assets/css/canvas.css',
  'assets/css/scroll-fade.css',
  'assets/css/hud.css',
  'assets/css/navbar.css',
  'assets/css/loader.css',
];

function cssPlugin() {
  return {
    name: 'css-bundle',
    writeBundle() {
      let css = CSS_FILES.map(f => readFileSync(f, 'utf8')).join('\n');
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
      let html = readFileSync('index.html', 'utf8');
      html = html.replace(/\s*<link rel="stylesheet" href="assets\/css\/[^"]+\.css">/g, '');
      html = html.replace('</head>', '  <link rel="stylesheet" href="assets/css/styles.min.css">\n</head>');
      html = html.replace('src="assets/js/main.js"', 'src="assets/js/main.min.js"');
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
  external: (id) => id === 'three' || id.startsWith('three/') || id === 'lil-gui',
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
        { src: 'CNAME', dest: 'docs' },
      ],
    }),
    cssPlugin(),
    htmlPlugin(),
  ],
};
