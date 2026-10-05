import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [preact()],
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
        faq: resolve(__dirname, 'faq/index.html'),
        store: resolve(__dirname, 'store/index.html'),
        privacy: resolve(__dirname, 'privacy/index.html'),
        auctions: resolve(__dirname, 'auctions/index.html'),
      },
    },
  },
});
