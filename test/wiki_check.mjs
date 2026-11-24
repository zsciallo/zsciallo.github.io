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
import { FACTS_DIR, HALVES, WIKI_DIR, factIds, iconPicture, picture, wikiChanges, wikiFacts, wikiPages } from '../src/wiki/index.js';
import { plainAnswer } from '../src/data/seo.js';
import { blockText, findAll, page, parseHtml, textOf, visibleText } from './check_site.mjs';
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
// Scope change (run 20261122-wiki-gear, owner ruling 2026-11-22: gear tables "show what the lore shows",
// including "N% chance" proc text): text in a lore column (LORE_COLUMNS) of a table built from a `gear-*`
// facts file is exempt from the one lore-chance term. Every other term still applies to gear tables; prose on every page, the head and
// every other table keep the full list.
const LORE_CHANCE = String.raw`\d+(\.\d+)?\s?%\s?chance`;
const gearTitlesOf = (p, facts) => new Set(factIds(p).filter((id) => id.startsWith('gear-')).map((id) => facts(id)?.title).filter(Boolean));
const captionOf = (t) => {
  const c = findAll(t, (el) => el.tag === 'caption')[0];
  return c ? textOf(c) : null;
};
// Reviewer F1 (gear r2): only the lore columns are exempt; Obtained and every other gear column keep the full list.
const LORE_COLUMNS = ['Bonus', 'Set bonus', 'Effect'];
/** A <td> in a lore column of a gear table (caption = a gear-* facts title). */
function isLoreCell(el, gearTitles) {
  if (el.tag !== 'td' || el.parent?.tag !== 'tr') return false;
  let table = el.parent;
  while (table && table.tag !== 'table') table = table.parent;
  if (!table || !gearTitles.has(captionOf(table))) return false;
  const col = el.parent.children.filter((c) => c.tag === 'td' || c.tag === 'th').indexOf(el);
  const head = findAll(table, (c) => c.tag === 'thead')[0];
  const th = head ? findAll(head, (c) => c.tag === 'th')[col] : null;
  return !!th && LORE_COLUMNS.includes(textOf(th));
}
/** Deny terms a rendered page matches; `gearTitles` are the captions of its gear-* tables. */
function denyHits(doc, gearTitles, head = '') {
  const root = findAll(doc, (el) => el.tag === 'div' && el.attrs.id === 'app')[0] ?? doc;
  const all = `${blockText(root)}\n${head}`;
  const rest = `${blockText(root, (el) => isLoreCell(el, gearTitles))}\n${head}`;
  return DENY.filter((re) => re.test(re.source === LORE_CHANCE ? rest : all)).map(String);
}
const pageOf = Object.fromEntries(pages.map((p) => [p.route, p]));
check('deny-terms', ROUTES.flatMap((route) => {
  const p = page(route, DIST);
  if (!p) return [`${route} has no built file`];
  const head = [...p.titles, ...p.metas.map((m) => m.content ?? ''), ...p.jsonLd].join('\n');
  const titles = pageOf[route] ? gearTitlesOf(pageOf[route], wikiFacts) : new Set();
  return denyHits(parseHtml(p.html), titles, head).map((t) => `${route} matches ${t}`);
}));
// The exemption keys on the table caption, so no other facts table may share a gear table's title.
check('gear-titles-unique', (() => {
  const all = readdirSync(FACTS_DIR).filter((f) => f.endsWith('.json')).map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join(FACTS_DIR, f), 'utf-8')).title]);
  return all.filter(([id, t]) => id.startsWith('gear-') && all.some(([o, u]) => o !== id && u === t)).map(([id, t]) => `${id} title ${q(t)} is shared with another facts table`);
})());

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
    // pictures.json (round 4) is dirty on purpose too: it feeds the renderer's picture and icon checks.
    ...contentProblems(FIXTURE).filter((s) => !/^smp\/(raw-html|pictures)\.json/.test(s)).map((s) => `clean fixture flagged: ${s}`),
  ];
})());

// seo-head in check_site holds every indexable description to 70-160 characters; the description is the summary.
check('summary-length', pages.flatMap((p) => {
  const d = plainAnswer(p.summary ?? '');
  const out = d.length < 70 || d.length > 160 ? [`${p.route} summary is ${d.length} characters as text, want 70-160`] : [];
  if (!(p.summary ?? '').startsWith(`**${p.title}**`)) out.push(`${p.route} summary does not start with **${p.title}**`);
  return out;
}));

// ------------------------------------------------------------------ pictures --
// Round 4 (owner: "lots of pictures"): materials named anywhere need a sprite file, so a typo fails.
const MATERIAL = /^[a-z0-9_]+$/;
const ICON_DIR = join(ROOT, 'public', 'wiki', 'icons');
const KNOWN_MISSING = ['netherite_spear']; // named by a facts table, no sprite exists anywhere (implementer r4)
const factFiles = readdirSync(FACTS_DIR).filter((f) => f.endsWith('.json')).map((f) => ({ file: f, data: JSON.parse(readFileSync(join(FACTS_DIR, f), 'utf-8')) }));

check('icons-have-files', (() => {
  const named = [
    ...pages.filter((p) => p.icon && MATERIAL.test(p.icon)).map((p) => [p.icon, `${p.route} icon`]),
    ...pages.flatMap((p) => strings(p).flatMap((s) => [...s.matchAll(/\{\{icon:([^}]*)\}\}/g)].map((m) => [m[1], `${p.route} token`]))),
    ...factFiles.flatMap(({ file, data }) => (data.icons ?? []).filter(Boolean).map((m) => [m, `facts ${file}`])),
  ];
  return [
    ...named.filter(([m]) => !MATERIAL.test(m)).map(([m, where]) => `${where} names ${q(m)}, not a material`),
    ...named.filter(([m]) => MATERIAL.test(m) && !KNOWN_MISSING.includes(m) && !existsSync(join(ICON_DIR, `${m}.png`))).map(([m, where]) => `${where} names ${q(m)}, no public/wiki/icons/${m}.png`),
    ...KNOWN_MISSING.filter((m) => existsSync(join(ICON_DIR, `${m}.png`))).map((m) => `${m} now has a sprite: drop it from KNOWN_MISSING`),
  ];
})());

check('facts-icons-shape', factFiles.flatMap(({ file, data }) => {
  if (!('icons' in data)) return [];
  if (!Array.isArray(data.icons)) return [`${file} icons is not a list`];
  return [
    ...(data.icons.length !== (data.rows ?? []).length ? [`${file} has ${data.icons.length} icons for ${(data.rows ?? []).length} rows`] : []),
    ...data.icons.filter((m) => m !== null && !(typeof m === 'string' && MATERIAL.test(m))).map((m) => `${file} icon ${q(m)} is not null or a material`),
  ];
}));

// T2 on the build: the FAQ never shows a wiki sprite.
{
  const doc = built('/faq/');
  check('faq-no-wiki-icons', doc ? findAll(doc, (el) => el.tag === 'img' && (el.attrs.src ?? '').includes('/wiki/icons/')).map((el) => `/faq/ has <img src=${q(el.attrs.src)}>`) : ['/faq/ has no built file']);
}

// T4: the bottom nav box links every live page of the article's half but itself, which is bold text.
check('navbox-half-pages', pages.flatMap((p) => {
  const doc = built(p.route);
  const box = doc && findAll(doc, (el) => el.tag === 'nav' && (el.attrs.class ?? '').split(/\s+/).includes('wiki-navbox'))[0];
  if (!box) return [`${p.route} has no nav box`];
  const row = findAll(box, (el) => el.tag === 'tr').find((tr) => findAll(tr, (el) => el.tag === 'th').some((th) => textOf(th) === 'Pages'));
  if (!row) return [`${p.route} nav box has no Pages row`];
  const hrefs = findAll(row, (el) => el.tag === 'a').map((a) => a.attrs.href);
  const want = pages.filter((o) => o.half === p.half && o.route !== p.route).map((o) => o.route);
  return [
    ...want.filter((r) => !hrefs.includes(r)).map((r) => `${p.route} nav box does not link ${r}`),
    ...hrefs.filter((r) => !want.includes(r)).map((r) => `${p.route} nav box links ${r}`),
    ...(findAll(box, (el) => el.tag === 'a' && el.attrs.href === p.route).length ? [`${p.route} nav box links the page itself`] : []),
    ...(findAll(row, (el) => el.tag === 'strong').some((s) => textOf(s) === p.title) ? [] : [`${p.route} nav box does not show ${q(p.title)} as text`]),
  ];
}));

// T5: one tile per live page; the summary lives in the link title, not in the tile text.
{
  const doc = built('/wiki/');
  const tiles = doc ? findAll(doc, (el) => el.tag === 'li' && 'data-wiki-title' in el.attrs) : [];
  check('home-tiles', !doc ? ['/wiki/ has no built file'] : [
    ...(tiles.length !== pages.length ? [`/wiki/ has ${tiles.length} tiles, want ${pages.length}`] : []),
    ...pages.flatMap((p) => {
      const mine = tiles.filter((t) => findAll(t, (el) => el.tag === 'a' && el.attrs.href === p.route).length);
      if (mine.length !== 1) return [`${p.route} has ${mine.length} tiles, want 1`];
      const a = findAll(mine[0], (el) => el.tag === 'a')[0];
      const sum = plainAnswer(p.summary ?? '');
      return [
        ...(a.attrs.title === sum ? [] : [`${p.route} tile title is ${q(a.attrs.title)}, want the plain summary`]),
        ...(textOf(mine[0]).includes(sum) || textOf(mine[0]) !== p.title ? [`${p.route} tile text is ${q(textOf(mine[0]).slice(0, 60))}, want just ${q(p.title)}`] : []),
      ];
    }),
  ]);
}

// ---------------------------------------------------------------------- gear --
// Run 20261122-wiki-gear (owner 2026-11-22: a Gear box on the home, a page per family).
const gear = pages.filter((p) => p.half === 'gear');
const halfBoxes = (doc) => findAll(doc, (el) => el.tag === 'section' && /^wiki-/.test(el.attrs['aria-labelledby'] ?? '') && el.attrs['aria-labelledby'] !== 'wiki-recent').map((el) => el.attrs['aria-labelledby']);

// G-T2: every live gear page is built under /wiki/gear/; the home has one box per half with live pages, in HALVES order.
check('gear-half', [
  ...(gear.length ? [] : ['no live gear pages']),
  ...gear.filter((p) => !p.route.startsWith('/wiki/gear/') || !built(p.route)).map((p) => `${p.route} is not built under /wiki/gear/`),
  ...(() => {
    const doc = built('/wiki/');
    const want = HALVES.filter(([half]) => pages.some((p) => p.half === half)).map(([half]) => `wiki-${half}`);
    const got = doc ? halfBoxes(doc) : null;
    return !got ? ['/wiki/ has no built file'] : q(got) === q(want) ? [] : [`/wiki/ half boxes are ${q(got)}, want ${q(want)}`];
  })(),
  ...(q(HALVES.map(([h, n]) => n)) === q(['SMP', 'ChromaPVP', 'Gear']) ? [] : [`HALVES labels are ${q(HALVES.map(([, n]) => n))}, want SMP, ChromaPVP, Gear in that order`]),
]);

// G-T3: the nav box is titled with the page's half; outside the Related row it links only that half.
check('navbox-title-and-rows', pages.flatMap((p) => {
  const doc = built(p.route);
  const box = doc && findAll(doc, (el) => el.tag === 'nav' && (el.attrs.class ?? '').split(/\s+/).includes('wiki-navbox'))[0];
  if (!box) return [`${p.route} has no nav box`];
  const label = HALVES.find(([h]) => h === p.half)?.[1];
  const title = findAll(box, (el) => el.tag === 'h2')[0];
  const rows = findAll(box, (el) => el.tag === 'tr').filter((tr) => !findAll(tr, (el) => el.tag === 'th').some((th) => textOf(th) === 'Related'));
  return [
    ...(title && textOf(title) === label ? [] : [`${p.route} nav box title is ${q(title ? textOf(title) : null)}, want ${q(label)}`]),
    ...rows.flatMap((tr) => findAll(tr, (el) => el.tag === 'a').map((a) => a.attrs.href).filter((r) => pageOf[r]?.half !== p.half).map((r) => `${p.route} nav box links ${r} outside the Related row`)),
  ];
}));

// G-T4: gear pages carry their pictures and tables; every gear table is on some page.
check('gear-pages-pictures-tables', [
  ...gear.flatMap((p) => [
    ...(p.icon && iconPicture(p.icon) ? [] : [`${p.route} icon ${q(p.icon)} does not resolve`]),
    ...(picture(p.image?.src) ? [] : [`${p.route} info box image ${q(p.image?.src)} does not resolve to a file`]),
    ...(factIds(p).length ? [] : [`${p.route} has no facts block`]),
  ]),
  ...readdirSync(FACTS_DIR).filter((f) => /^gear-.*\.json$/.test(f)).map((f) => f.slice(0, -5)).filter((id) => !pages.some((p) => factIds(p).includes(id))).map((id) => `${id} is on no live page`),
]);

// G-T5: no admin gem command, no drop odds, no "--" or em dash in gear pages or gear tables.
const gearLeaks = (where, s) => [
  ...(/\/gem\s+(give|take|balance)\b/i.test(s) ? [`${where} names an admin /gem command: ${q(s.slice(0, 60))}`] : []),
  ...(/(drop chance|extra drop)/i.test(s) && /\d+(\.\d+)?\s?%/.test(s) ? [`${where} gives a drop percentage: ${q(s.slice(0, 60))}`] : []),
  ...(s.includes('--') || s.includes('—') ? [`${where} has "--" or an em dash: ${q(s.slice(0, 60))}`] : []),
];
check('gear-no-admin-odds-dashes', [
  ...gear.flatMap((p) => strings(p).flatMap((s) => gearLeaks(p.route, s))),
  ...readdirSync(FACTS_DIR).filter((f) => /^gear-.*\.json$/.test(f)).flatMap((f) => strings(JSON.parse(readFileSync(join(FACTS_DIR, f), 'utf-8'))).flatMap((s) => gearLeaks(f, s))),
]);

// G-T6: every related entry names a live page (the renderer drops a dead one silently).
check('related-resolve', pages.flatMap((p) => (p.related ?? []).filter((r) => !pageOf[`/wiki/${r}/`]).map((r) => `${p.route} related ${q(r)} is not a live page`)));

// D-T4 (run 20261124-dungeon-drops, owner 2026-11-23: "we need content on all the special drops from the dungeon"):
// the Dungeons page has the six drop sections; every picture in their tables is a built file; every link in them and
// the heartwood-sets link to Materials open a built page and, with a #fragment, an element with that id; the elytra
// line names both crates that give one.
const DROP_SECTIONS = { 'drops-by-zone': 'Drops by zone', 'boss-items': 'Boss items', trophies: 'Trophies', materials: 'Materials', 'rotroot-heart': 'Rotroot Heart', 'rare-gear': 'Rare gear' };
const DROP_TABLES = ['drops-by-zone', 'boss-items', 'trophies', 'materials'];
/** A local link that does not open a built page, or whose #fragment is no id on it; null when it resolves. */
const deadLink = (from, href) => {
  const [path, frag] = href.split('#');
  const route = path || from;
  if (!route.startsWith('/')) return null;
  const doc = built(route.endsWith('/') ? route : `${route}/`);
  if (!doc) return `${from} links ${q(href)}, which is not built`;
  return frag && !findAll(doc, (el) => el.attrs.id === frag).length ? `${from} links ${q(href)}, and ${route} has no id ${q(frag)}` : null;
};
{
  const D = '/wiki/smp/dungeons/';
  const doc = built(D);
  const section = (id) => doc && findAll(doc, (el) => el.tag === 'section' && el.attrs['aria-labelledby'] === id)[0];
  check('dungeon-drops-sections', !doc ? [`${D} has no built file`] : Object.entries(DROP_SECTIONS).flatMap(([id, title]) => {
    const s = section(id);
    const h = s && findAll(s, (el) => el.tag === 'h2' && el.attrs.id === id)[0];
    return !h ? [`${D} has no section ${q(title)} (#${id})`] : textOf(h) === title ? [] : [`${D} #${id} heading is ${q(textOf(h))}, want ${q(title)}`];
  }));
  check('dungeon-drops-pictures', !doc ? [`${D} has no built file`] : DROP_TABLES.flatMap((id) => {
    const rows = section(id) ? findAll(section(id), (el) => el.tag === 'tr' && el.parent?.tag === 'tbody') : [];
    if (!rows.length) return [`${D} #${id} has no table rows`];
    return rows.flatMap((tr, i) => {
      const imgs = findAll(tr, (el) => el.tag === 'img');
      if (!imgs.length) return [`${D} #${id} row ${i + 1} (${q(blockText(tr).slice(0, 30))}) has no picture`];
      return imgs.filter((im) => !existsSync(join(DIST, (im.attrs.src ?? '').split('?')[0]))).map((im) => `${D} #${id} row ${i + 1} picture ${q(im.attrs.src)} is not a built file`);
    });
  }));
  check('dungeon-drops-links', [
    ...(!doc ? [`${D} has no built file`] : Object.keys(DROP_SECTIONS).flatMap((id) => (section(id) ? findAll(section(id), (el) => el.tag === 'a' && el.attrs.href) : []).map((a) => deadLink(D, a.attrs.href)))),
    ...(() => {
      const hs = built('/wiki/gear/heartwood-sets/');
      if (!hs) return ['/wiki/gear/heartwood-sets/ has no built file'];
      const to = findAll(hs, (el) => el.tag === 'a' && el.attrs.href === `${D}#materials`);
      return to.length ? to.map((a) => deadLink('/wiki/gear/heartwood-sets/', a.attrs.href)) : [`/wiki/gear/heartwood-sets/ has no link to ${D}#materials`];
    })(),
  ].filter(Boolean));
  check('dungeon-elytra-crates', !doc ? [`${D} has no built file`] : (() => {
    const lines = findAll(doc, (el) => ['p', 'li', 'td'].includes(el.tag) && /elytra/i.test(blockText(el))).map(blockText);
    return !lines.length ? [`${D} never mentions an elytra`] : lines.filter((t) => !(t.includes('Hollow Crate') && t.includes('Core Crate'))).map((t) => `${D} elytra line does not name both the Hollow Crate and the Core Crate: ${q(t.slice(0, 120))}`);
  })());
}

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
    // F9: rich() links only site paths, anchors and https; other schemes show their label as text.
    const links = findAll(findAll(doc, (el) => el.tag === 'main')[0] ?? doc, (el) => el.tag === 'a').map((a) => [textOf(a), a.attrs.href ?? '']);
    check('render-link-schemes', [
      ...links.filter(([, href]) => /^(javascript:|data:|http:|\/\/)/i.test(href)).map(([t, href]) => `${q(t)} links ${q(href)}`),
      ...[['wiki-link', '/wiki/smp/sample/'], ['ext-link', 'https://chromabit.us/']].filter((want) => !links.some((l) => q(l) === q(want))).map(([t, href]) => `${q(t)} does not render as a link to ${href}`),
      ...['js-link', 'data-link', 'http-link', 'proto-link'].filter((t) => !text.includes(t)).map((t) => `${q(t)} label is not shown as text`),
    ]);
    // Round 4 pictures fixture (no "live": never listed).
    const { WikiHome } = await server.ssrLoadModule('/src/pages/WikiPage.jsx');
    const { rich } = await server.ssrLoadModule('/src/lib/rich.jsx');
    const pic = { ...JSON.parse(readFileSync(join(FIXTURE, 'smp', 'pictures.json'), 'utf-8')), half: 'smp', slug: 'pictures', route: '/wiki/smp/pictures/' };
    const mainOf = (d) => findAll(d, (el) => el.tag === 'main')[0] ?? d;
    const imgs = (n) => findAll(n, (el) => el.tag === 'img');
    const onAttrs = (n) => findAll(n, (el) => Object.keys(el.attrs).some((k) => k.startsWith('on'))).map((el) => `<${el.tag}> has ${Object.keys(el.attrs).filter((k) => k.startsWith('on'))}`);
    const picDoc = parseHtml(render(h(WikiArticle, { page: pic, pages: [pic], facts: {} })));
    const para = (mark) => findAll(picDoc, (el) => el.tag === 'p' && textOf(el).startsWith(mark))[0];

    // T1 icon token.
    check('render-icon-token', (() => {
      const ok = para('T1ok');
      const bad = para('T1bad');
      const none = para('T1none');
      if (!ok || !bad || !none) return ['the icon token paragraphs did not render'];
      const [img, ...more] = imgs(ok);
      return [
        ...(!img || more.length ? [`{{icon:diamond_sword}} renders ${imgs(ok).length} <img>, want 1`] : []),
        ...(img && (img.attrs.alt !== '' || img.attrs.width !== '20' || img.attrs.height !== '20' || img.attrs.src !== '/wiki/icons/diamond_sword.png')
          ? [`sprite is ${q(img.attrs)}, want alt "", width/height 20, src /wiki/icons/diamond_sword.png`] : []),
        ...(imgs(bad).length ? [`an invalid icon name renders ${imgs(bad).length} <img>`] : []),
        ...['{{icon:../x}}', '{{icon:A B}}', '{{icon:"onerror=}}'].filter((t) => !textOf(bad).includes(t)).map((t) => `${q(t)} is not shown as text`),
        ...onAttrs(mainOf(picDoc)),
        ...(imgs(none).length ? ['a material with no sprite renders an <img>'] : []),
      ];
    })());

    // T2 the FAQ path: rich() without a resolver (FaqPage calls rich(item.a)) leaves the token as text.
    check('faq-icon-token-is-text', (() => {
      const d = parseHtml(render(h('p', null, rich('answer {{icon:diamond_sword}} here'))));
      return [
        ...(imgs(d).length ? ['rich() without a resolver renders an <img>'] : []),
        ...(textOf(d).includes('{{icon:diamond_sword}}') ? [] : [`the token is not kept as text: ${q(textOf(d))}`]),
        ...(/rich\(item\.a\)/.test(readFileSync(join(ROOT, 'src', 'pages', 'FaqPage.jsx'), 'utf-8')) ? [] : ['FaqPage no longer calls rich(item.a) with no resolver']),
      ];
    })());

    // T3 picture paths: only a plain site path (no .., no //, no scheme) renders; alt and caption escaped.
    check('render-picture-paths', (() => {
      const out = [];
      const fig = findAll(picDoc, (el) => el.tag === 'figure')[0];
      const box = findAll(picDoc, (el) => 'data-wiki-infobox' in el.attrs)[0];
      // Control: the good path renders in the info box, the figure and the home tile.
      if (!box || imgs(box).length !== 1) out.push('a good image.src does not render one info box <img>');
      if (!fig || imgs(fig).length !== 1) out.push('a good img block does not render one <img>');
      else {
        if (imgs(fig)[0].attrs.alt !== '"><script>alert(2)</script>') out.push(`figure alt is ${q(imgs(fig)[0].attrs.alt)}, want the raw string`);
        const cap = findAll(fig, (el) => el.tag === 'figcaption')[0];
        if (!cap || !textOf(cap).includes('<b>cap</b>')) out.push('caption <b> is not shown as text');
        const hrefs = cap ? findAll(cap, (el) => el.tag === 'a').map((a) => a.attrs.href) : [];
        if (hrefs.some((x) => /^javascript:/i.test(x))) out.push('caption renders a javascript: link');
        if (!hrefs.includes('/wiki/')) out.push('caption [ok-cap](/wiki/) is not a link');
      }
      if (box && imgs(box)[0]?.attrs.alt !== '"><script>alert(1)</script>') out.push('info box alt is not the raw string');
      if (findAll(mainOf(picDoc), (el) => el.tag === 'script').length) out.push('a <script> reached the article');
      const homeImg = (page) => imgs(mainOf(parseHtml(render(h(WikiHome, { pages: [page] }))))).filter((i) => !(i.attrs.class ?? '').includes('wiki-home-logo'));
      if (homeImg(pic).length !== 1) out.push('a good page icon does not render a tile <img>');
      for (const bad of ['/../dungeon/preview.jpg', '/dungeon/../dungeon/preview.jpg', '//chromabit.us/dungeon/preview.jpg', '/wiki/icons//diamond_sword.png', 'https://chromabit.us/dungeon/preview.jpg', 'javascript:alert(1)', 'data:image/png;base64,AA', 'dungeon/preview.jpg']) {
        const page = { ...pic, icon: bad, image: { src: bad, alt: 'x' }, sections: [{ h: 'Mechanics', blocks: [{ img: { src: bad, alt: 'x' } }] }] };
        const n = imgs(mainOf(parseHtml(render(h(WikiArticle, { page, pages: [page], facts: {} })))));
        if (n.length) out.push(`${q(bad)} renders ${n.length} article <img> (${q(n[0].attrs.src)})`);
        const t = homeImg(page);
        if (t.length) out.push(`${q(bad)} as a page icon renders a tile <img> (${q(t[0].attrs.src)})`);
      }
      return out;
    })());

    // G-T1: the lore-chance exemption covers gear tables and that one term only.
    check('deny-gear-exemption-self-test', (() => {
      const table = (id, title, cell) => ({ [id]: { id, title, columns: ['Set', 'Bonus'], rows: [['A', cell]] } });
      const gearPage = (blocks) => ({ title: 'Gear Fixture', half: 'gear', slug: 'fx', route: '/wiki/gear/fx/', summary: '**Gear Fixture** is a test page.', infobox: [], sections: [{ h: 'Mechanics', blocks }], history: [], related: [] });
      const hits = (pg, facts) => denyHits(parseHtml(render(h(WikiArticle, { page: pg, pages: [pg], facts }))), gearTitlesOf(pg, (id) => facts[id]));
      const cases = [
        ['a gear table with "15% chance"', gearPage([{ facts: 'gear-fx' }]), table('gear-fx', 'Gear Fx', '15% chance of Regeneration I'), false],
        ['a gear table with "15% chance" in its Obtained column', gearPage([{ facts: 'gear-fx' }]), { 'gear-fx': { id: 'gear-fx', title: 'Gear Fx', columns: ['Set', 'Obtained'], rows: [['A', '15% chance to drop a key']] } }, true],
        ['the same text in its Bonus column', gearPage([{ facts: 'gear-fx' }]), { 'gear-fx': { id: 'gear-fx', title: 'Gear Fx', columns: ['Set', 'Bonus'], rows: [['A', '15% chance to drop a key']] } }, false],
        ['a gear table with "weight"', gearPage([{ facts: 'gear-fx' }]), table('gear-fx', 'Gear Fx', 'reward weight 5'), true],
        ['gear page prose with "15% chance"', gearPage([{ p: 'A 15% chance of Regeneration I.' }, { facts: 'gear-fx' }]), table('gear-fx', 'Gear Fx', 'Plain'), true],
        ['a non-gear table with "15% chance"', gearPage([{ facts: 'smp-fx' }]), table('smp-fx', 'Smp Fx', '15% chance of Regeneration I'), true],
      ];
      return cases.flatMap(([name, pg, facts, want]) => (hits(pg, facts).length > 0 === want ? [] : [`${name} is ${want ? 'allowed, want denied' : `denied (${hits(pg, facts)}), want allowed`}`]));
    })());

    // G-T2: a half with no live pages renders no home box (the fixture list is SMP only).
    check('home-empty-half-no-box', (() => {
      const got = halfBoxes(parseHtml(render(h(WikiHome, { pages: fx }))));
      return q(got) === q(['wiki-smp']) ? [] : [`home boxes for an SMP-only list are ${q(got)}, want ["wiki-smp"]`];
    })());

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

// In the page: colours go through a 1x1 canvas, so oklch()/color() computed values read as RGBA too.
const SOLID = `(() => {
  const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  const rgba = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
  const main = document.querySelector('main');
  const opaque = (el) => { for (let e = el; e && main.contains(e); e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] === 255) return c; } return null; };
  const bad = [];
  for (const el of main.querySelectorAll('*')) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || !el.getClientRects().length) continue;
    if (!opaque(el)) bad.push(el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '') + ' ' + JSON.stringify(el.textContent.trim().slice(0, 30)));
  }
  const lum = (c) => (c ? (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 : null);
  const at = (sel) => { const e = document.querySelector(sel); return e ? lum(opaque(e)) : null; };
  const panel = document.querySelector('.wiki-panel');
  return { theme: document.documentElement.dataset.theme, bad, panelAlpha: panel ? rgba(getComputedStyle(panel).backgroundColor)[3] : null, lum: { panel: at('.wiki-panel'), td: at('main td'), infobox: at('[data-wiki-infobox]') } };
})()`;

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
    // T6 (owner: text on a solid panel): every visible text element in main sits on an opaque background
    // inside main, in dark and Quartz; in Quartz the panel, a table cell and the info box are light.
    const art = pages.find((p) => factIds(p).length) ?? pages[0];
    for (const path of ['/wiki/', art?.route].filter(Boolean))
      for (const width of [1280, 400]) {
        const lum = {};
        for (const theme of ['dark', 'light']) {
          let p;
          const name = `solid-panel ${path}@${width} ${theme}`;
          try {
            const init = theme === 'light' ? "try { localStorage.setItem('chromabit:theme', 'light'); } catch (e) {}" : undefined;
            p = await openState(b, origin, { id: `wiki ${name}`, path, ready: 'main.wiki .wiki-panel', init, colorScheme: theme }, width);
            const r = await p.ev(SOLID);
            lum[theme] = r.lum;
            check(name, [
              ...(r.theme === theme ? [] : [`data-theme is ${q(r.theme)}, want ${theme}`]),
              ...(r.panelAlpha === 255 ? [] : [`.wiki-panel background alpha is ${r.panelAlpha}/255, want opaque`]),
              ...r.bad.map((s) => `${s} has no opaque background inside main`),
            ]);
          } catch (e) {
            check(name, [String(e?.message ?? e)]);
          } finally {
            await p?.close();
          }
        }
        if (lum.dark && lum.light)
          check(`quartz-light ${path}@${width}`, ['panel', ...(path === '/wiki/' ? [] : ['td', 'infobox'])].flatMap((k) =>
            lum.light[k] == null || lum.dark[k] == null ? [`no ${k} measured`] : lum.light[k] - lum.dark[k] < 0.3 ? [`${k} luminance ${lum.light[k].toFixed(2)} in Quartz vs ${lum.dark[k].toFixed(2)} dark, want at least 0.3 lighter`] : []));
      }
  });
  if (!ran) check('browser', ['the browser half did not run (see the line above)']);
}

console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
process.exitCode = failed ? 1 : 0;
