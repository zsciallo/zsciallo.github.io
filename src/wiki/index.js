// The one list of wiki pages: src/wiki/pages/<smp|pvp>/<slug>.json, read from disk.
// ssg.js, src/data/seo.js (head, sitemap, llms.txt) and the tests all take wiki routes from here.
// Node only (fs): the browser bundle never imports this file.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
