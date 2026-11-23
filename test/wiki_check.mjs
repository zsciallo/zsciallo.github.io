#!/usr/bin/env node
// Wiki checks (run 20261122-wiki U1), on the production build plus the page files.
//
//   npm run build && node test/wiki_check.mjs [--dist <distDir>] [--no-browser]
//   (npm script: "test:wiki")
//
// Pages come from the one list, src/wiki/index.js. test/fixtures/wiki holds the self-test inputs:
//   smp/sample.json       live, a facts block naming a table that has no file, two history rows oldest first
//   smp/unpublished.json  "live": false
//   smp/raw-html.json     no "live" field; raw HTML, an em dash and a javascript: link in its strings
// The fixture pages go through the real renderer (src/pages/WikiPage.jsx via Vite SSR, as ssg.js does).
// The browser half opens /wiki/ and one article at 400 px with card_style_check's withBrowser + openState.
//
// Output: one `PASS <name>` / `FAIL <name>: <why>` per check, then `RESULT: PASS n checks` or
// `RESULT: FAIL k of n`; exit 0 or 1.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { h } from 'preact';
import render from 'preact-render-to-string';
import { createServer } from 'vite';
import { FACTS_DIR, WIKI_DIR, factIds, wikiChanges, wikiPages } from '../src/wiki/index.js';
import { plainAnswer } from '../src/data/seo.js';
import { findAll, page, parseHtml, textOf, visibleText } from './check_site.mjs';
import { openState, withBrowser } from './card_style_check.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const DIST = resolve(args.includes('--dist') ? args[args.indexOf('--dist') + 1] : join(ROOT, 'dist'));
const FIXTURE = join(ROOT, 'test', 'fixtures', 'wiki');
const q = JSON.stringify;

let passed = 0;
let failed = 0;
function check(name, problems) {
  const list = [].concat(problems ?? []).filter(Boolean);
  if (list.length) failed++;
  else passed++;
  console.log(list.length ? `FAIL ${name}: ${list.slice(0, 8).join('; ')}${list.length > 8 ? ` (+${list.length - 8} more)` : ''}` : `PASS ${name}`);
}

const pages = wikiPages();
const ROUTES = ['/wiki/', '/wiki/changes/', ...pages.map((p) => p.route)];
const built = (route) => {
  const file = join(DIST, route, 'index.html');
  return existsSync(file) ? parseHtml(readFileSync(file, 'utf-8')) : null;
};
const changeDates = (doc) => findAll(doc, (el) => 'data-wiki-change' in el.attrs).map((el) => el.attrs['data-wiki-change']);
const newestFirst = (where, dates) => dates.slice(1).flatMap((d, i) => (d > dates[i] ? [`${where} row ${i + 2} (${d}) is newer than row ${i + 1} (${dates[i]})`] : []));

/** Facts ids the pages reference that have no file. */
const missingFacts = (list) =>
  list.flatMap((p) => factIds(p).filter((id) => !existsSync(join(FACTS_DIR, `${id}.json`))).map((id) => `${p.route} facts ${q(id)} has no file`));

// The deny list: a term that does not compile is a failure, not a crash.
const denyProblems = [];
const DENY = (JSON.parse(readFileSync(join(ROOT, 'tools', 'wiki', 'deny.json'), 'utf-8')).terms ?? []).flatMap((t) => {
  try {
    return [new RegExp(t, 'i')];
  } catch (e) {
    denyProblems.push(`deny term ${q(t)} does not compile: ${e.message}`);
    return [];
  }
});
const denied = (text) => DENY.filter((re) => re.test(text)).map(String);

/** Every page file under `dir` (published or not), parsed; a file that does not parse is a problem. */
function allFiles(dir) {
  return readdirSync(dir).flatMap((half) =>
    readdirSync(join(dir, half))
      .filter((n) => n.endsWith('.json'))
      .map((f) => {
        try {
          return { file: `${half}/${f}`, data: JSON.parse(readFileSync(join(dir, half, f), 'utf-8')) };
        } catch (e) {
          return { file: `${half}/${f}`, error: e.message };
        }
      }),
  );
}

/** Every string in a JSON value. */
const strings = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);

/** Content-rule problems in every page file under `dir`: tags, em dashes, link schemes, block kinds. */
const contentProblems = (dir) =>
  allFiles(dir).flatMap(({ file, data, error }) => {
    if (error) return [`${file} does not parse: ${error}`];
    const out = [];
    for (const s of strings(data)) {
      if (/<[a-z/!]/i.test(s)) out.push(`${file} has a tag: ${q(s.slice(0, 60))}`);
      if (s.includes('—')) out.push(`${file} has an em dash: ${q(s.slice(0, 60))}`);
      for (const m of s.matchAll(/\]\(([^)]+)\)/g)) if (!/^(\/|#|https:\/\/)/.test(m[1])) out.push(`${file} links ${q(m[1])} (want /, # or https://)`);
    }
    for (const s of data.sections ?? [])
      for (const b of s.blocks ?? []) if (Object.keys(b).length !== 1 || !['p', 'ul', 'facts'].includes(Object.keys(b)[0])) out.push(`${file} block ${q(b).slice(0, 60)} is not one of p, ul, facts`);
    return out;
  });

// ------------------------------------------------------------------ built pages --

check('articles-built', pages.flatMap((p) => {
  const doc = built(p.route);
  if (!doc) return [`${p.route} has no built file`];
  const out = [];
  const h1 = findAll(doc, (el) => el.tag === 'h1').length;
  if (h1 !== 1) out.push(`${p.route} has ${h1} <h1>, want 1`);
  if (findAll(doc, (el) => 'data-wiki-infobox' in el.attrs).length !== 1) out.push(`${p.route} has no single info box`);
  if (!findAll(doc, (el) => el.tag === 'h2' && textOf(el) === 'History').length) out.push(`${p.route} has no History heading`);
  out.push(...newestFirst(`${p.route} History`, changeDates(doc)));
  return out;
}));

{
  const doc = built('/wiki/');
  const hrefs = doc ? findAll(doc, (el) => el.tag === 'a').map((a) => a.attrs.href) : [];
  check('home-links-every-page', doc ? pages.filter((p) => !hrefs.includes(p.route)).map((p) => `/wiki/ does not link ${p.route}`) : ['/wiki/ has no built file']);
}

{
  const doc = built('/wiki/changes/');
  const dates = doc ? changeDates(doc) : null;
  const want = wikiChanges(pages).length;
  check('changes-newest-first', !dates ? ['/wiki/changes/ has no built file'] : [
    ...(dates.length !== want ? [`/wiki/changes/ has ${dates.length} rows, want ${want}`] : []),
    ...newestFirst('/wiki/changes/', dates),
  ]);
}

{
  const file = join(DIST, 'sitemap.xml');
  const locs = existsSync(file) ? [...readFileSync(file, 'utf-8').matchAll(/<loc>\s*https:\/\/chromabit\.us(\/wiki\/[^<]*?)\s*<\/loc>/g)].map((m) => m[1]) : null;
  check('sitemap-wiki', !locs ? ['dist/sitemap.xml missing'] : [
    ...ROUTES.filter((r) => !locs.includes(r)).map((r) => `sitemap lacks ${r}`),
    ...locs.filter((l) => !ROUTES.includes(l)).map((l) => `sitemap lists ${l}, which is not a wiki route`),
  ]);
}

// AC2: nothing is built under dist/wiki/ but the published routes (an unpublished page never reaches dist/).
{
  const dir = join(DIST, 'wiki');
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name === 'index.html' ? [`/${relative(DIST, d).replaceAll('\\', '/')}/`] : []));
  check('dist-only-live', existsSync(dir) ? walk(dir).filter((r) => !ROUTES.includes(r)).map((r) => `dist has ${r}, which is not a published wiki route`) : ['dist/wiki missing']);
}

// AC5: visible text plus the head (title, meta, JSON-LD), which carries the summary to search engines.
check('deny-terms', ROUTES.flatMap((route) => {
  const p = page(route, DIST);
  if (!p) return [`${route} has no built file`];
  const text = [visibleText(p), ...p.titles, ...p.metas.map((m) => m.content ?? ''), ...p.jsonLd].join('\n');
  return denied(text).map((t) => `${route} matches ${t}`);
}));

// AC6 on the build: facts tables are generated, so their text is held to the no-em-dash rule here.
check('built-no-em-dash', ROUTES.flatMap((route) => {
  const p = page(route, DIST);
  return p && visibleText(p).includes('—') ? [`${route} visible text has an em dash`] : [];
}));

// ------------------------------------------------------------------- content --

check('unpublished-stays-out', (() => {
  const routes = wikiPages(FIXTURE).map((p) => p.route);
  return q(routes) === q(['/wiki/smp/sample/']) ? [] : [`wikiPages(test/fixtures/wiki) is ${q(routes)}, want ["/wiki/smp/sample/"] (live:false and no-live pages dropped)`];
})());

check('facts-files', missingFacts(pages));
check('facts-files-self-test', (() => {
  const got = missingFacts(wikiPages(FIXTURE));
  return got.length === 1 && got[0].includes('no-such-facts-table') ? [] : [`a missing facts file is not caught: ${q(got)}`];
})());

// The list keeps its teeth: these core phrases stay denied, so the file cannot be quietly emptied or defanged.
// Orchestrator ruling 2026-11-22: "Grim Harvester" (an SMP Halloween Crate reward) is content; Grim the anticheat is not.
check('deny-terms-self-test', [
  ...denyProblems,
  ...(DENY.length < 21 ? [`deny.json has ${DENY.length} terms, want at least the spec's 21`] : []),
  ...['Grim Harvester', 'a Grim Harvester drop'].filter((t) => denied(t).length).map((t) => `${q(t)} is denied, want allowed`),
  ...['GrimAC', 'Grim flagged him', '/caa reload', '12% chance', 'a 5 % chance', 'drop rate', 'the odds are 1 in 5', 'pity counter', 'item weight', 'a dupe', 'exploit fixed', 'anticheat', 'anti-dupe', '/lp user', '/grant', 'chromatic.arena.admin', 'payout']
    .filter((t) => !denied(t).length)
    .map((t) => `${q(t)} is allowed, want denied`),
]);

check('content-text', contentProblems(WIKI_DIR));
check('content-text-self-test', (() => {
  const got = contentProblems(FIXTURE).filter((s) => s.startsWith('smp/raw-html.json'));
  const want = ['has a tag', 'has an em dash', 'links "javascript:'];
  return [
    ...want.filter((w) => !got.some((s) => s.includes(w))).map((w) => `smp/raw-html.json ${w} is not caught`),
    ...contentProblems(FIXTURE).filter((s) => !s.startsWith('smp/raw-html.json')).map((s) => `clean fixture flagged: ${s}`),
  ];
})());

// seo-head in check_site holds every indexable description to 70-160 characters; the description is the summary.
check('summary-length', pages.flatMap((p) => {
  const d = plainAnswer(p.summary ?? '');
  const out = d.length < 70 || d.length > 160 ? [`${p.route} summary is ${d.length} characters as text, want 70-160`] : [];
  if (!(p.summary ?? '').startsWith(`**${p.title}**`)) out.push(`${p.route} summary does not start with **${p.title}**`);
  return out;
}));

// ------------------------------------------------------------- real renderer --
// The fixture pages through src/pages/WikiPage.jsx, loaded the way ssg.js loads it.
{
  const server = await createServer({ root: ROOT, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false } });
  try {
    const { WikiArticle, WikiChanges } = await server.ssrLoadModule('/src/pages/WikiPage.jsx');
    const fx = wikiPages(FIXTURE);
    const raw = { ...JSON.parse(readFileSync(join(FIXTURE, 'smp', 'raw-html.json'), 'utf-8')), half: 'smp', slug: 'raw-html', route: '/wiki/smp/raw-html/' };
    const html = render(h(WikiArticle, { page: raw, pages: [raw], facts: {} }));
    const doc = parseHtml(html);
    const text = textOf(doc);
    check('render-escapes-html', [
      // Inside <main> only: the nav and footer around it have their own <img> and markup.
      ...(html.includes('<main') ? [] : ['the article has no <main>']),
      ...[...html.slice(html.indexOf('<main'), html.indexOf('</main>')).matchAll(/<(script|b|img|i)[\s>]/gi)].map((m) => `raw ${q(m[0])} reached the markup`),
      ...['<script>alert(1)</script>', '<script>alert(2)</script>', '<img src=x onerror=alert(3)>', '<b>SMP</b>', '<b>raw</b> change'].filter((s) => !text.includes(s)).map((s) => `${q(s)} is not shown as text`),
      ...(textOf(findAll(doc, (el) => el.tag === 'h1')[0] ?? doc) === 'Raw <b>HTML</b> Page' ? [] : ['the h1 is not the raw title as text']),
    ]);
    const article = parseHtml(render(h(WikiArticle, { page: fx[0], pages: fx, facts: {} })));
    const changes = parseHtml(render(h(WikiChanges, { pages: fx })));
    check('render-history-newest-first', [
      ...(q(changeDates(article)) === q(['2026-11-05', '2026-11-01']) ? [] : [`article History rows are ${q(changeDates(article))}, want ["2026-11-05","2026-11-01"]`]),
      ...(q(changeDates(changes)) === q(['2026-11-05', '2026-11-01']) ? [] : [`changes rows are ${q(changeDates(changes))}, want ["2026-11-05","2026-11-01"]`]),
    ]);
  } catch (e) {
    check('render', [String(e?.stack ?? e)]);
  } finally {
    await server.close();
  }
}

// -------------------------------------------------------------------- browser --

if (!args.includes('--no-browser')) {
  let ran = false;
  await withBrowser(DIST, async (b, origin) => {
    ran = true;
    for (const path of ['/wiki/', pages[0]?.route].filter(Boolean)) {
      let p;
      try {
        p = await openState(b, origin, { id: `wiki ${path}`, path, ready: 'main.wiki' }, 400);
        const sw = await p.ev('document.documentElement.scrollWidth');
        check(`no-scroll-400 ${path}`, sw <= 400 ? [] : [`scrollWidth ${sw}, want <= 400`]);
      } catch (e) {
        check(`no-scroll-400 ${path}`, [String(e?.message ?? e)]);
      } finally {
        await p?.close();
      }
    }
  });
  if (!ran) check('browser', ['the browser half did not run (see the line above)']);
}

console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
process.exitCode = failed ? 1 : 0;
