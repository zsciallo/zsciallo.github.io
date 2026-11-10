#!/usr/bin/env node
// Post-build checks for the prerendered site in dist/.
//
//   npm run build && node tools/check_site.mjs [distDir]
//
// (Written by the U2 test writer under test/ because the orchestrator path
// guard keeps test writers out of tools/; the spec places it at
// tools/check_site.mjs. It resolves the repo root as the parent of its own
// directory, so it runs unchanged from either test/ or tools/.)
//
// Prints one line per check (`PASS <name>` or `FAIL <name>: <reason>`), then a
// final `RESULT: PASS n checks` or `RESULT: FAIL k of n`, and exits 0 or 1.
// distDir defaults to dist/ in the repo root.
//
// Each check is a small function in CHECKS below that returns a list of
// problems (an empty list means it passed). Later units append their own
// checks (landing page, /pvp/, profile page) to the end of that list.
//
// Plain Node ESM, no dependencies: HTML is read with a few narrow regexes, the
// PNG size from its IHDR chunk.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(process.argv[2] ?? join(ROOT, 'dist'));

// ---------------------------------------------------------------- the site --

export const NETWORK = 'Chromabit Network';
export const OG_IMAGE_URL = 'https://chromabit.us/og-preview.png';
export const OG_IMAGE_SIZE = { width: 1200, height: 630 };

/** Route -> built file, relative to dist/. */
export const PAGES = {
  '/': 'index.html',
  '/smp/': 'smp/index.html',
  '/faq/': 'faq/index.html',
  '/store/': 'store/index.html',
  '/auctions/': 'auctions/index.html',
  '/privacy/': 'privacy/index.html',
};

/**
 * U4: the /pvp/ page. Kept out of PAGES on purpose so the U2/U3 checks keep
 * exactly the scope they were written for; the U4 checks read it through
 * ALL_ROUTES (and check its head themselves, in pvp-page).
 */
export const PVP_PAGES = { '/pvp/': 'pvp/index.html' };
export const ALL_ROUTES = [...Object.keys(PAGES), ...Object.keys(PVP_PAGES)];
const fileOf = (route) => PAGES[route] ?? PVP_PAGES[route];

export const HOME = {
  title: 'Chromabit Network | Ranked PVP and Economy SMP for Java + Bedrock',
  description:
    'Chromabit is a Minecraft network for Java and Bedrock: ranked kit PVP on one shared ladder, ' +
    'and a survival server with a player-run economy. Join at play.chromabit.us.',
  socialDescription:
    'Ranked kit PVP and a player-run economy SMP for Java and Bedrock. Join at play.chromabit.us',
};

export const SUBPAGE_TITLES = {
  '/faq/': 'FAQ | Chromabit',
  '/store/': 'Store | Chromabit',
  '/privacy/': 'Privacy Policy | Chromabit',
  '/auctions/': 'Auction House | Chromabit SMP',
  '/smp/': 'Economy SMP | Chromabit',
};

/** The only pages whose built HTML may contain the exact string `Chromabit SMP`. */
export const SMP_NAME = 'Chromabit SMP';
export const SMP_NAME_ALLOWED = ['/auctions/', '/smp/'];

// ----------------------------------------------------------------- helpers --

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  // Added in U3 for the landing page copy (middle dots, curly apostrophes).
  middot: '·', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…', copy: '©',
};

/** Decode the HTML entities a template or the prerenderer is likely to emit. */
export function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+[0-9]*);/gi, (whole, name) => {
    if (name[0] === '#') {
      const hex = name[1] === 'x' || name[1] === 'X';
      const code = hex ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** Collapse runs of whitespace (incl. non-breaking spaces) to one space and trim. */
export const squash = (text) => text.replace(/[\s ]+/g, ' ').trim();

/** One-line excerpt of `text` around index `at`. */
function excerpt(text, at, length) {
  const start = Math.max(0, at - 40);
  return JSON.stringify(squash(text.slice(start, at + length + 40)));
}

function parseAttrs(tag) {
  const attrs = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3]);
  }
  return attrs;
}

const cache = new Map();

/** Load and lightly parse one built page; null if the file is missing. */
export function page(route, dist = DIST) {
  const key = `${dist}\0${route}`;
  if (cache.has(key)) return cache.get(key);
  const file = join(dist, fileOf(route));
  let result = null;
  if (existsSync(file)) {
    const html = readFileSync(file, 'utf-8');
    const headMatch = html.match(/<head[\s>][\s\S]*?<\/head>/i);
    const head = headMatch ? headMatch[0] : '';
    const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => parseAttrs(m[0]));
    const titles = [...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map((m) => squash(decode(m[1])));
    const jsonLd = [
      ...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
    ].map((m) => m[1]);
    result = { route, file: fileOf(route), html, head, metas, titles, jsonLd };
  }
  cache.set(key, result);
  return result;
}

/** Values of every <meta name=key> or <meta property=key> in the head. */
function metaValues(p, key) {
  return p.metas.filter((m) => m.name === key || m.property === key).map((m) => squash(m.content ?? ''));
}

/** Problems unless exactly one meta `key` exists and its content equals `want`. */
function expectMeta(p, key, want) {
  const values = metaValues(p, key);
  if (values.length === 0) return [`${p.route} has no ${key}`];
  if (values.length > 1) return [`${p.route} has ${values.length} ${key} tags`];
  return values[0] === want ? [] : [`${p.route} ${key} is ${JSON.stringify(values[0])}, want ${JSON.stringify(want)}`];
}

function expectTitle(p, want) {
  if (p.titles.length !== 1) return [`${p.route} has ${p.titles.length} <title> tags`];
  return p.titles[0] === want ? [] : [`${p.route} title is ${JSON.stringify(p.titles[0])}, want ${JSON.stringify(want)}`];
}

/** All JSON-LD nodes on a page (top-level objects, arrays and @graph members). */
function jsonLdNodes(p) {
  const nodes = [];
  const errors = [];
  p.jsonLd.forEach((raw, i) => {
    let doc;
    try {
      doc = JSON.parse(raw);
    } catch (e) {
      errors.push(`${p.route} JSON-LD block ${i + 1} does not parse: ${e.message}`);
      return;
    }
    for (const item of Array.isArray(doc) ? doc : [doc]) {
      if (item && Array.isArray(item['@graph'])) nodes.push(...item['@graph']);
      else nodes.push(item);
    }
  });
  return { nodes, errors };
}

const types = (node) => [].concat(node?.['@type'] ?? []);

/** Run `fn` on every page that exists; a missing page is one problem. */
function eachPage(routes, fn, dist) {
  const problems = [];
  for (const route of routes) {
    const p = page(route, dist);
    if (!p) problems.push(`${route} missing (${fileOf(route)})`);
    else problems.push(...fn(p));
  }
  return problems;
}

/** Width and height from a PNG's IHDR chunk, or a string saying why not. */
export function pngSize(buf) {
  const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(SIGNATURE)) return 'not a PNG (bad signature)';
  if (buf.toString('latin1', 12, 16) !== 'IHDR') return 'not a PNG (first chunk is not IHDR)';
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// ----------------------------------------------------- a tiny DOM (U3+) --
//
// The landing-page checks need structure (what is inside what, and in what
// order), so the built HTML is parsed into a small element tree. It knows void
// elements, `/>`, raw-text elements (script, style, textarea, title),
// comments and valueless attributes; a stray close tag closes up to its match
// or is ignored. That is all the prerendered markup needs.
//
// Text comparison, used by every U3 check:
//   textOf(el)    tags stripped (inline concatenation, <br> is a space), text
//                 of script/style/template/svg ignored, entities decoded,
//                 curly quotes made straight (’ -> ', “” -> "), whitespace
//                 (incl. nbsp) collapsed to one space and trimmed.
//   blockText(el) the same, but every non-inline element boundary counts as a
//                 space, so <p>A</p><p>B</p> reads "A B" while
//                 CHROMABIT <span>NETWORK</span> still reads "CHROMABIT NETWORK".

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);
const NO_TEXT = new Set(['script', 'style', 'template', 'svg']);
const INLINE = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 's', 'samp',
  'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'img', 'label',
]);

function parseTagAttrs(src) {
  const attrs = {};
  for (const m of src.matchAll(/([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** Parse HTML into { tag, attrs, children, parent, order } elements and { text } nodes. */
export function parseHtml(html) {
  let order = 0;
  const root = { tag: '#root', attrs: {}, children: [], parent: null, order: order++ };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const text = (t) => t && top().children.push({ text: t, parent: top() });
  const OPEN = /<([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/y;
  const CLOSE = /<\/([a-zA-Z][a-zA-Z0-9:-]*)\s*>/y;
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      text(html.slice(i));
      break;
    }
    text(html.slice(i, lt));
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      const end = html.indexOf('>', lt);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    CLOSE.lastIndex = lt;
    const close = CLOSE.exec(html);
    if (close) {
      const tag = close[1].toLowerCase();
      const at = stack.map((e) => e.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      i = CLOSE.lastIndex;
      continue;
    }
    OPEN.lastIndex = lt;
    const open = OPEN.exec(html);
    if (!open) {
      text('<');
      i = lt + 1;
      continue;
    }
    const tag = open[1].toLowerCase();
    const el = { tag, attrs: parseTagAttrs(open[2]), children: [], parent: top(), order: order++ };
    top().children.push(el);
    i = OPEN.lastIndex;
    if (RAW_TEXT.has(tag)) {
      const end = html.toLowerCase().indexOf(`</${tag}`, i);
      const stop = end < 0 ? html.length : end;
      if (stop > i) el.children.push({ text: html.slice(i, stop), parent: el });
      const gt = end < 0 ? -1 : html.indexOf('>', end);
      i = gt < 0 ? html.length : gt + 1;
    } else if (!VOID.has(tag) && !open[3]) {
      stack.push(el);
    }
  }
  return root;
}

/** Normalise text for comparison (see the block comment above). */
export const norm = (t) => squash(t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"'));

function collect(node, block, skip, out) {
  if ('text' in node) {
    out.push(decode(node.text));
    return;
  }
  if (node !== skip.root && skip.fn && skip.fn(node)) return;
  if (NO_TEXT.has(node.tag)) return;
  if (node.tag === 'br') {
    out.push(' ');
    return;
  }
  const sep = block && !INLINE.has(node.tag);
  if (sep) out.push(' ');
  for (const c of node.children) collect(c, block, skip, out);
  if (sep) out.push(' ');
}

/** Visible text of an element, inline concatenation; `skip(el)` drops subtrees. */
export function textOf(node, skip = null) {
  const out = [];
  collect(node, false, { root: node, fn: skip }, out);
  return norm(out.join(''));
}

/** Visible text with a space at every block boundary; `skip(el)` drops subtrees. */
export function blockText(node, skip = null) {
  const out = [];
  collect(node, true, { root: node, fn: skip }, out);
  return norm(out.join(''));
}

/** Every element under `node` (not `node` itself) matching `pred`, in document order. */
export function findAll(node, pred) {
  const out = [];
  const walk = (n) => {
    for (const c of n.children ?? []) {
      if ('text' in c) continue;
      if (pred(c)) out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

const hasClass = (name) => (el) => (el.attrs.class ?? '').split(/\s+/).includes(name);
const hasAttr = (name, value) => (el) => name in el.attrs && (value === undefined || el.attrs[name] === value);
const isTag = (...tags) => (el) => tags.includes(el.tag);
const isHeading = isTag('h2', 'h3', 'h4', 'h5', 'h6');
const inside = (el, ancestor) => {
  for (let p = el.parent; p; p = p.parent) if (p === ancestor) return true;
  return false;
};
const insideAny = (el, ancestors) => ancestors.some((a) => inside(el, a));
const q = JSON.stringify;
/** Quote `s`, cut to `max` characters so one long text does not swamp the line. */
const clip = (s, max = 240) => q(s.length > max ? `${s.slice(0, max)}...(+${s.length - max} chars)` : s);

/** The parsed element tree of a page (cached on the page object). */
function dom(p) {
  p.dom ??= parseHtml(p.html);
  return p.dom;
}

/** The <div id="app"> element, or the whole document if there is none. */
function app(p) {
  return findAll(dom(p), (el) => el.tag === 'div' && el.attrs.id === 'app')[0] ?? dom(p);
}

/** Everything after </head>, raw. */
function rawBody(p) {
  const at = p.html.search(/<\/head\s*>/i);
  return at < 0 ? p.html : p.html.slice(at);
}

/** The site nav: the first <header> in #app. */
const navOf = (p) => findAll(app(p), isTag('header'))[0] ?? null;

/**
 * Where `needle` occurs in the raw HTML `raw` (entities decoded, normalised)
 * or the visible text of `node`; null when it occurs in neither.
 */
function occurrence(raw, node, needle, { ci = false } = {}) {
  const fold = (s) => (ci ? s.toLowerCase() : s);
  const want = fold(needle);
  for (const hay of [norm(decode(raw)), node ? textOf(node) : '']) {
    const at = fold(hay).indexOf(want);
    if (at >= 0) return excerpt(hay, at, needle.length);
  }
  return null;
}

/** The single element matching `pred` under `node`, or a problem string. */
function one(node, pred, what, where) {
  const found = findAll(node, pred);
  if (found.length === 1) return found[0];
  return `${where} has ${found.length} ${what}, want 1`;
}

/** Exactly one [data-copy-ip] under `node`, a <button>, optionally labelled `label`. */
function copyButtonIn(node, where, label = 'COPY IP') {
  const btn = one(node, hasAttr('data-copy-ip'), '[data-copy-ip] buttons', where);
  if (typeof btn === 'string') return [[btn], null];
  const problems = [];
  if (btn.tag !== 'button') problems.push(`${where} [data-copy-ip] is a <${btn.tag}>, want <button>`);
  if (label !== null && textOf(btn) !== label)
    problems.push(`${where} [data-copy-ip] label is ${q(textOf(btn))}, want ${q(label)}`);
  return [problems, btn];
}

function siteConfig() {
  return JSON.parse(readFileSync(join(ROOT, 'src', 'config.json'), 'utf-8'));
}

// ------------------------------------------------------------------ checks --

/** AC1: all six pages exist and each has a non-empty prerendered <div id="app">. */
function pagesPrerendered(dist) {
  return eachPage(
    Object.keys(PAGES),
    (p) => {
      const at = p.html.search(/<div\s+id\s*=\s*["']app["'][^>]*>/i);
      if (at < 0) return [`${p.route} has no <div id="app">`];
      const rest = p.html.slice(at).replace(/^<div[^>]*>/i, '');
      return /^\s*<\/div>/i.test(rest) ? [`${p.route} <div id="app"> is empty (not prerendered)`] : [];
    },
    dist,
  );
}

/** AC2: home title, description, og/twitter, JSON-LD WebSite + Organization names. */
function homeHead(dist) {
  return eachPage(
    ['/'],
    (p) => {
      const problems = [
        ...expectTitle(p, HOME.title),
        ...expectMeta(p, 'description', HOME.description),
        ...expectMeta(p, 'og:title', HOME.title),
        ...expectMeta(p, 'twitter:title', HOME.title),
        ...expectMeta(p, 'og:description', HOME.socialDescription),
        ...expectMeta(p, 'twitter:description', HOME.socialDescription),
      ];
      const { nodes, errors } = jsonLdNodes(p);
      problems.push(...errors);
      for (const type of ['WebSite', 'Organization']) {
        const found = nodes.filter((n) => types(n).includes(type));
        if (found.length !== 1) {
          problems.push(`/ has ${found.length} JSON-LD ${type} nodes, want 1`);
          continue;
        }
        const [n] = found;
        if (n.name !== NETWORK) problems.push(`/ JSON-LD ${type} name is ${JSON.stringify(n.name)}, want "${NETWORK}"`);
        if (n.alternateName !== 'Chromabit')
          problems.push(`/ JSON-LD ${type} alternateName is ${JSON.stringify(n.alternateName)}, want "Chromabit"`);
      }
      return problems;
    },
    dist,
  );
}

/** AC3: og:site_name and meta author name the network on every page. */
function siteNameAndAuthor(dist) {
  return eachPage(
    Object.keys(PAGES),
    (p) => [...expectMeta(p, 'og:site_name', NETWORK), ...expectMeta(p, 'author', NETWORK)],
    dist,
  );
}

/** AC4: sub-page titles. */
function subpageTitles(dist) {
  return eachPage(Object.keys(SUBPAGE_TITLES), (p) => expectTitle(p, SUBPAGE_TITLES[p.route]), dist);
}

/**
 * AC5: the exact, case-sensitive `Chromabit SMP` only on the allowlisted pages.
 * Searched in the whole built HTML after decoding entities and collapsing
 * whitespace, so `Chromabit&nbsp;SMP` or a line break between the words counts.
 */
function smpNameAllowlist(dist) {
  const routes = Object.keys(PAGES).filter((r) => !SMP_NAME_ALLOWED.includes(r));
  return eachPage(
    routes,
    (p) => {
      const text = squash(decode(p.html));
      const hits = [];
      for (let at = text.indexOf(SMP_NAME); at >= 0; at = text.indexOf(SMP_NAME, at + 1)) hits.push(at);
      if (!hits.length) return [];
      const shown = hits.slice(0, 3).map((at) => excerpt(text, at, SMP_NAME.length));
      const more = hits.length > 3 ? ` (+${hits.length - 3} more)` : '';
      return [`${p.file} contains "${SMP_NAME}" ${hits.length}x: ${shown.join(', ')}${more}`];
    },
    dist,
  );
}

/** AC6: dist/og-preview.png is a 1200x630 PNG and every page's og:image points at it. */
function ogPreviewImage(dist) {
  const problems = [];
  const file = join(dist, 'og-preview.png');
  if (!existsSync(file) || !statSync(file).isFile()) {
    problems.push('dist/og-preview.png missing');
  } else {
    const size = pngSize(readFileSync(file));
    if (typeof size === 'string') problems.push(`dist/og-preview.png is ${size}`);
    else if (size.width !== OG_IMAGE_SIZE.width || size.height !== OG_IMAGE_SIZE.height)
      problems.push(
        `dist/og-preview.png is ${size.width}x${size.height}, want ${OG_IMAGE_SIZE.width}x${OG_IMAGE_SIZE.height}`,
      );
  }
  problems.push(...eachPage(Object.keys(PAGES), (p) => expectMeta(p, 'og:image', OG_IMAGE_URL), dist));
  return problems;
}

/** AC7: no "store credit" (any case) in the home page head. */
function homeNoStoreCredit(dist) {
  return eachPage(
    ['/'],
    (p) => {
      const head = squash(decode(p.head));
      const at = head.toLowerCase().indexOf('store credit');
      return at < 0 ? [] : [`/ head mentions "store credit": ${excerpt(head, at, 12)}`];
    },
    dist,
  );
}

// ---------------------------------------------- U3: landing page and /smp/ --
//
// Hooks (the contract with the implementer): [data-join-box], [data-copy-ip],
// a[data-discord-join], [data-claim], [data-mode-card="pvp"|"smp"],
// [data-banner="pvp"|"smp"], [data-live="ladder"|"movers"], .beta-tag,
// [data-section="dungeon"], [data-fact]. The market ticker is MarketTicker's
// root class `tape`. Card titles are h2-h6 elements. Texts are compared as
// described above the DOM helpers.

export const LANDING = {
  eyebrow: 'MINECRAFT NETWORK · JAVA + BEDROCK',
  h1: 'CHROMABIT NETWORK',
  tagline: 'Grind the market. Climb the ladder.',
  address: 'play.chromabit.us',
  java: 'Java: any version up to 26.3',
  bedrock: 'Bedrock: same address, port 19132',
  claim: 'THE ONLY RANKED COMPETITIVE PVP FOR JAVA AND BEDROCK',
  claimForbidden: 'One ladder for both editions',
  cardsForbidden: ['TWO WAYS TO PLAY', 'ONE ADDRESS'],
  cards: {
    pvp: {
      title: 'CHROMAPVP',
      beta: true,
      desc: 'Ranked kit PVP. Duels, the FFA pit, the Prismatic Arena and tournaments.',
      live: 'ladder',
      liveHeading: 'TOP OF THE LADDER',
      href: '/pvp/',
      link: 'ENTER PVP',
    },
    smp: {
      title: 'ECONOMY SMP',
      beta: false,
      desc: 'Survival with a player-run market. Claims, custom spawners, King of the Hill.',
      live: 'movers',
      liveHeading: "TODAY'S TOP MOVERS",
      href: '/smp/',
      link: 'EXPLORE THE SMP',
    },
  },
  copyButtons: 3,
  /** Case-sensitive texts that must not appear anywhere in / (raw HTML or visible text). */
  removed: ['Player Economy', 'Store Credit Prizes', 'Grief Prevention', 'Custom Spawners', 'REAL PRIZES', 'Server Events', 'PLAYER-DRIVEN'],
};

export const SMP_PAGE = {
  h1: 'MINE IT. PRICE IT. TRADE IT.',
  dungeonWord: 'HEARTWOOD',
  minFacts: 3,
  tickerClass: 'tape',
  auctionsHref: '/auctions/',
  auctionsLabel: 'OPEN THE AUCTION HOUSE',
  removed: ['Player Economy', 'Store Credit Prizes', 'Grief Prevention', 'Community Events'],
};

/** The landing page's pieces: nav, footer, the region between them, and the hooked blocks. */
function landing(p) {
  const root = app(p);
  const nav = navOf(p);
  const footer = findAll(root, isTag('footer'))[0] ?? null;
  let region = null;
  if (nav && footer && nav.parent === footer.parent) {
    const sibs = nav.parent.children;
    region = { tag: '#region', attrs: {}, children: sibs.slice(sibs.indexOf(nav) + 1, sibs.indexOf(footer)) };
  }
  const scope = region ?? root;
  return {
    nav,
    footer,
    region,
    joinBoxes: findAll(root, hasAttr('data-join-box')),
    claims: findAll(root, hasAttr('data-claim')),
    cards: findAll(root, hasAttr('data-mode-card')),
    scope,
  };
}

/** AC1 (U3): hero logo, eyebrow, single h1 CHROMABIT NETWORK, tagline; nothing else between nav and footer. */
function homeHero(dist) {
  return eachPage(
    ['/'],
    (p) => {
      const problems = [];
      const h1s = findAll(dom(p), isTag('h1'));
      if (h1s.length !== 1) problems.push(`/ has ${h1s.length} <h1>, want 1`);
      else if (textOf(h1s[0]) !== LANDING.h1) problems.push(`/ <h1> text is ${q(textOf(h1s[0]))}, want ${q(LANDING.h1)}`);
      const L = landing(p);
      if (!L.region) {
        problems.push('/ has no nav <header> and <footer> as siblings in #app');
        return problems;
      }
      const inRegion = (el) => L.region.children.includes(el) || L.region.children.some((c) => inside(el, c));
      const h1 = h1s.length === 1 && inRegion(h1s[0]) ? h1s[0] : null;
      if (h1s.length === 1 && !h1) problems.push('/ <h1> is not between the nav and the footer');
      const logo = findAll(L.region, (el) => el.tag === 'img' && hasClass('logo')(el))[0];
      if (!logo) problems.push('/ hero has no logo (img.logo) between the nav and the footer');
      else if (h1 && logo.order > h1.order) problems.push('/ hero logo comes after the <h1>');
      const hooked = (el) => 'data-join-box' in el.attrs || 'data-claim' in el.attrs || 'data-mode-card' in el.attrs;
      const rest = blockText(L.region, hooked);
      const want = `${LANDING.eyebrow} ${LANDING.h1} ${LANDING.tagline}`;
      if (rest !== want)
        problems.push(`/ text between nav and footer outside the join box, claim band and mode cards is ${clip(rest)}, want ${q(want)}`);
      // Order: h1 < join box < claim band < first mode card (missing blocks are their own checks' problem).
      const seq = [
        ['<h1>', h1],
        ['[data-join-box]', L.joinBoxes[0]],
        ['[data-claim]', L.claims[0]],
        ['first [data-mode-card]', L.cards[0]],
      ].filter(([, el]) => el);
      for (let k = 1; k < seq.length; k++)
        if (seq[k - 1][1].order > seq[k][1].order) problems.push(`/ ${seq[k][0]} comes before ${seq[k - 1][0]}`);
      return problems;
    },
    dist,
  );
}

/** AC2 (U3): one join box: address + COPY IP, Discord JOIN link to config.discord, edition line; no store/ladder button in the hero. */
function homeJoinBox(dist) {
  return eachPage(
    ['/'],
    (p) => {
      const problems = [];
      const L = landing(p);
      if (L.joinBoxes.length !== 1) return [`/ has ${L.joinBoxes.length} [data-join-box], want 1`];
      const [box] = L.joinBoxes;
      const addrs = findAll(box, (el) => textOf(el).includes(LANDING.address));
      const addr = addrs.filter((el) => !addrs.some((o) => o !== el && inside(o, el)))[0];
      if (!addr) problems.push(`/ join box does not show ${q(LANDING.address)}`);
      const [copyProblems, copy] = copyButtonIn(box, '/ join box');
      problems.push(...copyProblems);
      const link = one(box, (el) => el.tag === 'a' && 'data-discord-join' in el.attrs, 'a[data-discord-join] links', '/ join box');
      if (typeof link === 'string') problems.push(link);
      else {
        const want = siteConfig().discord;
        if (link.attrs.href !== want) problems.push(`/ join box Discord link href is ${q(link.attrs.href)}, want ${q(want)}`);
        if (textOf(link) !== 'JOIN') problems.push(`/ join box Discord link label is ${q(textOf(link))}, want "JOIN"`);
        if (!/discord/i.test(blockText(box)) && !/discord/i.test(link.attrs['aria-label'] ?? ''))
          problems.push('/ join box Discord row does not say "Discord"');
        if (addr && addr.order > link.order) problems.push('/ join box address comes after the Discord row');
        if (copy && copy.order > link.order) problems.push('/ join box COPY IP comes after the Discord row');
      }
      const line = findAll(
        box,
        (el) =>
          blockText(el).includes(LANDING.java) &&
          blockText(el).includes(LANDING.bedrock) &&
          !(copy && inside(copy, el)) &&
          !(typeof link !== 'string' && inside(link, el)),
      );
      if (!line.length) problems.push(`/ join box has no single line with ${q(LANDING.java)} and ${q(LANDING.bedrock)}`);
      // No store or ladder button anywhere in the hero (between nav and footer, outside the claim band and mode cards).
      const outside = [...L.claims, ...L.cards];
      for (const el of findAll(L.scope, isTag('a', 'button'))) {
        if (insideAny(el, outside) || outside.includes(el)) continue;
        const label = textOf(el);
        const href = el.attrs.href ?? '';
        if (/store|ladder/i.test(label) || /^\/(store|pvp)(\/|$|\?|#)/.test(href))
          problems.push(`/ hero has a <${el.tag}> ${q(label)}${href ? ` -> ${href}` : ''} (no store or ladder button in the hero)`);
      }
      return problems;
    },
    dist,
  );
}

/** AC3 (U3): the claim band is exactly the headline; "One ladder for both editions" appears nowhere. */
function homeClaim(dist) {
  return eachPage(
    ['/'],
    (p) => {
      const problems = [];
      const L = landing(p);
      if (L.claims.length !== 1) problems.push(`/ has ${L.claims.length} [data-claim], want 1`);
      else if (blockText(L.claims[0]) !== LANDING.claim)
        problems.push(`/ claim band text is ${q(blockText(L.claims[0]))}, want exactly ${q(LANDING.claim)}`);
      const hit = occurrence(p.html, app(p), LANDING.claimForbidden, { ci: true });
      if (hit) problems.push(`/ mentions ${q(LANDING.claimForbidden)}: ${hit}`);
      return problems;
    },
    dist,
  );
}

/** AC4 (U3): the pvp and smp mode cards, in that order, with no section heading above them. */
function homeModeCards(dist) {
  return eachPage(
    ['/'],
    (p) => {
      const problems = [];
      const L = landing(p);
      const ids = L.cards.map((c) => c.attrs['data-mode-card']);
      if (ids.join(',') !== 'pvp,smp')
        problems.push(`/ [data-mode-card] values in document order are ${q(ids)}, want ["pvp","smp"]`);
      const betas = findAll(dom(p), hasClass('beta-tag'));
      for (const [id, spec] of Object.entries(LANDING.cards)) {
        const where = `/ ${id} card`;
        const matches = L.cards.filter((c) => c.attrs['data-mode-card'] === id);
        if (matches.length !== 1) {
          if (ids.join(',') === 'pvp,smp') problems.push(`/ has ${matches.length} [data-mode-card="${id}"], want 1`);
          continue;
        }
        const [card] = matches;
        const banner = one(card, hasAttr('data-banner', id), `[data-banner="${id}"]`, where);
        if (typeof banner === 'string') problems.push(banner);
        else if (id === 'smp') {
          const img = findAll(banner, (el) => el.tag === 'img' && (el.attrs.src ?? '').trim())[0];
          if (!img) problems.push(`${where} banner has no screenshot <img src>`);
          if (!blockText(banner)) problems.push(`${where} banner has no caption text`);
        }
        const isBeta = hasClass('beta-tag');
        const titles = findAll(card, isHeading).map((h) => textOf(h, isBeta));
        if (!titles.includes(spec.title)) problems.push(`${where} has no heading ${q(spec.title)} (headings: ${q(titles)})`);
        const cardBetas = betas.filter((b) => inside(b, card));
        if (spec.beta) {
          if (cardBetas.length !== 1) problems.push(`${where} has ${cardBetas.length} .beta-tag, want 1`);
          else if (textOf(cardBetas[0]) !== 'BETA') problems.push(`${where} .beta-tag text is ${q(textOf(cardBetas[0]))}, want "BETA"`);
        } else if (cardBetas.length) problems.push(`${where} has a .beta-tag (BETA is only on the pvp card)`);
        if (!findAll(card, (el) => textOf(el) === spec.desc).length) problems.push(`${where} has no description ${q(spec.desc)}`);
        const live = one(card, hasAttr('data-live', spec.live), `[data-live="${spec.live}"]`, where);
        if (typeof live === 'string') problems.push(live);
        else {
          const t = blockText(live);
          if (t && !t.startsWith(spec.liveHeading)) problems.push(`${where} live block starts ${q(t.slice(0, 40))}, want heading ${q(spec.liveHeading)}`);
        }
        const links = findAll(card, (el) => el.tag === 'a' && el.attrs.href === spec.href && textOf(el) === spec.link);
        if (links.length !== 1) problems.push(`${where} has ${links.length} <a href="${spec.href}"> ${q(spec.link)}, want 1`);
        problems.push(...copyButtonIn(card, where)[0]);
      }
      for (const bad of LANDING.cardsForbidden) {
        const hit = occurrence(p.html, app(p), bad);
        if (hit) problems.push(`/ mentions ${q(bad)} (no section heading above the cards): ${hit}`);
      }
      const stray = betas.filter((b) => !insideAny(b, L.cards)).length;
      if (stray) problems.push(`/ has ${stray} .beta-tag outside the mode cards (BETA is only on the pvp card)`);
      return problems;
    },
    dist,
  );
}

/** AC5 (U3): exactly three [data-copy-ip] buttons on /. */
function homeCopyButtons(dist) {
  return eachPage(
    ['/'],
    (p) => {
      const n = findAll(dom(p), hasAttr('data-copy-ip')).length;
      return n === LANDING.copyButtons ? [] : [`/ has ${n} [data-copy-ip], want ${LANDING.copyButtons}`];
    },
    dist,
  );
}

/**
 * AC6 (U3): the old feature cards, events section, PLAYER-DRIVEN heading and
 * the standalone carousel are gone from /, and "store credit" (any case) is
 * nowhere in the body. The head is home-no-store-credit's job.
 */
function homeRemoved(dist) {
  return eachPage(
    ['/'],
    (p) => {
      const problems = [];
      const body = rawBody(p);
      for (const gone of LANDING.removed) {
        const hit = occurrence(body, app(p), gone);
        if (hit) problems.push(`/ still has ${q(gone)}: ${hit}`);
      }
      const hit = occurrence(body, app(p), 'store credit', { ci: true });
      if (hit) problems.push(`/ body mentions "store credit": ${hit}`);
      const smpCards = findAll(dom(p), hasAttr('data-mode-card', 'smp'));
      const carousels = findAll(dom(p), hasClass('carousel')).filter((el) => !insideAny(el, smpCards));
      if (carousels.length) problems.push(`/ has ${carousels.length} .carousel outside the smp card (standalone carousel section)`);
      return problems;
    },
    dist,
  );
}

/** AC7 (U3): the short /smp/ page, and how it is reached (footer, not nav). */
function smpPage(dist) {
  const problems = eachPage(
    ['/smp/'],
    (p) => {
      const problems = [];
      const root = dom(p);
      const h1s = findAll(root, isTag('h1'));
      if (h1s.length !== 1) problems.push(`/smp/ has ${h1s.length} <h1>, want 1`);
      else if (textOf(h1s[0]) !== SMP_PAGE.h1) problems.push(`/smp/ <h1> text is ${q(textOf(h1s[0]))}, want ${q(SMP_PAGE.h1)}`);
      const dungeon = one(root, hasAttr('data-section', 'dungeon'), '[data-section="dungeon"]', '/smp/');
      if (typeof dungeon === 'string') problems.push(dungeon);
      else {
        const heading = findAll(dungeon, isTag('h2', 'h3', 'h4', 'h5', 'h6'))[0];
        if (!heading) problems.push('/smp/ dungeon block has no heading');
        else if (!textOf(heading).includes(SMP_PAGE.dungeonWord))
          problems.push(`/smp/ dungeon heading is ${q(textOf(heading))}, want it to contain ${q(SMP_PAGE.dungeonWord)}`);
        const facts = findAll(dungeon, hasAttr('data-fact'));
        if (facts.length < SMP_PAGE.minFacts) problems.push(`/smp/ dungeon block has ${facts.length} [data-fact], want at least ${SMP_PAGE.minFacts}`);
        const empty = facts.filter((f) => !blockText(f)).length;
        if (empty) problems.push(`/smp/ dungeon block has ${empty} empty [data-fact]`);
      }
      if (!findAll(root, hasClass(SMP_PAGE.tickerClass)).length) problems.push(`/smp/ has no market ticker (.${SMP_PAGE.tickerClass})`);
      const auctions = findAll(root, (el) => el.tag === 'a' && el.attrs.href === SMP_PAGE.auctionsHref && textOf(el) === SMP_PAGE.auctionsLabel);
      if (!auctions.length) problems.push(`/smp/ has no <a href="${SMP_PAGE.auctionsHref}"> ${q(SMP_PAGE.auctionsLabel)}`);
      problems.push(...copyButtonIn(root, '/smp/', null)[0]);
      const betas = findAll(root, hasClass('beta-tag')).length;
      if (betas) problems.push(`/smp/ has ${betas} .beta-tag, want 0`);
      const credit = occurrence(p.html, app(p), 'store credit', { ci: true });
      if (credit) problems.push(`/smp/ mentions "store credit": ${credit}`);
      for (const gone of SMP_PAGE.removed) {
        const hit = occurrence(rawBody(p), app(p), gone);
        if (hit) problems.push(`/smp/ still has ${q(gone)}: ${hit}`);
      }
      return problems;
    },
    dist,
  );
  // Not in the nav on any page; the home footer links to it.
  for (const route of Object.keys(PAGES)) {
    const p = page(route, dist);
    const nav = p && navOf(p);
    if (nav && findAll(nav, (el) => el.tag === 'a' && el.attrs.href === '/smp/').length)
      problems.push(`${route} nav links to /smp/ (the SMP page is not in the nav)`);
  }
  const home = page('/', dist);
  if (home) {
    const footer = findAll(app(home), isTag('footer'))[0];
    if (!footer || !findAll(footer, (el) => el.tag === 'a' && el.attrs.href === '/smp/').length)
      problems.push('/ footer has no link to /smp/');
  }
  return problems;
}

/** AC8 (U3): every application/ld+json block on every page parses as JSON. */
function ldJsonParses(dist) {
  return eachPage(
    Object.keys(PAGES),
    (p) => {
      const problems = [];
      p.jsonLd.forEach((raw, i) => {
        try {
          JSON.parse(raw);
        } catch (e) {
          problems.push(`${p.route} JSON-LD block ${i + 1} does not parse: ${e.message}`);
        }
      });
      return problems;
    },
    dist,
  );
}

// ------------------------------------------- U4: /pvp/ and the network nav --
//
// Hooks (the contract with the implementer):
//   /pvp/       [data-season] [data-board] [data-board-tab="<key>"]
//               [data-board-table] [data-row] [data-board-empty] [data-tiers]
//               [data-tier="<Name>"] [data-facts] [data-fact] [data-modes]
//               [data-mode] [data-copy-ip], and .beta-tag in the eyebrow.
//   every page  the nav is the first <header> in the document; its links are
//               every <a> in it except the brand link (a.site-nav-brand). The
//               active link carries aria-current="page". The BETA marker in
//               the PVP link is an element with class beta-tag OR attribute
//               data-beta. NOTE: the U3 checks home-mode-cards and smp-page
//               count .beta-tag on / and /smp/, so the nav marker must use
//               [data-beta] WITHOUT the beta-tag class.
//
// Texts are compared exactly (case-sensitive) after the same normalisation as
// U3: textOf() / blockText() (entities decoded, curly quotes straightened,
// whitespace incl. nbsp collapsed to one space and trimmed). The BETA marker is
// left out of the text of the element it sits in. "Hidden" means the HTML
// `hidden` attribute (what Preact renders for hidden={true}).

export const PVP = {
  route: '/pvp/',
  title: 'Ranked PVP Leaderboards | Chromabit',
  description:
    'ChromaPVP ranked leaderboards for Java and Bedrock. Seven tiers from Tin to Chroma, Sword and Mace ladders, tournaments.',
  canonical: 'https://chromabit.us/pvp/',
  eyebrow: 'CHROMAPVP · RANKED KIT PVP',
  h1: 'RANKED. ON BOTH EDITIONS.',
  sub: 'The only ranked competitive PVP for Java and Bedrock.',
  /** [key, label, soon] in feed order. */
  tabs: [
    ['overall', 'OVERALL', false],
    ['sword', 'SWORD', false],
    ['mace', 'MACE', false],
    ['axe', 'AXE · SOON', true],
    ['chaos', 'CHAOS · SOON', true],
    ['tournament', 'TOURNAMENT WINS', false],
  ],
  defaultTab: 'overall',
  empty: 'No ranked players yet. Play 10 placement matches to appear here.',
  note: 'Updates every minute. Players appear after 10 placement matches.',
  tiersHeading: 'SEVEN TIERS',
  tiers: [
    ['Tin', 'START'],
    ['Bronze', '1350'],
    ['Silver', '1500'],
    ['Gold', '1600'],
    ['Emerald', '1700'],
    ['Mithril', '1800'],
    ['Chroma', '1950'],
  ],
  facts: [
    ['10', 'placement matches before you get a rank'],
    ['BO3', 'every ranked duel is best of three'],
    ['III · II · I', 'three divisions in every tier below Chroma'],
    ['LVL 2', 'ranked opens at level 2'],
  ],
  modesHeading: 'WHAT YOU CAN PLAY',
  modes: [
    ['Duels', 'Ranked or unranked 1v1 on the Mythic and Magic arenas. Build your own kit layout.'],
    ['FFA Pit', 'Nine zones under the spawn. Your gear drops where you die. Stash it or extract with it.'],
    // Spec amendment U4-copy (2026-11-10): the arena has no fixed round count, and 2v2v2 takes teams of two.
    // U4-copy-2: augments are offered in rounds 1-10 only, so not "each round".
    ['Prismatic Arena', 'A shrinking ring, augment picks, and a gold shop between fights. Last team standing wins.'],
    ['Tournaments', 'Double elimination. 1000, 500 and 250 Tokens for the top three, and the Champion title.'],
    ['Parties', 'Bring up to three friends. Queue Arena 2v2v2 as a pair.'],
    ['Cosmetics', 'Earn Tokens by playing and spend them on trails, hats and titles.'],
  ],
  /** U4-copy, U4-copy-2: texts that must appear nowhere on /pvp/ (raw HTML or visible text). */
  modesForbidden: ['Ten rounds', 'each round'],
  join: 'Connect to play.chromabit.us and pick Kit PVP in the hub.',
  /** Production must not ship sample data or a fixture build. */
  sampleMarker: 'Sample_',
  fixtureBase: '/pvp-fixture',
};

/** The nav on every page: [href, label] in order. */
export const NAV_LINKS = [
  ['/', 'HOME'],
  ['/pvp/', 'PVP'],
  ['/store/', 'STORE'],
  ['/auctions/', 'AUCTIONS'],
  ['/faq/', 'FAQ'],
];
export const SITEMAP_PVP = 'https://chromabit.us/pvp/';

const isBetaMarker = (el) => hasClass('beta-tag')(el) || 'data-beta' in el.attrs;
/** Elements that are not ancestors of another element in the list. */
const innermost = (list) => list.filter((el) => !list.some((o) => o !== el && inside(o, el)));
/** The innermost elements under `node` whose textOf equals `want`. */
const withText = (node, want, skip = null) => innermost(findAll(node, (el) => textOf(el, skip) === want));
const isHidden = (el) => 'hidden' in el.attrs;
/** The site nav: the first <header> anywhere in the document (not only in #app). */
const siteNav = (p) => findAll(dom(p), isTag('header'))[0] ?? null;
const siteFooter = (p) => findAll(dom(p), isTag('footer'))[0] ?? null;

/** Run `fn` on /pvp/; a missing page is one problem. */
const onPvp = (dist, fn) => eachPage([PVP.route], fn, dist);

/** U4-AC1: /pvp/ exists, is prerendered, its head is as specified, one <h1>, JSON-LD (if any) parses. */
function pvpPage(dist) {
  return onPvp(dist, (p) => {
    const problems = [];
    const at = p.html.search(/<div\s+id\s*=\s*["']app["'][^>]*>/i);
    if (at < 0) problems.push('/pvp/ has no <div id="app">');
    else if (/^\s*<\/div>/i.test(p.html.slice(at).replace(/^<div[^>]*>/i, '')))
      problems.push('/pvp/ <div id="app"> is empty (not prerendered)');
    problems.push(
      ...expectTitle(p, PVP.title),
      ...expectMeta(p, 'description', PVP.description),
      ...expectMeta(p, 'og:site_name', NETWORK),
      ...expectMeta(p, 'author', NETWORK),
      ...expectMeta(p, 'og:title', PVP.title),
      ...expectMeta(p, 'twitter:title', PVP.title),
      ...expectMeta(p, 'og:image', OG_IMAGE_URL),
    );
    const canon = [...p.head.matchAll(/<link\b[^>]*>/gi)]
      .map((m) => parseAttrs(m[0]))
      .filter((a) => (a.rel ?? '').toLowerCase().split(/\s+/).includes('canonical'));
    if (canon.length !== 1) problems.push(`/pvp/ has ${canon.length} <link rel="canonical">, want 1`);
    else if (canon[0].href !== PVP.canonical) problems.push(`/pvp/ canonical is ${q(canon[0].href)}, want ${q(PVP.canonical)}`);
    p.jsonLd.forEach((raw, i) => {
      try {
        JSON.parse(raw);
      } catch (e) {
        problems.push(`/pvp/ JSON-LD block ${i + 1} does not parse: ${e.message}`);
      }
    });
    const h1s = findAll(dom(p), isTag('h1')).length;
    if (h1s !== 1) problems.push(`/pvp/ has ${h1s} <h1>, want 1`);
    return problems;
  });
}

/** U4-AC2: eyebrow + BETA, the h1 text, the one sub line, the hidden season strip. */
function pvpMasthead(dist) {
  return onPvp(dist, (p) => {
    const problems = [];
    const root = dom(p);
    const h1s = findAll(root, isTag('h1'));
    const h1 = h1s.length === 1 ? h1s[0] : null; // the count is pvp-page's job
    if (h1 && textOf(h1) !== PVP.h1) problems.push(`/pvp/ <h1> text is ${q(textOf(h1))}, want ${q(PVP.h1)}`);
    const brows = withText(root, PVP.eyebrow, isBetaMarker).filter((el) => findAll(el, hasClass('beta-tag')).length);
    if (brows.length !== 1) {
      const loose = withText(root, PVP.eyebrow, isBetaMarker).length;
      problems.push(
        loose
          ? `/pvp/ eyebrow ${q(PVP.eyebrow)} has no .beta-tag inside it`
          : `/pvp/ has no eyebrow ${q(PVP.eyebrow)} (text compared without the BETA tag)`,
      );
    } else {
      const [brow] = brows;
      const tags = findAll(brow, hasClass('beta-tag'));
      if (tags.length !== 1) problems.push(`/pvp/ eyebrow has ${tags.length} .beta-tag, want 1`);
      else if (textOf(tags[0]) !== 'BETA') problems.push(`/pvp/ eyebrow .beta-tag text is ${q(textOf(tags[0]))}, want "BETA"`);
      if (h1 && brow.order > h1.order) problems.push('/pvp/ eyebrow comes after the <h1>');
    }
    const subs = withText(root, PVP.sub);
    if (subs.length !== 1) problems.push(`/pvp/ has ${subs.length} sub lines ${q(PVP.sub)}, want 1`);
    const season = one(root, hasAttr('data-season'), '[data-season]', '/pvp/');
    if (typeof season === 'string') problems.push(season);
    else if (!isHidden(season)) problems.push('/pvp/ [data-season] is not hidden in the prerendered HTML (want the hidden attribute until season data loads)');
    return problems;
  });
}

/** U4-AC3: the board skeleton: six tabs, one pressed, the empty state, no rows, no sample data. */
function pvpBoard(dist) {
  const problems = onPvp(dist, (p) => {
    const problems = [];
    const root = dom(p);
    const board = one(root, hasAttr('data-board'), '[data-board]', '/pvp/');
    if (typeof board === 'string') return [board];
    const tabs = findAll(board, hasAttr('data-board-tab'));
    const keys = tabs.map((t) => t.attrs['data-board-tab']);
    const want = PVP.tabs.map(([k]) => k);
    if (keys.join(',') !== want.join(',')) problems.push(`/pvp/ board tabs are ${q(keys)}, want ${q(want)}`);
    for (const [key, label, soon] of PVP.tabs) {
      const tab = tabs.find((t) => t.attrs['data-board-tab'] === key);
      if (!tab) continue;
      if (tab.tag !== 'button') problems.push(`/pvp/ tab ${key} is a <${tab.tag}>, want <button>`);
      if (textOf(tab) !== label) problems.push(`/pvp/ tab ${key} label is ${q(textOf(tab))}, want ${q(label)}`);
      if (soon && !('disabled' in tab.attrs)) problems.push(`/pvp/ tab ${key} is not disabled (soon)`);
      if (!soon && 'disabled' in tab.attrs) problems.push(`/pvp/ tab ${key} is disabled`);
    }
    const pressed = tabs.filter((t) => t.attrs['aria-pressed'] === 'true').map((t) => t.attrs['data-board-tab']);
    if (pressed.length !== 1) problems.push(`/pvp/ has ${pressed.length} tabs with aria-pressed="true" (${q(pressed)}), want 1`);
    else if (pressed[0] !== PVP.defaultTab) problems.push(`/pvp/ pressed tab is ${q(pressed[0])}, want ${q(PVP.defaultTab)}`);
    const empty = one(board, hasAttr('data-board-empty'), '[data-board-empty]', '/pvp/ board');
    if (typeof empty === 'string') problems.push(empty);
    else {
      if (textOf(empty) !== PVP.empty) problems.push(`/pvp/ [data-board-empty] text is ${q(textOf(empty))}, want ${q(PVP.empty)}`);
      if (isHidden(empty)) problems.push('/pvp/ [data-board-empty] is hidden in the prerendered HTML');
    }
    const rows = findAll(root, hasAttr('data-row')).length;
    if (rows) problems.push(`/pvp/ prerendered HTML has ${rows} [data-row], want 0`);
    if (p.html.includes(PVP.sampleMarker)) problems.push(`/pvp/ contains sample data (${q(PVP.sampleMarker)})`);
    if (!withText(root, PVP.note).length) problems.push(`/pvp/ has no note ${q(PVP.note)}`);
    return problems;
  });
  // A fixture build (VITE_PVP_BASE=/pvp-fixture, for test/browser_check.mjs) must never be what ships.
  const assets = join(dist, 'assets');
  if (existsSync(assets)) {
    for (const f of readdirSync(assets).filter((f) => f.endsWith('.js'))) {
      if (readFileSync(join(assets, f), 'utf-8').includes(PVP.fixtureBase))
        problems.push(`dist/assets/${f} contains ${q(PVP.fixtureBase)} (a fixture build; rebuild without VITE_PVP_BASE)`);
    }
  }
  return problems;
}

/** U4-AC4: SEVEN TIERS, seven [data-tier] items in order, each with its name and minimum. */
function pvpTiers(dist) {
  return onPvp(dist, (p) => {
    const problems = [];
    const block = one(dom(p), hasAttr('data-tiers'), '[data-tiers]', '/pvp/');
    if (typeof block === 'string') return [block];
    if (!findAll(block, isHeading).some((h) => textOf(h) === PVP.tiersHeading))
      problems.push(`/pvp/ [data-tiers] has no heading ${q(PVP.tiersHeading)}`);
    const items = findAll(block, hasAttr('data-tier'));
    const names = items.map((t) => t.attrs['data-tier']);
    const want = PVP.tiers.map(([n]) => n);
    if (names.join(',') !== want.join(',')) problems.push(`/pvp/ [data-tier] values are ${q(names)}, want ${q(want)}`);
    for (const [name, min] of PVP.tiers) {
      const item = items.find((t) => t.attrs['data-tier'] === name);
      if (!item) continue;
      if (!findAll(item, (el) => textOf(el) === name).length)
        problems.push(`/pvp/ tier ${name} does not show its name ${q(name)} in its own element`);
      if (!findAll(item, (el) => textOf(el) === min).length)
        problems.push(`/pvp/ tier ${name} does not show its minimum ${q(min)} in its own element (text ${q(blockText(item))})`);
    }
    return problems;
  });
}

/** U4-AC5: four [data-fact] items in [data-facts], each a value and a label in their own elements. */
function pvpFacts(dist) {
  return onPvp(dist, (p) => {
    const problems = [];
    const block = one(dom(p), hasAttr('data-facts'), '[data-facts]', '/pvp/');
    if (typeof block === 'string') return [block];
    const facts = findAll(block, hasAttr('data-fact'));
    if (facts.length !== PVP.facts.length) problems.push(`/pvp/ [data-facts] has ${facts.length} [data-fact], want ${PVP.facts.length}`);
    PVP.facts.forEach(([value, label], i) => {
      const f = facts[i];
      if (!f) return;
      const hasValue = findAll(f, (el) => textOf(el) === value).length > 0;
      const hasLabel = findAll(f, (el) => textOf(el) === label).length > 0;
      if (!hasValue || !hasLabel)
        problems.push(`/pvp/ fact ${i + 1} is ${q(blockText(f))}, want value ${q(value)} and label ${q(label)} each in its own element`);
    });
    return problems;
  });
}

/** U4-AC6: WHAT YOU CAN PLAY, six [data-mode] cards in order with title heading and exact description. */
function pvpModes(dist) {
  return onPvp(dist, (p) => {
    const problems = [];
    const block = one(dom(p), hasAttr('data-modes'), '[data-modes]', '/pvp/');
    if (typeof block === 'string') return [block];
    if (!findAll(block, isHeading).some((h) => textOf(h) === PVP.modesHeading))
      problems.push(`/pvp/ [data-modes] has no heading ${q(PVP.modesHeading)}`);
    const cards = findAll(block, hasAttr('data-mode'));
    if (cards.length !== PVP.modes.length) problems.push(`/pvp/ [data-modes] has ${cards.length} [data-mode], want ${PVP.modes.length}`);
    PVP.modes.forEach(([title, desc], i) => {
      const c = cards[i];
      if (!c) return;
      const titles = findAll(c, isHeading).map((h) => textOf(h));
      if (!titles.includes(title)) problems.push(`/pvp/ mode ${i + 1} has no heading ${q(title)} (headings: ${q(titles)})`);
      if (!findAll(c, (el) => textOf(el) === desc).length) problems.push(`/pvp/ mode ${q(title)} has no description ${q(desc)}`);
    });
    for (const gone of PVP.modesForbidden) {
      const hit = occurrence(p.html, app(p), gone);
      if (hit) problems.push(`/pvp/ mentions ${q(gone)}: ${hit}`);
    }
    return problems;
  });
}

/** U4-AC7: the join line, exactly one COPY IP; no "store credit" (any case) or "Chromabit SMP" on /pvp/. */
function pvpJoin(dist) {
  return onPvp(dist, (p) => {
    const problems = [];
    const root = dom(p);
    if (!withText(root, PVP.join).length) problems.push(`/pvp/ has no join line ${q(PVP.join)}`);
    problems.push(...copyButtonIn(root, '/pvp/')[0]);
    const credit = occurrence(p.html, app(p), 'store credit', { ci: true });
    if (credit) problems.push(`/pvp/ mentions "store credit": ${credit}`);
    const smp = occurrence(p.html, app(p), SMP_NAME);
    if (smp) problems.push(`/pvp/ mentions ${q(SMP_NAME)}: ${smp}`);
    return problems;
  });
}

/** U4-AC8: on every page the nav is HOME PVP STORE AUCTIONS FAQ, PVP has BETA, PVP active only on /pvp/; footer links PVP. */
function navLinks(dist) {
  return eachPage(
    ALL_ROUTES,
    (p) => {
      const problems = [];
      const r = p.route;
      const nav = siteNav(p);
      if (!nav) problems.push(`${r} has no nav <header>`);
      else {
        const links = findAll(nav, (el) => el.tag === 'a' && !hasClass('site-nav-brand')(el));
        const got = links.map((a) => [a.attrs.href ?? '', textOf(a, isBetaMarker)]);
        if (q(got) !== q(NAV_LINKS)) problems.push(`${r} nav links are ${q(got)}, want ${q(NAV_LINKS)}`);
        for (const a of links) {
          const marks = findAll(a, isBetaMarker);
          if (a.attrs.href === '/pvp/') {
            if (marks.length !== 1) problems.push(`${r} nav PVP link has ${marks.length} BETA markers, want 1`);
            else if (textOf(marks[0]) !== 'BETA') problems.push(`${r} nav PVP BETA marker text is ${q(textOf(marks[0]))}, want "BETA"`);
          } else if (marks.length) problems.push(`${r} nav link ${a.attrs.href} has a BETA marker (only PVP has one)`);
        }
        const active = links.filter((a) => a.attrs['aria-current'] === 'page').map((a) => a.attrs.href);
        if (r === PVP.route) {
          if (active.join(',') !== '/pvp/') problems.push(`/pvp/ nav aria-current="page" links are ${q(active)}, want ["/pvp/"]`);
        } else {
          if (active.includes('/pvp/')) problems.push(`${r} nav marks PVP as the current page`);
          if (active.length > 1) problems.push(`${r} nav has ${active.length} aria-current="page" links`);
        }
      }
      const footer = siteFooter(p);
      if (!footer) problems.push(`${r} has no <footer>`);
      else {
        const pvp = findAll(footer, (el) => el.tag === 'a' && el.attrs.href === '/pvp/');
        if (pvp.length !== 1) problems.push(`${r} footer has ${pvp.length} links to /pvp/, want 1`);
        else if (textOf(pvp[0]) !== 'PVP') problems.push(`${r} footer /pvp/ link label is ${q(textOf(pvp[0]))}, want "PVP"`);
      }
      return problems;
    },
    dist,
  );
}

/** U4-AC9: dist/sitemap.xml lists https://chromabit.us/pvp/ once. */
function sitemapPvp(dist) {
  const file = join(dist, 'sitemap.xml');
  if (!existsSync(file)) return ['dist/sitemap.xml missing'];
  const locs = [...readFileSync(file, 'utf-8').matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)].map((m) => decode(m[1]));
  const n = locs.filter((l) => l === SITEMAP_PVP).length;
  return n === 1 ? [] : [`dist/sitemap.xml lists ${SITEMAP_PVP} ${n} times, want 1`];
}

/**
 * U4-AC10: every href starting with a single "/" on every page (a, link, ...)
 * resolves to a file in dist: query and fragment dropped, percent-decoded,
 * "/x/" -> x/index.html, "/x" -> the file x or x/index.html (GitHub Pages
 * serves a directory's index.html for both).
 */
function internalLinks(dist) {
  return eachPage(
    ALL_ROUTES,
    (p) => {
      const problems = [];
      const seen = new Set();
      for (const el of findAll(dom(p), (el) => typeof el.attrs.href === 'string')) {
        const href = el.attrs.href.trim();
        if (!href.startsWith('/') || href.startsWith('//') || seen.has(href)) continue;
        seen.add(href);
        let path = href.replace(/[?#].*$/, '');
        try {
          path = decodeURIComponent(path);
        } catch {
          problems.push(`${p.route} <${el.tag} href=${q(href)}> is not a valid URL path`);
          continue;
        }
        const isFile = (f) => existsSync(f) && statSync(f).isFile();
        const target = join(dist, path);
        const ok = path.endsWith('/') ? isFile(join(target, 'index.html')) : isFile(target) || isFile(join(target, 'index.html'));
        if (!ok) problems.push(`${p.route} <${el.tag} href=${q(href)}> does not resolve to a file in dist`);
      }
      return problems;
    },
    dist,
  );
}

/** U4-AC11 (U3 review F4): the landing JOIN link opened in a new tab has rel containing noopener. */
function homeJoinRel(dist) {
  return eachPage(
    ['/'],
    (p) => {
      const problems = [];
      for (const a of findAll(dom(p), (el) => el.tag === 'a' && 'data-discord-join' in el.attrs)) {
        if ((a.attrs.target ?? '').toLowerCase() !== '_blank') continue;
        const rel = (a.attrs.rel ?? '').toLowerCase().split(/\s+/);
        if (!rel.includes('noopener')) problems.push(`/ JOIN link has target="_blank" and rel=${q(a.attrs.rel ?? '')}, want rel containing "noopener"`);
      }
      return problems;
    },
    dist,
  );
}

/** U4-copy (review F4): the privacy page names mc-heads.net (player head images on the PVP pages). */
export const PRIVACY_MC_HEADS = 'mc-heads.net';
function privacyMcHeads(dist) {
  return eachPage(
    ['/privacy/'],
    (p) => (textOf(app(p)).includes(PRIVACY_MC_HEADS) ? [] : [`/privacy/ prerendered body does not mention ${q(PRIVACY_MC_HEADS)}`]),
    dist,
  );
}

/** Ordered list of [name, fn(dist) -> problems[]]. Append new checks at the end. */
export const CHECKS = [
  ['pages-prerendered', pagesPrerendered],
  ['home-head', homeHead],
  ['site-name-author', siteNameAndAuthor],
  ['subpage-titles', subpageTitles],
  ['smp-name-allowlist', smpNameAllowlist],
  ['og-preview-image', ogPreviewImage],
  ['home-no-store-credit', homeNoStoreCredit],
  // U3: landing page and /smp/
  ['home-hero', homeHero],
  ['home-join-box', homeJoinBox],
  ['home-claim', homeClaim],
  ['home-mode-cards', homeModeCards],
  ['home-copy-buttons', homeCopyButtons],
  ['home-removed', homeRemoved],
  ['smp-page', smpPage],
  ['ld-json-parses', ldJsonParses],
  // U4: /pvp/ and the network nav
  ['pvp-page', pvpPage],
  ['pvp-masthead', pvpMasthead],
  ['pvp-board', pvpBoard],
  ['pvp-tiers', pvpTiers],
  ['pvp-facts', pvpFacts],
  ['pvp-modes', pvpModes],
  ['pvp-join', pvpJoin],
  ['nav-links', navLinks],
  ['sitemap-pvp', sitemapPvp],
  ['internal-links', internalLinks],
  ['home-join-rel', homeJoinRel],
  ['privacy-mc-heads', privacyMcHeads],
];

// -------------------------------------------------------------------- main --

export function run(dist = DIST, log = console.log) {
  let failed = 0;
  if (!existsSync(dist)) log(`(no ${dist}: run \`npm run build\` first)`);
  for (const [name, fn] of CHECKS) {
    let problems;
    try {
      problems = fn(dist);
    } catch (e) {
      problems = [`threw ${e?.stack?.split('\n')[0] ?? e}`];
    }
    if (problems.length) {
      failed++;
      log(`FAIL ${name}: ${problems.join('; ')}`);
    } else {
      log(`PASS ${name}`);
    }
  }
  log(failed ? `RESULT: FAIL ${failed} of ${CHECKS.length}` : `RESULT: PASS ${CHECKS.length} checks`);
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run();
}
