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
