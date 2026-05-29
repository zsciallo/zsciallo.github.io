import { createServer } from 'vite';
import render from 'preact-render-to-string';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { h } from 'preact';

const pages = [
  { module: '/src/App.jsx', export: 'default', dist: 'dist/index.html' },
  { module: '/src/pages/SmpPage.jsx', export: 'SmpPage', dist: 'dist/smp/index.html' },
  { module: '/src/pages/FaqPage.jsx', export: 'FaqPage', dist: 'dist/faq/index.html' },
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
