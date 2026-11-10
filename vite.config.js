import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { imageSizes } from './tools/vite-image-sizes.js';
import { headFor, pageForEntry } from './src/data/seo.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MARKER = '<!--seo-head-->';

/**
 * Each page's title, meta tags, canonical, social card and JSON-LD come from
 * src/data/seo.js (one source for every page), written into the
 * `<!--seo-head-->` marker of its index.html. faq.json and config.json are read
 * on every transform, so the FAQPage block always matches the FAQ the page renders.
 */
function seoHead() {
  const json = (file) => JSON.parse(readFileSync(resolve(__dirname, file), 'utf-8'));
  return {
    name: 'chromabit-seo-head',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        // Only the site's page entries get (and must have) a generated head;
        // any other HTML file (e.g. the palette swatch sheet) passes through.
        const file = ctx.path.replace(/[?#].*$/, '').replace(/^\//, '').replace(/(^|\/)$/, '$1index.html');
        const page = pageForEntry(file);
        if (!page) return html;
        if (!html.includes(MARKER)) throw new Error(`seo: ${ctx.path} has no ${MARKER} marker`);
        return html.replace(MARKER, headFor(page.route, { faq: json('src/data/faq.json'), config: json('src/config.json') }));
      },
    },
  };
}

export default defineConfig({
  plugins: [preact(), imageSizes({ dir: resolve(__dirname, 'src/assets/serverImages') }), seoHead()],
  base: '/',
  // ssg.js renders through Vite's SSR loader, which leaves node_modules to
  // Node - and Node does not see the react -> preact/compat alias, so Motion's
  // `import 'react'` fails. Bundling Motion through Vite applies the alias.
  ssr: {
    noExternal: ['motion', 'framer-motion', 'motion-dom', 'motion-utils'],
  },
  appType: 'mpa',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        smp: resolve(__dirname, 'smp/index.html'),
        pvp: resolve(__dirname, 'pvp/index.html'),
        pvpPlayer: resolve(__dirname, 'pvp/player/index.html'),
        faq: resolve(__dirname, 'faq/index.html'),
        store: resolve(__dirname, 'store/index.html'),
        privacy: resolve(__dirname, 'privacy/index.html'),
        auctions: resolve(__dirname, 'auctions/index.html'),
      },
    },
  },
});
