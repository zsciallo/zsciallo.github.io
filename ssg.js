import { createServer } from 'vite';
import render from 'preact-render-to-string';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { h } from 'preact';

// The auctions page fetches these at runtime, so a build with them missing
// succeeds and then shows an empty market on the deployed site. Fail here
// instead. In CI the deploy workflow generates them by reading the live
// database, falling back to the last deployed snapshot if it is unreachable,
// so reaching this point means both of those went wrong.
//
// Only the items tab is required. The pools and futures documents are newer
// than the first deploys and each tab renders an explicit empty state without
// one, which beats refusing to publish the rest of the site over it.
const required = ['dist/market/index.json', 'dist/market/meta.json'];

const pages = [
  { module: '/src/App.jsx', export: 'default', dist: 'dist/index.html' },
  { module: '/src/pages/SmpPage.jsx', export: 'SmpPage', dist: 'dist/smp/index.html' },
  { module: '/src/pages/FaqPage.jsx', export: 'FaqPage', dist: 'dist/faq/index.html' },
  { module: '/src/pages/StorePage.jsx', export: 'StorePage', dist: 'dist/store/index.html' },
  { module: '/src/pages/PrivacyPage.jsx', export: 'PrivacyPage', dist: 'dist/privacy/index.html' },
  { module: '/src/pages/AuctionsPage.jsx', export: 'AuctionsPage', dist: 'dist/auctions/index.html' },
];

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true },
});

for (const { module, export: exportName, dist } of pages) {
  const mod = await server.ssrLoadModule(module);
  const Component = mod[exportName];
  const markup = render(h(Component, null));
  const file = resolve(dist);
  const html = readFileSync(file, 'utf-8');
  writeFileSync(file, html.replace('<div id="app"></div>', `<div id="app">${markup}</div>`));
  console.log(`[ssg] ${dist}`);
}

await server.close();

const missing = required.filter((file) => !existsSync(resolve(file)));
if (missing.length) {
  console.error(`\n[ssg] missing market data: ${missing.join(', ')}`);
  console.error('[ssg] locally: run `npm run market` first. in CI: check the fetch and fallback steps.\n');
  process.exit(1);
}
