// The one list of wiki pages: src/wiki/pages/<smp|pvp>/<slug>.json, read from disk.
// ssg.js, src/data/seo.js (head, sitemap, llms.txt) and the tests all take wiki routes from here.
// Node only (fs): the browser bundle never imports this file.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageSize } from '../../tools/vite-image-sizes.js';

export const WIKI_DIR = fileURLToPath(new URL('./pages/', import.meta.url));
export const FACTS_DIR = fileURLToPath(new URL('./facts/', import.meta.url));
export const HALVES = [['smp', 'SMP'], ['pvp', 'ChromaPVP']];

/** Every published page under `dir`, sorted by route. A page is published only with `"live": true`. */
export function wikiPages(dir = WIKI_DIR) {
  return HALVES.flatMap(([half]) => {
    const folder = join(dir, half);
    if (!existsSync(folder)) return [];
    return readdirSync(folder)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => {
        const slug = f.slice(0, -5);
        return { ...JSON.parse(readFileSync(join(folder, f), 'utf-8')), half, slug, route: `/wiki/${half}/${slug}/`, file: join(folder, f) };
      });
  }).filter((p) => p.live === true);
}

/** The facts table `id` (src/wiki/facts/<id>.json), or null when it has no file. */
export function wikiFacts(id, dir = FACTS_DIR) {
  const file = join(dir, `${id}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : null;
}

/** Every facts id a page's sections reference. */
export const factIds = (page) => (page.sections ?? []).flatMap((s) => s.blocks ?? []).filter((b) => b.facts).map((b) => b.facts);

/** Every history row of every page, newest first: { date, text, page }. */
export function wikiChanges(pages) {
  return pages
    .flatMap((page) => (page.history ?? []).map((row) => ({ ...row, page })))
    .sort((a, b) => b.date.localeCompare(a.date) || a.page.title.localeCompare(b.page.title));
}

// ------------------------------------------------------------------ pictures --
// Every picture is vendored under public/ (tools/wiki/fetch_wiki_icons.py fills public/wiki/icons/).
// A picture whose file is missing resolves to null and renders nothing.

export const PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));
export const MATERIAL = /^[a-z0-9_]+$/;
const SITE_PATH = /^\/(?!\/)[a-z0-9_./-]+\.(png|jpe?g|webp|gif)$/i;

/** A site picture: { src, width, height } read from the file under public/, or null when it is not there. */
export function picture(src) {
  if (typeof src !== 'string' || !SITE_PATH.test(src) || src.includes('..') || src.includes('//')) return null;
  const file = join(PUBLIC_DIR, src);
  if (!existsSync(file)) return null;
  const size = imageSize(readFileSync(file));
  return size ? { src, width: size[0], height: size[1] } : null;
}

/** The sprite for an icon name: a material (public/wiki/icons/<material>.png) or a site path; null when there is none. */
export const iconPicture = (name) => picture(MATERIAL.test(name ?? '') ? `/wiki/icons/${name}.png` : name);

/** How many custom enchants the enchant tables list (src/wiki/facts/enchants-*.json rows). */
export function enchantCount(dir = FACTS_DIR) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir)
    .filter((f) => /^enchants-.+\.json$/.test(f))
    .reduce((n, f) => n + (JSON.parse(readFileSync(join(dir, f), 'utf-8')).rows?.length ?? 0), 0);
}
