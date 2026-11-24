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
//       a full dist of 1043374 (.orch/runs/20261117-palette/base-dist); retaken
//       from 7f37244 in run 20261121-dungeon-map U3 (owner 2026-11-21: SMP replaces
//       AUCTIONS in the nav, /smp/ gains the dungeon preview and button).
//   (npm script: "test:theme": "node test/theme_check.mjs")
//
// Sections (--only takes these names):
//   static    dist HTML, no browser.
//             head-scripts  every page has exactly as many inline render-blocking
//                           head scripts as the base build (AC3);
//             head-theme    the font-ready head snippet (the one inline script
//                           check_site's perf-hints allows: "fonts-ready" and
//                           "document.fonts") holds the theme code: it names the
//                           storage key chromabit:theme and data-theme /
//                           dataset.theme, uses try/catch, sits in <head> (so it
//                           runs before <body> is parsed) and stays within
//                           perf-hints' 2000 characters (AC2, AC3). U2 A1 (owner
//                           2026-11-17 "make sure dark mode is default"): its
//                           code (comments aside) names neither
//                           prefers-color-scheme nor matchMedia;
//             theme-module  src/lib/theme.js (comments aside) names neither
//                           prefers-color-scheme nor matchMedia (U2 A1);
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
//             U2 A2 (owner 2026-11-17 "where did the pixel dithering go?"): at
//             1280 the strongest painted pixel has alpha >= DITHER_MAX_ALPHA_MIN
//             (base: 100), and the painted pixels in the lower half of the
//             viewport outside the centre column (|x - centre| >= DITHER_COLUMN_HALF
//             screen px, where ditherBg.js dims the dots behind the copy) number
//             at least DITHER_COVER of the base build's count
//             (test/fixtures/theme/dither-base.json, from base-dist with
//             --snapshot-dither); in both themes and after the toggle. The
//             tokens section pins --dither-alpha to 1 and --dither-dot to a
//             neutral grey >= DITHER_DOT_CONTRAST:1 against the theme's --bg.
//   switch    the theme switch on / (AC2): U2 A1: a first visit is Obsidian
//             whatever the OS says (emulated prefers-color-scheme light and
//             dark both give data-theme "dark" and the #0E0F12 meta); a stored
//             choice wins over the OS; the
//             attribute holds its final value before <body> is parsed and never
//             changes after (no wrong-theme flash); the toggle flips the theme,
//             stores it and updates the theme-color meta, both ways; the choice
//             survives a reload; a storage event from another tab switches the
//             theme; with localStorage throwing the page still renders with no
//             uncaught exception, is Obsidian (OS light or dark) and toggles.
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
//   self      pure checks of the comparators (geometry diff, neutrality, the
//             purple rule and the literal scanner), so each check is proven
//             to fail on what it is for.
//
// U2 + U3 sections (owner palette rules, plan "Kept as they are"):
//   literals  (static, B1) test/palette_scan.mjs: no purple/pink colour literal
//             (hue 250-340 deg, HSL saturation > 15%: the accent family, the
//             pinks and the purple-tinted near-blacks such as #0c0718,
//             rgba(12,7,24,a)) in src/**/*.{css,js,jsx} or the 8 index.html
//             outside the two theme token blocks, except its ALLOW entries
//             (file + context + keep-list reason). One line per file, and a
//             stale ALLOW entry fails. Also pins the chart series hues (B8).
//   walk      every card_style_check STATE (plus a planted store mode pop-up,
//             the card fixture's catalog having no modes) at its widths (400
//             and 1280) in BOTH themes (seeded choice), --jobs pages at a time:
//             text      every visible text node (the open modal / drawer only,
//                       when one is open) >= 4.5:1, >= 3:1 at 24px and up,
//                       against what is painted behind it (nearest fills over
//                       --bg; each gradient stop; text on an image is counted
//                       and skipped), with the opacity of the element and of
//                       every ancestor multiplied into the ink (reviewer F3).
//                       A disabled control's text is measured without its fade
//                       (WCAG 1.4.3 exempts inactive components).
//                       No keep-list exemption (B3: tier labels included).
//             tierhue   U2 r2 (orchestrator Q1): every tier label text, rung
//                       names included (TIER_HUE_LABELS), keeps the hue of its
//                       --tier-* token within 12 degrees (achromatic tokens
//                       skipped); per-context lighter/darker variants pass.
//             eyebrows  U2 r2 (Q2): .faq-section-label and .pvp-season-name may
//                       be purple, but only --accent on the page and
//                       --accent-on-surface on a surface (text floor as above).
//             tiers     B3: every tier label (palette_page TIER_LABELS) outside
//                       a --inset-on-surface well and not on the page itself
//                       (wells have no hover or
//                       selected state; the wells section and the text line
//                       judge those), painted in its own colour,
//                       reaches 4.5:1 on each of --surface,
//                       --surface-hover and --surface-selected (a row at rest,
//                       hovered and selected), in both themes.
//             purple    no computed purple (color, fill, stroke, background,
//                       border, box-shadow, text-shadow, outline, drop-shadow,
//                       ::before/::after) outside palette_page PURPLE_ALLOW (B5).
//             borders   Quartz: nothing inside a --surface / --surface-hover /
//                       --surface-selected / --inset-on-surface fill draws a
//                       border or a thin divider strip in the page --border /
//                       --divider colour (B4).
//             fills     Quartz: a light --bg2 / --bg3 / --surface-inset fill
//                       inside such a surface holds no failing text (B4).
//             chrome    Quartz: modals, drawers, the mode pop-up and the slot
//                       cabinet (palette_page CHROME_DARK) have luminance < 0.05.
//             selected  selected-state controls (palette_page SELECTED): their
//                       best non-text marker (fill, border, ring, pseudo or
//                       empty child bar) >= 3:1 against what is behind them.
//   focus     (1280, both themes, every state) FOCUS_TABS presses of Tab: each
//             focus ring (outline or box-shadow) >= 3:1 against what is around
//             the focused control (reviewer F5).
//   buttons   (1280, both themes, B6) palette_page SECONDARY: --surface-hover
//             fill, a --surface-selected ring (border or inset shadow), and on
//             real mouse hover a neutral fill, ring, border and ink.
//   chart     (states with a chart, both themes, B8) the grid, axis, tick and
//             axis-label colours resolve to a theme token; every pinned series
//             hue is >= 3:1 against the chart card's fill.
//
//   node test/theme_check.mjs --snapshot-dither <baseDistDir>
//       write test/fixtures/theme/dither-base.json (painted pixel count of the
//       base build's dither, lower half outside the centre column, at 1280).
//   --jobs <n> (default 3) pages the walk opens at a time; --states <id,...>
//       limits the walk to those states (debugging); --dump <file>
//       writes every walk reading as JSON (for reports).
//
// Output: one `PASS <name>` / `FAIL <name>: <why>` per check, then
// `RESULT: PASS n checks` or `RESULT: FAIL k of n`; exit 0 or 1.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FREEZE_ANIMATIONS, ROOT, findChrome, sleep } from './visual_check.mjs';
import { STATES, contrastOf, openState, withBrowser } from './card_style_check.mjs';
import { ALLOW as LITERAL_ALLOW, hslOf, isPurpleRgb, purpleLiterals, scan as scanLiterals, scanProblems, stripComments } from './palette_scan.mjs';
import { TIER_LABELS, TIER_HUE_LABELS, TIER_HUE_TOLERANCE, TIER_ACHROMATIC, EYEBROW_TOKEN, CHART_PARTS, CHROME_DARK, CHROME_LUM, FOCUS_READ, FOCUS_TABS, INDICATOR_PIN, KEEP_TAGS, LARGE_MIN, LARGE_PX, LAYER_ROOTS, NON_TEXT_MIN, PURPLE_ALLOW, SECONDARY, SELECTED, SERIES_PIN, TEXT_MIN, WALK, BUTTON_READ } from './palette_page.mjs';

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
/** U2 A2: the dither strength (owner: "where did the pixel dithering go?"). */
export const DITHER_ALPHA = 1;
export const DITHER_DOT_CONTRAST = 9;
export const DITHER_MAX_ALPHA_MIN = 90;
export const DITHER_COVER = 0.9;
/** ditherBg.js COLUMN_HALF: the dots are dimmed within this many px of the centre, behind the copy. */
export const DITHER_COLUMN_HALF = 470;
/** U2 B3: the seven ladder tier colours stay exactly as they are (keep list), in both themes. */
export const TIER_TOKENS = { '--tier-tin': '#8a8f98', '--tier-bronze': '#cd7f32', '--tier-silver': '#c0c0c0', '--tier-gold': '#ffd700', '--tier-emerald': '#50c878', '--tier-mithril': '#ff77e9', '--tier-chroma': '#b24bf3' };
/** U2 B2: a store mode pop-up, planted (the card fixture's flat catalog never opens it); same markup as src/components/store/ModePrompt.jsx. */
const PLANT_MODE_PROMPT = `(() => { const o = document.createElement('div'); o.className = 'modal-overlay'; o.innerHTML = '<div class="mode-modal card" role="dialog" aria-modal="true" data-mode-prompt data-planted><h2 class="type-modal-title">WHICH MODE?</h2><div class="type-options"><button type="button" class="type-option mode-option" data-mode-option="pvp"><span class="type-option-name">ChromaPVP</span></button><button type="button" class="type-option mode-option" data-mode-option="smp"><span class="type-option-name">Economy SMP</span></button></div></div>'; document.body.appendChild(o); return true; })()`;
/** B6: the store's PVP | SMP switch, planted for the same reason (ModeSwitch.jsx markup: the checked mode primary, the other secondary). */
const PLANT_MODE_SWITCH = `(() => { const m = document.querySelector('main'); if (!m) return false; const d = document.createElement('div'); d.className = 'mode-switch'; d.setAttribute('role', 'radiogroup'); d.setAttribute('data-mode-switch', ''); d.setAttribute('data-planted', ''); d.innerHTML = '<button type="button" role="radio" aria-checked="true" class="btn btn-primary btn-sm mode-switch-opt" data-arcade data-mode="pvp" style="--edge: 4px">ChromaPVP</button><button type="button" role="radio" aria-checked="false" class="btn btn-secondary btn-sm mode-switch-opt" data-arcade data-mode="smp" style="--edge: 4px">Economy SMP</button>'; m.prepend(d); return true; })()`;
export const EXTRA_STATES = [
  { id: 'store-mode-prompt', path: '/store/', ready: '.pkg-card', setup: [PLANT_MODE_PROMPT] },
  { id: 'store-mode-switch', path: '/store/', ready: '.pkg-card', setup: [PLANT_MODE_SWITCH] },
];

export const ROUTES = [
  { path: '/', ready: '.mode-card', file: 'index.html' },
  { path: '/pvp/', ready: '.pvp-table', file: 'pvp/index.html' },
  { path: '/pvp/player/', ready: '.pvp-profile-state', file: 'pvp/player/index.html' },
  { path: '/store/', ready: '.pkg-card', file: 'store/index.html' },
  { path: '/auctions/', ready: '.market-row', file: 'auctions/index.html' },
  { path: '/faq/', ready: '.faq-item', file: 'faq/index.html' },
  { path: '/smp/', ready: '[data-section="dungeon"]', file: 'smp/index.html' }, // .fact until run 20261123-smp-page removed the fact cards
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
export const DITHER_BASE_FILE = join(FIX_DIR, 'dither-base.json');

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
      // U2 A1: dark is the default whatever the OS says; light only by the visitor's choice.
      const code = stripComments(font, true);
      if (code.includes('prefers-color-scheme')) p.push('font-ready snippet reads prefers-color-scheme (a first visit must be Obsidian whatever the OS says)');
      if (/matchMedia/.test(code)) p.push('font-ready snippet calls matchMedia (a first visit must be Obsidian whatever the OS says)');
      if (!/data-theme|dataset\.theme/.test(font)) p.push('font-ready snippet does not set data-theme');
      if (!/\btry\s*\{/.test(font) || !/\bcatch\b/.test(font)) p.push('font-ready snippet reads storage outside try/catch');
    }
    check(`static ${r.path} head-theme`, p);
    const metas = [...html.matchAll(/<meta\b[^>]*\bname\s*=\s*["']theme-color["'][^>]*>/gi)].map((m) => m[0].match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] ?? null);
    check(`static ${r.path} meta-default`, metas.length !== 1 ? [`${metas.length} theme-color metas, want 1`] : lc(metas[0]) !== THEME_COLOR.dark ? [`theme-color is ${q(metas[0])}, want ${THEME_COLOR.dark}`] : []);
  }
  const mod = join(ROOT, 'src', 'lib', 'theme.js');
  const code = existsSync(mod) ? stripComments(readFileSync(mod, 'utf-8'), true) : null;
  check('static src/lib/theme.js theme-module: no OS preference (U2 A1)', code == null ? ['src/lib/theme.js missing'] : [
    code.includes('prefers-color-scheme') ? 'reads prefers-color-scheme' : null,
    /matchMedia/.test(code) ? 'calls matchMedia' : null,
  ]);
}

// --------------------------------------------------------------- literals --

const SERIES_SRC = join(ROOT, 'src', 'components', 'market', 'chart.js');
const INDICATOR_SRC = join(ROOT, 'src', 'components', 'market', 'CandleChart.jsx');
function literalChecks() {
  const hits = scanLiterals();
  const problems = scanProblems(hits);
  const byFile = new Map();
  for (const h of hits) byFile.set(h.file, (byFile.get(h.file) ?? 0) + 1);
  const files = [...new Set([...byFile.keys(), 'src/index.css', 'src/market.css', 'src/pvp.css'])].sort();
  for (const f of files) {
    const p = problems.filter((x) => x.startsWith(f + ':'));
    check(`literals ${f}: no purple literal outside the token blocks and the keep list (${byFile.get(f) ?? 0} purple, ${(byFile.get(f) ?? 0) - p.length} allowed)`, p.length > 15 ? [`${p.length} purple literals`, ...p.slice(0, 15), `... and ${p.length - 15} more`] : p);
  }
  check(`literals allow list: every entry (${LITERAL_ALLOW.length}) still matches a literal`, problems.filter((x) => x.startsWith('stale')));
  // B8: the series hues are unchanged.
  const series = existsSync(SERIES_SRC) ? readFileSync(SERIES_SRC, 'utf-8') : '';
  const ind = existsSync(INDICATOR_SRC) ? readFileSync(INDICATOR_SRC, 'utf-8') : '';
  check('literals chart series hues unchanged (chart.js SERIES, CandleChart.jsx INDICATORS)', [
    ...Object.entries(SERIES_PIN).map(([k, v]) => (new RegExp(`\\b${k}\\s*:\\s*'${v}'`, 'i').test(series) ? null : `SERIES.${k} is not ${v}`)),
    ...Object.entries(INDICATOR_PIN).map(([k, v]) => (new RegExp(`id:\\s*'${k}'[^}]*colour:\\s*'${v}'`, 'i').test(ind) ? null : `INDICATORS ${k} is not ${v}`)),
  ]);
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
    let n = 0, bad = 0, sum = 0, worst = null, maxA = 0, region = 0;
    const scale = innerWidth / c.width, mid = innerWidth / 2;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > maxA) maxA = d[i + 3];
      if (d[i + 3] < 24) continue;
      n++;
      const px = (i / 4) % c.width, py = Math.floor(i / 4 / c.width);
      if (py >= c.height / 2 && Math.abs((px + 0.5) * scale - mid) >= ${DITHER_COLUMN_HALF}) region++;
      const spread = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
      if (spread > ${NEUTRAL}) { bad++; worst = worst || [d[i], d[i + 1], d[i + 2], d[i + 3]]; }
      sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
    }
    return { n, bad, mean: n ? sum / n : null, worst, w: c.width, h: c.height, maxA, region, vw: innerWidth };
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
  // U2 B3: the tier colours are pinned (keep list).
  const tiers = await page.ev(`(() => { const s = getComputedStyle(document.documentElement); return ${q(Object.keys(TIER_TOKENS))}.map((n) => [n, s.getPropertyValue(n).trim()]); })()`);
  check(`tokens ${theme} tier colours unchanged`, tiers.filter(([n, v]) => lc(v) !== TIER_TOKENS[n]).map(([n, v]) => `${n} is ${q(v)}, want ${TIER_TOKENS[n]}`));
  // U2 A2: the dither dots at full strength, a neutral grey well away from --bg.
  const dd = await page.ev(`(() => { const T = window.__theme; return { alpha: T.token('--dither-alpha'), dot: T.token('--dither-dot'), c: T.colour('var(--dither-dot)') }; })()`);
  const bgc = hexRgb(spec['--bg']);
  const dotRatio = dd.c ? contrastOf(dd.c.rgba, bgc) : 0;
  check(`tokens ${theme} dither: --dither-alpha ${DITHER_ALPHA}, --dither-dot neutral and >= ${DITHER_DOT_CONTRAST}:1 on --bg`, [
    parseFloat(dd.alpha) !== DITHER_ALPHA ? `--dither-alpha is ${q(dd.alpha)}, want ${DITHER_ALPHA} (the base alpha curve, unscaled)` : null,
    !dd.c ? `--dither-dot is ${q(dd.dot)}, not a colour` : !isNeutral(dd.c.rgba) ? `--dither-dot ${dd.c.css} is not neutral` : null,
    dd.c && dotRatio < DITHER_DOT_CONTRAST ? `--dither-dot ${dd.dot} is ${dotRatio.toFixed(2)}:1 on --bg ${spec['--bg']}, want >= ${DITHER_DOT_CONTRAST}` : null,
  ]);
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

let ditherBase = null;
function ditherProblems(d, theme) {
  if (!d) return ['no canvas.dither-bg'];
  if (d.n < 50) return [`only ${d.n} painted pixels (alpha >= 24) on a ${d.w}x${d.h} canvas`];
  const p = [];
  // U2 A2: as strong as the base build, where it shows (lower half, outside the copy column).
  if (d.maxA < DITHER_MAX_ALPHA_MIN) p.push(`strongest painted pixel has alpha ${d.maxA}/255, want >= ${DITHER_MAX_ALPHA_MIN}`);
  const want = ditherBase?.region?.[String(d.vw)];
  if (want == null) p.push(`no base dither count for width ${d.vw} in ${DITHER_BASE_FILE}`);
  else if (d.region < DITHER_COVER * want) p.push(`${d.region} painted pixels in the lower half outside the centre column, base has ${want} (want >= ${Math.ceil(DITHER_COVER * want)})`);
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

  // U2 A1 (owner 2026-11-17 "make sure dark mode is default"): was "first visit follows the OS".
  for (const os of THEMES)
    await run(`first visit is Obsidian (OS ${os})`, { os }, async (page) => {
      const s = await state(page);
      check(`switch first visit, OS ${os}: theme dark, set before <body>, meta #0E0F12`, [s.theme !== 'dark' ? `data-theme is ${q(s.theme)}, want "dark" whatever the OS says` : null, ...flashProblems(s, 'dark'), metaProblem(s, 'dark')]);
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

  // localStorage that throws on access (blocked storage): the page renders, is Obsidian (U2 A1), and toggles.
  for (const os of THEMES) {
    errors.length = 0;
    b.listeners.add(onError);
    try {
      await run(`storage throws (OS ${os})`, { os, init: THROWING_STORAGE }, async (page) => {
        const s = await state(page);
        const rendered = await page.ev(`!!document.querySelector('.site-nav') && !!document.querySelector(${q(HOME.ready)})`);
        const other = 'light';
        const clicked = await clickToggle(page);
        const ok = clicked && (await waitTheme(page, other));
        await sleep(150);
        const s2 = await state(page);
        check(`switch localStorage throws, OS ${os}: renders, theme dark, toggles to ${other}, no uncaught exception`, [
          rendered ? null : 'the page did not render its nav and mode cards',
          s.theme !== 'dark' ? `data-theme is ${q(s.theme)}, want "dark" whatever the OS says` : null,
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
  // U2 r2 (Q1): the tier hue guard.
  check('self tier hue: the token colour, a lighter and a darker variant of Chroma pass', ['Chroma', 'Chroma II'].flatMap((t) => [[178, 75, 243], [214, 160, 250], [110, 30, 160]].map((c) => tierHueProblem(t, c) ? `${t} ${c} failed` : null)));
  check('self tier hue: Chroma drifted to pink, Gold drifted to green, a grey Chroma fail', [tierHueProblem('Chroma', [255, 119, 233]) ? null : 'pink Chroma passed', tierHueProblem('Gold', [150, 200, 0]) ? null : 'green Gold passed', tierHueProblem('Chroma', [120, 120, 125]) ? null : 'grey Chroma passed']);
  check('self tier hue: achromatic tokens (Tin, Silver) and non-tier labels are skipped', [tierHueProblem('Silver', [0, 0, 255]) === null ? null : 'Silver judged', tierHueProblem('Tin', [255, 0, 0]) === null ? null : 'Tin judged', tierHueProblem('UNPLACED', [1, 2, 3]) === null ? null : 'UNPLACED judged']);
  // U2: the purple rule and the literal scanner.
  const lits = (src) => purpleLiterals(src).map((x) => x.literal.toLowerCase());
  check('self purple: the accent family, pinks and purple near-blacks are purple', ['#c77dff', '#9a4dff', '#7b2fe0', '#ff7de1', '#ffb3ec', '#0c0718', '#150f27', '#05020c', 'rgba(12, 7, 24, 0.6)', 'rgba(4,2,10,.55)', 'hsl(280 60% 50%)', 'hsla(300, 40%, 30%, .5)', '#c7d'].filter((c) => lits(`a{color:${c}}`).length !== 1).map((c) => `${c} not caught`));
  check('self purple: greys, blues, ambers, reds, greens and white/black overlays are not', ['#8a8f9a', '#0e0f12', '#16181d', '#5cb8ff', '#ffd27a', '#ff4d6d', '#5be3a0', 'rgba(255, 255, 255, 0.1)', 'rgba(0,0,0,.75)', 'hsl(206 80% 60%)', '#d3d6dc'].filter((c) => lits(`a{color:${c}}`).length).map((c) => `${c} caught`));
  check('self purple: computed rgb purple vs neutral', [isPurpleRgb([199, 125, 255, 1]) ? null : 'accent not purple', isPurpleRgb([39, 42, 50, 1]) ? '#272a32 purple' : null, isPurpleRgb([199, 125, 255, 0]) ? 'transparent counted' : null]);
  check('self literals: comments are not scanned', lits(stripComments('/* #c77dff */ a { color: #fff } // #ff7de1', true)).length ? ['comment literal caught'] : []);
  const fakeHits = [{ file: 'src/x.css', line: 1, literal: '#c77dff', context: '.a { color }' }, { file: 'src/x.css', line: 2, literal: '#ff7de1', context: '.keep { color }' }];
  const fakeAllow = [{ file: 'src/x.css', context: /^\.keep /, reason: 't' }, { file: 'src/x.css', context: /^\.gone /, reason: 't' }];
  const sp = scanProblems(fakeHits, fakeAllow);
  check('self literals: an unlisted hit fails, a listed one passes, a stale entry fails', [sp.some((x) => x.includes('.a { color }')) ? null : 'unlisted hit passed', sp.some((x) => x.includes('.keep')) ? 'listed hit failed' : null, sp.some((x) => x.startsWith('stale') && x.includes('gone')) ? null : 'stale entry passed']);
}

// ------------------------------------------------- walk, focus, buttons --

const fmtList = (list, max = 8) => (list.length > max ? [...list.slice(0, max), `... and ${list.length - max} more`] : list);
const sameRgb = (a, b) => a && b && a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= 1);
const isNeutralC = (c) => !c || c[3] === 0 || isNeutral(c);
const rgbS = (c) => (c ? `rgb(${c.slice(0, 3).map(Math.round).join(',')})${c[3] < 1 ? '/' + (+c[3].toFixed(2)) : ''}` : String(c));
const key = async (page, k, code) => {
  await page.s('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await page.s('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
};

/** One state, one width, one theme: [[check name, problems], ...] and the raw readings. */
async function walkOne(b, origin, job, args) {
  const { st, width, theme } = job;
  const id = `${st.id}@${width} ${theme}`;
  const lines = [];
  const raw = { id };
  let page;
  try {
    page = await openState(b, origin, { ...st, id: `palette ${st.id}`, init: [seed(theme), st.init].filter(Boolean).join('\n'), colorScheme: 'dark' }, width);
  } catch (e) {
    return { lines: [[`walk ${id}`, [`page did not open: ${String(e?.message ?? e).slice(0, 200)}`]]], raw };
  }
  try {
    await install(page);
    const tk = TOKENS[theme];
    const H = (n) => hexRgb(tk[n]);
    const cfg = {
      theme, layerRoots: LAYER_ROOTS, keepTags: KEEP_TAGS, tierLabels: TIER_LABELS, tierHueLabels: TIER_HUE_LABELS, eyebrows: EYEBROW_TOKEN, allow: PURPLE_ALLOW, chrome: CHROME_DARK, selected: SELECTED, chartParts: CHART_PARTS,
      textMin: TEXT_MIN, largeMin: LARGE_MIN, largePx: LARGE_PX, nonTextMin: NON_TEXT_MIN,
      tokens: { border: H('--border'), divider: H('--divider'), bg2: H('--bg2'), bg3: H('--bg3'), inset: H('--surface-inset'), surfaces: ['--surface', '--surface-hover', '--surface-selected', '--inset-on-surface'].map(H) },
    };
    const t = await page.ev(`document.documentElement.getAttribute('data-theme')`);
    const w = await page.ev(WALK(cfg));
    raw.walk = w;
    const themeP = t !== theme ? [`data-theme is ${q(t)}, want ${q(theme)} (seeded)`] : [];
    if (want(args, 'walk')) {
      lines.push([`walk ${id} text contrast (${w.text.n} text nodes in ${w.root}${w.text.onImage ? `, ${w.text.onImage} on images skipped` : ''})`, [...themeP, ...fmtList(w.text.fails.map((f) => `${f.path} ${q(f.text)} ${f.ink} on ${f.bg} ${f.ratio}:1 < ${f.min}${f.fade < 1 ? ` (opacity ${f.fade})` : ''}${f.keep ? ` [${f.keep}]` : ''}`))]]);
      lines.push([`walk ${id} purple only where allowed`, fmtList(w.purple.map((x) => `${x.path} ${x.prop} ${x.css}`))]);
      if (theme === 'light') {
        lines.push([`walk ${id} on-surface borders not the page --border/--divider`, fmtList(w.b4.borders.map((x) => `${x.path} ${x.side} ${x.css}`))]);
        lines.push([`walk ${id} no light fill with failing text inside a surface`, fmtList(w.b4.fills.map((x) => `${x.path} fill ${x.css} holds ${x.failing} failing text node(s)`))]);
        if (w.b4.chrome.length) lines.push([`walk ${id} chrome dark (luminance < ${CHROME_LUM})`, fmtList(w.b4.chrome.filter((x) => x.lum == null || x.lum >= CHROME_LUM).map((x) => `${x.path} ${x.css} luminance ${x.lum}`))]);
      }
      // Judged on the dark fills only where the label sits on a surface (not in a well, not on the page: Q1 lets a page-level label take a page-specific variant; the text line judges it there).
      const tiers = w.tiers.filter((t) => !t.inWell && !t.onPage);
      if (tiers.length) {
        const fills = [['--surface', H('--surface')], ['--surface-hover', H('--surface-hover')], ['--surface-selected', H('--surface-selected')]];
        const bad = [];
        for (const t of tiers)
          for (const [n, f] of fills) {
            const painted = [0, 1, 2].map((i) => t.ink[i] * t.ink[3] + f[i] * (1 - t.ink[3]));
            const r = contrastOf(painted, f);
            const min = t.large ? LARGE_MIN : TEXT_MIN;
            if (r < min) bad.push(`${t.path} ${q(t.text)} ${rgbS(t.ink)} on ${n} ${r.toFixed(2)}:1 < ${min}`);
          }
        lines.push([`walk ${id} tier labels >= ${TEXT_MIN}:1 on the rest, hover and selected fills (${tiers.length})`, fmtList([...new Set(bad)])]);
      }
      // Q1 hue guard: a tier label keeps its token's hue.
      if (w.tierHue.length) {
        const bad = [];
        let judged = 0;
        for (const t of w.tierHue) {
          const r = tierHueProblem(t.text, t.ink);
          if (r === null) continue;
          judged++;
          if (r) bad.push(`${t.path} ${r}`);
        }
        if (judged) lines.push([`walk ${id} tier label hue within ${TIER_HUE_TOLERANCE}deg of its --tier-* token (${judged})`, fmtList(bad)]);
      }
      // Q2: the eyebrows allowed purple use the accent token for their backdrop.
      if (w.eyebrows.length) {
        const bad = w.eyebrows.filter((e) => !sameRgb(e.ink, H(e.onPage ? '--accent' : '--accent-on-surface'))).map((e) => `${e.path} ${rgbS(e.ink)} on ${e.bg}, want ${e.onPage ? '--accent' : '--accent-on-surface'} ${tk[e.onPage ? '--accent' : '--accent-on-surface']}`);
        lines.push([`walk ${id} eyebrow labels use --accent (page) / --accent-on-surface (surface) (${w.eyebrows.length})`, fmtList(bad)]);
      }
      if (w.selected.n) lines.push([`walk ${id} selected markers >= ${NON_TEXT_MIN}:1 (${w.selected.n})`, fmtList(w.selected.fails.map((x) => `${x.path} ${x.marker} on ${x.bg} ${x.ratio}:1`))]);
    }
    if (w.chart && want(args, 'chart')) {
      const tokP = w.chart.parts.filter((x) => !x.token).map((x) => `${x.sel} ${x.prop} ${x.css} is no theme token`);
      lines.push([`chart ${id} grid, axis and labels from tokens (${w.chart.parts.length} parts)`, fmtList([...new Set(tokP)])]);
      const fill = w.chart.fill;
      lines.push([`chart ${id} series hues >= ${NON_TEXT_MIN}:1 on the chart card fill`, !fill ? [`no single fill behind the chart (${w.chart.fillCss})`] : Object.entries({ ...SERIES_PIN, ...INDICATOR_PIN }).map(([k, v]) => [k, v, contrastOf(hexRgb(v), fill)]).filter(([, , r]) => r < NON_TEXT_MIN).map(([k, v, r]) => `${k} ${v} is ${r.toFixed(2)}:1 on ${rgbS(fill)}`)]);
    }
    // Behind an open modal or drawer the page cannot be hovered: secondary controls are judged where no layer is open.
    if (width === 1280 && want(args, 'buttons') && w.root === 'body')
      for (const sec of SECONDARY) {
        const p = [];
        let seen = 0;
        for (let i = 0; i < 2; i++) {
          await page.ev(`(() => { const el = [...document.querySelectorAll(${q(sec.sel)})].filter((e) => e.getClientRects().length)[${i}]; if (el) el.scrollIntoView({ block: 'center' }); return true; })()`);
          await sleep(60);
          const rest = await page.ev(BUTTON_READ(sec.sel, i));
          if (!rest) break;
          seen++;
          if (!(rest.fill && rest.fill[3] >= 0.999 && sameRgb(rest.fill, H('--surface-hover')))) p.push(`${rest.path} fill ${rgbS(rest.fill)}${rest.image !== 'none' ? ' + ' + rest.image.slice(0, 40) : ''}, want --surface-hover ${tk['--surface-hover']}`);
          if (![...rest.border, ...rest.inset].some((c) => sameRgb(c, H('--surface-selected')))) p.push(`${rest.path} ring ${[...rest.border, ...rest.inset].map(rgbS).join(' ') || 'none'}, want --surface-selected ${tk['--surface-selected']} (border or inset ring)`);
          await page.s('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rest.x, y: rest.y });
          await sleep(200);
          const hov = await page.ev(BUTTON_READ(sec.sel, i));
          await page.s('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
          if (hov) {
            const bad = [['fill', hov.fill], ...hov.border.map((c) => ['border', c]), ...hov.inset.map((c) => ['ring', c]), ['ink', hov.ink]].filter(([, c]) => !isNeutralC(c));
            if (bad.length || hov.purple.length) p.push(`${hov.path} hover not neutral: ${[...bad.map(([k, c]) => `${k} ${rgbS(c)}`), ...hov.purple].join(', ')}`);
          }
        }
        if (!seen) continue;
        (raw.buttons ??= []).push(sec.name);
        lines.push([`buttons ${id} ${sec.name}: --surface-hover fill, --surface-selected ring, neutral hover`, p]);
      }
    if (width === 1280 && want(args, 'focus')) {
      await page.s('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
      await page.ev(`(() => { if (document.activeElement) document.activeElement.blur(); return true; })()`);
      const seenF = new Set();
      const p = [];
      let rings = 0, focused = 0;
      for (let i = 0; i < FOCUS_TABS; i++) {
        await key(page, 'Tab', 'Tab');
        await sleep(40);
        const f = await page.ev(FOCUS_READ);
        if (!f || seenF.has(f.path)) continue;
        seenF.add(f.path);
        focused++;
        if (f.rings) rings++;
        if (f.ratio != null && f.ratio < NON_TEXT_MIN) p.push(`${f.path} ${f.ring} on ${f.bg} ${f.ratio}:1`);
      }
      raw.focus = { focused, rings };
      lines.push([`focus ${id} rings >= ${NON_TEXT_MIN}:1 (${focused} focused, ${rings} with a ring)`, focused ? fmtList(p) : ['Tab focused nothing']]);
    }
  } catch (e) {
    lines.push([`walk ${id}`, [String(e?.message ?? e).slice(0, 300)]]);
  } finally {
    await page.close();
  }
  return { lines, raw };
}

/** Q1 hue guard (pure): null when the label names no chromatic tier, '' when its ink keeps the token hue, else the problem. */
export function tierHueProblem(text, ink) {
  const name = (String(text).match(/^[a-z]+/i) ?? [''])[0].toLowerCase();
  const tok = TIER_TOKENS[`--tier-${name}`];
  if (!tok) return null;
  const [th, ts] = hslOf(...hexRgb(tok));
  if (ts < TIER_ACHROMATIC) return null;
  const [h, sat] = hslOf(ink[0], ink[1], ink[2]);
  const d = Math.abs(((h - th + 540) % 360) - 180);
  return sat < TIER_ACHROMATIC || d > TIER_HUE_TOLERANCE ? `${q(text)} ${rgbS(ink)} hue ${h.toFixed(0)}deg (sat ${(sat * 100).toFixed(0)}%), --tier-${name} ${tok} hue ${th.toFixed(0)}deg: off by ${d.toFixed(0)} > ${TIER_HUE_TOLERANCE}` : '';
}

async function walkChecks(b, origin, args) {
  const jobs = [];
  const si = args.indexOf('--states');
  const only = si >= 0 ? args[si + 1].split(',') : null;
  for (const st of [...STATES, ...EXTRA_STATES]) if (!only || only.includes(st.id)) for (const width of st.widths ?? WIDTHS) for (const theme of THEMES) jobs.push({ st, width, theme });
  const ji = args.indexOf('--jobs');
  const n = Math.max(1, ji >= 0 ? +args[ji + 1] : 3);
  const results = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await walkOne(b, origin, jobs[i], args);
    }
  }));
  for (const r of results) for (const [name, problems] of r.lines) check(name, problems);
  // Coverage: every secondary control and a chart were really measured, in both themes.
  if (!only)
    for (const theme of THEMES) {
      const got = results.filter((r) => r.raw.id.endsWith(` ${theme}`));
      if (want(args, 'buttons')) check(`buttons ${theme} coverage: each secondary control rendered in some state`, SECONDARY.filter((sec) => !got.some((r) => r.raw.buttons?.includes(sec.name))).map((sec) => `${sec.name} (${sec.sel}) never rendered`));
      if (want(args, 'walk')) check(`walk ${theme} coverage: tier labels on a surface were judged on the three fills`, got.some((r) => r.raw.walk?.tiers?.some((t) => !t.inWell)) ? [] : ['no state rendered a tier label on a surface fill']);
      if (want(args, 'chart')) check(`chart ${theme} coverage: a chart rendered in some state`, got.some((r) => r.raw.walk?.chart) ? [] : ['no state rendered a chart']);
    }
  const di = args.indexOf('--dump');
  if (di >= 0) writeFileSync(resolve(args[di + 1]), JSON.stringify(results.map((r) => r.raw), null, 1));
}

async function snapshotDither(dist) {
  const out = { capturedFrom: process.argv[process.argv.indexOf('--snapshot-dither') + 2] ?? 'unknown', note: 'Painted dither pixels (alpha >= 24) in the lower half of the viewport outside the centre column, base build, for theme_check dither (U2 A2).', region: {}, maxAlpha: {} };
  await browser(dist, async (b, origin) => {
    const page = await open(b, origin, { label: 'dither base', os: 'dark' }, 1280);
    try {
      await install(page);
      const d = await page.ev('window.__theme.dither()');
      out.region[String(d.vw)] = d.region;
      out.maxAlpha[String(d.vw)] = d.maxA;
      console.log(`base dither @${d.vw}: ${d.n} painted, ${d.region} in the region, max alpha ${d.maxA}`);
    } finally {
      await page.close();
    }
  });
  if (failed) return;
  mkdirSync(FIX_DIR, { recursive: true });
  writeFileSync(DITHER_BASE_FILE, JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${DITHER_BASE_FILE}`);
}

// ------------------------------------------------------------------- nav --
// Run 20261123-nav (owner 2026-11-23: STORE SMP PVP WIKI AUCTIONS MAP). Part of the geometry section so the gate's
// subset runs it. N-T2: from 801 px the six links sit in one row with no sideways scroll; at 800 and below the
// hamburger shows and its open menu lists the six in order. N-T3: with no JS (the html.js class removed, which is
// what the app's no-JS CSS keys on) the bar wraps instead of overflowing at 320, 400 and 760.
export const NAV_LABELS = ['STORE', 'SMP', 'PVP', 'WIKI', 'AUCTIONS', 'MAP'];
const NAV_STATE = `(() => {
  const vw = innerWidth;
  const links = [...document.querySelectorAll('.site-nav-links a')];
  const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const rects = links.map((a) => a.getBoundingClientRect());
  return {
    sw: document.documentElement.scrollWidth, vw,
    labels: links.map((a) => a.textContent.trim()),
    shownLinks: links.filter(shown).length,
    tops: [...new Set(rects.filter((r, i) => shown(links[i])).map((r) => Math.round(r.top)))],
    outside: links.filter((a, i) => shown(a) && (rects[i].left < -0.5 || rects[i].right > vw + 0.5)).map((a) => a.textContent.trim()),
    toggle: shown(document.querySelector('.nav-toggle')),
  };
})()`;
async function navChecks(b, origin) {
  const look = async (width, steps, fn, name) => {
    let page;
    try {
      page = await openState(b, origin, { id: `nav ${name}`, path: '/', ready: '.site-nav', setup: steps }, width);
      check(name, fn(await page.ev(NAV_STATE)));
    } catch (e) {
      check(name, [String(e?.message ?? e)]);
    } finally {
      await page?.close();
    }
  };
  const noScroll = (n) => (n.sw > n.vw ? [`scrollWidth ${n.sw} > ${n.vw}`] : []);
  for (const width of [801, 900, 1024, 1280])
    await look(width, [], (n) => [
      ...noScroll(n),
      ...(q(n.labels) === q(NAV_LABELS) ? [] : [`nav labels ${q(n.labels)}, want ${q(NAV_LABELS)}`]),
      ...(n.toggle ? ['the hamburger is shown'] : []),
      ...(n.shownLinks === NAV_LABELS.length ? [] : [`${n.shownLinks} nav links shown, want ${NAV_LABELS.length}`]),
      ...(n.tops.length === 1 ? [] : [`nav links sit in ${n.tops.length} rows (tops ${q(n.tops)}), want one`]),
      ...(n.outside.length ? [`outside the viewport: ${q(n.outside)}`] : []),
    ], `nav-row @${width}`);
  const openMenu = ["(() => { const t = document.querySelector('.nav-toggle'); if (!t || !t.getClientRects().length) return false; t.click(); return true; })()", "(async () => { for (let i = 0; i < 50; i++) { if (document.querySelector('.site-nav-links.open')) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()"];
  for (const width of [800, 400])
    await look(width, openMenu, (n) => [
      ...noScroll(n),
      ...(n.toggle ? [] : ['no hamburger']),
      ...(q(n.labels) === q(NAV_LABELS) && n.shownLinks === NAV_LABELS.length ? [] : [`open menu shows ${n.shownLinks} of ${q(n.labels)}, want ${q(NAV_LABELS)}`]),
      ...(n.outside.length ? [`outside the viewport: ${q(n.outside)}`] : []),
    ], `nav-menu @${width}`);
  const noJs = ["(async () => { document.documentElement.classList.remove('js'); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return !document.documentElement.classList.contains('js'); })()"];
  for (const width of [320, 400, 760])
    await look(width, noJs, (n) => [
      ...noScroll(n),
      ...(n.shownLinks === NAV_LABELS.length ? [] : [`${n.shownLinks} nav links shown without JS, want ${NAV_LABELS.length}`]),
      ...(n.outside.length ? [`outside the viewport: ${q(n.outside)}`] : []),
    ], `nav-nojs @${width}`);
}

// ------------------------------------------------------------------- main --

const SECTIONS = ['static', 'literals', 'tokens', 'body', 'dither', 'switch', 'toggle', 'geometry', 'wells', 'glow', 'plant', 'walk', 'focus', 'buttons', 'chart', 'self'];
const BROWSER_SECTIONS = ['tokens', 'body', 'dither', 'switch', 'toggle', 'geometry', 'wells', 'glow', 'plant', 'walk', 'focus', 'buttons', 'chart'];
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
  if (args.includes('--snapshot-dither')) {
    await snapshotDither(resolve(args[args.indexOf('--snapshot-dither') + 1]));
  } else if (args.includes('--snapshot')) {
    await snapshot(resolve(args[args.indexOf('--snapshot') + 1]));
  } else {
    const dist = resolve(di >= 0 ? args[di + 1] : join(ROOT, 'dist'));
    const i = args.indexOf('--only');
    if (i >= 0) for (const s of args[i + 1].split(',')) if (!SECTIONS.includes(s)) throw new Error(`unknown section ${s}; sections: ${SECTIONS.join(', ')}`);
    const base = existsSync(BASE_FILE) ? JSON.parse(readFileSync(BASE_FILE, 'utf-8')) : null;
    ditherBase = existsSync(DITHER_BASE_FILE) ? JSON.parse(readFileSync(DITHER_BASE_FILE, 'utf-8')) : null;
    if (want(args, 'self')) selfChecks();
    if (want(args, 'static')) staticChecks(dist, base);
    if (want(args, 'literals')) literalChecks();
    if (BROWSER_SECTIONS.some((s) => want(args, s)))
      await browser(dist, async (b, origin) => {
        if (['tokens', 'body', 'dither'].some((s) => want(args, s))) await themedPageChecks(b, origin, args);
        if (want(args, 'switch')) await switchChecks(b, origin);
        if (want(args, 'wells')) await wellChecks(b, origin);
        if (want(args, 'glow')) await glowChecks(b, origin);
        if (want(args, 'toggle') || want(args, 'geometry')) await geometryChecks(b, origin, base, args);
        if (want(args, 'geometry')) await navChecks(b, origin);
        if (want(args, 'plant')) await plantChecks(b, origin, base);
        if (['walk', 'focus', 'buttons', 'chart'].some((s) => want(args, s))) await walkChecks(b, origin, args);
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
