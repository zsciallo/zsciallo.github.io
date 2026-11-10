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

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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
/**
 * U7: the profile shell. Kept out of PAGES and ALL_ROUTES on purpose (as U4
 * did for /pvp/) so every earlier check keeps exactly its scope; the U7 checks
 * read it through fileOf and check its head, nav and links themselves.
 */
export const PLAYER_PAGES = { '/pvp/player/': 'pvp/player/index.html' };
const fileOf = (route) => PAGES[route] ?? PVP_PAGES[route] ?? PLAYER_PAGES[route];

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
  /** Owner ruling 2026-11-10: neither mode card has a badge line; these texts appear nowhere on /. */
  cardBadgesForbidden: ['COMPETITIVE · JAVA + BEDROCK', 'SURVIVAL · JAVA + BEDROCK'],
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
      for (const bad of LANDING.cardBadgesForbidden) {
        const hit = occurrence(p.html, app(p), bad);
        if (hit) problems.push(`/ mentions ${q(bad)} (mode cards have no badge line): ${hit}`);
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
//               active link carries aria-current="page". Owner ruling
//               2026-11-10: NO BETA marker in any nav (no [data-beta], no
//               .beta-tag inside a <header> or <nav>); the PVP link text is
//               exactly "PVP". (Superseded: Amendment 2's BETA in the nav.)
//               The /pvp/ eyebrow and the landing pvp card keep .beta-tag.
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
  /** Owner ruling 2026-11-10: section labels removed; these texts appear nowhere on /pvp/. */
  labelsForbidden: ['THE CLIMB', 'MORE THAN DUELS', 'JOIN AND PLACE'],
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

/** U4-AC8: on every page the nav is HOME PVP STORE AUCTIONS FAQ, no BETA marker in any nav (owner ruling 2026-11-10), PVP active only on /pvp/; footer links PVP. */
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
        const got = links.map((a) => [a.attrs.href ?? '', textOf(a)]);
        if (q(got) !== q(NAV_LINKS)) problems.push(`${r} nav links are ${q(got)}, want ${q(NAV_LINKS)}`);
        const active = links.filter((a) => a.attrs['aria-current'] === 'page').map((a) => a.attrs.href);
        // Owner ruling 2026-11-10: no BETA marker in any nav (the site <header> and every <nav>).
        const navs = [nav, ...findAll(dom(p), isTag('nav')).filter((n) => !inside(n, nav))];
        const marks = navs.flatMap((n) => findAll(n, isBetaMarker));
        if (marks.length)
          problems.push(`${r} nav has ${marks.length} BETA marker(s) ([data-beta] or .beta-tag), want 0 (first: <${marks[0].tag}> ${q(textOf(marks[0]))})`);
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

/** Owner ruling 2026-11-10: the /pvp/ section labels THE CLIMB, MORE THAN DUELS, JOIN AND PLACE are gone. */
function pvpLabelsRemoved(dist) {
  return onPvp(dist, (p) => {
    const problems = [];
    for (const gone of PVP.labelsForbidden) {
      const hit = occurrence(p.html, app(p), gone);
      if (hit) problems.push(`/pvp/ mentions ${q(gone)}: ${hit}`);
    }
    return problems;
  });
}

// ------------------------------------------------ U5: the network FAQ --
//
// Hooks (the markup FaqPage.jsx renders today; the contract with the
// implementer): every question group is a .faq-group (its id attribute is the
// group id) holding one .faq-section-label (the group title, upper-cased by
// the page) and one .faq-item per question. Inside a .faq-item, the
// .faq-question button holds the question (its .faq-icon / aria-hidden="true"
// "+" is not part of the text) and .faq-answer holds the answer. Groups and
// items are read from the whole /faq/ document in document order.
//
// Text comparison: as U3/U4, textOf() (tags stripped with inline
// concatenation, entities decoded, curly quotes straightened, whitespace incl.
// nbsp collapsed to one space and trimmed), then exact and case-sensitive. A
// faq.json answer is compared by first stripping its markdown-lite the way
// tools/build_faq_ld.py does (**b** -> b, `c` -> c, [t](href) -> t), then the
// same norm(). JSON-LD names and answer texts get norm() too. Links in an
// answer are compared as [href, textOf(a)] pairs in order.

export const FAQ = {
  route: '/faq/',
  /** Visible label of the new group (FaqPage upper-cases the title) and its 0-based position among .faq-group. */
  pvpLabel: 'PVP',
  pvpIndex: 1,
  /** [question, answer text, links in the answer as [href, text]] in order. */
  pvp: [
    [
      'What is ChromaPVP?',
      'ChromaPVP is the network\'s kit PVP server. Join play.chromabit.us and pick Kit PVP in the hub. It has ranked and unranked duels, the FFA pit, the Prismatic Arena and tournaments.',
      [],
    ],
    [
      'How does ranked work?',
      'Play 10 placement matches on a kit to get a rank. Ranked duels are best of three. There are seven tiers, from Tin to Chroma, with three divisions in every tier below Chroma. Ranked opens at level 2.',
      [],
    ],
    ['Can Bedrock players play ranked?', 'Yes. Java and Bedrock players queue into the same matches and share one ladder.', []],
    ['Which kits are ranked?', 'Sword and Mace.', []],
    ['Where are the leaderboards?', 'On the PVP page of this site, and in game with /leaderboard.', [['/pvp/', 'PVP page']]],
    ['What happens when a season ends?', 'Each season has its own ladder. When a new season starts, everyone plays placement matches again.', []],
  ],
  /**
   * The two re-led answers. Each must equal `lead` + one space + a remainder
   * matching `rest`: the remainder starts "On the SMP," and keeps the old
   * answer's facts word for word; between "On the SMP, " and the kept text at
   * most 40 characters with no full stop (e.g. "the " or "PvP is ").
   */
  network: [
    {
      q: 'What kind of server is Chromabit?',
      lead: 'Chromabit is a network with two servers behind one address: a survival server with a player-run economy, and ChromaPVP, a ranked kit PVP server.',
      rest: /^On the SMP, [^.]{0,12}?difficulty is Hard, PvP is on in the wild, and the market is where most of the game happens: you earn by mining, farming spawners and trading, and spend on land, gear and rank\.$/,
      restDesc: '"On the SMP, ...difficulty is Hard, PvP is on in the wild, and the market is where most of the game happens: you earn by mining, farming spawners and trading, and spend on land, gear and rank."',
      notStart: 'A survival server',
    },
    {
      q: 'Is PvP on?',
      lead: null,
      rest: /^On the SMP, [^.]{0,12}?in the overworld, the Nether and the End, and in the KOTH arena\. Off at spawn, inside claims and in the dungeon\. A 15-second combat tag blocks \/home, \/spawn and teleports while you are fighting\.$/,
      restDesc: '"On the SMP, ...in the overworld, the Nether and the End, and in the KOTH arena. Off at spawn, inside claims and in the dungeon. A 15-second combat tag blocks /home, /spawn and teleports while you are fighting."',
      notStart: 'On in the overworld',
    },
  ],
  /** src/data/faq.json at c8a09be, before U5. */
  baseFixture: join(ROOT, 'test', 'fixtures', 'faq-base.json'),
  emDash: '—',
};

/** Strip faq.json markdown-lite to the text the page shows (as tools/build_faq_ld.py does), normalised. */
export function faqPlain(md) {
  return norm(md.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'));
}
/** [href, text] of every [text](href) in a faq.json answer. */
export const faqLinks = (md) => [...md.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((m) => [m[2], norm(m[1])]);

const isFaqIcon = (el) => hasClass('faq-icon')(el) || el.attrs['aria-hidden'] === 'true';

/** The FAQ as rendered: groups [{ id, label, items: [{ q, a, links }] }] plus structural problems. */
function faqModel(p) {
  if (p.faq) return p.faq;
  const problems = [];
  const groups = findAll(dom(p), hasClass('faq-group')).map((g, gi) => {
    const labels = findAll(g, hasClass('faq-section-label'));
    if (labels.length !== 1) problems.push(`/faq/ group ${gi + 1} has ${labels.length} .faq-section-label, want 1`);
    const items = findAll(g, hasClass('faq-item')).map((it, ii) => {
      const qs = findAll(it, hasClass('faq-question'));
      const as = findAll(it, hasClass('faq-answer'));
      if (qs.length !== 1) problems.push(`/faq/ group ${gi + 1} item ${ii + 1} has ${qs.length} .faq-question, want 1`);
      if (as.length !== 1) problems.push(`/faq/ group ${gi + 1} item ${ii + 1} has ${as.length} .faq-answer, want 1`);
      const a = as[0];
      return {
        q: qs[0] ? textOf(qs[0], isFaqIcon) : '',
        a: a ? textOf(a) : '',
        links: a ? findAll(a, isTag('a')).map((l) => [l.attrs.href ?? '', textOf(l)]) : [],
      };
    });
    return { id: g.attrs.id ?? '', label: labels[0] ? textOf(labels[0]) : '', items };
  });
  if (!groups.length) problems.push('/faq/ has no .faq-group');
  p.faq = { groups, problems };
  return p.faq;
}

const onFaq = (dist, fn) => eachPage([FAQ.route], fn, dist);
const allItems = (groups) => groups.flatMap((g) => g.items);

/** U5-AC1: one PVP group, directly after the first group, with the six questions and exact answers in order. */
function faqPvpGroup(dist) {
  return onFaq(dist, (p) => {
    const { groups, problems: structural } = faqModel(p);
    const problems = [...structural];
    const at = groups.map((g, i) => (g.label === FAQ.pvpLabel ? i : -1)).filter((i) => i >= 0);
    if (at.length !== 1) {
      problems.push(`/faq/ has ${at.length} groups labelled ${q(FAQ.pvpLabel)}, want 1 (labels: ${q(groups.map((g) => g.label))})`);
      return problems;
    }
    if (at[0] !== FAQ.pvpIndex)
      problems.push(`/faq/ ${q(FAQ.pvpLabel)} group is group ${at[0] + 1}, want group ${FAQ.pvpIndex + 1} (directly after the first group) (labels: ${q(groups.map((g) => g.label))})`);
    const items = groups[at[0]].items;
    const gotQs = items.map((i) => i.q);
    const wantQs = FAQ.pvp.map(([qq]) => qq);
    if (q(gotQs) !== q(wantQs)) problems.push(`/faq/ PVP questions are ${q(gotQs)}, want ${q(wantQs)}`);
    FAQ.pvp.forEach(([qq, a, links]) => {
      const item = items.find((i) => i.q === qq);
      if (!item) return;
      if (item.a !== norm(a)) problems.push(`/faq/ answer to ${q(qq)} is ${clip(item.a)}, want ${q(a)}`);
      if (item.a.includes(FAQ.emDash)) problems.push(`/faq/ answer to ${q(qq)} has an em dash`);
      if (q(item.links) !== q(links)) problems.push(`/faq/ links in the answer to ${q(qq)} are ${q(item.links)}, want ${q(links)}`);
    });
    return problems;
  });
}

/** U5-AC2: the two re-led answers; no "store credit" (any case) on /faq/. */
function faqNetworkAnswers(dist) {
  return onFaq(dist, (p) => {
    const { groups, problems: structural } = faqModel(p);
    const problems = [...structural];
    const items = allItems(groups);
    for (const spec of FAQ.network) {
      const found = items.filter((i) => i.q === spec.q);
      if (found.length !== 1) {
        problems.push(`/faq/ has ${found.length} questions ${q(spec.q)}, want 1`);
        continue;
      }
      const a = found[0].a;
      if (a.startsWith(spec.notStart)) problems.push(`/faq/ answer to ${q(spec.q)} still starts ${q(spec.notStart)}`);
      if (a.includes(FAQ.emDash)) problems.push(`/faq/ answer to ${q(spec.q)} has an em dash`);
      let rest = a;
      if (spec.lead) {
        if (!a.startsWith(`${spec.lead} `)) {
          problems.push(`/faq/ answer to ${q(spec.q)} is ${clip(a)}, want it to start ${q(spec.lead)}`);
          continue;
        }
        rest = a.slice(spec.lead.length + 1);
      }
      if (!spec.rest.test(rest))
        problems.push(`/faq/ answer to ${q(spec.q)} ${spec.lead ? 'after the network sentence ' : ''}is ${clip(rest)}, want ${spec.restDesc}`);
    }
    const credit = occurrence(p.html, dom(p), 'store credit', { ci: true });
    if (credit) problems.push(`/faq/ mentions "store credit": ${credit}`);
    return problems;
  });
}

/**
 * U5-AC3: apart from the six PVP questions (wherever they are) every group and
 * question is the base snapshot's: same groups in order (id, label), same
 * questions in order, same answers and links, except the answers of the two
 * re-led questions (their wording is faq-network-answers' job).
 */
function faqUnchanged(dist) {
  return onFaq(dist, (p) => {
    const { groups, problems: structural } = faqModel(p);
    const problems = [...structural];
    const base = JSON.parse(readFileSync(FAQ.baseFixture, 'utf-8')).groups;
    const pvpQs = new Set(FAQ.pvp.map(([qq]) => qq));
    const edited = new Set(FAQ.network.map((n) => n.q));
    const got = groups.map((g) => ({ ...g, items: g.items.filter((i) => !pvpQs.has(i.q)) })).filter((g) => g.items.length);
    const shape = (gs) => gs.map((g) => `${g.id}:${g.label}`);
    const want = base.map((g) => ({ id: g.id, label: g.title.toUpperCase(), items: g.items }));
    if (q(shape(got)) !== q(shape(want))) {
      problems.push(`/faq/ groups (besides the PVP questions) are ${q(shape(got))}, want ${q(shape(want))}`);
      return problems;
    }
    want.forEach((wg, gi) => {
      const gg = got[gi];
      const gotQs = gg.items.map((i) => i.q);
      const wantQs = wg.items.map((i) => norm(i.q));
      if (q(gotQs) !== q(wantQs)) {
        problems.push(`/faq/ group ${q(wg.id)} questions are ${q(gotQs)}, want ${q(wantQs)}`);
        return;
      }
      wg.items.forEach((wi, ii) => {
        if (edited.has(wi.q)) return;
        const gi2 = gg.items[ii];
        if (gi2.a !== faqPlain(wi.a)) problems.push(`/faq/ answer to ${q(wi.q)} changed: ${clip(gi2.a)}, want ${q(faqPlain(wi.a))}`);
        if (q(gi2.links) !== q(faqLinks(wi.a))) problems.push(`/faq/ links in the answer to ${q(wi.q)} are ${q(gi2.links)}, want ${q(faqLinks(wi.a))}`);
      });
    });
    return problems;
  });
}

/** U5-AC4: the FAQPage JSON-LD parses and matches the visible FAQ one to one; the six PVP questions are in it. */
function faqJsonLdSync(dist) {
  return onFaq(dist, (p) => {
    const { groups, problems: structural } = faqModel(p);
    const problems = [...structural];
    const { nodes, errors } = jsonLdNodes(p);
    problems.push(...errors);
    const pages = nodes.filter((n) => types(n).includes('FAQPage'));
    if (pages.length !== 1) {
      problems.push(`/faq/ has ${pages.length} JSON-LD FAQPage nodes, want 1`);
      return problems;
    }
    const entity = pages[0].mainEntity;
    if (!Array.isArray(entity)) {
      problems.push('/faq/ FAQPage mainEntity is not an array');
      return problems;
    }
    const visible = allItems(groups);
    if (entity.length !== visible.length)
      problems.push(`/faq/ FAQPage mainEntity has ${entity.length} entries, the page shows ${visible.length} questions`);
    const mismatches = [];
    entity.forEach((e, i) => {
      const v = visible[i];
      if (!types(e).includes('Question')) mismatches.push(`mainEntity ${i + 1} @type is ${q(e?.['@type'])}, want "Question"`);
      const name = typeof e?.name === 'string' ? norm(e.name) : e?.name;
      if (v && name !== v.q) mismatches.push(`mainEntity ${i + 1} name is ${q(name)}, the page shows ${q(v.q)}`);
      const ans = e?.acceptedAnswer;
      if (!ans || !types(ans).includes('Answer') || typeof ans.text !== 'string')
        mismatches.push(`mainEntity ${i + 1} (${q(name)}) has no acceptedAnswer of @type Answer with a text`);
      else if (v && norm(ans.text) !== v.a)
        mismatches.push(`mainEntity ${i + 1} (${q(name)}) answer is ${clip(norm(ans.text), 120)}, the page shows ${clip(v.a, 120)}`);
    });
    if (mismatches.length) problems.push(`/faq/ JSON-LD differs from the page: ${mismatches.slice(0, 3).join('; ')}${mismatches.length > 3 ? ` (+${mismatches.length - 3} more)` : ''}`);
    const names = new Set(entity.map((e) => (typeof e?.name === 'string' ? norm(e.name) : '')));
    const missing = FAQ.pvp.map(([qq]) => qq).filter((qq) => !names.has(qq));
    if (missing.length) problems.push(`/faq/ FAQPage JSON-LD lacks the PVP questions ${q(missing)}`);
    return problems;
  });
}

// ----------------------------------- U7: player search and the profile page --
//
// Hooks (the contract with the implementer):
//   /pvp/player/  [data-profile-state] (the loading / not-ranked / unavailable
//                 text), [data-edition], [data-profile-best], [data-kit="<key>"],
//                 [data-career], [data-recent], [data-recent-row], .beta-tag in
//                 the eyebrow, and a back link <a href="/pvp/">ALL LEADERBOARDS</a>
//                 outside the nav <header> and the <footer>.
//   /pvp/         [data-player-search] holding a <label> and its <input>, and
//                 [data-search-results] with [data-search-result] links.
// The prerendered /pvp/player/ is the loading shell: no player data at all.
// Texts compare as U3/U4 (textOf: entities decoded, curly quotes straightened,
// whitespace incl. nbsp collapsed and trimmed, case-sensitive); the eyebrow is
// compared without its BETA tag. "Hidden" is the HTML `hidden` attribute on
// the element or on any ancestor.

export const PLAYER = {
  route: '/pvp/player/',
  title: 'Player | Chromabit',
  /** Compared with whitespace removed and lower-cased, so "noindex, follow" also passes. */
  robots: 'noindex,follow',
  canonical: 'https://chromabit.us/pvp/',
  eyebrow: 'CHROMAPVP · PLAYER',
  h1: 'PLAYER',
  loading: 'Loading player.',
  /** State texts that must not show in the prerendered shell. */
  otherStates: ['Not ranked this season.', 'Player data is unavailable right now.'],
  back: ['/pvp/', 'ALL LEADERBOARDS'],
  /** Blocks that only exist once a player has loaded: absent or hidden in the shell. */
  dataBlocks: ['data-kit', 'data-career', 'data-recent', 'data-recent-row'],
  sitemapNeedle: 'chromabit.us/pvp/player',
};

export const PLAYER_SEARCH = {
  label: 'FIND A PLAYER',
  input: { type: 'search', autocomplete: 'off', maxlength: '20' },
  noMatch: 'No ranked player by that name.',
};

const hiddenUp = (el) => {
  for (let p = el; p; p = p.parent) if (p.attrs && 'hidden' in p.attrs) return true;
  return false;
};
const onPlayer = (dist, fn) => eachPage([PLAYER.route], fn, dist);

/** U7-A: the profile shell exists, is prerendered, has the spec'd head, masthead, loading state and back link, and no player data. */
function playerShell(dist) {
  return onPlayer(dist, (p) => {
    const problems = [];
    const r = PLAYER.route;
    const at = p.html.search(/<div\s+id\s*=\s*["']app["'][^>]*>/i);
    if (at < 0) problems.push(`${r} has no <div id="app">`);
    else if (/^\s*<\/div>/i.test(p.html.slice(at).replace(/^<div[^>]*>/i, ''))) problems.push(`${r} <div id="app"> is empty (not prerendered)`);
    problems.push(...expectTitle(p, PLAYER.title), ...expectMeta(p, 'og:site_name', NETWORK), ...expectMeta(p, 'author', NETWORK));
    const robots = metaValues(p, 'robots');
    if (robots.length !== 1) problems.push(`${r} has ${robots.length} robots metas, want 1`);
    else if (robots[0].replace(/\s+/g, '').toLowerCase() !== PLAYER.robots) problems.push(`${r} robots is ${q(robots[0])}, want ${q(PLAYER.robots)}`);
    const canon = [...p.head.matchAll(/<link\b[^>]*>/gi)]
      .map((m) => parseAttrs(m[0]))
      .filter((a) => (a.rel ?? '').toLowerCase().split(/\s+/).includes('canonical'));
    if (canon.length !== 1) problems.push(`${r} has ${canon.length} <link rel="canonical">, want 1`);
    else if (canon[0].href !== PLAYER.canonical) problems.push(`${r} canonical is ${q(canon[0].href)}, want ${q(PLAYER.canonical)}`);
    p.jsonLd.forEach((raw, i) => {
      try {
        JSON.parse(raw);
      } catch (e) {
        problems.push(`${r} JSON-LD block ${i + 1} does not parse: ${e.message}`);
      }
    });

    const root = dom(p);
    const h1s = findAll(root, isTag('h1'));
    if (h1s.length !== 1) problems.push(`${r} has ${h1s.length} <h1>, want 1`);
    else if (textOf(h1s[0]) !== PLAYER.h1) problems.push(`${r} <h1> text is ${q(textOf(h1s[0]))}, want ${q(PLAYER.h1)}`);
    const tags = findAll(root, hasClass('beta-tag'));
    if (tags.length !== 1) problems.push(`${r} has ${tags.length} .beta-tag, want 1`);
    const brows = withText(root, PLAYER.eyebrow, isBetaMarker).filter((el) => findAll(el, hasClass('beta-tag')).length);
    if (brows.length !== 1) {
      const loose = withText(root, PLAYER.eyebrow, isBetaMarker).length;
      problems.push(loose ? `${r} eyebrow ${q(PLAYER.eyebrow)} has no .beta-tag inside it` : `${r} has no eyebrow ${q(PLAYER.eyebrow)} (text compared without the BETA tag)`);
    } else {
      const inner = findAll(brows[0], hasClass('beta-tag'));
      if (inner.length === 1 && textOf(inner[0]) !== 'BETA') problems.push(`${r} eyebrow .beta-tag text is ${q(textOf(inner[0]))}, want "BETA"`);
      if (h1s.length === 1 && brows[0].order > h1s[0].order) problems.push(`${r} eyebrow comes after the <h1>`);
    }

    const state = one(root, hasAttr('data-profile-state'), '[data-profile-state]', r);
    if (typeof state === 'string') problems.push(state);
    else {
      if (hiddenUp(state)) problems.push(`${r} [data-profile-state] is hidden in the prerendered HTML`);
      if (!hasTextIn(state, PLAYER.loading)) problems.push(`${r} [data-profile-state] text is ${q(textOf(state))}, want an element with ${q(PLAYER.loading)}`);
    }
    for (const other of PLAYER.otherStates) {
      const shown = withText(root, other).filter((el) => !hiddenUp(el));
      if (shown.length) problems.push(`${r} prerendered shell shows ${q(other)}`);
    }

    const nav = siteNav(p);
    const footer = siteFooter(p);
    const [backHref, backText] = PLAYER.back;
    const backs = findAll(root, (el) => el.tag === 'a' && el.attrs.href === backHref && textOf(el) === backText).filter(
      (a) => !(nav && inside(a, nav)) && !(footer && inside(a, footer)),
    );
    if (!backs.length) problems.push(`${r} has no back link <a href=${q(backHref)}>${backText}</a> outside the nav and footer`);
    else if (backs.every(hiddenUp)) problems.push(`${r} back link ${q(backText)} is hidden`);

    for (const attr of PLAYER.dataBlocks) {
      const shown = findAll(root, hasAttr(attr)).filter((el) => !hiddenUp(el));
      if (shown.length) problems.push(`${r} prerendered shell shows ${shown.length} [${attr}] (want none, or hidden)`);
    }
    if (p.html.includes(PVP.sampleMarker)) problems.push(`${r} contains sample data (${q(PVP.sampleMarker)})`);
    if (p.html.includes(PVP.fixtureBase)) problems.push(`${r} contains ${q(PVP.fixtureBase)}`);
    return problems;
  });
}

/** Some element at or under `node` whose text is exactly `want`. */
function hasTextIn(node, want) {
  return textOf(node) === want || findAll(node, (el) => textOf(el) === want).length > 0;
}

/** U7-A: the profile page is not in dist/sitemap.xml (it is noindex). A missing sitemap is sitemap-pvp's failure, not this one's. */
function playerNotInSitemap(dist) {
  const file = join(dist, 'sitemap.xml');
  if (!existsSync(file)) return [];
  const locs = [...readFileSync(file, 'utf-8').matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)].map((m) => decode(m[1]));
  const hits = locs.filter((l) => l.includes(PLAYER.sitemapNeedle));
  return hits.length ? [`dist/sitemap.xml lists the profile page: ${q(hits)}`] : [];
}

/** U7-A/D: /pvp/player/ nav is HOME PVP STORE AUCTIONS FAQ with PVP the only current link, no BETA marker in any nav, footer links PVP. */
function playerNav(dist) {
  return onPlayer(dist, (p) => {
    const problems = [];
    const r = p.route;
    const nav = siteNav(p);
    if (!nav) problems.push(`${r} has no nav <header>`);
    else {
      const links = findAll(nav, (el) => el.tag === 'a' && !hasClass('site-nav-brand')(el));
      const got = links.map((a) => [a.attrs.href ?? '', textOf(a)]);
      if (q(got) !== q(NAV_LINKS)) problems.push(`${r} nav links are ${q(got)}, want ${q(NAV_LINKS)}`);
      const active = links.filter((a) => a.attrs['aria-current'] === 'page').map((a) => a.attrs.href);
      if (active.join(',') !== '/pvp/') problems.push(`${r} nav aria-current="page" links are ${q(active)}, want ["/pvp/"]`);
      const navs = [nav, ...findAll(dom(p), isTag('nav')).filter((n) => !inside(n, nav))];
      const marks = navs.flatMap((n) => findAll(n, isBetaMarker));
      if (marks.length) problems.push(`${r} nav has ${marks.length} BETA marker(s) ([data-beta] or .beta-tag), want 0`);
    }
    const footer = siteFooter(p);
    if (!footer) problems.push(`${r} has no <footer>`);
    else {
      const pvp = findAll(footer, (el) => el.tag === 'a' && el.attrs.href === '/pvp/');
      if (pvp.length !== 1) problems.push(`${r} footer has ${pvp.length} links to /pvp/, want 1`);
      else if (textOf(pvp[0]) !== 'PVP') problems.push(`${r} footer /pvp/ link label is ${q(textOf(pvp[0]))}, want "PVP"`);
    }
    return problems;
  });
}

/** U7-D: every site-internal href on /pvp/player/ resolves to a file in dist (same rule as internal-links). */
function playerInternalLinks(dist) {
  return onPlayer(dist, (p) => {
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
  });
}

/** U7-B: the prerendered /pvp/ has the search block, hidden, above the board table, with its label, input and an empty results list. */
function pvpSearchShell(dist) {
  return onPvp(dist, (p) => {
    const problems = [];
    const root = dom(p);
    const block = one(root, hasAttr('data-player-search'), '[data-player-search]', '/pvp/');
    if (typeof block === 'string') return [block];
    if (!('hidden' in block.attrs)) problems.push('/pvp/ [data-player-search] has no hidden attribute in the prerendered HTML (want hidden until players.json loads)');
    const table = findAll(root, hasAttr('data-board-table'))[0];
    if (table && block.order > table.order) problems.push('/pvp/ [data-player-search] comes after [data-board-table] (want it above the board)');
    const labels = findAll(block, isTag('label'));
    const inputs = findAll(block, isTag('input'));
    if (labels.length !== 1) problems.push(`/pvp/ [data-player-search] has ${labels.length} <label>, want 1`);
    else if (textOf(labels[0]) !== PLAYER_SEARCH.label) problems.push(`/pvp/ search <label> text is ${q(textOf(labels[0]))}, want ${q(PLAYER_SEARCH.label)}`);
    if (inputs.length !== 1) problems.push(`/pvp/ [data-player-search] has ${inputs.length} <input>, want 1`);
    else {
      const [input] = inputs;
      for (const [attr, want] of Object.entries(PLAYER_SEARCH.input))
        if (input.attrs[attr] !== want) problems.push(`/pvp/ search <input> ${attr} is ${q(input.attrs[attr] ?? null)}, want ${q(want)}`);
      if (labels.length === 1) {
        const [label] = labels;
        const linked = (label.attrs.for && label.attrs.for === input.attrs.id) || inside(input, label);
        if (!linked) problems.push(`/pvp/ search <label> is not tied to the <input> (for=${q(label.attrs.for ?? null)}, input id=${q(input.attrs.id ?? null)}, and the input is not inside the label)`);
      }
    }
    const results = findAll(block, hasAttr('data-search-results'));
    if (results.length !== 1) problems.push(`/pvp/ [data-player-search] has ${results.length} [data-search-results], want 1`);
    const items = findAll(root, hasAttr('data-search-result'));
    if (items.length) problems.push(`/pvp/ prerendered HTML has ${items.length} [data-search-result], want 0`);
    if (results.length === 1 && findAll(results[0], isTag('a')).length) problems.push('/pvp/ prerendered [data-search-results] contains links');
    const noMatch = withText(root, PLAYER_SEARCH.noMatch).filter((el) => !hiddenUp(el));
    if (noMatch.length) problems.push(`/pvp/ shows ${q(PLAYER_SEARCH.noMatch)} with an empty query`);
    return problems;
  });
}

// ======================================== U8: SEO / AEO, semantics, hints ==
//
// U8 changes nothing a visitor can see. These checks pin the head tags,
// structured data, crawl files, markup semantics and load hints, and two
// regression guards hold the visible page to the 762b268 build:
//   seo-titles-frozen        titles and approved descriptions byte-identical
//                            to test/fixtures/seo-head-base.json
//   visible-text-unchanged   blockText(#app) of every page identical to
//                            test/fixtures/visible-text-base.json
// (pixel identity is test/visual_check.mjs).
//
// Scope: "indexable" = INDEXABLE below (seven routes). /pvp/player/ is not
// indexable (noindex, canonical /pvp/, not in the sitemap: player-shell and
// player-not-in-sitemap keep asserting that); the semantics and hint checks
// cover it too (SEMANTIC_ROUTES).
//
// Normalisation: as every earlier check. Head values via metaValues()
// (entities decoded, whitespace collapsed, trimmed); page text via textOf() /
// blockText() (entities decoded, curly quotes straightened, whitespace incl.
// nbsp collapsed, trimmed). The fixture directory is test/fixtures, or the
// directory in env CHECK_SITE_FIXTURES (the self-test points it at a snapshot
// of its own fake site). `node test/check_site.mjs --snapshot <dist> [outDir]`
// writes both fixtures from a build (run once by the U8 test writer on the
// production build of 762b268; regenerating them is a test change).
//
// Not repeated here because an earlier check already pins it, with the same or
// a stricter expectation (so a defect fails the check that owns it, once):
//   og:site_name, og:image      site-name-author, og-preview-image (PAGES), pvp-page (/pvp/)
//   description, twitter:title  exact on / (home-head) and /pvp/ (pvp-page); still counted for uniqueness
//   canonical on /pvp/          pvp-page (exact)
//   one <h1>                    home-hero (/), smp-page (/smp/), pvp-page (/pvp/), player-shell (/pvp/player/)
//   a <footer>                  nav-links (the seven indexable pages), player-nav (/pvp/player/)
//   JSON-LD parse errors        ld-json-parses, pvp-page (unparsable blocks are skipped here)
//   the FAQPage node and its    faq-jsonld-sync (one to one with the visible FAQ, stricter than
//   question/answer texts       the visible-facts rule, so FAQPage subtrees are skipped there)
//   a missing sitemap, and      sitemap-pvp; player-not-in-sitemap (seo-sitemap ignores
//   profile URLs in it          <loc>s containing /pvp/player)
//   the profile page's robots/canonical  player-shell
//   the search block, the hero logo      pvp-search-shell, home-hero

export const SITE = 'https://chromabit.us';
export const INDEXABLE = ['/', '/pvp/', '/smp/', '/faq/', '/store/', '/auctions/', '/privacy/'];
export const SEMANTIC_ROUTES = [...INDEXABLE, '/pvp/player/'];
const FIXTURE_DIR = process.env.CHECK_SITE_FIXTURES ? resolve(process.env.CHECK_SITE_FIXTURES) : join(ROOT, 'test', 'fixtures');

export const SEO = {
  descMin: 70,
  descMax: 160,
  /**
   * Routes whose description is exempt from the 70-160 range. '/' is 167
   * characters at 762b268 and home-head (U2) pins it byte for byte, so U8
   * cannot shorten it without a test change: flagged to the orchestrator.
   */
  descRangeExempt: { '/': 'pinned byte-exact by home-head (U2); 167 characters at 762b268' },
  locale: 'en_US',
  imageWidth: '1200',
  imageHeight: '630',
  twitterCard: 'summary_large_image',
  robotsTokens: ['index', 'follow', 'max-image-preview:large', 'max-snippet:-1'],
  /** Review finding: the store description says "the Chromabit Minecraft server"; it becomes Chromabit wording without "server". */
  store: { route: '/store/', oldPhrase: 'the Chromabit Minecraft server', forbid: /server/i, need: 'Chromabit' },
  crawlers: ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Bingbot'],
  sitemapUrl: 'https://chromabit.us/sitemap.xml',
  /** JSON-LD keys whose numeric values are allowed (anything else is a volatile number). */
  ldNumberKeys: ['position', 'width', 'height'],
  ldForbiddenKeys: ['playersOnline', 'serverStatus', 'interactionStatistic', 'userInteractionCount', 'aggregateRating'],
  /** JSON-LD string keys that must state only facts visible on the page (or the meta description). */
  ldFactKeys: ['name', 'text', 'description', 'headline'],
  /** Node types whose strings are boilerplate (not fact-checked). */
  ldBoilerplate: ['Organization', 'WebSite'],
  /** Node types whose strings another check compares exactly (faq-jsonld-sync). */
  ldOwnedElsewhere: ['FAQPage'],
  gameAddress: 'play.chromabit.us',
  /** Head requirements an earlier check pins on that route (see the list above). */
  pinned: { '/': ['description', 'twitter:title'], '/pvp/': ['description', 'twitter:title', 'canonical'] },
  /** Routes whose single <h1> an earlier check pins. */
  h1Pinned: ['/', '/smp/', '/pvp/', '/pvp/player/'],
};

export const LLMS = {
  file: 'llms.txt',
  must: ['play.chromabit.us', '19132', '26.3', 'Java', 'Bedrock'],
  mustCi: ['ranked'],
  forbidCi: ['store credit', 'ten rounds', 'each round'],
  /**
   * Numbers allowed in llms.txt (facts already on the site): 10 placement
   * matches, level 2, 3 divisions / best of three, 7 tiers, port 19132, Java
   * 26.3, tournament Tokens 1000/500/250, Heartwood 9 zones / 4 difficulties /
   * 3 phases; 80,000 only while the built FAQ states it. Digits are read after
   * URLs are removed; commas inside a number are dropped (1,000 = 1000).
   * Number words count too (two..ninety, hundred, thousand, million); "one" is
   * not read as a number.
   */
  numbers: ['10', '2', '3', '7', '19132', '26.3', '1000', '500', '250', '9', '4'],
  conditional: { 80000: { route: '/faq/', text: '80,000' } },
};

const NUMBER_WORDS = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, million: 1000000,
};

const headEl = (p) => findAll(dom(p), isTag('head'))[0] ?? null;
const bodyEl = (p) => findAll(dom(p), isTag('body'))[0] ?? dom(p);
const headLinks = (p) => (headEl(p) ? findAll(headEl(p), isTag('link')) : []);
const relHas = (el, rel) => (el.attrs.rel ?? '').toLowerCase().split(/\s+/).includes(rel);
const pathOf = (url) => {
  try {
    return new URL(url, `${SITE}/`).pathname;
  } catch {
    return null;
  }
};
const isFileIn = (f) => existsSync(f) && statSync(f).isFile();

/** True when an absolute https://chromabit.us URL resolves to a file in dist (fragment and query ignored). */
function siteUrlResolves(url, dist) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  let path;
  try {
    path = decodeURIComponent(u.pathname);
  } catch {
    return false;
  }
  const target = join(dist, path);
  return path.endsWith('/') ? isFileIn(join(target, 'index.html')) : isFileIn(target) || isFileIn(join(target, 'index.html'));
}
const isSiteUrl = (s) => typeof s === 'string' && /^https:\/\/chromabit\.us(\/|$|#|\?)/.test(s);
const isAbsHttps = (s) => typeof s === 'string' && /^https:\/\/[^\s/]+/.test(s);

function readFixture(name) {
  const file = join(FIXTURE_DIR, name);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf-8'));
}

/** The visible text a U8 change must not alter: blockText of #app. */
export const visibleText = (p) => blockText(app(p));

/** Snapshot of titles, descriptions and visible text for the two U8 fixtures. */
export function snapshot(dist = DIST, capturedFrom = 'unknown') {
  const heads = {};
  const text = {};
  for (const route of SEMANTIC_ROUTES) {
    const p = page(route, dist);
    if (!p) continue;
    const descs = metaValues(p, 'description');
    heads[route] = { title: p.titles.length === 1 ? p.titles[0] : null, description: descs.length === 1 ? descs[0] : null };
    text[route] = visibleText(p);
  }
  const indexed = INDEXABLE.filter((r) => heads[r]);
  for (const route of Object.keys(heads)) {
    const h = heads[route];
    const d = h.description;
    const inRange = d !== null && d.length >= SEO.descMin && d.length <= SEO.descMax;
    const unique = d !== null && indexed.filter((r) => heads[r].description === d).length <= (INDEXABLE.includes(route) ? 1 : 0);
    let why = null;
    if (route === SEO.store.route) why = `store wording: "${SEO.store.oldPhrase}" becomes Chromabit wording without "server"`;
    else if (SEO.descRangeExempt[route]) why = null;
    else if (!inRange) why = `${d === null ? 'no single description' : `${d.length} characters`}, outside ${SEO.descMin}-${SEO.descMax}`;
    else if (INDEXABLE.includes(route) && !unique) why = 'not unique across the indexable pages';
    h.descriptionFrozen = why === null;
    if (why) h.released = why;
  }
  return {
    heads: { capturedFrom, note: 'Titles always frozen; a description is frozen unless "released" says why it may change.', pages: heads },
    text: {
      capturedFrom,
      normalisation: 'blockText(#app): tags stripped, script/style/template/svg text ignored, a space at every non-inline element boundary, entities decoded, curly quotes straightened, whitespace incl. nbsp collapsed to one space, trimmed',
      pages: text,
    },
  };
}

/** U8-H: head tags of every indexable page. */
function seoHead(dist) {
  const problems = [];
  const seen = { title: new Map(), description: new Map() };
  for (const route of INDEXABLE) {
    const p = page(route, dist);
    if (!p) {
      problems.push(`${route} missing (${fileOf(route)})`);
      continue;
    }
    const r = route;
    const pinned = SEO.pinned[r] ?? [];
    const html = findAll(dom(p), isTag('html'))[0];
    if (!html || html.attrs.lang !== 'en') problems.push(`${r} <html lang> is ${q(html?.attrs.lang ?? null)}, want "en"`);
    if (p.titles.length !== 1) problems.push(`${r} has ${p.titles.length} <title>, want 1`);
    else if (!p.titles[0]) problems.push(`${r} <title> is empty`);
    else seen.title.set(r, p.titles[0]);
    const descs = metaValues(p, 'description');
    if (descs.length !== 1) {
      if (!pinned.includes('description')) problems.push(`${r} has ${descs.length} meta descriptions, want 1`);
    } else {
      const d = descs[0];
      seen.description.set(r, d);
      if (!SEO.descRangeExempt[r] && !pinned.includes('description') && (d.length < SEO.descMin || d.length > SEO.descMax))
        problems.push(`${r} description is ${d.length} characters, want ${SEO.descMin}-${SEO.descMax}: ${q(d)}`);
      if (r === SEO.store.route) {
        if (d.includes(SEO.store.oldPhrase)) problems.push(`${r} description still says ${q(SEO.store.oldPhrase)}`);
        if (SEO.store.forbid.test(d)) problems.push(`${r} description contains "server": ${q(d)}`);
        if (!d.includes(SEO.store.need)) problems.push(`${r} description does not name ${q(SEO.store.need)}`);
      }
    }
    const want = `${SITE}${r}`;
    if (!pinned.includes('canonical')) {
      const canon = headLinks(p).filter((l) => relHas(l, 'canonical'));
      if (canon.length !== 1) problems.push(`${r} has ${canon.length} <link rel="canonical">, want 1`);
      else if (canon[0].attrs.href !== want) problems.push(`${r} canonical is ${q(canon[0].attrs.href ?? null)}, want ${q(want)}`);
    }
    problems.push(
      ...expectMeta(p, 'og:url', want),
      ...expectMeta(p, 'og:locale', SEO.locale),
      ...expectMeta(p, 'og:image:width', SEO.imageWidth),
      ...expectMeta(p, 'og:image:height', SEO.imageHeight),
      ...expectMeta(p, 'twitter:card', SEO.twitterCard),
      // The same image as og:image (whose URL and file og-preview-image / pvp-page pin).
      ...expectMeta(p, 'twitter:image', OG_IMAGE_URL),
    );
    for (const key of ['og:type', 'og:title', 'og:description', 'og:image:alt', 'twitter:title', 'twitter:description', 'theme-color']) {
      if (pinned.includes(key)) continue;
      const v = metaValues(p, key);
      if (v.length !== 1) problems.push(`${r} has ${v.length} ${key}, want 1`);
      else if (!v[0]) problems.push(`${r} ${key} is empty`);
    }
    const robots = metaValues(p, 'robots');
    if (robots.length !== 1) problems.push(`${r} has ${robots.length} robots metas, want 1`);
    else {
      const tokens = robots[0].toLowerCase().split(',').map((t) => t.trim());
      const missing = SEO.robotsTokens.filter((t) => !tokens.includes(t));
      if (missing.length || tokens.some((t) => t === 'noindex' || t === 'nofollow' || t === 'none'))
        problems.push(`${r} robots is ${q(robots[0])}, want ${q(SEO.robotsTokens.join(', '))} (no noindex/nofollow)`);
    }
  }
  for (const [kind, map] of Object.entries(seen)) {
    const by = new Map();
    for (const [r, v] of map) by.set(v, [...(by.get(v) ?? []), r]);
    for (const [v, rs] of by) if (rs.length > 1) problems.push(`${rs.join(' and ')} share the ${kind} ${clip(v, 80)}`);
  }
  return problems;
}

/** Digit numbers in `text` (commas dropped) that do not occur in `visible`. */
function numbersNotIn(text, visible) {
  const vis = new Set((visible.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, '')));
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, '').replace(/\.$/, '')).filter((n) => !vis.has(n));
}

/** U8-H: titles and approved descriptions stay byte-identical to the 762b268 snapshot. */
function seoTitlesFrozen(dist) {
  const base = readFixture('seo-head-base.json');
  if (!base) return [`fixture ${join(FIXTURE_DIR, 'seo-head-base.json')} missing`];
  const problems = [];
  for (const [route, b] of Object.entries(base.pages)) {
    const p = page(route, dist);
    if (!p) {
      problems.push(`${route} missing (${fileOf(route)})`);
      continue;
    }
    const title = p.titles.length === 1 ? p.titles[0] : null;
    if (title !== b.title) problems.push(`${route} title is ${q(title)}, frozen at ${q(b.title)}`);
    const descs = metaValues(p, 'description');
    const d = descs.length === 1 ? descs[0] : null;
    if (b.descriptionFrozen) {
      if (d !== b.description) problems.push(`${route} description is ${q(d)}, frozen at ${q(b.description)}`);
    } else if (d !== null) {
      // A released description is rewritten from facts on the page: every number in it is on the page.
      const extra = numbersNotIn(d, textOf(bodyEl(p)));
      if (extra.length) problems.push(`${route} rewritten description states ${q(extra)}, not in the page's visible text`);
    }
  }
  return problems;
}

/** Walk a JSON value: fn(key, value, ownerNode, typesOfNearestTypedAncestor). */
function walkLd(value, fn, key = null, owner = null, ctx = []) {
  if (Array.isArray(value)) {
    for (const v of value) walkLd(v, fn, key, owner, ctx);
    return;
  }
  if (value && typeof value === 'object') {
    const t = types(value);
    const here = t.length ? [...ctx, ...t] : ctx;
    for (const [k, v] of Object.entries(value)) {
      fn(k, v, value, here);
      walkLd(v, fn, k, value, here);
    }
  }
}

/** Parsed JSON-LD blocks of a page (unparsable blocks skipped: ld-json-parses / pvp-page report those). */
function ldBlocks(p) {
  const out = [];
  for (const raw of p.jsonLd) {
    try {
      out.push(JSON.parse(raw));
    } catch {
      /* reported elsewhere */
    }
  }
  return out;
}

/** Every object with an @type anywhere in the page's JSON-LD. */
function ldTyped(p) {
  const out = [];
  const visit = (v) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') {
      if (types(v).length) out.push(v);
      Object.values(v).forEach(visit);
    }
  };
  ldBlocks(p).forEach(visit);
  return out;
}

const ldUrl = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' ? v['@id'] ?? v.url ?? v.contentUrl ?? null : null);
const SITE_ROOT = /^https:\/\/chromabit\.us\/?$/;

function orgProblems(n, dist, where) {
  const problems = [];
  const discord = siteConfig().discord;
  if (n.name !== NETWORK) problems.push(`${where} Organization name is ${q(n.name ?? null)}, want ${q(NETWORK)}`);
  if (!SITE_ROOT.test(n.url ?? '')) problems.push(`${where} Organization url is ${q(n.url ?? null)}, want ${q(`${SITE}/`)}`);
  const logo = ldUrl(n.logo);
  if (!isSiteUrl(logo) || !siteUrlResolves(logo, dist)) problems.push(`${where} Organization logo ${q(logo)} is not an absolute ${SITE}/ URL of a file in dist`);
  const same = [].concat(n.sameAs ?? []);
  if (!same.includes(discord)) problems.push(`${where} Organization sameAs ${q(same)} lacks the Discord URL ${q(discord)}`);
  return problems;
}
function siteProblems(n, where) {
  const problems = [];
  if (typeof n.name !== 'string' || !n.name.trim()) problems.push(`${where} WebSite has no name`);
  if (!SITE_ROOT.test(n.url ?? '')) problems.push(`${where} WebSite url is ${q(n.url ?? null)}, want ${q(`${SITE}/`)}`);
  return problems;
}

/** U8-J: structured data on every indexable page. */
function seoJsonLd(dist) {
  const problems = [];
  const home = page('/', dist);
  const homeNodes = home ? ldTyped(home) : [];
  const homeOrg = homeNodes.filter((n) => types(n).includes('Organization'));
  const homeSite = homeNodes.filter((n) => types(n).includes('WebSite'));
  const orgId = homeOrg.length === 1 && !orgProblems(homeOrg[0], dist, '/').length ? homeOrg[0]['@id'] ?? null : null;
  const siteId = homeSite.length === 1 && !siteProblems(homeSite[0], '/').length ? homeSite[0]['@id'] ?? null : null;
  for (const route of INDEXABLE) {
    const p = page(route, dist);
    if (!p) {
      problems.push(`${route} missing (${fileOf(route)})`);
      continue;
    }
    const r = route;
    const blocks = ldBlocks(p);
    if (!blocks.length) {
      problems.push(`${r} has no JSON-LD`);
      continue;
    }
    for (const [i, block] of blocks.entries()) {
      for (const item of Array.isArray(block) ? block : [block]) {
        if (!item || typeof item !== 'object' || item['@context'] !== 'https://schema.org')
          problems.push(`${r} JSON-LD block ${i + 1} @context is ${q(item?.['@context'] ?? null)}, want "https://schema.org"`);
        const members = item && Array.isArray(item['@graph']) ? item['@graph'] : [item];
        for (const m of members) if (!types(m).length) problems.push(`${r} JSON-LD block ${i + 1} has a node without @type`);
      }
      walkLd(block, (k, v) => {
        if (k === '@id' && !(typeof v === 'string' && isSiteUrl(v))) problems.push(`${r} JSON-LD @id ${q(v)} is not an absolute ${SITE}/ URL`);
        if (['@id', 'url', 'item', 'logo', 'contentUrl', 'image'].includes(k) && typeof v === 'string') {
          if (!isAbsHttps(v)) problems.push(`${r} JSON-LD ${k} ${q(v)} is not an absolute https URL`);
          else if (isSiteUrl(v) && !siteUrlResolves(v, dist)) problems.push(`${r} JSON-LD ${k} ${q(v)} does not resolve to a file in dist`);
        }
        if (typeof v === 'number' && !SEO.ldNumberKeys.includes(k)) problems.push(`${r} JSON-LD ${k} is the number ${v} (no volatile numbers)`);
        if (SEO.ldForbiddenKeys.includes(k)) problems.push(`${r} JSON-LD has ${k} (volatile)`);
      });
    }
    const nodes = ldTyped(p);
    const ids = new Set();
    walkLd(blocks, (k, v) => k === '@id' && typeof v === 'string' && ids.add(v));
    // Organization and WebSite: inline, or by @id reference to the home page's nodes.
    const orgs = nodes.filter((n) => types(n).includes('Organization'));
    if (orgs.length) orgs.forEach((n) => problems.push(...orgProblems(n, dist, r)));
    else if (!(orgId && ids.has(orgId))) problems.push(`${r} has no Organization node and no @id reference to the home page's Organization${orgId ? ` (${orgId})` : ' (none valid with an @id on /)'}`);
    const sites = nodes.filter((n) => types(n).includes('WebSite'));
    if (sites.length) sites.forEach((n) => problems.push(...siteProblems(n, r)));
    else if (!(siteId && ids.has(siteId))) problems.push(`${r} has no WebSite node and no @id reference to the home page's WebSite${siteId ? ` (${siteId})` : ' (none valid with an @id on /)'}`);

    if (r === '/') {
      const games = nodes.filter((n) => types(n).includes('VideoGame') && /minecraft/i.test(n.name ?? ''));
      if (games.length !== 1) problems.push(`/ has ${games.length} VideoGame nodes named Minecraft, want 1`);
      else {
        const [g] = games;
        const platforms = [].concat(g.gamePlatform ?? []).join(' | ');
        if (!/java/i.test(platforms) || !/bedrock/i.test(platforms)) problems.push(`/ VideoGame gamePlatform is ${q(g.gamePlatform ?? null)}, want both Java and Bedrock editions`);
        const servers = [].concat(g.gameServer ?? []).filter((s) => s && types(s).includes('GameServer'));
        if (servers.length !== 1) problems.push(`/ VideoGame has ${servers.length} gameServer nodes of @type GameServer, want 1`);
        else {
          const [s] = servers;
          if (typeof s.name !== 'string' || !s.name.trim()) problems.push('/ GameServer has no name');
          let names = false;
          walkLd(s, (k, v) => typeof v === 'string' && v.includes(SEO.gameAddress) && (names = true));
          if (!isAbsHttps(s.url) && !names) problems.push(`/ GameServer has neither a url nor the address ${q(SEO.gameAddress)}`);
        }
      }
    } else {
      const crumbs = nodes.filter((n) => types(n).includes('BreadcrumbList'));
      if (crumbs.length !== 1) problems.push(`${r} has ${crumbs.length} BreadcrumbList nodes, want 1`);
      else {
        const items = [].concat(crumbs[0].itemListElement ?? []);
        const got = items.map((it) => [it?.position, ldUrl(it?.item), typeof it?.name === 'string' ? !!it.name.trim() : typeof it?.item?.name === 'string' && !!it.item.name.trim()]);
        const wantCrumbs = [[1, `${SITE}/`, true], [2, `${SITE}${r}`, true]];
        if (q(got) !== q(wantCrumbs)) problems.push(`${r} BreadcrumbList is ${q(got)} ([position, item, named]), want ${q(wantCrumbs)}`);
      }
    }
    if (r === PVP.route) {
      const pages = nodes.filter((n) => types(n).includes('WebPage'));
      if (pages.length !== 1) problems.push(`/pvp/ has ${pages.length} WebPage nodes, want 1`);
      else {
        const w = pages[0];
        if (typeof w.name !== 'string' || !w.name.trim()) problems.push('/pvp/ WebPage has no name');
        if (typeof w.description !== 'string' || !w.description.trim()) problems.push('/pvp/ WebPage has no description');
        if (w.url !== `${SITE}/pvp/`) problems.push(`/pvp/ WebPage url is ${q(w.url ?? null)}, want ${q(`${SITE}/pvp/`)}`);
      }
      // The six mode names visible on /pvp/, in page order (pvp-modes pins the page to PVP.modes).
      const lists = nodes.filter((n) => types(n).includes('ItemList'));
      const wantModes = PVP.modes.map(([t]) => t);
      if (lists.length !== 1) problems.push(`/pvp/ has ${lists.length} ItemList nodes, want 1`);
      else {
        const items = [].concat(lists[0].itemListElement ?? []);
        const names = items.map((it) => (typeof it?.name === 'string' ? it.name : it?.item?.name ?? null));
        const pos = items.map((it) => it?.position);
        if (q(names) !== q(wantModes)) problems.push(`/pvp/ ItemList names are ${q(names)}, want ${q(wantModes)}`);
        if (q(pos) !== q(wantModes.map((_, i) => i + 1))) problems.push(`/pvp/ ItemList positions are ${q(pos)}, want 1..${wantModes.length}`);
      }
    }
  }
  return problems;
}

/** U8-J: every name/text/description/headline string in a page's JSON-LD (outside Organization/WebSite) is visible on that page or is its meta description. */
function seoJsonLdVisibleFacts(dist) {
  const problems = [];
  for (const route of INDEXABLE) {
    const p = page(route, dist);
    if (!p) {
      problems.push(`${route} missing (${fileOf(route)})`);
      continue;
    }
    const body = bodyEl(p);
    const hay = [textOf(body), blockText(body)].map((t) => t.toLowerCase());
    const meta = metaValues(p, 'description').map((d) => norm(d).toLowerCase());
    const bad = [];
    walkLd(ldBlocks(p), (k, v, owner, ctx) => {
      if (!SEO.ldFactKeys.includes(k) || typeof v !== 'string') return;
      if (ctx.some((t) => SEO.ldBoilerplate.includes(t) || SEO.ldOwnedElsewhere.includes(t))) return;
      if (/^https?:\/\//.test(v.trim())) return;
      const n = norm(v).toLowerCase();
      if (!n || meta.includes(n) || hay.some((h) => h.includes(n))) return;
      bad.push(`${types(owner).join('/') || ctx.at(-1) || 'node'} ${k} ${clip(norm(v), 100)}`);
    });
    if (bad.length) problems.push(`${route} JSON-LD states what the page does not show: ${bad.slice(0, 4).join('; ')}${bad.length > 4 ? ` (+${bad.length - 4} more)` : ''}`);
  }
  return problems;
}

/** Problems with the well-formedness of a small XML document (no DTDs, no CDATA). */
export function xmlProblems(text) {
  const problems = [];
  let s = text.replace(/^﻿/, '');
  s = s.replace(/^\s*<\?xml[^?]*\?>/, '');
  if (/<\?xml/.test(s)) problems.push('XML declaration not at the start');
  const stack = [];
  let roots = 0;
  const re = /<!--[\s\S]*?-->|<[^>]*>|[^<]+/g;
  let m;
  while ((m = re.exec(s))) {
    const tok = m[0];
    if (tok.startsWith('<!--')) continue;
    if (tok.startsWith('<')) {
      const close = /^<\/([A-Za-z_][\w.:-]*)\s*>$/.exec(tok);
      const open = /^<([A-Za-z_][\w.:-]*)((?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>$/.exec(tok);
      if (close) {
        if (stack.at(-1) !== close[1]) problems.push(`</${close[1]}> closes <${stack.at(-1) ?? '(nothing)'}>`);
        else stack.pop();
      } else if (open) {
        if (!stack.length) roots++;
        if (!open[3]) stack.push(open[1]);
      } else problems.push(`malformed tag ${q(tok.slice(0, 60))}`);
    } else {
      if (!stack.length && tok.trim()) problems.push(`text outside the root: ${q(tok.trim().slice(0, 40))}`);
      for (const amp of tok.matchAll(/&([^;\s]*);?/g))
        if (!/^&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);$/i.test(amp[0])) problems.push(`bad entity ${q(amp[0])}`);
    }
    if (problems.length > 5) break;
  }
  if (stack.length) problems.push(`unclosed <${stack.join('>, <')}>`);
  if (roots !== 1) problems.push(`${roots} root elements, want 1`);
  return problems;
}

/** U8-C: dist/sitemap.xml is valid XML listing exactly the seven indexable URLs, each with a YYYY-MM-DD lastmod. */
function seoSitemap(dist) {
  const file = join(dist, 'sitemap.xml');
  if (!existsSync(file)) return []; // sitemap-pvp's failure
  const xml = readFileSync(file, 'utf-8');
  const problems = xmlProblems(xml).map((x) => `dist/sitemap.xml is not well-formed: ${x}`);
  if (!/<urlset\s[^>]*xmlns\s*=\s*"http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(xml)) problems.push('dist/sitemap.xml root is not <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  // Profile URLs are player-not-in-sitemap's failure.
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]).filter((u) => !u.includes(PLAYER.sitemapNeedle));
  const locs = [];
  for (const u of urls) {
    const loc = [...u.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)].map((m) => decode(m[1]));
    const mods = [...u.matchAll(/<lastmod>\s*([^<]*?)\s*<\/lastmod>/g)].map((m) => m[1]);
    if (loc.length !== 1) {
      problems.push(`a <url> has ${loc.length} <loc>`);
      continue;
    }
    locs.push(loc[0]);
    const day = mods.length === 1 && /^\d{4}-\d{2}-\d{2}$/.test(mods[0]) ? new Date(`${mods[0]}T00:00:00Z`) : null;
    const ok = !!day && !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === mods[0];
    if (!ok) problems.push(`${loc[0]} lastmod is ${q(mods)}, want one YYYY-MM-DD date`);
  }
  const want = INDEXABLE.map((r) => `${SITE}${r}`);
  const extra = locs.filter((l) => !want.includes(l));
  const missing = want.filter((w) => !locs.includes(w));
  const dupes = [...new Set(locs.filter((l, i) => locs.indexOf(l) !== i))];
  if (missing.length) problems.push(`dist/sitemap.xml lacks ${q(missing)}`);
  if (extra.length) problems.push(`dist/sitemap.xml lists ${q(extra)}, which are not indexable pages`);
  if (dupes.length) problems.push(`dist/sitemap.xml lists ${q(dupes)} more than once`);
  return problems;
}

/** robots.txt groups: [{ agents: [lowercased], rules: [{ field, value }] }] and the Sitemap values. */
export function robotsGroups(text) {
  const groups = [];
  const sitemaps = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === 'sitemap') {
      sitemaps.push(value);
      continue;
    }
    if (field === 'user-agent') {
      if (!lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (cur) cur.rules.push({ field, value });
  }
  return { groups, sitemaps };
}

/** U8-C: dist/robots.txt allows everyone and the named AI and search crawlers, and points at the sitemap. */
function seoRobots(dist) {
  const file = join(dist, 'robots.txt');
  if (!existsSync(file)) return ['dist/robots.txt missing'];
  const text = readFileSync(file, 'utf-8');
  const { groups, sitemaps } = robotsGroups(text);
  const problems = [];
  if (!groups.some((g) => g.agents.includes('*'))) problems.push('dist/robots.txt has no "User-agent: *" group');
  for (const g of groups)
    for (const rule of g.rules) {
      if (rule.field !== 'disallow' || !rule.value) continue;
      if (rule.value === '/') problems.push(`dist/robots.txt has "Disallow: /" for ${q(g.agents)}`);
      else {
        const blocked = INDEXABLE.filter((r) => r.startsWith(rule.value) || rule.value === '/*');
        if (blocked.length) problems.push(`dist/robots.txt "Disallow: ${rule.value}" for ${q(g.agents)} blocks ${q(blocked)}`);
      }
    }
  if (!sitemaps.includes(SEO.sitemapUrl)) problems.push(`dist/robots.txt has no "Sitemap: ${SEO.sitemapUrl}" line (has ${q(sitemaps)})`);
  for (const bot of SEO.crawlers) {
    const own = groups.filter((g) => g.agents.includes(bot.toLowerCase()));
    if (!own.length) problems.push(`dist/robots.txt has no explicit group for ${bot}`);
    else if (!own.some((g) => g.rules.some((rule) => rule.field === 'allow' && rule.value === '/'))) problems.push(`dist/robots.txt group for ${bot} has no "Allow: /"`);
  }
  return problems;
}

/** Numbers stated in `text` (digits after URLs are removed, and number words), as strings. */
export function statedNumbers(text) {
  const plain = text.replace(/https?:\/\/\S+/g, ' ');
  const digits = (plain.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, '').replace(/\.$/, ''));
  const words = (plain.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w in NUMBER_WORDS).map((w) => `${w} (${NUMBER_WORDS[w]})`);
  return { digits, words };
}

/** U8-C: dist/llms.txt for answer engines: title, the facts, absolute links to every indexable page, only allowlisted numbers. */
function seoLlms(dist) {
  const file = join(dist, LLMS.file);
  if (!existsSync(file)) return [`dist/${LLMS.file} missing`];
  const text = readFileSync(file, 'utf-8');
  const problems = [];
  const first = text.split(/\r?\n/)[0] ?? '';
  if (!first.startsWith('# ') || !first.includes('Chromabit')) problems.push(`dist/${LLMS.file} first line is ${q(first)}, want a "# " title containing "Chromabit"`);
  for (const s of LLMS.must) if (!text.includes(s)) problems.push(`dist/${LLMS.file} does not contain ${q(s)}`);
  for (const s of LLMS.mustCi) if (!text.toLowerCase().includes(s)) problems.push(`dist/${LLMS.file} does not contain ${q(s)}`);
  const flat = squash(text).toLowerCase();
  for (const s of LLMS.forbidCi) if (flat.includes(s)) problems.push(`dist/${LLMS.file} contains ${q(s)}`);
  const urls = [...text.matchAll(/https?:\/\/[^\s)\]>"'<]+/g)].map((m) => m[0].replace(/[.,;:]+$/, ''));
  const site = urls.filter((u) => /^https?:\/\/(www\.)?chromabit\.us/.test(u));
  for (const u of site) {
    if (!isSiteUrl(u)) problems.push(`dist/${LLMS.file} links ${q(u)} (want https://chromabit.us/...)`);
    else if (!siteUrlResolves(u, dist)) problems.push(`dist/${LLMS.file} links ${q(u)}, which is missing from dist`);
  }
  const missing = INDEXABLE.map((r) => `${SITE}${r}`).filter((w) => !site.includes(w));
  if (missing.length) problems.push(`dist/${LLMS.file} does not link ${q(missing)}`);
  const relative = [...text.matchAll(/\]\((\/[^)]*)\)/g)].map((m) => m[1]);
  if (relative.length) problems.push(`dist/${LLMS.file} has relative links ${q(relative)} (want absolute ${SITE}/...)`);
  const allowed = new Set(LLMS.numbers);
  for (const [n, cond] of Object.entries(LLMS.conditional)) {
    const p = page(cond.route, dist);
    if (p && textOf(bodyEl(p)).includes(cond.text)) allowed.add(n);
  }
  const { digits, words } = statedNumbers(text);
  const badDigits = [...new Set(digits.filter((d) => !allowed.has(d)))];
  const badWords = [...new Set(words.filter((w) => !allowed.has(w.match(/\((\d+)\)/)[1])))];
  if (badDigits.length || badWords.length) problems.push(`dist/${LLMS.file} states numbers that are not site facts: ${q([...badDigits, ...badWords])} (allowed: ${[...allowed].join(', ')}, seven)`);
  return problems;
}

/** U8-C: if dist/404.html exists it is noindex. */
function seo404(dist) {
  const file = join(dist, '404.html');
  if (!existsSync(file)) return [];
  const head = (readFileSync(file, 'utf-8').match(/<head[\s>][\s\S]*?<\/head>/i) ?? [''])[0];
  const robots = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => parseAttrs(m[0])).filter((a) => a.name === 'robots');
  return robots.some((a) => (a.content ?? '').toLowerCase().split(',').map((t) => t.trim()).includes('noindex')) ? [] : ['dist/404.html has no robots noindex'];
}

/** U8-S: one <h1> (where no earlier check pins it), heading levels never skip deeper (h1->h3, h2->h4) in document order. */
function a11yHeadings(dist) {
  return eachPage(
    SEMANTIC_ROUTES,
    (p) => {
      const problems = [];
      const hs = findAll(dom(p), (el) => /^h[1-6]$/.test(el.tag));
      const h1 = hs.filter((h) => h.tag === 'h1').length;
      if (h1 !== 1 && !SEO.h1Pinned.includes(p.route)) problems.push(`${p.route} has ${h1} <h1>, want 1`);
      for (let i = 1; i < hs.length; i++) {
        const a = Number(hs[i - 1].tag[1]);
        const b = Number(hs[i].tag[1]);
        if (b > a + 1) problems.push(`${p.route} <${hs[i - 1].tag}> ${clip(textOf(hs[i - 1]), 40)} is followed by <${hs[i].tag}> ${clip(textOf(hs[i]), 40)} (skips a level)`);
      }
      return problems;
    },
    dist,
  );
}

/** The accessible name of an element (aria-label, aria-labelledby, text, img alt, title). */
function accName(el, root) {
  const label = (el.attrs['aria-label'] ?? '').trim();
  if (label) return label;
  const ids = (el.attrs['aria-labelledby'] ?? '').trim().split(/\s+/).filter(Boolean);
  if (ids.length) {
    const t = ids.map((id) => {
      const target = findAll(root, (e) => e.attrs.id === id)[0];
      return target ? textOf(target) : '';
    }).join(' ').trim();
    if (t) return t;
  }
  const t = textOf(el, (e) => e.attrs['aria-hidden'] === 'true');
  if (t) return t;
  const alts = findAll(el, (e) => e.tag === 'img' && (e.attrs.alt ?? '').trim() && e.attrs['aria-hidden'] !== 'true').map((e) => e.attrs.alt.trim());
  if (alts.length) return alts.join(' ');
  return (el.attrs.title ?? '').trim();
}
const describe = (el) => `<${el.tag}${el.attrs.class ? ` class=${q(el.attrs.class)}` : ''}${el.attrs.href ? ` href=${q(el.attrs.href)}` : ''}>`;

/** U8-S: one <main>, every <nav> named when there is more than one (the <footer> is nav-links' / player-nav's). */
function a11yLandmarks(dist) {
  return eachPage(
    SEMANTIC_ROUTES,
    (p) => {
      const problems = [];
      const root = dom(p);
      const mains = findAll(root, isTag('main')).length;
      if (mains !== 1) problems.push(`${p.route} has ${mains} <main>, want 1`);
      const navs = findAll(root, isTag('nav'));
      if (navs.length > 1)
        for (const n of navs) {
          const named = (n.attrs['aria-label'] ?? '').trim() || ((n.attrs['aria-labelledby'] ?? '').trim() && accName({ tag: 'nav', attrs: { 'aria-labelledby': n.attrs['aria-labelledby'] }, children: [] }, root));
          if (!named) problems.push(`${p.route} ${describe(n)} has no aria-label or resolvable aria-labelledby (${navs.length} <nav> on the page)`);
        }
      return problems;
    },
    dist,
  );
}

/** U8-S: icon-only links and buttons are named; the /pvp/ join section is labelled; the search count is announced. */
function a11yNames(dist) {
  return eachPage(
    SEMANTIC_ROUTES,
    (p) => {
      const problems = [];
      const root = dom(p);
      for (const el of findAll(root, (e) => e.tag === 'button' || (e.tag === 'a' && 'href' in e.attrs)))
        if (!accName(el, root)) problems.push(`${p.route} ${describe(el)} has no accessible name`);
      if (p.route === PVP.route) {
        const joins = findAll(root, hasClass('pvp-join'));
        if (joins.length !== 1) problems.push(`/pvp/ has ${joins.length} .pvp-join sections, want 1`);
        else {
          const j = joins[0];
          const named = (j.attrs['aria-label'] ?? '').trim() || ((j.attrs['aria-labelledby'] ?? '').trim() && accName({ tag: j.tag, attrs: { 'aria-labelledby': j.attrs['aria-labelledby'] }, children: [] }, root));
          if (!named) problems.push('/pvp/ join section (.pvp-join) has no aria-label or resolvable aria-labelledby');
        }
        for (const block of findAll(root, hasAttr('data-player-search'))) {
          const live = findAll(block, (e) => e.attrs['aria-live'] === 'polite' || e.attrs.role === 'status');
          if (!live.length) problems.push('/pvp/ [data-player-search] has no polite live region (aria-live="polite" or role="status") for the result count');
        }
      }
      return problems;
    },
    dist,
  );
}

/** Above the first screen: inside a <header>, a <nav> or a .page-hero (the masthead every page has). */
const inHero = (el) => {
  for (let a = el.parent; a; a = a.parent) if (a.tag === 'header' || a.tag === 'nav' || hasClass('page-hero')(a)) return true;
  return false;
};

/** U8-S: every <img> has alt, width and height; images below the first screen load lazily and decode async. */
function imgAttrs(dist) {
  return eachPage(
    SEMANTIC_ROUTES,
    (p) => {
      const problems = [];
      for (const img of findAll(dom(p), isTag('img'))) {
        const what = `${p.route} <img src=${q(img.attrs.src ?? null)}>`;
        if (!('alt' in img.attrs)) problems.push(`${what} has no alt`);
        for (const dim of ['width', 'height']) if (!/^[1-9]\d*$/.test(img.attrs[dim] ?? '')) problems.push(`${what} ${dim} is ${q(img.attrs[dim] ?? null)}, want a positive integer`);
        if (!inHero(img) && (img.attrs.loading !== 'lazy' || img.attrs.decoding !== 'async'))
          problems.push(`${what} is below the first screen with loading=${q(img.attrs.loading ?? null)} decoding=${q(img.attrs.decoding ?? null)}, want "lazy" and "async"`);
      }
      return problems;
    },
    dist,
  );
}

/**
 * U8-P: font preconnects, the hero logo preload on /, no render-blocking head
 * scripts. A head <script> passes when it is type="module", async, defer or
 * application/ld+json. The one inline script allowed to block is the
 * font-ready snippet, recognised by this marker: no src, its text contains both
 * "fonts-ready" and "document.fonts", and it is at most 2000 characters (about
 * 950 today); only the first such script is allowed.
 */
function perfHints(dist) {
  return eachPage(
    SEMANTIC_ROUTES,
    (p) => {
      const problems = [];
      const r = p.route;
      const links = headLinks(p);
      const origin = (h) => (h ?? '').replace(/\/+$/, '');
      const pre = (host) => links.filter((l) => relHas(l, 'preconnect') && origin(l.attrs.href) === host);
      if (!pre('https://fonts.googleapis.com').length) problems.push(`${r} has no <link rel="preconnect" href="https://fonts.googleapis.com">`);
      const gs = pre('https://fonts.gstatic.com');
      if (!gs.length) problems.push(`${r} has no <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`);
      else if (!gs.some((l) => 'crossorigin' in l.attrs)) problems.push(`${r} fonts.gstatic.com preconnect has no crossorigin`);
      if (r === '/') {
        const preloads = links.filter((l) => relHas(l, 'preload') && l.attrs.as === 'image' && l.attrs.fetchpriority === 'high');
        if (!preloads.length) problems.push('/ has no <link rel="preload" as="image" fetchpriority="high">');
        const logo = findAll(dom(p), (el) => el.tag === 'img' && hasClass('logo')(el) && inHero(el))[0];
        if (logo && preloads.length && !preloads.some((l) => pathOf(l.attrs.href) === pathOf(logo.attrs.src)))
          problems.push(`/ image preload ${q(preloads.map((l) => l.attrs.href))} is not the hero logo ${q(logo.attrs.src ?? null)}`);
      }
      const head = headEl(p);
      let fontReady = 0;
      for (const s of head ? findAll(head, isTag('script')) : []) {
        const type = (s.attrs.type ?? '').toLowerCase();
        if (type === 'module' || 'async' in s.attrs || 'defer' in s.attrs || type === 'application/ld+json') continue;
        const body = s.children.map((c) => c.text ?? '').join('');
        if (!('src' in s.attrs) && body.includes('fonts-ready') && body.includes('document.fonts') && body.length <= 2000 && fontReady++ === 0) continue;
        problems.push(`${r} head has a render-blocking <script${s.attrs.src ? ` src=${q(s.attrs.src)}` : ` (inline, ${body.length} chars)`}>`);
      }
      return problems;
    },
    dist,
  );
}

/** U8-P (review finding): PVP pages send no referrer (avatar requests leaked the origin); other pages keep the default. */
export const REFERRER = { routes: ['/pvp/', '/pvp/player/'], content: 'no-referrer' };
function pvpReferrer(dist) {
  return eachPage(
    SEMANTIC_ROUTES,
    (p) => {
      const v = metaValues(p, 'referrer');
      if (REFERRER.routes.includes(p.route))
        return v.length === 1 && v[0] === REFERRER.content ? [] : [`${p.route} referrer metas are ${q(v)}, want [${q(REFERRER.content)}]`];
      return v.length ? [`${p.route} has a referrer meta ${q(v)} (only the PVP pages change referrer behaviour)`] : [];
    },
    dist,
  );
}

/** U8-V: the visible text of #app on every page is the 762b268 snapshot's, exactly. */
function visibleTextUnchanged(dist) {
  const base = readFixture('visible-text-base.json');
  if (!base) return [`fixture ${join(FIXTURE_DIR, 'visible-text-base.json')} missing`];
  const problems = [];
  for (const [route, want] of Object.entries(base.pages)) {
    const p = page(route, dist);
    if (!p) {
      problems.push(`${route} missing (${fileOf(route)})`);
      continue;
    }
    const got = visibleText(p);
    if (got === want) continue;
    let i = 0;
    while (i < got.length && i < want.length && got[i] === want[i]) i++;
    problems.push(`${route} visible text differs at character ${i}: now ${clip(got.slice(Math.max(0, i - 30), i + 50), 90)}, was ${clip(want.slice(Math.max(0, i - 30), i + 50), 90)} (${got.length} vs ${want.length} chars)`);
  }
  return problems;
}

// ------------------------------------------------------------------- U9 --
// Card surface restyle ("C · Surface", owner 2026-11-10): the static half. The
// rendered half (computed styles on every page) is test/card_style_check.mjs,
// whose CARDS list also decides here what counts as a card.

/**
 * The surface tokens and their spec values (plan Amendment 4, amended by
 * U9-states: --surface-hover #1a1330 -> #21193c, it was 1.044:1 against
 * --surface; new --surface-selected; --divider pinned as well).
 */
export const CARD_TOKENS = {
  '--surface': '#150f27',
  '--surface-inset': '#0f0a1d',
  '--surface-hover': '#21193c',
  '--surface-selected': '#2c214f',
  '--radius-card': '10px',
  '--radius-inset': '6px',
  '--divider': '#221838',
};
/** The frost gradient as index.css defines it, whitespace-free and with the minifier's short decimals. */
const FROST_LITERAL = 'linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.01))';

/** Every built stylesheet under dist/assets, concatenated, or null when there is none. */
function builtCss(dist) {
  const dir = join(dist, 'assets');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.css')).sort();
  return files.length ? files.map((f) => readFileSync(join(dir, f), 'utf-8')).join('\n') : null;
}

/**
 * A flat list of style rules: { selectors: [..], decls: [[prop, value]], at: '@media ...' | '' }.
 * Comments and strings are respected; @media/@supports/@layer/@container are
 * descended into, @keyframes/@font-face/@property skipped.
 */
export function cssRules(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let i = 0;
  const readUntil = (stops) => {
    let s = '';
    while (i < src.length && !stops.includes(src[i])) {
      if (src[i] === '"' || src[i] === "'") {
        const q = src[i];
        let j = i + 1;
        while (j < src.length && src[j] !== q) j += src[j] === '\\' ? 2 : 1;
        s += src.slice(i, j + 1);
        i = j + 1;
      } else s += src[i++];
    }
    return s;
  };
  const skipBlock = () => {
    let depth = 0;
    do {
      readUntil(['{', '}']);
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    } while (depth > 0 && i < src.length);
  };
  const block = (at) => {
    while (i < src.length) {
      const head = readUntil(['{', '}', ';']).trim();
      if (src[i] === '}') {
        i++;
        return;
      }
      if (src[i] === ';') {
        i++;
        continue;
      }
      if (i >= src.length) return;
      if (head.startsWith('@')) {
        if (/^@(media|supports|layer|container|document)\b/.test(head)) {
          i++;
          block(`${at} ${head}`.trim());
        } else skipBlock();
        continue;
      }
      i++;
      const body = readUntil(['}']);
      i++;
      const decls = [];
      for (const d of body.split(/;(?![^(]*\))/)) {
        const k = d.indexOf(':');
        if (k > 0) decls.push([d.slice(0, k).trim().toLowerCase(), d.slice(k + 1).trim()]);
      }
      const selectors = head.split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean);
      rules.push({ selectors, decls, at });
    }
  };
  block('');
  return rules;
}

let cardClassCache = null;
/** The class names that make an element a card: the subject classes of every CARDS entry in card_style_check.mjs. */
async function loadCardClasses() {
  if (cardClassCache) return cardClassCache;
  const { CARDS, DEAD_CARD_CLASSES } = await import(new URL('./card_style_check.mjs', import.meta.url).href);
  // Card classes no page renders any more still count: their frost/hairline rules are dead CSS to delete.
  const set = new Set(DEAD_CARD_CLASSES);
  for (const c of CARDS)
    for (const sel of c.sel.split(/,(?![^(]*\))/)) {
      const subject = sel.trim().split(/\s*[\s>+~]\s*(?![^(]*\))/).pop();
      for (const m of subject.replace(/:not\([^)]*\)/g, '').matchAll(/\.([\w-]+)/g)) set.add(m[1]);
    }
  cardClassCache = set;
  return set;
}
const CARD_CLASSES = await loadCardClasses();

/** The card class a selector's subject (last compound, pseudo-elements kept apart) carries, or null. */
function cardSubject(selector) {
  const subject = selector.trim().split(/\s*[\s>+~]\s*(?![^(]*\))/).pop();
  const pseudoEl = (subject.match(/::?(before|after)\b/) ?? [])[1] ?? null;
  const bare = subject.replace(/:not\([^)]*\)/g, '').replace(/:(is|where|has)\([^)]*\)/g, '');
  for (const m of bare.matchAll(/\.([\w-]+)/g)) if (CARD_CLASSES.has(m[1])) return { cls: m[1], pseudoEl };
  return null;
}

/** U9: the built CSS defines the surface tokens (CARD_TOKENS) at :root with the spec values, and nowhere else with another value. */
function cardTokens(dist) {
  const css = builtCss(dist);
  if (css == null) return ['no built CSS under dist/assets'];
  const rules = cssRules(css);
  const problems = [];
  for (const [name, want] of Object.entries(CARD_TOKENS)) {
    const decls = rules.flatMap((r) => r.decls.filter(([p]) => p === name).map(([, v]) => ({ v: v.replace(/\s*!important$/, '').trim(), r })));
    const atRoot = decls.filter(({ r }) => !r.at && r.selectors.includes(':root'));
    if (!atRoot.length) problems.push(`${name} is not declared in a top-level :root rule`);
    for (const { v, r } of decls)
      if (v.toLowerCase() !== want) problems.push(`${name} is ${JSON.stringify(v)} in ${r.selectors.join(',')}${r.at ? ` (${r.at})` : ''}, want ${want}`);
  }
  return [...new Set(problems)];
}

/** U9: no rule applies the frost gradient to a card, and no card keeps a ::before/::after hairline rule. */
function cardNoFrost(dist) {
  const css = builtCss(dist);
  if (css == null) return ['no built CSS under dist/assets'];
  const problems = [];
  for (const r of cssRules(css)) {
    const cards = r.selectors.map((s) => [s, cardSubject(s)]).filter(([, c]) => c);
    if (!cards.length) continue;
    const frost = r.decls.find(([p, v]) => /^background(-image)?$/.test(p) && (/var\(\s*--frost\s*[,)]/.test(v) || v.replace(/\s+/g, '').replace(/0\./g, '.').includes(FROST_LITERAL)));
    if (frost) for (const [s] of cards) problems.push(`${s} applies the frost gradient (${frost[0]}: ${frost[1].slice(0, 60)})`);
    const height = r.decls.find(([p]) => p === 'height');
    const hairline = height && /^(0?\.5|1|1\.5|2)px$/.test(height[1].replace(/\s*!important$/, '')) && r.decls.some(([p]) => /^background/.test(p));
    if (hairline) for (const [s, c] of cards) if (c.pseudoEl) problems.push(`${s} still draws a ${height[1]} hairline`);
  }
  return [...new Set(problems)];
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
  ['pvp-labels-removed', pvpLabelsRemoved],
  // U5: the network FAQ
  ['faq-pvp-group', faqPvpGroup],
  ['faq-network-answers', faqNetworkAnswers],
  ['faq-unchanged', faqUnchanged],
  ['faq-jsonld-sync', faqJsonLdSync],
  // U7: player search and the profile page
  ['player-shell', playerShell],
  ['player-not-in-sitemap', playerNotInSitemap],
  ['player-nav', playerNav],
  ['player-internal-links', playerInternalLinks],
  ['pvp-search-shell', pvpSearchShell],
  // U8: SEO / AEO, semantics, hints, and the no-visible-change guards
  ['seo-head', seoHead],
  ['seo-titles-frozen', seoTitlesFrozen],
  ['seo-jsonld', seoJsonLd],
  ['seo-jsonld-visible-facts', seoJsonLdVisibleFacts],
  ['seo-sitemap', seoSitemap],
  ['seo-robots', seoRobots],
  ['seo-llms', seoLlms],
  ['seo-404', seo404],
  ['a11y-headings', a11yHeadings],
  ['a11y-landmarks', a11yLandmarks],
  ['a11y-names', a11yNames],
  ['img-attrs', imgAttrs],
  ['perf-hints', perfHints],
  ['pvp-referrer', pvpReferrer],
  ['visible-text-unchanged', visibleTextUnchanged],
  // U9: card surface restyle (static half; test/card_style_check.mjs renders)
  ['card-tokens', cardTokens],
  ['card-no-frost', cardNoFrost],
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
  if (process.argv[2] === '--snapshot') {
    // U8: write test/fixtures/{seo-head-base,visible-text-base}.json from a build.
    //   node test/check_site.mjs --snapshot <distDir> [outDir] [capturedFrom]
    const dist = resolve(process.argv[3] ?? join(ROOT, 'dist'));
    const out = resolve(process.argv[4] ?? join(ROOT, 'test', 'fixtures'));
    const snap = snapshot(dist, process.argv[5] ?? 'unknown');
    writeFileSync(join(out, 'seo-head-base.json'), `${JSON.stringify(snap.heads, null, 2)}\n`);
    writeFileSync(join(out, 'visible-text-base.json'), `${JSON.stringify(snap.text, null, 2)}\n`);
    console.log(`wrote ${join(out, 'seo-head-base.json')} and ${join(out, 'visible-text-base.json')}`);
  } else {
    process.exitCode = run();
  }
}
