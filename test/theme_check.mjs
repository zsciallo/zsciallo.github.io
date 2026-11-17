#!/usr/bin/env node
// Theme check (run 20261117-palette, unit U1; owner palette spec 2026-11-17):
// neutral greys for page and surfaces, purple only as the accent, and a light
// theme. "Obsidian" (dark) is the default; "Quartz" (light) is the second.
//
//   node test/theme_check.mjs [--dist <distDir>] [--only <section,...>]
//       serve the build with vite preview (as test/card_style_check.mjs does:
//       its openState gives the same frozen clock, seeded Math.random, frozen
//       animations, fixture network and a true 400px viewport through the CDP
//       device-metrics override) and check the sections below.
//   node test/theme_check.mjs --snapshot <baseDistDir>
//       write test/fixtures/theme/base.json (inline head script counts and the
//       geometry of every visible element) from the BASE build. Taken once from
//       a full dist of 1043374 (.orch/runs/20261117-palette/base-dist).
//   (npm script: "test:theme": "node test/theme_check.mjs")
//
// Sections (--only takes these names):
//   static    dist HTML, no browser.
//             head-scripts  every page has exactly as many inline render-blocking
//                           head scripts as the base build (AC3);
//             head-theme    the font-ready head snippet (the one inline script
//                           check_site's perf-hints allows: "fonts-ready" and
//                           "document.fonts") holds the theme code: it names the
//                           storage key chromabit:theme, prefers-color-scheme and
//                           data-theme / dataset.theme, uses try/catch, sits in
//                           <head> (so it runs before <body> is parsed) and stays
//                           within perf-hints' 2000 characters (AC2, AC3);
//             meta-default  the prerendered <meta name="theme-color"> is #0E0F12.
//   tokens    for each theme (stored choice and OS preference both set to it),
//             the computed custom properties on <html> equal the spec (AC1):
//             TOKENS hex values (case-insensitive), ALIASES resolve to the same
//             colour as their target (and --grad-* are no gradient), --glow is
//             the theme's accent at alpha <= 0.2, --edge-line is rgba(0,0,0,.75)
//             in Obsidian, the Quartz edges are neutral; color-scheme is the
//             theme's; data-theme is 'dark' / 'light'.
//   body      computed body background-color = the theme's --bg; every colour in
//             the body background-image and in body::after is neutral (R, G, B
//             within NEUTRAL of each other: no purple literal).
//   dither    the .dither-bg canvas: painted pixels (alpha >= 24) are neutral,
//             lighter than --bg on Obsidian and darker on Quartz; after the
//             toggle is clicked the canvas repaints in the other theme's dots
//             (checked under prefers-reduced-motion, where the dither does not
//             animate, so only an explicit repaint passes).
//   switch    the theme switch on / (AC2): first visit follows the OS (emulated
//             prefers-color-scheme); a stored choice wins over the OS; the
//             attribute holds its final value before <body> is parsed and never
//             changes after (no wrong-theme flash); the toggle flips the theme,
//             stores it and updates the theme-color meta, both ways; the choice
//             survives a reload; a storage event from another tab switches the
//             theme; with localStorage throwing the page still renders with no
//             uncaught exception, follows the OS and toggles.
//   toggle    on all 8 routes, both widths, both themes: a <button class=
//             "theme-toggle"> with an aria-label, a sibling right next to
//             .sound-toggle in the nav, rendered; data-theme and the theme-color
//             meta match the theme the page was opened in.
//   geometry  on all 8 routes at 400px and 1280px, in the dark AND the light
//             theme: the bounding box (x, y, width, height in document
//             coordinates, rounded to 1px) of every visible element equals the
//             base build's (test/fixtures/theme/base.json) (AC4). Elements are
//             keyed by their element path from <body> (child index + tag), with
//             the new .theme-toggle (and its subtree) left out of the path, so
//             it is the one allowed new element. NAV_GROUP (and their
//             descendants) may move along x only: the toggle shifts them
//             sideways in the bar. Nothing else may move, appear or vanish.
//             Runtime data is deterministic through card_style_check's fixtures
//             (PVP feed, market data, status, Tebex); GEOMETRY_EXCLUDE is empty.
//   wells     (round 2, amendment B1) on / at 400 and 1280, both themes: every
//             rendered .mode-live (the TOP OF THE LADDER / TODAY'S TOP MOVERS
//             well inside the Home mode cards) has the computed background of
//             --inset-on-surface (Obsidian #090A0C, Quartz #0E0F12: dark in both),
//             and every visible text node inside it, tier colours and the
//             up/down percentages included, is >= 4.5:1 against what is behind it.
//   glow      (round 2, amendment B2) on / at 1280, both themes: the hero title
//             (TITLES) and the claim-band title carry no glow of their own
//             (text-shadow none, no drop-shadow filter, nor on any ancestor);
//             their highlighted-word spans (.accent) have either no shadow or
//             only shadows in the theme's --accent at alpha <= GLOW_TITLE_ALPHA:
//             no pink (no colour with R > B) and no dark drop in either theme.
//   plant     the geometry comparator on a real page of the build under test:
//             a .theme-toggle planted beside the sound toggle (when the build
//             has none) passes; main 1px lower, the brand 1px right, or the
//             sound toggle 2px lower each fail.
//   self      pure checks of the comparators (geometry diff, neutrality), so
//             the geometry check is proven to fail on a real layout change.
//
// Output: one `PASS <name>` / `FAIL <name>: <why>` per check, then
// `RESULT: PASS n checks` or `RESULT: FAIL k of n`; exit 0 or 1.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FREEZE_ANIMATIONS, ROOT, findChrome, sleep } from './visual_check.mjs';
import { openState, withBrowser } from './card_style_check.mjs';

export const THEME_KEY = 'chromabit:theme';
export const THEMES = ['dark', 'light'];
export const THEME_COLOR = { dark: '#0e0f12', light: '#f2f3f5' };
/** The owner's palette (2026-11-17), with the plan's four contrast fixes. Hex compared case-insensitively. */
export const TOKENS = {
  dark: {
    '--bg': '#0e0f12', '--bg2': '#1c1e24', '--bg3': '#272a32',
    '--surface': '#1c1e24', '--surface-inset': '#090a0c', '--surface-hover': '#272a32', '--surface-selected': '#3a3e49',
    '--divider': '#23252c', '--border': '#32363f',
    '--text': '#f2f3f5', '--muted': '#9ca0ab', '--text-on-surface': '#f2f3f5', '--muted-on-surface': '#a6abb6',
    '--accent': '#c77dff', '--accent-deep': '#9a4dff', '--accent-on-surface': '#c77dff', '--on-accent': '#120a1f',
    '--positive': '#5be3a0', '--positive-on-surface': '#5be3a0',
    '--edge-raised': '#3a3e49', '--edge-dark': '#1c1e24',
    // Round 2 amendment B1: wells inside dark cards stay dark in both themes.
    '--inset-on-surface': '#090a0c',
  },
  light: {
    '--bg': '#f2f3f5', '--bg2': '#e6e8ec', '--bg3': '#d3d6dc',
    '--surface': '#16181d', '--surface-inset': '#e6e8ec', '--surface-hover': '#23262d', '--surface-selected': '#3a3e49',
    '--divider': '#d3d6dc', '--border': '#d3d6dc',
    '--text': '#16181d', '--muted': '#565b66', '--text-on-surface': '#f2f3f5', '--muted-on-surface': '#a6abb6',
    '--accent': '#7b2fe0', '--accent-deep': '#5a1fb0', '--accent-on-surface': '#c77dff', '--on-accent': '#ffffff',
    '--positive': '#0b6b40', '--positive-on-surface': '#5be3a0',
    '--inset-on-surface': '#0e0f12',
  },
};
/** Both themes: the token resolves to exactly the colour of its target (and is no gradient). */
export const ALIASES = {
  '--accent-2': '--accent',
  '--grad-text': '--accent',
  '--grad-cta': '--accent',
  '--border-pink': '--border',
  '--edge-primary': '--accent-deep',
  '--edge-lit': '--accent',
};
/** Obsidian's edge line; Quartz edges are the implementer's choice but must be neutral. */
export const EDGE_LINE_DARK = [0, 0, 0, 0.75];
export const QUARTZ_NEUTRAL = ['--edge-raised', '--edge-dark', '--edge-line'];
export const GLOW_MAX_ALPHA = 0.2;
/** Neutral: R, G and B within this many steps of each other (the old accent #c77dff spreads 130, the old body gradient stop #150b29 30, #0e0f12 4). */
export const NEUTRAL = 24;
/** Dither dots must differ from --bg by at least this much (mean of R, G, B) in the theme's direction. */
export const DOT_STEP = 40;
/** B1: text inside a well, against the well. */
export const WELL_TEXT_MIN = 4.5;
/** B2: the Home titles (real selectors, src/App.jsx and src/components/ClaimBand.jsx) and their highlighted words. */
export const TITLES = [
  { name: 'hero title', title: '.home-hero .hero-title', hl: '.home-hero .hero-title .accent' },
  { name: 'claim title', title: '.claim-band .claim-title', hl: '.claim-band .claim-title .accent' },
];
export const GLOW_TITLE_ALPHA = 0.35;

export const ROUTES = [
  { path: '/', ready: '.mode-card', file: 'index.html' },
  { path: '/pvp/', ready: '.pvp-table', file: 'pvp/index.html' },
  { path: '/pvp/player/', ready: '.pvp-profile-state', file: 'pvp/player/index.html' },
  { path: '/store/', ready: '.pkg-card', file: 'store/index.html' },
  { path: '/auctions/', ready: '.market-row', file: 'auctions/index.html' },
  { path: '/faq/', ready: '.faq-item', file: 'faq/index.html' },
  { path: '/smp/', ready: '.fact', file: 'smp/index.html' },
  { path: '/privacy/', ready: 'main', file: 'privacy/index.html' },
];
export const WIDTHS = [400, 1280];
/** The new element: left out of every element path, so it is the one box allowed to appear. */
export const NEW_ELEMENT = '.theme-toggle';
/**
 * The nav control group the toggle joins: the bar is brand | links (pushed
 * right) | sound | menu, so a new button beside the sound toggle moves these
 * sideways. They and their descendants may change x only; y, width and height
 * stay. The brand, the bar itself and everything outside the nav may not move.
 */
export const NAV_GROUP = ['.site-nav-inner > .site-nav-links', '.site-nav-inner > .sound-toggle', '.site-nav-inner > .nav-toggle'];
/** Elements left out of the geometry comparison, each with the reason. None: the fixtures make every page deterministic. */
export const GEOMETRY_EXCLUDE = [];

const FIX_DIR = join(ROOT, 'test', 'fixtures', 'theme');
export const BASE_FILE = join(FIX_DIR, 'base.json');

// ------------------------------------------------------------------ run --

let passed = 0;
let failed = 0;
function check(name, problems) {
  const list = [].concat(problems ?? []).filter(Boolean);
  if (list.length) failed++;
  else passed++;
  console.log(list.length ? `FAIL ${name}: ${list.join('; ')}` : `PASS ${name}`);
}

const q = (v) => JSON.stringify(v);
const lc = (v) => String(v ?? '').trim().toLowerCase();
const hexRgb = (h) => {
  const m = String(h).trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** R, G and B within NEUTRAL of each other. */
export const isNeutral = (c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) <= NEUTRAL;

// ----------------------------------------------------------------- static --

/** Inline scripts in <head> that block rendering (no src; not module, async, defer or JSON-LD), with their text. */
export function inlineHeadScripts(html) {
  const end = html.search(/<body[\s>]/i);
  const head = end >= 0 ? html.slice(0, end) : html;
  const out = [];
  for (const m of head.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1] ?? '').toLowerCase();
    if (/\bsrc\s*=/.test(attrs) || /\b(async|defer)\b/i.test(attrs) || type === 'module' || type === 'application/ld+json') continue;
    out.push(m[2]);
  }
  return out;
}
const readPage = (dist, r) => {
  const f = join(dist, ...r.file.split('/'));
  return existsSync(f) ? readFileSync(f, 'utf-8') : null;
};

function staticChecks(dist, base) {
  for (const r of ROUTES) {
    const html = readPage(dist, r);
    if (html == null) {
      check(`static ${r.path} head-scripts`, [`${r.file} missing in ${dist}`]);
      continue;
    }
    const scripts = inlineHeadScripts(html);
    const want = base?.headScripts?.[r.path];
    check(`static ${r.path} head-scripts`, want == null ? [`no base count in ${BASE_FILE}`] : scripts.length !== want ? [`${scripts.length} inline head scripts, base has ${want}`] : []);
    const font = scripts.find((s) => s.includes('fonts-ready') && s.includes('document.fonts'));
    const p = [];
    if (!font) p.push('no font-ready snippet in <head>');
    else {
      if (font.length > 2000) p.push(`font-ready snippet is ${font.length} chars, perf-hints allows 2000`);
      if (!font.includes(THEME_KEY)) p.push(`font-ready snippet does not read ${THEME_KEY}`);
      if (!font.includes('prefers-color-scheme')) p.push('font-ready snippet does not consult prefers-color-scheme');
      if (!/data-theme|dataset\.theme/.test(font)) p.push('font-ready snippet does not set data-theme');
      if (!/\btry\s*\{/.test(font) || !/\bcatch\b/.test(font)) p.push('font-ready snippet reads storage outside try/catch');
    }
    check(`static ${r.path} head-theme`, p);
    const metas = [...html.matchAll(/<meta\b[^>]*\bname\s*=\s*["']theme-color["'][^>]*>/gi)].map((m) => m[0].match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] ?? null);
    check(`static ${r.path} meta-default`, metas.length !== 1 ? [`${metas.length} theme-color metas, want 1`] : lc(metas[0]) !== THEME_COLOR.dark ? [`theme-color is ${q(metas[0])}, want ${THEME_COLOR.dark}`] : []);
  }
}

// --------------------------------------------------------------- in page --

/** Installed as window.__theme: colour parsing and the readings each section needs. */
const LIB = String.raw`(() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const canvasRgba = (css) => {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = 'rgba(0, 0, 0, 0)';
    cx.fillStyle = css;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  /** [r, g, b, a] (0-255, alpha 0-1) of a computed colour string. */
  const parse = (css) => {
    const s = String(css).trim();
    let m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
    if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
    m = s.match(/^color\(\s*srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i);
    if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
    return canvasRgba(s);
  };
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;';
  document.body.appendChild(probe);
  /** The colour an expression (a token as var(--x), or any colour) resolves to as a background-color; null when it is not a colour. */
  const colour = (expr) => {
    probe.style.backgroundColor = '';
    probe.style.backgroundColor = expr;
    if (!probe.style.backgroundColor) return null;
    const c = getComputedStyle(probe).backgroundColor;
    return { css: c, rgba: parse(c) };
  };
  /** Every colour literal in a computed value (gradients serialise their stops as rgb()/color()). */
  const coloursIn = (v) => (String(v).match(/(?:rgba?|color|hsla?|hwb|lab|lch|oklab|oklch)\([^()]*\)|#[0-9a-f]{3,8}\b/gi) || []).map((c) => ({ css: c, rgba: parse(c) }));
  const root = () => getComputedStyle(document.documentElement);
  const token = (n) => root().getPropertyValue(n).trim();
  const meta = () => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute('content'));
  const dither = () => {
    const c = document.querySelector('canvas.dither-bg');
    if (!c) return null;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0, bad = 0, sum = 0, worst = null;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 24) continue;
      n++;
      const spread = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
      if (spread > ${NEUTRAL}) { bad++; worst = worst || [d[i], d[i + 1], d[i + 2], d[i + 3]]; }
      sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
    }
    return { n, bad, mean: n ? sum / n : null, worst, w: c.width, h: c.height };
  };
  const toggle = () => document.querySelector(${JSON.stringify(NEW_ELEMENT)});
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (t, u) => [0, 1, 2].map((i) => t[i] * t[3] + u[i] * (1 - t[3])).concat(1);
  const clipText = (cs) => cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text';
  /** The opaque colour behind an element (nearest painted ancestors over the body background); null under an image or gradient. */
  const effBg = (el) => {
    const layers = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (!clipText(cs) && cs.backgroundImage !== 'none' && e !== document.body && e !== document.documentElement) return null;
      const c = clipText(cs) ? null : parse(cs.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let bg = parse(getComputedStyle(document.body).backgroundColor);
    if (bg[3] < 1) bg = [0, 0, 0, 1];
    for (let i = layers.length - 1; i >= 0; i--) bg = layers[i][3] >= 1 ? layers[i] : over(layers[i], bg);
    return bg;
  };
  /** Every visible text node under root: its ink against what is behind it. */
  const texts = (root) => {
    const out = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const el = n.parentElement;
      if (!el || !el.getClientRects().length) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden') continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      const box = r.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      let ink = parse(cs.webkitTextFillColor);
      if (ink[3] === 0) ink = parse(cs.color);
      if (clipText(cs) && ink[3] === 0) ink = cs.backgroundImage === 'none' ? parse(cs.backgroundColor) : null;
      const bg = effBg(el);
      if (!ink || !bg) { out.push({ text: n.nodeValue.trim().slice(0, 24), cls: el.className, unknown: true }); continue; }
      if (ink[3] < 1) ink = over(ink, bg);
      out.push({ text: n.nodeValue.trim().slice(0, 24), cls: String(el.className), ink: ink.slice(0, 3).map(Math.round), bg: bg.slice(0, 3).map(Math.round), ratio: +contrast(ink, bg).toFixed(2) });
    }
    return out;
  };
  return { parse, colour, coloursIn, token, meta, dither, toggle, effBg, texts, contrast, theme: () => document.documentElement.getAttribute('data-theme') };
})()`;

const install = (page) => page.ev(`(window.__theme = ${LIB}, true)`);
const waitTheme = (page, want, ms = 2000) => page.ev(`(async () => { for (let i = 0; i < ${Math.ceil(ms / 50)}; i++) { if (document.documentElement.getAttribute('data-theme') === ${q(want)}) return true; await new Promise((r) => setTimeout(r, 50)); } return false; })()`);
const clickToggle = (page) => page.ev(`(() => { const t = document.querySelector(${q(NEW_ELEMENT)}); if (!t) return false; t.click(); return true; })()`);
const seed = (theme) => `try { localStorage.setItem(${q(THEME_KEY)}, ${q(theme)}); } catch (e) {}`;
/** Records data-theme when <body> is first inserted and on every change of it, before any page script runs. */
const OBSERVE = `(() => {
  window.__themeLog = [];
  window.__themeAtBody = undefined;
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'attributes' && m.target === document.documentElement) window.__themeLog.push({ v: document.documentElement.getAttribute('data-theme'), body: !!document.body });
      if (m.type === 'childList' && window.__themeAtBody === undefined && [...m.addedNodes].some((n) => n.nodeName === 'BODY')) window.__themeAtBody = document.documentElement.getAttribute('data-theme');
    }
  }).observe(document, { attributes: true, attributeFilter: ['data-theme'], childList: true, subtree: true });
})();`;
const THROWING_STORAGE = `Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });`;

const HOME = ROUTES[0];
const open = (b, origin, opts, width = 1280) =>
  openState(b, origin, { id: `theme ${opts.label ?? ''}`, path: opts.path ?? HOME.path, ready: opts.ready ?? HOME.ready, init: opts.init, colorScheme: opts.os, context: opts.context }, width);

// ----------------------------------------------------------------- tokens --

async function tokenChecks(page, theme) {
  const spec = TOKENS[theme];
  const got = await page.ev(`(() => { const T = window.__theme; const names = ${q([...new Set([...Object.keys(TOKENS.dark), ...Object.keys(TOKENS.light), ...Object.keys(ALIASES), ...Object.values(ALIASES), '--glow', ...QUARTZ_NEUTRAL])])}; const out = {}; for (const n of names) out[n] = { raw: T.token(n), c: T.colour('var(' + n + ')') }; return { out, scheme: getComputedStyle(document.documentElement).colorScheme, theme: T.theme() }; })()`);
  const p = [];
  if (got.theme !== theme) p.push(`data-theme is ${q(got.theme)}, want ${q(theme)}`);
  for (const [n, want] of Object.entries(spec)) if (lc(got.out[n].raw) !== want) p.push(`${n} is ${q(got.out[n].raw)}, want ${want}`);
  check(`tokens ${theme} values`, p);

  const a = [];
  for (const [n, target] of Object.entries(ALIASES)) {
    const x = got.out[n];
    const t = hexRgb(spec[target]);
    if (/gradient/i.test(x.raw)) a.push(`${n} is a gradient (${x.raw.slice(0, 60)}), want solid var(${target})`);
    else if (!x.c) a.push(`${n} is ${q(x.raw)}, not a colour (want var(${target}))`);
    else if (x.c.rgba[3] < 0.999 || x.c.rgba.slice(0, 3).some((v, i) => Math.abs(v - t[i]) > 0.5)) a.push(`${n} resolves to ${x.c.css}, want ${target} ${spec[target]}`);
  }
  check(`tokens ${theme} aliases`, a);

  const g = got.out['--glow'];
  const acc = hexRgb(spec['--accent']);
  check(`tokens ${theme} glow`, !g.c ? [`--glow is ${q(g.raw)}, not a colour`] : [
    g.c.rgba[3] > GLOW_MAX_ALPHA + 1e-6 || g.c.rgba[3] <= 0 ? `--glow alpha ${g.c.rgba[3]}, want > 0 and <= ${GLOW_MAX_ALPHA}` : null,
    g.c.rgba.slice(0, 3).some((v, i) => Math.abs(v - acc[i]) > 1) ? `--glow is ${g.c.css}, want the accent ${spec['--accent']} at low alpha` : null,
  ]);

  const e = [];
  if (theme === 'dark') {
    const l = got.out['--edge-line'];
    if (!l.c || l.c.rgba.some((v, i) => Math.abs(v - EDGE_LINE_DARK[i]) > (i === 3 ? 0.01 : 0.5))) e.push(`--edge-line is ${q(l.raw)}, want rgba(0, 0, 0, .75)`);
  } else
    for (const n of QUARTZ_NEUTRAL) {
      const x = got.out[n];
      if (!x.c) e.push(`${n} is ${q(x.raw)}, not a colour`);
      else if (!isNeutral(x.c.rgba)) e.push(`${n} is ${x.c.css}, not neutral (R, G, B within ${NEUTRAL})`);
    }
  check(`tokens ${theme} edges`, e);
  const sch = String(got.scheme).split(/\s+/);
  check(`tokens ${theme} color-scheme`, sch.includes(theme) && !sch.includes(theme === 'dark' ? 'light' : 'dark') ? [] : [`color-scheme is ${q(got.scheme)}, want ${theme}`]);
}

async function bodyChecks(page, theme) {
  const got = await page.ev(`(() => { const T = window.__theme; const b = getComputedStyle(document.body); const a = getComputedStyle(document.body, '::after'); return { bg: T.parse(b.backgroundColor), bgCss: b.backgroundColor, img: T.coloursIn(b.backgroundImage), after: T.coloursIn(a.backgroundImage + ' ' + a.backgroundColor) }; })()`);
  const want = hexRgb(TOKENS[theme]['--bg']);
  check(`body ${theme} background-color`, got.bg[3] < 0.999 || got.bg.slice(0, 3).some((v, i) => Math.abs(v - want[i]) > 0.5) ? [`body background-color is ${got.bgCss}, want --bg ${TOKENS[theme]['--bg']}`] : []);
  check(`body ${theme} background-image neutral`, got.img.filter((c) => c.rgba[3] > 0 && !isNeutral(c.rgba)).map((c) => `body background-image has ${c.css}`));
  check(`body ${theme} vignette neutral`, got.after.filter((c) => c.rgba[3] > 0 && !isNeutral(c.rgba)).map((c) => `body::after has ${c.css}`));
}

function ditherProblems(d, theme) {
  if (!d) return ['no canvas.dither-bg'];
  if (d.n < 50) return [`only ${d.n} painted pixels (alpha >= 24) on a ${d.w}x${d.h} canvas`];
  const p = [];
  if (d.bad) p.push(`${d.bad} of ${d.n} painted pixels are not neutral, e.g. rgba(${d.worst.join(', ')})`);
  const bg = hexRgb(TOKENS[theme]['--bg']).reduce((x, y) => x + y) / 3;
  if (theme === 'dark' && !(d.mean >= bg + DOT_STEP)) p.push(`dots average ${d.mean.toFixed(0)}, want light dots (>= ${(bg + DOT_STEP).toFixed(0)}) on Obsidian`);
  if (theme === 'light' && !(d.mean <= bg - DOT_STEP)) p.push(`dots average ${d.mean.toFixed(0)}, want dark dots (<= ${(bg - DOT_STEP).toFixed(0)}) on Quartz`);
  return p;
}

async function themedPageChecks(b, origin, args) {
  for (const theme of THEMES) {
    let page;
    try {
      page = await open(b, origin, { label: theme, init: seed(theme), os: theme });
    } catch (e) {
      check(`tokens ${theme} page`, [String(e?.message ?? e)]);
      continue;
    }
    try {
      await install(page);
      if (want(args, 'tokens')) await tokenChecks(page, theme);
      if (want(args, 'body')) await bodyChecks(page, theme);
      if (want(args, 'dither')) {
        check(`dither ${theme} dots`, ditherProblems(await page.ev('window.__theme.dither()'), theme));
        const other = theme === 'dark' ? 'light' : 'dark';
        const clicked = await clickToggle(page);
        const switched = clicked && (await waitTheme(page, other));
        await sleep(400);
        check(`dither ${theme} -> ${other} repaints after the toggle`, !clicked ? ['no .theme-toggle to click'] : !switched ? [`data-theme did not become ${other}`] : ditherProblems(await page.ev('window.__theme.dither()'), other));
      }
    } catch (e) {
      check(`tokens ${theme} inspect`, [String(e?.message ?? e)]);
    } finally {
      await page.close();
    }
  }
}

// ----------------------------------------------------------------- switch --

const state = (page) => page.ev(`(() => { let stored; try { stored = localStorage.getItem(${q(THEME_KEY)}); } catch (e) { stored = 'throws'; } return { theme: document.documentElement.getAttribute('data-theme'), stored, meta: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute('content')), atBody: window.__themeAtBody, log: window.__themeLog || [] }; })()`);
const metaProblem = (s, theme) => (s.meta.length && s.meta.every((m) => lc(m) === THEME_COLOR[theme]) ? null : `theme-color meta is ${q(s.meta)}, want ${THEME_COLOR[theme]}`);
/** The attribute held `theme` when <body> was inserted and never took another value. */
const flashProblems = (s, theme) => [
  s.atBody !== theme ? `data-theme was ${q(s.atBody ?? null)} when <body> was inserted, want ${q(theme)}` : null,
  s.log.some((x) => x.v !== theme) ? `data-theme took ${q(s.log.map((x) => `${x.v}${x.body ? ' (after <body>)' : ''}`))} during load` : null,
];

async function switchChecks(b, origin) {
  const errors = [];
  const onError = (d) => {
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails?.exception?.description?.split('\n')[0] ?? d.params.exceptionDetails?.text ?? 'exception');
  };
  const run = async (name, opts, fn) => {
    let page;
    try {
      page = await open(b, origin, { ...opts, label: name, init: [OBSERVE, opts.init].filter(Boolean).join('\n') });
    } catch (e) {
      check(`switch ${name}`, [`page did not open: ${String(e?.message ?? e)}`]);
      return;
    }
    try {
      await fn(page);
    } catch (e) {
      check(`switch ${name}`, [String(e?.message ?? e)]);
    } finally {
      await page.close();
    }
  };

  for (const os of THEMES)
    await run(`first visit follows the OS (${os})`, { os }, async (page) => {
      const s = await state(page);
      check(`switch first visit, OS ${os}: theme ${os}, set before <body>, meta follows`, [s.theme !== os ? `data-theme is ${q(s.theme)}, want ${q(os)}` : null, ...flashProblems(s, os), metaProblem(s, os)]);
    });
  for (const [stored, os] of [['light', 'dark'], ['dark', 'light']])
    await run(`stored ${stored}`, { os, init: seed(stored) }, async (page) => {
      const s = await state(page);
      check(`switch stored ${stored} over OS ${os}: theme ${stored}, no wrong-theme flash, meta follows`, [s.theme !== stored ? `data-theme is ${q(s.theme)}, want ${q(stored)}` : null, ...flashProblems(s, stored), metaProblem(s, stored)]);
    });

  // The toggle, both ways, then a reload in the same browser context.
  let ctx = null;
  let first = null;
  try {
    first = await open(b, origin, { label: 'toggle', os: 'dark' });
    ctx = first.browserContextId;
    const btn = await first.ev(`(() => { const t = document.querySelector(${q(NEW_ELEMENT)}); if (!t) return null; const s = t.previousElementSibling, n = t.nextElementSibling; return { tag: t.tagName, type: t.getAttribute('type'), label: (t.getAttribute('aria-label') || '').trim(), inNav: !!t.closest('.site-nav'), nextToSound: !!((s && s.matches('.sound-toggle')) || (n && n.matches('.sound-toggle'))), rendered: t.getClientRects().length > 0 }; })()`);
    check('switch toggle: a <button class="theme-toggle"> with an aria-label, in the nav, next to .sound-toggle', !btn ? ['no .theme-toggle'] : [btn.tag !== 'BUTTON' ? `it is a <${btn.tag.toLowerCase()}>` : null, btn.label ? null : 'no aria-label', btn.inNav ? null : 'not inside .site-nav', btn.nextToSound ? null : 'not a sibling right next to .sound-toggle', btn.rendered ? null : 'not rendered']);
    for (const to of ['light', 'dark']) {
      const clicked = await clickToggle(first);
      const ok = clicked && (await waitTheme(first, to));
      await sleep(150);
      const s = await state(first);
      check(`switch toggle click -> ${to}: theme, stored ${THEME_KEY}, meta`, !clicked ? ['no .theme-toggle to click'] : [ok ? null : `data-theme is ${q(s.theme)}, want ${q(to)}`, s.stored !== to ? `${THEME_KEY} is ${q(s.stored)}, want ${q(to)}` : null, metaProblem(s, to)]);
    }
    // Leave it on light, then load the page again in the same context with the OS on dark.
    await clickToggle(first);
    await waitTheme(first, 'light');
    await sleep(150);
  } catch (e) {
    check('switch toggle', [String(e?.message ?? e)]);
  }
  if (ctx) {
    let again = null;
    try {
      again = await open(b, origin, { label: 'reload', os: 'dark', context: ctx, init: OBSERVE });
      const s = await state(again);
      check('switch the choice survives a reload (stored light, OS dark)', [s.theme !== 'light' ? `data-theme is ${q(s.theme)} after reload, want "light"` : null, ...flashProblems(s, 'light'), metaProblem(s, 'light')]);
      // Two tabs of one context: a toggle in one switches the other (storage event).
      const before = await state(first);
      const clicked = await clickToggle(again);
      const flipped = clicked && (await waitTheme(first, 'dark'));
      await sleep(150);
      const s2 = await state(first);
      check('switch a toggle in another tab switches this one (storage event)', !clicked ? ['no .theme-toggle to click in the other tab'] : [before.theme !== 'light' ? `this tab started on ${q(before.theme)}, want "light"` : null, flipped ? null : `this tab stayed ${q(s2.theme)}, want "dark"`, metaProblem(s2, 'dark')]);
    } catch (e) {
      check('switch reload and storage event', [String(e?.message ?? e)]);
    } finally {
      if (again) await again.close();
    }
  }
  if (first) await first.close();

  // localStorage that throws on access (blocked storage): the page renders, follows the OS, and toggles.
  for (const os of THEMES) {
    errors.length = 0;
    b.listeners.add(onError);
    try {
      await run(`storage throws (OS ${os})`, { os, init: THROWING_STORAGE }, async (page) => {
        const s = await state(page);
        const rendered = await page.ev(`!!document.querySelector('.site-nav') && !!document.querySelector(${q(HOME.ready)})`);
        const other = os === 'dark' ? 'light' : 'dark';
        const clicked = await clickToggle(page);
        const ok = clicked && (await waitTheme(page, other));
        await sleep(150);
        const s2 = await state(page);
        check(`switch localStorage throws, OS ${os}: renders, theme ${os}, toggles to ${other}, no uncaught exception`, [
          rendered ? null : 'the page did not render its nav and mode cards',
          s.theme !== os ? `data-theme is ${q(s.theme)}, want ${q(os)}` : null,
          !clicked ? 'no .theme-toggle to click' : ok ? null : `after the click data-theme is ${q(s2.theme)}, want ${q(other)}`,
          ok ? metaProblem(s2, other) : null,
          errors.length ? `uncaught: ${errors.slice(0, 3).join(' | ')}` : null,
        ]);
      });
    } finally {
      b.listeners.delete(onError);
    }
  }
}

// --------------------------------------------------------------- geometry --

/** Boxes of every visible element under <body>, keyed by element path; the NEW_ELEMENT subtree is not walked. */
const GEOMETRY = (cfg) => `(() => {
  const cfg = ${JSON.stringify(cfg)};
  scrollTo({ top: 0, left: 0, behavior: 'instant' });
  const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'BASE']);
  const group = cfg.group.join(', ');
  const boxes = {}, labels = {}, grouped = [];
  const label = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + [...el.classList].slice(0, 3).map((c) => '.' + c).join('');
  const walk = (el, key, lab) => {
    let i = 0;
    for (const c of el.children) {
      if (c.matches(cfg.newEl)) continue;
      const k = key + '/' + i++ + c.tagName.toLowerCase();
      if (SKIP.has(c.tagName)) continue;
      const l = lab + ' > ' + label(c);
      const excluded = cfg.exclude.length && cfg.exclude.some((s) => c.closest(s));
      if (!excluded && c.getClientRects().length && getComputedStyle(c).visibility !== 'hidden') {
        const r = c.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          boxes[k] = [Math.round(r.left + scrollX), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)];
          labels[k] = l.split(' > ').slice(-3).join(' > ');
          if (c.closest(group)) grouped.push(k);
        }
      }
      walk(c, k, l);
    }
  };
  walk(document.body, 'body', 'body');
  return { boxes, labels, grouped, planted: !!window.__planted };
})()`;

/**
 * Problems between the base boxes and the current ones. `grouped` keys may
 * differ in x only. Pure, so the self checks can prove it fails on a change.
 */
export function geometryDiff(base, got, grouped = [], labels = {}) {
  const g = new Set(grouped);
  const out = [];
  const name = (k) => labels[k] ?? k;
  for (const [k, b] of Object.entries(base)) {
    const n = got[k];
    if (!n) {
      out.push(`${name(k)} [${b.join(',')}] is gone`);
      continue;
    }
    if (n.every((v, i) => v === b[i])) continue;
    if (g.has(k) && n[1] === b[1] && n[2] === b[2] && n[3] === b[3]) continue;
    out.push(`${name(k)} moved [${b.join(',')}] -> [${n.join(',')}]${g.has(k) ? ' (nav group: only x may change)' : ''}`);
  }
  for (const [k, n] of Object.entries(got)) if (!(k in base)) out.push(`${name(k)} [${n.join(',')}] is new`);
  return out;
}

const geomCfg = { newEl: NEW_ELEMENT, group: NAV_GROUP, exclude: GEOMETRY_EXCLUDE };

async function measure(b, origin, r, width, theme, plant = null) {
  const page = await open(b, origin, { label: `${r.path} ${theme}`, path: r.path, ready: r.ready, init: theme ? seed(theme) : undefined, os: theme ?? 'dark' }, width);
  try {
    if (plant && !(await page.ev(plant))) throw new Error(`plant failed: ${plant.slice(0, 120)}`);
    await page.ev(FREEZE_ANIMATIONS);
    await sleep(150);
    const g = await page.ev(GEOMETRY(geomCfg));
    const t = theme
      ? await page.ev(`(() => { const t = document.querySelector(${q(NEW_ELEMENT)}); const s = t && t.previousElementSibling, n = t && t.nextElementSibling; const sound = document.querySelector('.sound-toggle'); return { theme: document.documentElement.getAttribute('data-theme'), meta: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute('content')), toggle: t && { tag: t.tagName, label: (t.getAttribute('aria-label') || '').trim(), nextToSound: !!((s && s.matches('.sound-toggle')) || (n && n.matches('.sound-toggle'))), rendered: t.getClientRects().length > 0 }, soundRendered: !!sound && sound.getClientRects().length > 0 }; })()`)
      : null;
    return { g, t };
  } finally {
    await page.close();
  }
}

async function geometryChecks(b, origin, base, args) {
  for (const r of ROUTES)
    for (const width of WIDTHS)
      for (const theme of THEMES) {
        const id = `${r.path}@${width} ${theme}`;
        let m;
        try {
          m = await measure(b, origin, r, width, theme);
        } catch (e) {
          if (want(args, 'geometry')) check(`geometry ${id}`, [String(e?.message ?? e)]);
          if (want(args, 'toggle')) check(`toggle ${id}`, [String(e?.message ?? e)]);
          continue;
        }
        if (want(args, 'toggle')) {
          const t = m.t;
          check(`toggle ${id}`, [
            !t.toggle ? 'no .theme-toggle' : null,
            t.toggle && t.toggle.tag !== 'BUTTON' ? `.theme-toggle is a <${t.toggle.tag.toLowerCase()}>` : null,
            t.toggle && !t.toggle.label ? '.theme-toggle has no aria-label' : null,
            t.toggle && !t.toggle.nextToSound ? '.theme-toggle is not right next to .sound-toggle' : null,
            t.toggle && t.soundRendered && !t.toggle.rendered ? '.theme-toggle is not rendered while .sound-toggle is' : null,
            t.theme !== theme ? `data-theme is ${q(t.theme)}, want ${q(theme)}` : null,
            metaProblem({ meta: t.meta }, theme),
          ]);
        }
        if (want(args, 'geometry')) {
          const key = `${r.path}@${width}`;
          const bb = base?.geometry?.[key];
          if (!bb) {
            check(`geometry ${id}`, [`no base geometry for ${key} in ${BASE_FILE}`]);
            continue;
          }
          const p = geometryDiff(bb, m.g.boxes, m.g.grouped, m.g.labels);
          check(`geometry ${id} (${Object.keys(bb).length} boxes)`, p.length > 12 ? [...p.slice(0, 12), `... and ${p.length - 12} more`] : p);
        }
      }
}

// ------------------------------------------------------------ wells, glow --

async function wellChecks(b, origin) {
  for (const width of WIDTHS)
    for (const theme of THEMES) {
      const id = `/@${width} ${theme}`;
      let page;
      try {
        page = await open(b, origin, { label: `wells ${theme}`, init: seed(theme), os: theme }, width);
      } catch (e) {
        check(`wells ${id}`, [String(e?.message ?? e)]);
        continue;
      }
      try {
        await install(page);
        const ok = await page.ev(`(async () => { for (let i = 0; i < 50; i++) { if ([...document.querySelectorAll('.mode-live')].some((w) => !w.hidden && w.getClientRects().length && w.querySelector('.mode-live-row'))) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()`);
        const got = await page.ev(`(() => { const T = window.__theme; return [...document.querySelectorAll('.mode-live')].filter((w) => !w.hidden && w.getClientRects().length).map((w) => ({ live: w.getAttribute('data-live') || w.className, bg: T.parse(getComputedStyle(w).backgroundColor), bgCss: getComputedStyle(w).backgroundColor, texts: T.texts(w) })); })()`);
        const want = hexRgb(TOKENS[theme]['--inset-on-surface']);
        const p = [];
        if (!ok || !got.length) p.push('no rendered .mode-live with rows (the PVP fixture should fill it)');
        for (const w of got) {
          if (w.bg[3] < 0.999 || w.bg.slice(0, 3).some((v, i) => Math.abs(v - want[i]) > 0.5)) p.push(`.mode-live[${w.live}] background is ${w.bgCss}, want --inset-on-surface ${TOKENS[theme]['--inset-on-surface']}`);
        }
        check(`wells ${id} background`, p);
        const t = [];
        for (const w of got)
          for (const x of w.texts) {
            if (x.unknown) t.push(`.mode-live[${w.live}] ${q(x.text)} (.${x.cls}) sits on an image or gradient`);
            else if (x.ratio < WELL_TEXT_MIN) t.push(`.mode-live[${w.live}] ${q(x.text)} (.${x.cls.split(' ').join('.')}) rgb(${x.ink.join(', ')}) on rgb(${x.bg.join(', ')}) ${x.ratio}:1, want >= ${WELL_TEXT_MIN}`);
          }
        check(`wells ${id} text contrast (${got.reduce((n, w) => n + w.texts.length, 0)} text nodes)`, got.length ? t : ['no well to read']);
      } catch (e) {
        check(`wells ${id}`, [String(e?.message ?? e)]);
      } finally {
        await page.close();
      }
    }
}

/** Problems with the shadow colours of a computed text-shadow / filter value: each must be the accent at alpha in (0, max]. */
export function glowColourProblems(colours, accent, max, what) {
  const out = [];
  for (const c of colours) {
    const [r, g, bl, a] = c.rgba;
    if (a === 0) continue;
    if (r > bl) out.push(`${what} has ${c.css}: pink/warm (R > B)`);
    else if ([r, g, bl].some((v, i) => Math.abs(v - accent[i]) > 1)) out.push(`${what} has ${c.css}: not the theme accent rgb(${accent.join(', ')})`);
    else if (a > max + 1e-6) out.push(`${what} has ${c.css}: alpha ${a} > ${max}`);
  }
  return out;
}

async function glowChecks(b, origin) {
  for (const theme of THEMES) {
    let page;
    try {
      page = await open(b, origin, { label: `glow ${theme}`, init: seed(theme), os: theme });
    } catch (e) {
      check(`glow ${theme}`, [String(e?.message ?? e)]);
      continue;
    }
    try {
      await install(page);
      const accent = hexRgb(TOKENS[theme]['--accent']);
      for (const t of TITLES) {
        const got = await page.ev(`(() => { const T = window.__theme; const el = document.querySelector(${q(t.title)}); if (!el) return null; const cs = getComputedStyle(el); const anc = []; for (let a = el.parentElement; a; a = a.parentElement) { const f = getComputedStyle(a).filter; if (/drop-shadow/.test(f)) anc.push({ tag: a.tagName.toLowerCase() + (a.className ? '.' + String(a.className).split(' ').join('.') : ''), filter: f }); } return { shadow: cs.textShadow, filter: cs.filter, anc, hl: [...document.querySelectorAll(${q(t.hl)})].map((h) => { const s = getComputedStyle(h); return { shadow: s.textShadow, filter: s.filter, colours: T.coloursIn(s.textShadow + ' ' + (/drop-shadow/.test(s.filter) ? s.filter : '')) }; }) }; })()`);
        if (!got) {
          check(`glow ${theme} ${t.name}`, [`no ${t.title}`]);
          continue;
        }
        check(`glow ${theme} ${t.name}: no glow on the title words (${t.title})`, [
          got.shadow !== 'none' ? `text-shadow is ${got.shadow.slice(0, 120)}, want none` : null,
          /drop-shadow/.test(got.filter) ? `filter is ${got.filter.slice(0, 120)}, want no drop-shadow` : null,
          ...got.anc.map((a) => `ancestor ${a.tag} has filter ${a.filter.slice(0, 80)} (it glows the whole title)`),
        ]);
        check(`glow ${theme} ${t.name}: highlighted words (${t.hl}) glow only in the accent at alpha <= ${GLOW_TITLE_ALPHA}`, !got.hl.length ? [`no ${t.hl}`] : got.hl.flatMap((h, i) => glowColourProblems(h.colours, accent, GLOW_TITLE_ALPHA, `span ${i + 1}`)));
      }
    } catch (e) {
      check(`glow ${theme}`, [String(e?.message ?? e)]);
    } finally {
      await page.close();
    }
  }
}

/**
 * The comparator on a real page of this build: a planted toggle beside the
 * sound toggle (when the build has none) passes, and a 1px change outside the
 * nav group fails, so the geometry lines fail on real layout change only.
 */
const addStyle = (css) => `(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); return true; })()`;
const PLANT_TOGGLE = `(() => { if (document.querySelector(${q(NEW_ELEMENT)})) return true; const s = document.querySelector('.sound-toggle'); if (!s) return false; const t = s.cloneNode(true); t.className = 'sound-toggle theme-toggle'; t.setAttribute('aria-label', 'Light theme'); s.after(t); window.__planted = true; return true; })()`;
async function plantChecks(b, origin, base) {
  const r = HOME;
  const cases = [
    [400, 'a toggle planted beside the sound toggle passes', PLANT_TOGGLE, true],
    [1280, 'a toggle planted beside the sound toggle passes', PLANT_TOGGLE, true],
    [1280, 'main 1px lower fails', addStyle('main{padding-top:1px!important}'), false],
    [1280, 'the brand 1px to the right fails (not in the nav group)', addStyle('.site-nav-brand{margin-left:1px!important}'), false],
    [1280, 'the sound toggle 2px lower fails (the group may move along x only)', addStyle('.sound-toggle{position:relative!important;top:2px!important}'), false],
  ];
  for (const [width, name, plant, pass] of cases) {
    const bb = base?.geometry?.[`${r.path}@${width}`];
    if (!bb) {
      check(`plant ${r.path}@${width} ${name}`, [`no base geometry in ${BASE_FILE}`]);
      continue;
    }
    try {
      const m = await measure(b, origin, r, width, 'dark', plant);
      const p = geometryDiff(bb, m.g.boxes, m.g.grouped, m.g.labels);
      // A planted toggle must actually push the group sideways, or the plant proved nothing about the x allowance.
      const shifted = m.g.grouped.filter((k) => bb[k] && m.g.boxes[k][0] !== bb[k][0]).length;
      check(`plant ${r.path}@${width} ${name}`, pass ? [...p.slice(0, 6), m.g.planted && !shifted ? 'the planted toggle moved no nav-group box' : null] : p.length ? [] : ['no difference reported']);
    } catch (e) {
      check(`plant ${r.path}@${width} ${name}`, [String(e?.message ?? e)]);
    }
  }
}

// ------------------------------------------------------------------- self --

function selfChecks() {
  const base = { 'body/0div': [0, 0, 100, 50], 'body/0div/0a': [10, 5, 30, 20], 'body/1main': [0, 50, 100, 400] };
  const same = JSON.parse(JSON.stringify(base));
  check('self geometry: identical boxes pass', geometryDiff(base, same));
  check('self geometry: a 1px move down fails', geometryDiff(base, { ...same, 'body/1main': [0, 51, 100, 400] }).length === 1 ? [] : ['not reported']);
  check('self geometry: a 1px wider box fails', geometryDiff(base, { ...same, 'body/0div/0a': [10, 5, 31, 20] }).length === 1 ? [] : ['not reported']);
  check('self geometry: a nav-group box shifted along x passes', geometryDiff(base, { ...same, 'body/0div/0a': [-32, 5, 30, 20] }, ['body/0div/0a']));
  check('self geometry: a nav-group box shifted along y fails', geometryDiff(base, { ...same, 'body/0div/0a': [10, 6, 30, 20] }, ['body/0div/0a']).length === 1 ? [] : ['not reported']);
  check('self geometry: a nav-group box resized fails', geometryDiff(base, { ...same, 'body/0div/0a': [10, 5, 31, 20] }, ['body/0div/0a']).length === 1 ? [] : ['not reported']);
  const { 'body/1main': _gone, ...less } = same;
  check('self geometry: a vanished box fails', geometryDiff(base, less).some((x) => x.includes('is gone')) ? [] : ['not reported']);
  check('self geometry: a new box fails', geometryDiff(base, { ...same, 'body/2footer': [0, 450, 100, 40] }).some((x) => x.includes('is new')) ? [] : ['not reported']);
  check('self neutral: #0e0f12 and #32363f pass, #c77dff and #150b29 fail', [isNeutral([14, 15, 18]) ? null : '#0e0f12', isNeutral([50, 54, 63]) ? null : '#32363f', isNeutral([199, 125, 255]) ? '#c77dff passed' : null, isNeutral([21, 11, 41]) ? '#150b29 passed' : null]);
  const acc = [199, 125, 255];
  const col = (r, g, b, a) => ({ css: `rgba(${r}, ${g}, ${b}, ${a})`, rgba: [r, g, b, a] });
  check('self glow: the accent at .3 passes', glowColourProblems([col(199, 125, 255, 0.3)], acc, 0.35, 'x'));
  check('self glow: pink 255,125,225 fails', glowColourProblems([col(255, 125, 225, 0.3)], acc, 0.35, 'x').some((x) => x.includes('R > B')) ? [] : ['not reported']);
  check('self glow: a dark drop rgba(22,24,29,.5) fails', glowColourProblems([col(22, 24, 29, 0.5)], acc, 0.35, 'x').length ? [] : ['not reported']);
  check('self glow: the accent at .5 fails', glowColourProblems([col(199, 125, 255, 0.5)], acc, 0.35, 'x').some((x) => x.includes('alpha')) ? [] : ['not reported']);
  const html = '<html><head><script>(function(){document.fonts;"fonts-ready"})()</script><script type="module" src="/a.js"></script><script type="application/ld+json">{}</script><script defer src="x.js"></script><script>var x=1</script></head><body><script>var y=2</script></body></html>';
  check('self head scripts: counts inline blocking head scripts only', inlineHeadScripts(html).length === 2 ? [] : [`counted ${inlineHeadScripts(html).length}`]);
}

// ------------------------------------------------------------------- main --

const SECTIONS = ['static', 'tokens', 'body', 'dither', 'switch', 'toggle', 'geometry', 'wells', 'glow', 'plant', 'self'];
function want(args, section) {
  const i = args.indexOf('--only');
  return i < 0 || args[i + 1].split(',').includes(section);
}

async function browser(dist, fn) {
  if (!findChrome()) return check('chrome-found', ['no Chrome: set CHROME to chrome.exe']);
  if (!existsSync(join(dist, 'index.html'))) return check('dist-built', [`${dist} has no index.html: build first (npm run build)`]);
  let ran = false;
  await withBrowser(dist, async (b, origin) => {
    ran = true;
    await fn(b, origin);
  });
  if (!ran) check('preview-server', ['vite preview or Chrome did not start (see the FAIL line above)']);
}

async function snapshot(dist) {
  const out = { capturedFrom: process.argv[process.argv.indexOf('--snapshot') + 2] ?? 'unknown', note: 'Base build geometry (dark/no theme) and inline head script counts, for test/theme_check.mjs. Regenerate only with a reviewed reason.', headScripts: {}, geometry: {} };
  for (const r of ROUTES) {
    const html = readPage(dist, r);
    if (html == null) throw new Error(`${r.file} missing in ${dist}`);
    out.headScripts[r.path] = inlineHeadScripts(html).length;
  }
  await browser(dist, async (b, origin) => {
    for (const r of ROUTES)
      for (const width of WIDTHS) {
        const m = await measure(b, origin, r, width, null);
        out.geometry[`${r.path}@${width}`] = Object.fromEntries(Object.entries(m.g.boxes).sort(([a], [c]) => (a < c ? -1 : a > c ? 1 : 0)));
        console.log(`measured ${r.path}@${width}: ${Object.keys(m.g.boxes).length} boxes`);
      }
  });
  if (failed) return;
  mkdirSync(FIX_DIR, { recursive: true });
  const lines = ['{', `  "capturedFrom": ${q(out.capturedFrom)},`, `  "note": ${q(out.note)},`, `  "headScripts": ${q(out.headScripts)},`, '  "geometry": {'];
  const keys = Object.keys(out.geometry);
  keys.forEach((k, i) => {
    const ent = Object.entries(out.geometry[k]);
    lines.push(`    ${q(k)}: {`);
    ent.forEach(([p, b], j) => lines.push(`      ${q(p)}: ${q(b)}${j < ent.length - 1 ? ',' : ''}`));
    lines.push(`    }${i < keys.length - 1 ? ',' : ''}`);
  });
  lines.push('  }', '}', '');
  writeFileSync(BASE_FILE, lines.join('\n'));
  console.log(`wrote ${BASE_FILE}`);
}

async function main() {
  const args = process.argv.slice(2);
  const di = args.indexOf('--dist');
  if (args.includes('--snapshot')) {
    await snapshot(resolve(args[args.indexOf('--snapshot') + 1]));
  } else {
    const dist = resolve(di >= 0 ? args[di + 1] : join(ROOT, 'dist'));
    const i = args.indexOf('--only');
    if (i >= 0) for (const s of args[i + 1].split(',')) if (!SECTIONS.includes(s)) throw new Error(`unknown section ${s}; sections: ${SECTIONS.join(', ')}`);
    const base = existsSync(BASE_FILE) ? JSON.parse(readFileSync(BASE_FILE, 'utf-8')) : null;
    if (want(args, 'self')) selfChecks();
    if (want(args, 'static')) staticChecks(dist, base);
    if (['tokens', 'body', 'dither', 'switch', 'toggle', 'geometry', 'wells', 'glow', 'plant'].some((s) => want(args, s)))
      await browser(dist, async (b, origin) => {
        if (['tokens', 'body', 'dither'].some((s) => want(args, s))) await themedPageChecks(b, origin, args);
        if (want(args, 'switch')) await switchChecks(b, origin);
        if (want(args, 'wells')) await wellChecks(b, origin);
        if (want(args, 'glow')) await glowChecks(b, origin);
        if (want(args, 'toggle') || want(args, 'geometry')) await geometryChecks(b, origin, base, args);
        if (want(args, 'plant')) await plantChecks(b, origin, base);
      });
  }
  console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.log(`FAIL theme-check: ${e?.stack ?? e}`);
    console.log('RESULT: FAIL 1 of 1');
    process.exitCode = 1;
  });
}
