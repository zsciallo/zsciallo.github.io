// Page-side readings for the both-theme palette checks (run 20261117-palette,
// unit U2 + U3; used by test/theme_check.mjs sections walk, focus, buttons,
// chart). Each export here is either a list the owner's plan names (with the
// reason per entry) or the source of a function evaluated in the page after
// window.__theme (theme_check's LIB) and window.__cards (card_style_check's
// LIB) are installed. Everything returns plain data; the judging is in
// theme_check.mjs, so the rules are visible next to the check lines.

import { PURPLE_HUE, PURPLE_SAT } from './palette_scan.mjs';

/** B2: text floors (WCAG AA; large text from 24px). Non-text (focus rings, selected markers): 3:1. */
export const TEXT_MIN = 4.5;
export const LARGE_MIN = 3;
export const LARGE_PX = 24;
export const NON_TEXT_MIN = 3;
/** B2 focus: Tab presses per page (from the top of the document) at 1280. */
export const FOCUS_TABS = 14;

/**
 * Where a state's open layer is, the text walk reads only inside it: the page
 * behind a modal is dimmed on purpose and is not what the visitor reads.
 */
export const LAYER_ROOTS = ['.modal-overlay', '.cart-drawer.open', '.lightbox'];

/**
 * B3 report grouping only (a failing text node is still a failure): the
 * owner's keep-list families, so the report can say which rows are tier,
 * rarity, rank, status or chart axis colours.
 */
export const KEEP_TAGS = [
  { sel: '.pvp-tier, .mode-live-tier, [class*="tier-"], .pvp-rung, .pvp-medal', tag: 'tier colours' },
  { sel: '[class*="rarity"]', tag: 'rarity colours' },
  { sel: '.rank-step, .pkg-modal--rank, [class*="rank-"]', tag: 'rank colours' },
  { sel: '.status-badge, [class*="status"], .pool-card .up, .pool-card .down, [class*="--up"], [class*="--down"], .pos, .neg', tag: 'status / up-down colours' },
  { sel: '.chart-tick, .chart-axis-label, .chart-legend, [class*="legend"]', tag: 'chart labels' },
  { sel: '.store-tooltip', tag: 'Minecraft tooltip' },
];

/**
 * B5: where a purple computed colour (hue PURPLE_HUE, saturation > PURPLE_SAT,
 * the literal scan's rule) is allowed. An element is allowed when it or an
 * ancestor matches `sel`; `props` limits the entry to those properties (all
 * when absent). Owner rule (plan "purple only as the accent"): primary CTA
 * fills, the active nav indicator, links, .accent spans, eyebrow labels, focus
 * rings, selected-state markers, toggle icons and the keep list. Anything else
 * purple fails with its element path.
 */
export const PURPLE_ALLOW = [
  { sel: '.btn-primary', reason: 'primary CTA fill, edge and glow' },
  { sel: '.site-nav-links a.active, .site-nav-links a.active .nav-bar', reason: 'active nav indicator' },
  { sel: 'a:not(.btn):not(.card):not([class*="card"])', props: ['color', 'text-decoration-color', 'border-bottom-color'], reason: 'links' },
  { sel: '.accent', reason: '.accent highlighted words' },
  { sel: '.section-eyebrow, .type-modal-eyebrow, [class*="eyebrow"], .join-label--discord', props: ['color', 'text-shadow'], reason: 'eyebrow labels' },
  { sel: '[aria-selected="true"], [aria-current="page"], [aria-checked="true"], [aria-pressed="true"], .active, .is-active, .is-selected, .selected', reason: 'selected-state markers (active tabs, active range tab, selected chips)' },
  { sel: '.sound-toggle, .theme-toggle', props: ['color', 'fill', 'stroke'], reason: 'toggle icons' },
  { sel: '.nav-toggle .nav-toggle-bar', props: ['background-color'], reason: 'toggle icons (the menu toggle bars; not their glow)' },
  // Keep list (plan "Kept as they are").
  { sel: '.pvp-tier, .mode-live-tier, [class*="tier-"], .pvp-rung, [style*="--tier"]', reason: 'keep list: tier colours' },
  { sel: '[class*="rarity"]', reason: 'keep list: rarity colours' },
  { sel: '.store-tooltip', reason: 'keep list: Minecraft tooltip' },
  { sel: '.pkg-modal--rank, .rank-step, .store-rank, [style*="--rank"]', reason: 'keep list: rank gradients (--rank-a/--rank-b)' },
  { sel: '.slot-window.is-pair, .slot-cabinet.is-match-2 .slot-jackpot, .slot-jackpot--2', reason: 'keep list: slot result colours' },
  { sel: '.chart-card svg, svg.chart, .chart-legend, [class*="legend-"]', props: ['fill', 'stroke', 'color', 'background-color'], reason: 'keep list: chart series' },
  { sel: '.item-icon--glyph', reason: 'keep list: item glyph hsl()' },
];

/** B2: selected-state controls whose marker must reach NON_TEXT_MIN against what is behind them. */
export const SELECTED = '[aria-selected="true"], [aria-current="page"], [aria-checked="true"], [aria-pressed="true"], .active, .is-active, .is-selected, .selected';

/** B3: tier label text (the ladder colours on text), judged on every surface fill a row can take. */
export const TIER_LABELS = '.pvp-tier, .mode-live-tier';

/** B4: chrome that must stay dark in Quartz (luminance < CHROME_LUM). */
export const CHROME_DARK = ['.pkg-modal', '.modal-card', '.type-modal', '.mode-modal', '.cart-drawer.open', '.slot-cabinet'];
export const CHROME_LUM = 0.05;

/**
 * B6: the secondary controls. Each must have a --surface-hover fill, a
 * --surface-selected ring (a border or an inset box-shadow ring) and a
 * neutral hover (fill, ring, border and ink all neutral). Checked wherever
 * one renders (1280); each must render in at least one state per theme.
 */
export const SECONDARY = [
  { sel: '[data-join-box] .btn-secondary', name: 'Join (Discord)' },
  { sel: '.mode-actions .copy-ip.btn-secondary', name: 'mode-card COPY IP' },
  { sel: '.mode-switch-opt.btn-secondary', name: 'inactive PVP | SMP switch' },
  { sel: '.pkg-cart-btn:not(:disabled)', name: '.pkg-cart-btn' },
  { sel: '.market-toggle:not(.active), .market-more', name: 'market press layer (.market-toggle, .market-more)' },
];

/** B8: the series hues, pinned (src/components/market/chart.js SERIES and CandleChart.jsx INDICATORS). */
export const SERIES_PIN = { price: '#ab68f2', floor: '#1ba873', up: '#3fcf8e', down: '#f2707c', flat: '#7f6ea6' };
export const INDICATOR_PIN = { ma7: '#f5c451', ma25: '#4fa3f7', boll: '#e07be0' };
/** B8: chart parts whose colour must be a theme token: [selector, property]. */
export const CHART_PARTS = [['.chart-grid', 'stroke'], ['.chart-axis', 'stroke'], ['.chart-tick', 'fill'], ['.chart-axis-label', 'fill']];

/** Shared in-page helpers (expects window.__theme and window.__cards). */
const HELPERS = String.raw`
  const T = window.__theme, L = window.__cards;
  const P = (s) => { try { return T.parse(s); } catch (e) { return null; } };
  const cache = new Map();
  const cs = (el) => { let c = cache.get(el); if (!c) { c = getComputedStyle(el); cache.set(el, c); } return c; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (t, u) => [0, 1, 2].map((i) => t[i] * t[3] + u[i] * (1 - t[3])).concat(1);
  const hsl = (c) => { const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn; const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; };
  const purple = (c) => { if (!c || c[3] === 0) return false; const [h, s] = hsl(c); return h >= ${PURPLE_HUE[0]} && h <= ${PURPLE_HUE[1]} && s > ${PURPLE_SAT}; };
  const rgbText = (c) => c ? 'rgb(' + c.slice(0, 3).map(Math.round).join(',') + ')' + (c[3] < 1 ? '/' + (+c[3].toFixed(2)) : '') : String(c);
  const clipText = (s) => s.backgroundClip === 'text' || s.webkitBackgroundClip === 'text';
  const stops = (v) => T.coloursIn(v).map((x) => x.rgba);
  const rendered = (el) => { if (!el.getClientRects().length) return false; const s = cs(el); return s.display !== 'none' && s.visibility !== 'hidden' && s.visibility !== 'collapse'; };
  const fadeOf = (el) => { let f = 1; for (let a = el; a && a.nodeType === 1; a = a.parentElement) f *= parseFloat(cs(a).opacity); return f; };
  const pageBg = (() => { const c = P(cs(document.body).backgroundColor); return c && c[3] >= 1 ? c : [0, 0, 0, 1]; })();
  /** Candidate opaque backdrops behind el (own fill included): gradients give one per stop; null on an image. */
  const backdrops = (el) => {
    const layers = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      const s = cs(e);
      if (clipText(s)) continue;
      const img = s.backgroundImage;
      if (img && img !== 'none') {
        if (/url\(/.test(img)) return null;
        const st = stops(img).filter((c) => c[3] > 0);
        if (st.length) { layers.push({ stops: st }); if (st.every((c) => c[3] >= 1)) break; }
      }
      const c = P(s.backgroundColor);
      if (c && c[3] > 0) { layers.push({ stops: [c] }); if (c[3] >= 1) break; }
    }
    let cands = [pageBg];
    for (let i = layers.length - 1; i >= 0; i--) {
      const next = [];
      for (const st of layers[i].stops) for (const u of cands) next.push(st[3] >= 1 ? st : over(st, u));
      const seen = new Set();
      cands = next.filter((c) => { const k = c.slice(0, 3).map(Math.round).join(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 24);
    }
    return cands;
  };
  const isSvg = (el) => el instanceof SVGElement;
  /** Ink candidates of a text element (SVG text: fill; clipped gradient words: each stop). */
  const inks = (el) => {
    const s = cs(el);
    if (isSvg(el)) { const f = P(s.fill); return f ? [[f[0], f[1], f[2], f[3] * (parseFloat(s.fillOpacity) || 1)]] : []; }
    let c = P(s.webkitTextFillColor);
    if (!c || c[3] === 0) {
      if (clipText(s) && s.backgroundImage !== 'none') return stops(s.backgroundImage);
      if (clipText(s)) { const b = P(s.backgroundColor); return b ? [b] : []; }
      c = P(s.color);
    }
    return c ? [c] : [];
  };
  const keepTag = (el, tags) => { for (const t of tags) if (el.closest(t.sel)) return t.tag; return null; };
`;

/**
 * The walk for one opened state: text contrast (B2/B3), purple discipline
 * (B5), on-surface borders, light fills and dark chrome (B4), selected markers
 * (B2) and chart colours (B8). cfg: { theme, layerRoots, keepTags, allow,
 * chrome, selected, chartParts, textMin, largeMin, largePx, tokens:
 * {border, divider, bg2, bg3, inset, surfaces[]} }.
 */
export const WALK = (cfg) => String.raw`(() => {
  const cfg = ${JSON.stringify(cfg)};
  ${HELPERS}
  const same = (a, b) => a && b && a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= 1);
  const out = { text: { n: 0, onImage: 0, fails: [] }, purple: [], b4: { borders: [], fills: [], chrome: [] }, selected: { n: 0, fails: [] }, chart: null };
  const layer = cfg.layerRoots.map((s) => [...document.querySelectorAll(s)].filter(rendered).pop()).find(Boolean);
  const root = layer || document.body;
  out.root = layer ? L.label(layer) : 'body';
  // ---- text (B2, B3)
  const failEls = new Set();
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || !rendered(el) || el.closest('script, style, noscript, template, title')) continue;
    // A disabled control's text is measured at its colour without its fade (WCAG 1.4.3 exempts inactive components).
    const fade = el.closest(':disabled, [aria-disabled="true"]') ? (fadeOf(el) > 0 ? 1 : 0) : fadeOf(el);
    if (fade === 0) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    const box = r.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    const bds = backdrops(el);
    if (!bds) { out.text.onImage++; continue; }
    const ink = inks(el).filter((c) => c[3] > 0);
    if (!ink.length) continue;
    out.text.n++;
    let worst = null;
    for (const i of ink) for (const b of bds) { const painted = over([i[0], i[1], i[2], i[3] * fade], b); const q = ratio(painted, b); if (!worst || q < worst.q) worst = { q, ink: painted, bg: b }; }
    const size = parseFloat(cs(el).fontSize);
    const min = size >= cfg.largePx ? cfg.largeMin : cfg.textMin;
    if (worst.q < min) {
      failEls.add(el);
      out.text.fails.push({ path: L.path(el), text: n.nodeValue.trim().slice(0, 28), ratio: +worst.q.toFixed(2), min, ink: rgbText(worst.ink), bg: rgbText(worst.bg), fade: +fade.toFixed(2), keep: keepTag(el, cfg.keepTags) });
    }
  }
  // ---- purple (B5): every rendered element of the document
  const allowed = (el, prop) => cfg.allow.some((a) => (!a.props || a.props.includes(prop)) && el.closest(a.sel));
  const seenP = new Set();
  const flag = (el, prop, c, pseudo = '') => {
    if (!purple(c) || allowed(el, prop)) return;
    const key = L.path(el) + pseudo + ' ' + prop;
    if (seenP.has(key)) return;
    seenP.add(key);
    out.purple.push({ path: L.path(el) + pseudo, prop, css: rgbText(c) });
  };
  const ownText = (el) => [...el.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim());
  const SIDES = ['Top', 'Right', 'Bottom', 'Left'];
  const boxColours = (el, s, pseudo) => {
    flag(el, 'background-color', P(s.backgroundColor), pseudo);
    if (s.backgroundImage !== 'none') for (const c of stops(s.backgroundImage)) flag(el, 'background-image', c, pseudo);
    for (const d of SIDES) if (parseFloat(s['border' + d + 'Width']) > 0 && s['border' + d + 'Style'] !== 'none') flag(el, 'border-color', P(s['border' + d + 'Color']), pseudo);
    if (s.boxShadow !== 'none') for (const c of stops(s.boxShadow)) flag(el, 'box-shadow', c, pseudo);
    if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) flag(el, 'outline-color', P(s.outlineColor), pseudo);
    if (/drop-shadow/.test(s.filter)) for (const c of stops(s.filter)) flag(el, 'filter', c, pseudo);
  };
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('script, style, noscript, template') || !rendered(el)) continue;
    if (fadeOf(el) === 0) continue;
    const bx = el.getBoundingClientRect();
    if (bx.width < 1 || bx.height < 1) continue;
    const s = cs(el);
    if (isSvg(el)) {
      if (!(el instanceof SVGGraphicsElement) || el.tagName === 'svg' || el.tagName === 'g') continue;
      if (s.fill !== 'none') flag(el, 'fill', P(s.fill));
      if (s.stroke !== 'none') flag(el, 'stroke', P(s.stroke));
      continue;
    }
    if (ownText(el)) {
      flag(el, 'color', clipText(s) ? null : P(s.webkitTextFillColor) && P(s.webkitTextFillColor)[3] > 0 ? P(s.webkitTextFillColor) : P(s.color));
      if (s.textShadow !== 'none') for (const c of stops(s.textShadow)) flag(el, 'text-shadow', c);
      if (clipText(s) && s.backgroundImage !== 'none') for (const c of stops(s.backgroundImage)) flag(el, 'color', c);
    }
    boxColours(el, s, '');
    for (const p of ['::before', '::after']) {
      const ps = getComputedStyle(el, p);
      if (!ps.content || ps.content === 'none' || ps.content === 'normal' || ps.display === 'none') continue;
      boxColours(el, ps, p);
      if (ps.content !== '""' && ps.content !== "''") flag(el, 'color', P(ps.color), p);
    }
  }
  // ---- B4: inside a surface (Quartz): no page border / divider; light fills only with passing text; chrome dark
  const onSurface = (el) => { const b = backdrops(el); return !!b && b.length === 1 && cfg.tokens.surfaces.some((s) => same(b[0], s)); };
  if (cfg.theme === 'light') {
    const pageLines = [cfg.tokens.border, cfg.tokens.divider];
    const lightFills = [cfg.tokens.bg2, cfg.tokens.bg3, cfg.tokens.inset];
    for (const el of root.querySelectorAll('*')) {
      if (isSvg(el) || !rendered(el) || fadeOf(el) === 0) continue;
      const s = cs(el);
      const parent = el.parentElement;
      const inSurface = parent && onSurface(parent);
      const own = P(s.backgroundColor);
      const selfSurface = own && own[3] >= 1 && cfg.tokens.surfaces.some((x) => same(own, x));
      if (!inSurface && !selfSurface) continue;
      for (const d of SIDES) {
        if (!(parseFloat(s['border' + d + 'Width']) > 0) || s['border' + d + 'Style'] === 'none') continue;
        const c = P(s['border' + d + 'Color']);
        if (c && c[3] > 0 && pageLines.some((x) => same(c, x))) { out.b4.borders.push({ path: L.path(el), side: d.toLowerCase(), css: rgbText(c) }); break; }
      }
      for (const p of ['::before', '::after']) {
        const ps = getComputedStyle(el, p);
        if (!ps.content || ps.content === 'none' || ps.display === 'none') continue;
        const c = P(ps.backgroundColor);
        const thin = parseFloat(ps.height) <= 2.5 || parseFloat(ps.width) <= 2.5;
        if (thin && c && c[3] > 0 && pageLines.some((x) => same(c, x))) out.b4.borders.push({ path: L.path(el) + p, side: 'divider strip', css: rgbText(c) });
      }
      if (inSurface && own && own[3] >= 1 && lightFills.some((x) => same(own, x))) {
        const bad = [...failEls].filter((t) => el.contains(t));
        if (bad.length) out.b4.fills.push({ path: L.path(el), css: rgbText(own), failing: bad.length });
      }
    }
  }
  for (const sel of cfg.chrome)
    for (const el of document.querySelectorAll(sel)) {
      if (!rendered(el)) continue;
      const b = backdrops(el);
      const l = b ? Math.max(...b.map(lum)) : null;
      out.b4.chrome.push({ sel, path: L.path(el), lum: l == null ? null : +l.toFixed(4), css: b ? rgbText(b[0]) : 'image' });
    }
  // ---- selected markers (B2): a non-text marker >= 3:1 against what is behind the control
  for (const el of root.querySelectorAll(cfg.selected)) {
    if (!rendered(el) || fadeOf(el) === 0 || el === document.body) continue;
    const bd = el.parentElement ? backdrops(el.parentElement) : null;
    if (!bd) continue;
    const marks = [];
    const s = cs(el);
    const take = (c, what) => { if (c && c[3] > 0) marks.push({ c, what }); };
    take(P(s.backgroundColor), 'fill');
    if (s.backgroundImage !== 'none' && !clipText(s)) for (const c of stops(s.backgroundImage)) take(c, 'fill gradient');
    for (const d of SIDES) if (parseFloat(s['border' + d + 'Width']) > 0 && s['border' + d + 'Style'] !== 'none') take(P(s['border' + d + 'Color']), 'border-' + d.toLowerCase());
    if (s.boxShadow !== 'none') for (const c of stops(s.boxShadow)) take(c, 'box-shadow');
    for (const p of ['::before', '::after']) { const ps = getComputedStyle(el, p); if (ps.content && ps.content !== 'none' && ps.display !== 'none') { take(P(ps.backgroundColor), p); if (ps.backgroundImage !== 'none') for (const c of stops(ps.backgroundImage)) take(c, p); } }
    for (const g of el.querySelectorAll('svg *')) { if (!(g instanceof SVGGraphicsElement) || !rendered(g)) continue; const k = cs(g); if (k.fill !== 'none') take(P(k.fill), 'icon fill'); if (k.stroke !== 'none') take(P(k.stroke), 'icon stroke'); }
    for (const c of el.children) if (!c.textContent.trim() && rendered(c) && !isSvg(c)) { const k = cs(c); take(P(k.backgroundColor), 'child ' + L.label(c)); if (k.backgroundImage !== 'none') for (const x of stops(k.backgroundImage)) take(x, 'child ' + L.label(c)); }
    if (!marks.length) continue;
    out.selected.n++;
    let best = null;
    for (const m of marks) { const q = Math.min(...bd.map((b) => ratio(over(m.c, b), b))); if (!best || q > best.q) best = { q, m }; }
    if (best.q < cfg.nonTextMin) out.selected.fails.push({ path: L.path(el), ratio: +best.q.toFixed(2), marker: best.m.what + ' ' + rgbText(best.m.c), bg: rgbText(bd[0]) });
  }
  // ---- tier labels (B3): their painted ink, judged in node against the rest / hover / selected fills
  out.tiers = [];
  for (const el of root.querySelectorAll(cfg.tierLabels)) {
    if (!rendered(el) || !el.textContent.trim()) continue;
    const fade = fadeOf(el);
    if (fade === 0) continue;
    const ink = inks(el)[0];
    if (!ink) continue;
    const bd = backdrops(el);
    out.tiers.push({ path: L.path(el), text: el.textContent.trim().slice(0, 20), ink: [ink[0], ink[1], ink[2], ink[3] * fade], large: parseFloat(cs(el).fontSize) >= cfg.largePx, inWell: !bd || (bd.length === 1 && same(bd[0], cfg.tokens.surfaces[3])) });
  }
  // ---- chart (B8)
  const svg = [...document.querySelectorAll('svg')].find((s) => s.querySelector('.chart-tick') && rendered(s));
  if (svg) {
    const names = new Set();
    for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch (e) { continue; } for (const r of rules) if (r.selectorText && /^(:root|html)?(\[data-theme[^\]]*\])?$/.test(r.selectorText.trim()) || r.selectorText === ':root') for (const p of r.style) if (p.startsWith('--')) names.add(p); }
    const toks = [];
    for (const nme of names) { const c = T.colour('var(' + nme + ')'); if (c && c.rgba[3] > 0) toks.push({ name: nme, c: c.rgba }); }
    const parts = [];
    for (const [sel, prop] of cfg.chartParts)
      for (const el of svg.querySelectorAll(sel)) {
        const c = P(cs(el)[prop]);
        if (!c || c[3] === 0) continue;
        const hit = toks.find((t) => same(t.c, c));
        parts.push({ sel, prop, css: rgbText(c), token: hit ? hit.name : null });
      }
    const card = svg.closest('.chart-card') || svg.parentElement;
    const fill = backdrops(svg);
    out.chart = { card: L.label(card), fill: fill && fill.length === 1 ? fill[0] : null, fillCss: fill ? fill.map(rgbText).join(' | ') : 'image', parts };
  }
  return out;
})()`;

/** B2 focus: the focused element's ring and what is behind it (call after each Tab). */
export const FOCUS_READ = String.raw`(() => {
  ${HELPERS}
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  const s = getComputedStyle(el);
  const rings = [];
  if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) { const c = P(s.outlineColor); if (c && c[3] > 0) rings.push({ c, what: 'outline' }); }
  if (s.boxShadow !== 'none') for (const c of stops(s.boxShadow)) if (c[3] > 0) rings.push({ c, what: 'box-shadow' });
  // A form field may mark focus with its border instead (the best indicator counts; fields only, so a resting button border cannot stand in for a ring).
  if (el.matches('input, select, textarea')) for (const d of ['Top', 'Right', 'Bottom', 'Left']) if (parseFloat(s['border' + d + 'Width']) >= 1 && s['border' + d + 'Style'] !== 'none') { const c = P(s['border' + d + 'Color']); if (c && c[3] > 0) rings.push({ c, what: 'border-' + d.toLowerCase() }); }
  const bd = el.parentElement ? backdrops(el.parentElement) : null;
  const best = rings.length && bd ? rings.map((r) => ({ r, q: Math.min(...bd.map((b) => ratio(over(r.c, b), b))) })).sort((a, b) => b.q - a.q)[0] : null;
  return { path: L.path(el), outline: s.outlineStyle + ' ' + s.outlineWidth, ring: best ? best.r.what + ' ' + rgbText(best.r.c) : null, ratio: best ? +best.q.toFixed(2) : null, bg: bd ? rgbText(bd[0]) : 'image', rings: rings.length };
})()`;

/** B6: rest (or hover, after the mouse is on it) colours of the i-th match of sel, plus its centre point. */
export const BUTTON_READ = (sel, i) => String.raw`(() => {
  ${HELPERS}
  const el = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(rendered)[${i}];
  if (!el) return null;
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const SIDES = ['Top', 'Right', 'Bottom', 'Left'];
  const border = SIDES.filter((d) => parseFloat(s['border' + d + 'Width']) > 0 && s['border' + d + 'Style'] !== 'none').map((d) => P(s['border' + d + 'Color']));
  const inset = (s.boxShadow.match(/(?:rgba?|color)\([^()]*\)[^,]*inset|inset[^,]*(?:rgba?|color)\([^()]*\)/g) || []).map((x) => stops(x)[0]).filter(Boolean);
  const shadows = s.boxShadow === 'none' ? [] : stops(s.boxShadow);
  const ink = P(s.color);
  return { path: L.path(el), x: r.left + r.width / 2, y: r.top + r.height / 2, fill: P(s.backgroundColor), image: s.backgroundImage, border, inset, shadows, ink, purple: [P(s.backgroundColor), ...border, ...shadows, ink, ...stops(s.backgroundImage)].filter((c) => purple(c)).map(rgbText) };
})()`;
