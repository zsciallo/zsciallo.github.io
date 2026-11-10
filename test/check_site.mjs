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

import { existsSync, readFileSync, statSync } from 'node:fs';
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

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

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
  const file = join(dist, PAGES[route]);
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
    result = { route, file: PAGES[route], html, head, metas, titles, jsonLd };
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
    if (!p) problems.push(`${route} missing (${PAGES[route]})`);
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

/** Ordered list of [name, fn(dist) -> problems[]]. Append new checks at the end. */
export const CHECKS = [
  ['pages-prerendered', pagesPrerendered],
  ['home-head', homeHead],
  ['site-name-author', siteNameAndAuthor],
  ['subpage-titles', subpageTitles],
  ['smp-name-allowlist', smpNameAllowlist],
  ['og-preview-image', ogPreviewImage],
  ['home-no-store-credit', homeNoStoreCredit],
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
