// Purple/pink colour literal scan (run 20261117-palette, unit U2; plan "Kept as
// they are"). Used by test/theme_check.mjs (section `literals`); also
// `node test/palette_scan.mjs` prints every hit with its context.
//
// The rule: a colour literal (#rgb/#rrggbb/#rrggbbaa, rgb()/rgba(), hsl()/hsla())
// is PURPLE when its hue is in [PURPLE_HUE] degrees and its HSL saturation is
// above PURPLE_SAT. That catches the accent family (#c77dff 272deg, #9a4dff,
// #7b2fe0), the pinks (#ff7de1 313deg, #ffb3ec) and the purple-tinted near
// blacks the old palette used everywhere (#0c0718 258deg/55%, #150f27, #05020c,
// rgba(12,7,24,a), rgba(4,2,10,a)). Greys (saturation 0-15%), blues
// (#5cb8ff 206deg), reds, ambers and golds are outside it. Alpha is ignored:
// a 4% purple wash is still purple. Comments are not scanned.
//
// Scanned: src/**/*.{css,js,jsx} and the 8 page index.html. Not scanned: the
// two theme token blocks of src/index.css (the top-level `:root` and
// `[data-theme=light]` rules that declare --bg, where the accent lives by
// definition), and src/data/*.json (crate colour pairs are data, keep list).
// Other `:root` blocks (the tier colours, for one) are scanned like any rule.
// Template-built colours (hsl(${h} ...) item glyphs) are not literals and are
// out of the scan by construction (keep list: item glyph hsl()).
//
// Every hit must match an ALLOW entry (file + context, with the reason from
// the plan's keep list); an ALLOW entry that matches no hit fails as stale.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const PURPLE_HUE = [250, 340];
export const PURPLE_SAT = 0.15;
export const PAGES_HTML = ['index.html', 'pvp/index.html', 'pvp/player/index.html', 'store/index.html', 'auctions/index.html', 'faq/index.html', 'smp/index.html', 'privacy/index.html'];

/** [hue deg, saturation 0-1, lightness 0-1]. */
export function hslOf(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export const isPurpleHsl = (h, s) => h >= PURPLE_HUE[0] && h <= PURPLE_HUE[1] && s > PURPLE_SAT;
/** Purple by the rule, for an [r, g, b(, a)] colour (alpha ignored; fully transparent is not a colour). */
export const isPurpleRgb = (c) => (c[3] == null || c[3] > 0) && isPurpleHsl(...hslOf(c[0], c[1], c[2]));

const LITERAL = /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[^)]*\)|hsla?\(\s*(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%[^)]*\)/gi;

/** Purple literals in a source text: [{ index, literal }]. */
export function purpleLiterals(src) {
  const out = [];
  for (const m of src.matchAll(LITERAL)) {
    let h, s;
    if (m[1]) {
      let x = m[1];
      x = x.length <= 4 ? [...x.slice(0, 3)].map((c) => c + c).join('') : x.slice(0, 6);
      const n = parseInt(x, 16);
      [h, s] = hslOf((n >> 16) & 255, (n >> 8) & 255, n & 255);
    } else if (m[2] != null) [h, s] = hslOf(+m[2], +m[3], +m[4]);
    else { h = ((+m[5] % 360) + 360) % 360; s = +m[6] / 100; }
    if (isPurpleHsl(h, s)) out.push({ index: m.index, literal: m[0] });
  }
  return out;
}

/** Comments blanked (same length, so offsets and line numbers hold). A `//` right after `:` is a URL, not a comment. */
export function stripComments(src, js) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  if (js) out = out.replace(/(^|[^:'"`])\/\/[^\n]*/g, (c, pre) => pre + ' '.repeat(c.length - pre.length));
  return out;
}

/** CSS (comments already blanked): the enclosing block of an offset: selector, parents, depth, body. */
function cssContexts(clean) {
  const stack = [];
  const spans = [];
  let last = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '{') {
      const head = clean.slice(last, i).split(/[;}]/).pop().trim().replace(/\s+/g, ' ');
      stack.push({ head, start: i });
      last = i + 1;
    } else if (ch === '}') {
      const top = stack.pop();
      if (top) spans.push({ start: top.start, end: i, selector: top.head, depth: stack.length, parents: stack.map((s) => s.head), body: clean.slice(top.start + 1, i) });
      last = i + 1;
    } else if (ch === ';') last = i + 1;
  }
  return (idx) => {
    let best = null;
    for (const sp of spans) if (sp.start < idx && idx < sp.end && (!best || sp.start > best.start)) best = sp;
    return best ?? { selector: '', depth: 0, parents: [], body: '' };
  };
}
const TOKEN_SELECTOR = /^(?::root|html)?(?:\[data-theme=["']?(?:light|dark)["']?\])?$/;
const isTokenBlock = (ctx) => ctx.depth === 0 && !!ctx.selector &&
  ctx.selector.split(',').every((s) => s.trim() !== '' && TOKEN_SELECTOR.test(s.trim())) && /(^|[;{\s])--bg\s*:/.test(ctx.body);

/** Every purple literal outside the token blocks: [{ file, line, literal, context }]. */
export function scan(root = ROOT) {
  const files = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(css|js|jsx)$/.test(f)) files.push(p);
    }
  };
  walk(join(root, 'src'));
  for (const h of PAGES_HTML) if (existsSync(join(root, h))) files.push(join(root, h));
  const hits = [];
  for (const f of files) {
    const raw = readFileSync(f, 'utf-8');
    const rel = relative(root, f).split('\\').join('/');
    const src = stripComments(raw, /\.(js|jsx)$/.test(rel));
    const lines = raw.split('\n');
    const ctxOf = rel.endsWith('.css') ? cssContexts(src) : null;
    for (const { index, literal } of purpleLiterals(src)) {
      const lineNo = src.slice(0, index).split('\n').length;
      let context = lines[lineNo - 1].trim();
      if (ctxOf) {
        const c = ctxOf(index);
        if (isTokenBlock(c)) continue;
        const prop = (src.slice(0, index).split(/[;{]/).pop().match(/^\s*([-\w]+)\s*:/) ?? [])[1] ?? '';
        context = `${[...c.parents, c.selector].filter(Boolean).join(' / ')} { ${prop} }`;
      }
      hits.push({ file: rel, line: lineNo, literal, context });
    }
  }
  return hits;
}

/**
 * The plan's keep list, entry by entry: file, a pattern the hit's context must
 * match (CSS: "selector { property }"; JS/JSX: the source line), and why the
 * purple there is information the owner kept. Everything else purple fails:
 * slot cabinet chrome, free-key banner border, claim band, store promo,
 * carousel caption, nav, buttons, modals, overlays, focus rings, --btn-glow.
 * Keep-list colours that are not purple (medal tints, edition badges, status
 * amber/red, free-key gold, the other tiers and series) never hit the scan.
 */
export const ALLOW = [
  { file: 'src/index.css', context: /^:root \{ --tier-(mithril|chroma) \}$/, reason: 'tier tokens Mithril/Chroma (keep list: tier colours; values pinned by test:theme tiers)' },
  { file: 'src/lib/pvp.js', context: /name: '(Mithril|Chroma)'/, reason: 'ladder tier colours (keep list: tier colours)' },
  { file: 'src/index.css', context: /^\.store-rarity(--(chroma|mythic|epic))? \{ --rarity \}$/, reason: 'crate rarity bar colours (keep list: rarity colours)' },
  { file: 'src/index.css', context: /^\.rarity-text--(common|epic|mythic) \{ color \}$/, reason: 'rarity label colours (keep list: rarity colours)' },
  { file: 'src/index.css', context: /^\.store-tooltip(-lore)? \{ (background|border|box-shadow|color) \}$/, reason: 'Minecraft item tooltip replica (keep list: imitates the in-game tooltip)' },
  { file: 'src/index.css', context: /^(\.slot-cabinet\.is-match-2 \{ --roll-glow|\.slot-jackpot--2 \{ --shout|\.slot-window\.is-pair \{ box-shadow) \}$/, reason: 'slot result colours: a pair lights pink (keep list: slot reel colours; the cabinet chrome is NOT kept)' },
  { file: 'src/components/market/chart.js', context: /^(price|flat): '#/, reason: 'chart series hues (keep list: chart series)' },
  { file: 'src/components/market/CandleChart.jsx', context: /id: 'boll'/, reason: 'BOLL indicator series hue (keep list: chart series)' },
  { file: 'src/market.css', context: /^\.legend-candle--flat \{ color \}$/, reason: 'legend swatch of the flat-candle series (keep list: chart series; same hue as SERIES.flat)' },
];

/** Problems: hits outside ALLOW, and ALLOW entries that match nothing (stale). */
export function scanProblems(hits, allow = ALLOW) {
  const used = new Set();
  const out = [];
  for (const h of hits) {
    const i = allow.findIndex((a) => a.file === h.file && a.context.test(h.context));
    if (i >= 0) used.add(i);
    else out.push(`${h.file}:${h.line} ${h.literal} in ${h.context.slice(0, 90)}`);
  }
  allow.forEach((a, i) => { if (!used.has(i)) out.push(`stale ALLOW entry ${a.file} ${a.context} (${a.reason}): no purple literal matches it any more`); });
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hits = scan();
  for (const h of hits) console.log(`${h.file}:${h.line}  ${h.literal}  ${h.context.slice(0, 120)}`);
  const p = scanProblems(hits);
  for (const x of p.filter((x) => x.startsWith('stale'))) console.log(x);
  console.log(`${hits.length} purple literals outside the token blocks; ${p.length} problems`);
}
