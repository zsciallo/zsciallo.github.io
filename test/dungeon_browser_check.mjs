#!/usr/bin/env node
// Browser check for the Heartwood map page /dungeon/ (run 20261121-dungeon-map, U2 AC2-AC7
// and the search-injection check). Spec: .orch/runs/20261121-dungeon-map/spec-U2.md.
//
//   npm run build && node test/dungeon_browser_check.mjs [--dist <distDir>]
//   (npm script: "test:dungeon:browser": "node test/dungeon_browser_check.mjs")
//
// Serves the build with vite preview and drives headless Chrome over CDP exactly as
// test/card_style_check.mjs does (its withBrowser + openState: frozen clock, seeded
// Math.random, prefers-reduced-motion, so no spring, and a true 1280 or 400 px viewport
// through the CDP device-metrics override). Two Chrome launches:
//   GL on   software WebGL2 (SwiftShader): AC2, AC3, AC4, AC5, AC7, the injection checks;
//   GL off  --disable-gpu --disable-3d-apis (getContext('webgl2') is null): AC6.
// Run 20261121-dungeon-map U3-AC5 rides on the GL off launch: /smp/ at 400 px (the dungeon preview,
// EXPLORE THE DUNGEONS and OPEN THE AUCTION HOUSE fully in view, no horizontal scroll).
//
// Hooks (the contract with the implementer):
//   [data-map-box]        the map box. data-gl="on" once the first frame with blocks is drawn;
//                         data-gl="off" once the page has fallen back to the preview picture.
//   [data-map-box] canvas the WebGL canvas.
//   [data-map-preview]    <img src="/dungeon/preview.jpg"> inside the map box, placed by
//                         meta.preview (its box = the preview rect in map units, same scale as markers).
//   [data-map-slider]     <input type="range"> of the cut (world Y); reacts to the input event.
//   the label             an element whose whole text is "CUT AT Y <n>".
//   [data-map-mode]       the CUTAWAY / ALL BLOCKS switch.
//   [data-map-search]     the search <input>; reacts to the input event.
//   [data-map-result]     one button per search hit (text contains the hit's name); click selects it.
//   [data-marker-id=<id>] each marker, ids as the mock-up's (boss-<slug of name>, ...); its box is
//                         centred on its map point; hidden (checkVisibility false) when the cut hides it.
//   [data-map-panel]      the detail panel; shows the selected thing's name.
//
// Output: one `PASS <name>` / `FAIL <name>: <why>` per check, then `RESULT: PASS n checks` or
// `RESULT: FAIL k of n`; exit 0 or 1.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { ROOT, decodePng, diffImages } from './visual_check.mjs';
import { openState, withBrowser } from './card_style_check.mjs';
import { DIFF, ZONES } from '../src/data/dungeonMap.js';

const args = process.argv.slice(2);
const DIST = resolve(args.includes('--dist') ? args[args.indexOf('--dist') + 1] : join(ROOT, 'dist'));
const META = JSON.parse(readFileSync(join(ROOT, 'public', 'dungeon', 'meta.json'), 'utf-8'));

let passed = 0;
let failed = 0;
function check(name, problems) {
  const list = [].concat(problems ?? []).filter(Boolean);
  if (list.length) failed++;
  else passed++;
  console.log(list.length ? `FAIL ${name}: ${list.join('; ')}` : `PASS ${name}`);
}
const q = JSON.stringify;

// The slider range: lowest and highest block, world Y, read from the committed data (not from the page).
const [Y_MIN, Y_MAX] = (() => {
  const b = gunzipSync(readFileSync(join(ROOT, 'public', 'dungeon', 'blocks.bin.gz')));
  const n = b.readUInt32LE(4);
  const off = 32 + b.readUInt32LE(8) * 12 + n * 2;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = b.readUInt16LE(off + i * 2);
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  return [META.origin[1] + lo, META.origin[1] + hi];
})();
const OPEN_Y = 72;
/** Old Mossback (mock-up ZONES): shown at the opening cut (Y 72), hidden at Y 0. */
const MOSSBACK = { id: 'boss-old-mossback', name: 'Old Mossback', at: [-885.5, 67, -722.5] };
/** The Rotroot Heart, at Y -55: hidden at the opening cut, so a deep link must move the cut. */
const ROOTHEART = { id: 'boss-the-rotroot-heart', name: 'The Rotroot Heart' };
const HOSTILE = '<img src=x onerror="window.__dmXss=1">';
const GL_ON = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];
const GL_OFF = ['--disable-gpu', '--disable-3d-apis'];
const GL_WAIT_MS = 90_000;

/** In-page helpers, installed as window.__dm. */
const LIB = String.raw`(window.__dm = {
  el: (s) => document.querySelector(s),
  vis: (s) => { const e = document.querySelector(s); return !!e && e.checkVisibility({ visibilityProperty: true, opacityProperty: true }); },
  mark: (id) => '[data-marker-id="' + id + '"]',
  label: () => {
    const re = /^CUT AT Y -?\d+$/, t = (e) => e.textContent.replace(/\s+/g, ' ').trim();
    const all = [...document.querySelectorAll('body *')].filter((e) => re.test(t(e)) && e.checkVisibility());
    const inner = all.filter((e) => !all.some((o) => o !== e && e.contains(o)));
    return inner.length ? t(inner[0]) : null;
  },
  slider: () => { const s = document.querySelector('[data-map-slider]'); return s && { type: s.type, min: s.min, max: s.max, step: s.step, value: s.value }; },
  setCut: (v) => { const s = document.querySelector('[data-map-slider]'); s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; },
  type: (text) => { const i = document.querySelector('[data-map-search]'); i.focus(); i.value = text; i.dispatchEvent(new Event('input', { bubbles: true })); return i.value; },
  panel: () => (document.querySelector('[data-map-panel]')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
  rect: (s) => { const e = typeof s === 'string' ? document.querySelector(s) : s; if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; },
  until: async (fn, ms) => { for (let t = 0; t < ms; t += 50) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 50)); } return !!(await fn()); },
  frames: () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))),
  webgl2: () => !!document.createElement('canvas').getContext('webgl2'),
  injected: () => ({ img: document.querySelectorAll('img').length, x: document.querySelectorAll('img[src="x"], [onerror]').length, ran: window.__dmXss === 1 }),
}, true)`;

const open = async (b, origin, path, width = 1280) => {
  const page = await openState(b, origin, { id: `dungeon ${path}`, path, ready: '[data-map-box]' }, width);
  await page.ev(LIB);
  return page;
};
const until = (page, cond, ms) => page.ev(`window.__dm.until(() => ${cond}, ${ms})`);

/** The map canvas alone (or `sel` alone, over the canvas's clip; everything else in the map box invisible), decoded. */
async function shot(page, sel = 'canvas') {
  const box = await page.ev(`(() => {
    const st = document.createElement('style'); st.id = '__dm_only';
    st.textContent = '[data-map-box] * { visibility: hidden !important } [data-map-box] ${sel} { visibility: visible !important${sel === 'canvas' ? '' : '; display: block !important'} }';
    document.head.appendChild(st);
    const c = document.querySelector('[data-map-box] canvas'); if (!c) return null;
    const r = c.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height, scale: 1 };
  })()`);
  try {
    if (!box || box.width < 10 || box.height < 10) return null;
    await page.ev('window.__dm.frames()');
    const { data } = await page.s('Page.captureScreenshot', { format: 'png', clip: box, captureBeyondViewport: true });
    return decodePng(Buffer.from(data, 'base64'));
  } finally {
    await page.ev(`(document.getElementById('__dm_only')?.remove(), true)`);
  }
}
/** Share of pixels that differ (sum of |dR|+|dG|+|dB| > 24) from the most common colour, the background. */
function painted(img) {
  const n = img.width * img.height;
  const count = new Map();
  for (let i = 0; i < n * 4; i += 4) {
    const k = (img.rgba[i] << 16) | (img.rgba[i + 1] << 8) | img.rgba[i + 2];
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const bg = [...count].sort((a, b) => b[1] - a[1])[0][0];
  const [r, g, b] = [bg >> 16, (bg >> 8) & 255, bg & 255];
  let diff = 0;
  for (let i = 0; i < n * 4; i += 4) if (Math.abs(img.rgba[i] - r) + Math.abs(img.rgba[i + 1] - g) + Math.abs(img.rgba[i + 2] - b) > 24) diff++;
  return { share: diff / n, bg: `rgb(${r}, ${g}, ${b})` };
}

async function page(b, origin, name, path, width, fn) {
  let p;
  try {
    p = await open(b, origin, path, width);
  } catch (e) {
    return check(`${name}: page opens`, [String(e?.message ?? e)]);
  }
  try {
    await fn(p);
  } catch (e) {
    check(`${name}: runs`, [String(e?.message ?? e)]);
  } finally {
    await p.close();
  }
}

// ---------------------------------------------------------------- GL on --

async function glOn(b, origin) {
  await page(b, origin, 'gl-on', '/dungeon/', 1280, async (p) => {
    const env = await p.ev('window.__dm.webgl2()');
    check('env: software WebGL2 is available in this Chrome (else AC2-AC4 cannot be judged)', env ? [] : ["getContext('webgl2') is null with SwiftShader flags"]);
    // AC2
    const on = await until(p, `document.querySelector('[data-map-box]')?.dataset.gl === 'on'`, GL_WAIT_MS);
    check('AC2 [data-gl="on"] is set on the map box after load', on ? [] : [`not set after ${GL_WAIT_MS / 1000} s (data-gl ${q(await p.ev(`document.querySelector('[data-map-box]')?.dataset.gl ?? null`))})`]);
    const first = await shot(p);
    const pt = first && painted(first);
    check('AC2 the canvas is not blank: more than 5% of its pixels differ from the background', !first ? ['no visible canvas in [data-map-box]'] : pt.share > 0.05 ? [] : [`${(pt.share * 100).toFixed(2)}% differ from ${pt.bg}`]);

    // AC3: CUTAWAY opens at Y 72; every block height from the lowest to the highest, step 1.
    const s = await p.ev('window.__dm.slider()');
    check(`AC3 slider is a range from the lowest block (Y ${Y_MIN}) to the highest (Y ${Y_MAX}), step 1, opening at Y ${OPEN_Y}`, !s ? ['no [data-map-slider]'] : [
      s.type !== 'range' ? `type ${q(s.type)}, want "range"` : null,
      Number(s.min) !== Y_MIN ? `min ${q(s.min)}, want ${Y_MIN}` : null,
      Number(s.max) !== Y_MAX ? `max ${q(s.max)}, want ${Y_MAX}` : null,
      s.step !== '1' ? `step ${q(s.step)}, want "1"` : null,
      s.value !== String(OPEN_Y) ? `value ${q(s.value)}, want ${OPEN_Y}` : null,
    ]);
    check(`AC3 the label reads "CUT AT Y ${OPEN_Y}" on open`, (await p.ev('window.__dm.label()')) === `CUT AT Y ${OPEN_Y}` ? [] : [`label is ${q(await p.ev('window.__dm.label()'))}`]);
    await p.ev(`window.__dm.setCut(${OPEN_Y - 1})`);
    const relabel = await until(p, `window.__dm.label() === 'CUT AT Y ${OPEN_Y - 1}'`, 3000);
    check(`AC3 one step down: the label reads "CUT AT Y ${OPEN_Y - 1}"`, relabel ? [] : [`label is ${q(await p.ev('window.__dm.label()'))}`]);
    let next = null;
    for (let t = 0; t < 20 && first; t++) {
      next = await shot(p);
      if (next && next.width === first.width && next.height === first.height && diffImages(first, next).count > 0) break;
    }
    check(`AC3 one step down redraws the frame (Y ${OPEN_Y} vs Y ${OPEN_Y - 1})`, !first || !next ? ['no canvas capture'] : next.width !== first.width || next.height !== first.height ? [`canvas size changed ${first.width}x${first.height} -> ${next.width}x${next.height}`] : diffImages(first, next).count ? [] : ['the canvas is pixel-identical after the cut moved one block']);

    // AC4: a marker above the cut is hidden; picking it from search moves the cut above it and shows it.
    const mk = q(`[data-marker-id="${MOSSBACK.id}"]`);
    const shownAt72 = await p.ev(`(window.__dm.setCut(${OPEN_Y}), window.__dm.until(() => window.__dm.vis(${mk}), 3000))`);
    check(`AC4 ${MOSSBACK.name} (Y ${MOSSBACK.at[1]}) is shown at the opening cut Y ${OPEN_Y}`, shownAt72 ? [] : [`[data-marker-id="${MOSSBACK.id}"] not visible`]);
    await p.ev('window.__dm.setCut(0)');
    const hidden = await until(p, `!window.__dm.vis(${mk}) && window.__dm.label() === 'CUT AT Y 0'`, 3000);
    check(`AC4 at cut Y 0 the marker of ${MOSSBACK.name} (Y ${MOSSBACK.at[1]}, above the cut) is hidden`, hidden ? [] : [`visible ${await p.ev(`window.__dm.vis(${mk})`)}, label ${q(await p.ev('window.__dm.label()'))}`]);
    await p.ev(`window.__dm.type(${q(MOSSBACK.name)})`);
    const hit = `[...document.querySelectorAll('[data-map-result]')].find((e) => e.checkVisibility() && e.textContent.includes(${q(MOSSBACK.name)}))`;
    const found = await until(p, `!!${hit}`, 3000);
    if (found) await p.ev(`(${hit}.click(), true)`);
    const shown = found && (await until(p, `window.__dm.vis(${mk})`, 5000));
    const after = await p.ev('window.__dm.slider()');
    const label = await p.ev('window.__dm.label()');
    check(`AC4 picking ${MOSSBACK.name} from search moves the cut to Y >= ${MOSSBACK.at[1]}, shows the marker and the panel names it`, !found ? [`no visible [data-map-result] containing ${q(MOSSBACK.name)} after typing it`] : [
      shown ? null : 'the marker is still hidden',
      after && Number(after.value) >= MOSSBACK.at[1] ? null : `slider value ${q(after?.value)}, want >= ${MOSSBACK.at[1]}`,
      after && label === `CUT AT Y ${after.value}` ? null : `label ${q(label)} does not match the slider ${q(after?.value)}`,
      (await p.ev('window.__dm.panel()')).includes(MOSSBACK.name) ? null : `[data-map-panel] text ${q((await p.ev('window.__dm.panel()')).slice(0, 120))} lacks ${q(MOSSBACK.name)}`,
    ]);

    // Abuse: search text is compared, never inserted as HTML.
    const before = await p.ev('window.__dm.injected()');
    const typed = await p.ev(`window.__dm.type(${q(HOSTILE)})`);
    await p.ev('window.__dm.frames()');
    const got = await p.ev('window.__dm.injected()');
    check('AB1 a search for <img src=x onerror=...> adds no element and runs nothing', [
      typed !== HOSTILE ? `the search input holds ${q(typed)}` : null,
      got.img !== before.img ? `${got.img - before.img} <img> added` : null,
      got.x ? `${got.x} img[src=x] / [onerror] element(s) in the page` : null,
      got.ran ? 'the onerror handler ran' : null,
    ]);
  });

  // AC5: a deep link to a boss selects it (and, the boss being under the opening cut, shows it).
  await page(b, origin, 'deep link', `/dungeon/#${ROOTHEART.id}`, 1280, async (p) => {
    const named = await until(p, `window.__dm.panel().includes(${q(ROOTHEART.name)})`, 15_000);
    check(`AC5 /dungeon/#${ROOTHEART.id} selects ${ROOTHEART.name}: the panel names it`, named ? [] : [`[data-map-panel] text ${q((await p.ev('window.__dm.panel()')).slice(0, 120))}`]);
    const vis = await until(p, `window.__dm.vis(${q(`[data-marker-id="${ROOTHEART.id}"]`)})`, 5000);
    check(`AC5 the deep-linked ${ROOTHEART.name} (Y -55) is shown: the cut moved to it`, vis ? [] : [`[data-marker-id="${ROOTHEART.id}"] not visible, label ${q(await p.ev('window.__dm.label()'))}`]);
  });

  // Abuse (added by the test writer): the hash is the other text a visitor controls.
  await page(b, origin, 'hash injection', `/dungeon/#${encodeURIComponent(HOSTILE)}`, 1280, async (p) => {
    await until(p, `window.__dm.panel().length > 0`, 10_000);
    await p.ev('window.__dm.frames()');
    const got = await p.ev('window.__dm.injected()');
    check('AB2 /dungeon/#<img src=x onerror=...> inserts nothing and runs nothing', [got.x ? `${got.x} img[src=x] / [onerror] element(s) in the page` : null, got.ran ? 'the onerror handler ran' : null]);
  });

  // AC7: 400 px wide.
  await page(b, origin, '400px', '/dungeon/', 400, async (p) => {
    await until(p, `document.querySelector('[data-map-box]')?.dataset.gl === 'on'`, GL_WAIT_MS);
    const sw = await p.ev('document.documentElement.scrollWidth');
    check('AC7 at 400 px there is no horizontal scroll (scrollWidth <= 400)', sw <= 400 ? [] : [`scrollWidth ${sw}`]);
    for (const [what, sel] of [['slider', '[data-map-slider]'], ['search', '[data-map-search]'], ['mode switch', '[data-map-mode]']]) {
      const r = await p.ev(`(() => { const e = document.querySelector(${q(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, bo: b.bottom, w: b.width, h: b.height, vw: innerWidth, vh: innerHeight, vis: e.checkVisibility({ visibilityProperty: true }) }; })()`);
      check(`AC7 at 400 px the ${what} (${sel}) is fully inside the viewport`, !r ? [`no ${sel}`] : !r.vis || r.w < 1 || r.h < 1 ? [`not shown (${r.w}x${r.h}, visible ${r.vis})`] : r.l < 0 || r.r > r.vw || r.t < 0 || r.bo > r.vh ? [`box ${Math.round(r.l)}..${Math.round(r.r)} x ${Math.round(r.t)}..${Math.round(r.bo)} in a ${r.vw}x${r.vh} viewport`] : []);
    }
  });
}

// --------------------------------------------------------------- GL off --

/** Run 20261121-dungeon-map U3-AC5: /smp/ at 400 px, no horizontal scroll, the dungeon preview and both buttons fully in view. */
async function smp400(b, origin) {
  let p;
  try {
    p = await openState(b, origin, { id: 'smp 400px', path: '/smp/', ready: '[data-section="dungeon"]' }, 400);
  } catch (e) {
    return check('U3-AC5 /smp/ at 400 px: page opens', [String(e?.message ?? e)]);
  }
  try {
    const sw = await p.ev('document.documentElement.scrollWidth');
    check('U3-AC5 /smp/ at 400 px has no horizontal scroll (scrollWidth <= 400)', sw <= 400 ? [] : [`scrollWidth ${sw}`]);
    const link = (href, text) => `[...document.querySelectorAll('a[href="${href}"]')].find((a) => a.textContent.trim() === ${q(text)})`;
    for (const [what, find] of [
      ['dungeon preview picture', `document.querySelector('a[href="/dungeon/"] img[src="/dungeon/preview.jpg"]')`],
      ['EXPLORE THE DUNGEONS button', link('/dungeon/', 'EXPLORE THE DUNGEONS')],
      ['OPEN THE AUCTION HOUSE button', link('/auctions/', 'OPEN THE AUCTION HOUSE')],
    ]) {
      const r = await p.ev(`(() => { const e = ${find}; if (!e) return null; e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, bo: b.bottom, w: b.width, h: b.height, vw: innerWidth, vh: innerHeight, vis: e.checkVisibility({ visibilityProperty: true }) }; })()`);
      check(`U3-AC5 /smp/ at 400 px the ${what} is fully inside the viewport`, !r ? [`no ${what}`] : !r.vis || r.w < 1 || r.h < 1 ? [`not shown (${r.w}x${r.h}, visible ${r.vis})`] : r.l < 0 || r.r > r.vw || r.t < 0 || r.bo > r.vh ? [`box ${Math.round(r.l)}..${Math.round(r.r)} x ${Math.round(r.t)}..${Math.round(r.bo)} in a ${r.vw}x${r.vh} viewport`] : []);
    }
  } catch (e) {
    check('U3-AC5 /smp/ at 400 px: runs', [String(e?.message ?? e)]);
  } finally {
    await p.close();
  }
}

async function glOff(b, origin) {
  await smp400(b, origin);
  await page(b, origin, 'gl-off', '/dungeon/', 1280, async (p) => {
    const env = await p.ev('window.__dm.webgl2()');
    check("env: WebGL2 is off in this Chrome (getContext('webgl2') is null)", env ? ['getContext("webgl2") works despite --disable-3d-apis'] : []);
    const off = await until(p, `document.querySelector('[data-map-box]')?.dataset.gl === 'off'`, 30_000);
    check('AC6 the map box falls back: data-gl="off", never "on"', off ? [] : [`data-gl is ${q(await p.ev(`document.querySelector('[data-map-box]')?.dataset.gl ?? null`))}`]);
    const pv = await p.ev(`(async () => { const i = document.querySelector('[data-map-box] img[data-map-preview]'); if (!i) return null; await window.__dm.until(() => i.complete, 10000); const r = i.getBoundingClientRect(); return { src: new URL(i.src).pathname, ok: i.complete && i.naturalWidth > 0, vis: i.checkVisibility({ visibilityProperty: true, opacityProperty: true }), l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
    const ratio = META.preview.w / META.preview.h;
    check('AC6 preview.jpg is shown in the map box, in the shape of meta.preview', !pv ? ['no [data-map-box] img[data-map-preview]'] : [
      pv.src !== '/dungeon/preview.jpg' ? `src ${q(pv.src)}` : null,
      pv.ok ? null : 'the picture did not load',
      pv.vis && pv.w > 10 ? null : `not shown (${pv.w}x${pv.h})`,
      Math.abs(pv.w / pv.h - ratio) / ratio <= 0.02 ? null : `box ${pv.w.toFixed(1)}x${pv.h.toFixed(1)}, want the meta.preview ratio ${ratio.toFixed(4)}`,
    ]);
    const hide = await p.ev(`({ slider: window.__dm.vis('[data-map-slider]'), mode: window.__dm.vis('[data-map-mode]') })`);
    check('AC6 the slider and the mode switch are hidden', [hide.slider ? '[data-map-slider] is shown' : null, hide.mode ? '[data-map-mode] is shown' : null]);
    // The marker sits on the picture where its world point projects (same map frame as the bake).
    const [x, y, z] = MOSSBACK.at;
    const mx = META.A[0][0] * x + META.A[0][1] * y + META.A[0][2] * z + META.b[0];
    const my = META.A[1][0] * x + META.A[1][1] * y + META.A[1][2] * z + META.b[1];
    const mk = q(`[data-marker-id="${MOSSBACK.id}"]`);
    const m = await p.ev(`(() => { const e = document.querySelector(${mk}); if (!e) return null; const r = e.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, vis: window.__dm.vis(${mk}) }; })()`);
    const want = pv && [pv.l + ((mx - META.preview.x) * pv.w) / META.preview.w, pv.t + ((my - META.preview.y) * pv.h) / META.preview.h];
    check(`AC6 the ${MOSSBACK.name} marker is shown on the picture at its projected point (+-4 px)`, !m ? [`no ${mk}`] : !pv ? ['no preview picture to measure against'] : [
      m.vis ? null : 'marker hidden',
      Math.hypot(m.cx - want[0], m.cy - want[1]) <= 4 ? null : `centre (${m.cx.toFixed(1)}, ${m.cy.toFixed(1)}), want (${want[0].toFixed(1)}, ${want[1].toFixed(1)})`,
    ]);
    if (m) await p.ev(`(document.querySelector(${mk}).click(), true)`);
    const named = await until(p, `window.__dm.panel().includes(${q(MOSSBACK.name)})`, 3000);
    check(`AC6 clicking the marker opens ${MOSSBACK.name} in the panel`, named ? [] : [`[data-map-panel] text ${q((await p.ev('window.__dm.panel()')).slice(0, 120))}`]);
    const text = await p.ev(`document.querySelector('[data-map-box]')?.innerText ?? ''`);
    check('AC6 no error text for players in the map box', /error|webgl|failed|unsupported/i.test(text) ? [`map box says ${q(text.slice(0, 120))}`] : []);
  });
}

// ------------------------------------------------------------ round 2 --
// Reviewer r1 F1, F2, F3, F6, F7 (reports/U2-reviewer-r1.md) and the spec-U2 amendments.

const CUT_RGB = [46, 48, 56];
const BG_RGB = [9, 10, 12];
const dist3 = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
const px = (img, x, y) => Array.from(img.rgba.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3));
/** Root Gate (resources/camps/hw_root_gate.yml, chromatic-dungeons release/chromabithia): interval-seconds 180, jitter-seconds 45. */
const ROOT_GATE = { id: 'camp-root-gate', name: 'Root Gate', ceiling: '225 s', base: '180 s' };

/**
 * A column for the cut off-by-one check, from the committed data: a grass or moss block at relative y n, top of a
 * 4x4 patch (x-1..x+2, z-1..z+2) where every column is a whole cube at n and at n-1 with nothing at n+1.
 * With the cut at n the top face of (x, n, z) is drawn; at n-1 the cut face covers the patch.
 */
const COLUMN = (() => {
  const b = gunzipSync(readFileSync(join(ROOT, 'public', 'dungeon', 'blocks.bin.gz')));
  const solid = gunzipSync(readFileSync(join(ROOT, 'public', 'dungeon', 'solid.bin.gz')));
  const n = b.readUInt32LE(4), nc = b.readUInt32LE(8), [sx, sy, sz] = META.size;
  const col = (c, i) => b.readUInt16LE(32 + nc * 12 + (c * n + i) * 2);
  const idx = (x, y, z) => (y * sz + z) * sx + x;
  const isSolid = (x, y, z) => x >= 0 && z >= 0 && x < sx && z < sz && y >= 0 && y < sy && (solid[idx(x, y, z) >> 3] >> (7 - (idx(x, y, z) & 7))) & 1;
  const present = new Set();
  for (let i = 0; i < n; i++) present.add(idx(col(0, i), col(1, i), col(2, i)));
  const bright = new Set(META.states.map((s, i) => (/^(grass_block|moss_block)\b/.test(s) ? i : -1)).filter((i) => i >= 0));
  for (let i = 0; i < n; i++) {
    const [x, y, z] = [col(0, i), col(1, i), col(2, i)];
    if (!bright.has(col(3, i)) || y < 2) continue;
    let ok = true;
    for (let dx = -1; dx <= 2 && ok; dx++)
      for (let dz = -1; dz <= 2 && ok; dz++)
        ok = isSolid(x + dx, y, z + dz) && isSolid(x + dx, y - 1, z + dz) && !isSolid(x + dx, y + 1, z + dz) && !present.has(idx(x + dx, y + 1, z + dz));
    if (ok) return { x: META.origin[0] + x, y: META.origin[1] + y, z: META.origin[2] + z, state: META.states[col(3, i)] };
  }
  return null;
})();

/** Wait for the reloaded document's map box, then reinstall the helpers. */
async function reloaded(p) {
  for (let t = 0; t < 300; t++) {
    try {
      if (await p.ev(`document.readyState === 'complete' && !!document.querySelector('[data-map-box]')`)) return p.ev(LIB);
    } catch {
      /* navigating */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('the page did not load again in 30 s');
}

/** The fallback a visitor gets (spec line 49): data-gl off, preview shown, no slider or mode switch, markers and panel work, no error text. */
async function fallbackChecks(p, name) {
  const off = await until(p, `document.querySelector('[data-map-box]')?.dataset.gl === 'off'`, 10_000);
  check(`${name}: data-gl="off"`, off ? [] : [`data-gl is ${q(await p.ev(`document.querySelector('[data-map-box]')?.dataset.gl ?? null`))}`]);
  const pv = await p.ev(`(async () => { const i = document.querySelector('[data-map-box] img[data-map-preview]'); if (!i) return null; await window.__dm.until(() => i.complete && i.naturalWidth > 0, 10000); return { ok: i.complete && i.naturalWidth > 0, vis: i.checkVisibility({ visibilityProperty: true, opacityProperty: true }) }; })()`);
  check(`${name}: preview.jpg is shown`, !pv ? ['no img[data-map-preview]'] : [pv.ok ? null : 'the picture did not load', pv.vis ? null : 'the picture is hidden']);
  const hide = await p.ev(`({ slider: window.__dm.vis('[data-map-slider]'), mode: window.__dm.vis('[data-map-mode]') })`);
  check(`${name}: the slider and the mode switch are hidden`, [hide.slider ? '[data-map-slider] is shown' : null, hide.mode ? '[data-map-mode] is shown' : null]);
  const mk = q(`[data-marker-id="${MOSSBACK.id}"]`);
  const clicked = await p.ev(`(() => { const e = document.querySelector(${mk}); if (!e) return false; e.click(); return true; })()`);
  const named = clicked && (await until(p, `window.__dm.panel().includes(${q(MOSSBACK.name)})`, 3000));
  check(`${name}: clicking the ${MOSSBACK.name} marker opens it in the panel`, !clicked ? [`no ${mk}`] : named ? [] : [`[data-map-panel] text ${q((await p.ev('window.__dm.panel()')).slice(0, 120))}`]);
  const text = await p.ev(`document.querySelector('[data-map-box]')?.innerText ?? ''`);
  check(`${name}: no error text for players in the map box`, /error|webgl|failed|unsupported/i.test(text) ? [`map box says ${q(text.slice(0, 120))}`] : []);
}

async function r2(b, origin) {
  // T1 (F6): blocks.bin.gz fails to load in a browser that has WebGL2.
  await page(b, origin, 'T1 failed fetch', '/dungeon/', 1280, async (p) => {
    await p.s('Network.setBlockedURLs', { urls: ['*/dungeon/blocks.bin.gz*'] });
    await p.s('Page.reload', { ignoreCache: true });
    await reloaded(p);
    check('T1 env: WebGL2 is available, so only the failed fetch can cause the fallback', (await p.ev('window.__dm.webgl2()')) ? [] : ["getContext('webgl2') is null"]);
    await fallbackChecks(p, 'T1 blocks.bin.gz blocked');
  });

  // T3 (F2): the WebGL context is lost after the first frame.
  await page(b, origin, 'T3 context lost', '/dungeon/', 1280, async (p) => {
    const on = await until(p, `document.querySelector('[data-map-box]')?.dataset.gl === 'on'`, GL_WAIT_MS);
    check('T3 env: data-gl="on" before the context is lost', on ? [] : ['the map never drew']);
    const lost = await p.ev(`(() => { const x = document.querySelector('[data-map-box] canvas')?.getContext('webgl2')?.getExtension('WEBGL_lose_context'); if (!x) return false; x.loseContext(); return true; })()`);
    check('T3 env: WEBGL_lose_context is available on the page canvas', lost ? [] : ['no WEBGL_lose_context']);
    await fallbackChecks(p, 'T3 WebGL context lost');
  });

  // T4 (F3): prototype keys in the hash select nothing and throw nothing.
  for (const key of ['constructor', '__proto__', 'toString']) {
    const errors = [];
    const listen = (d) => d.method === 'Runtime.exceptionThrown' && errors.push(d.params.exceptionDetails?.exception?.description?.split('\n')[0] ?? d.params.exceptionDetails?.text ?? 'exception');
    b.listeners.add(listen);
    try {
      await page(b, origin, `T4 #${key}`, `/dungeon/#${key}`, 1280, async (p) => {
        await until(p, `window.__dm.panel().length > 0`, 10_000);
        await p.ev('window.__dm.frames()');
        const panel = await p.ev('window.__dm.panel()');
        // run 20261121-dungeon-ui U1: the nothing-picked state is now the legend, not the overview text
        const legend = await p.ev(`!!document.querySelector('[data-map-panel] details[data-map-legend]')`);
        check(`T4 /dungeon/#${key}: no uncaught exception, the panel shows the nothing-picked legend`, [
          errors.length ? `uncaught: ${q(errors.slice(0, 3))}` : null,
          legend ? null : `no [data-map-panel] details[data-map-legend]; panel text ${q(panel.slice(0, 120))}`,
        ]);
      });
    } finally {
      b.listeners.delete(listen);
    }
  }

  // T5 (F1): a camp's respawn line states the real ceiling, interval + jitter.
  await page(b, origin, 'T5 respawn', `/dungeon/#${ROOT_GATE.id}`, 1280, async (p) => {
    await until(p, `window.__dm.panel().includes(${q(ROOT_GATE.name)})`, 10_000);
    const panel = await p.ev('window.__dm.panel()');
    check(`T5 ${ROOT_GATE.name}: the respawn line says ${ROOT_GATE.ceiling} (180 s + 45 s jitter), not ${ROOT_GATE.base}`, [
      panel.includes(ROOT_GATE.name) ? null : `[data-map-panel] does not show ${ROOT_GATE.name}: ${q(panel.slice(0, 120))}`,
      panel.includes(ROOT_GATE.ceiling) ? null : `no ${q(ROOT_GATE.ceiling)} in ${q(panel.slice(0, 200))}`,
      panel.includes(ROOT_GATE.base) ? `still says ${q(ROOT_GATE.base)}` : null,
    ]);
  });

  // T2 (F7): the drawn picture is the island's picture, and the cut is not off by one.
  await page(b, origin, 'T2 picture', '/dungeon/', 1280, async (p) => {
    const on = await until(p, `document.querySelector('[data-map-box]')?.dataset.gl === 'on'`, GL_WAIT_MS);
    if (!on) return check('T2 env: data-gl="on"', ['the map never drew']);
    await p.ev(`(document.querySelector('[data-map-mode] input[value="all"]').click(), true)`);
    await p.ev(`(async () => { const i = document.querySelector('[data-map-preview]'); i.loading = 'eager'; await window.__dm.until(() => i.complete && i.naturalWidth > 0, 10000); return true; })()`);
    const gl = await shot(p);
    const pic = await shot(p, '[data-map-preview]');
    if (!gl || !pic) return check('T2 ALL BLOCKS frame matches preview.jpg', ['no capture']);
    // the island: pixels of the placed preview that are neither its background nor the box behind it
    const boxBg = px(pic, 0, 0);
    let n = 0, close = 0;
    const sum = [[0, 0, 0], [0, 0, 0]];
    for (let y = 0; y < pic.height; y++)
      for (let x = 0; x < pic.width; x++) {
        const a = px(pic, x, y);
        if (dist3(a, BG_RGB) <= 24 || dist3(a, boxBg) <= 24) continue;
        const c = px(gl, x, y);
        n++;
        for (let i = 0; i < 3; i++) (sum[0][i] += c[i]), (sum[1][i] += a[i]);
        if (dist3(a, c) <= 90) close++;
      }
    const mean = sum.map((s) => s.map((v) => v / Math.max(1, n)));
    const off = mean[0].map((v, i) => Math.abs(v - mean[1][i]) / Math.max(1, mean[1][i]));
    check("T2 ALL BLOCKS at the fit view: the island's mean colour is within 8% of preview.jpg placed by meta.preview", n < 1000 ? [`only ${n} island pixels`] : off.some((v) => v > 0.08) ? [`canvas mean ${q(mean[0].map(Math.round))}, preview mean ${q(mean[1].map(Math.round))}`] : []);
    check('T2 ALL BLOCKS at the fit view: at least 90% of island pixels are within 90 (sum of |dR|+|dG|+|dB|) of preview.jpg', n < 1000 ? [`only ${n} island pixels`] : close / n >= 0.9 ? [] : [`${((close / n) * 100).toFixed(1)}% of ${n}`]);

    // the cut, one block either side of a column top
    if (!COLUMN) return check('T2 env: a 4x4 grass/moss patch with air above exists in blocks.bin.gz', ['none found']);
    await p.ev(`(document.querySelector('[data-map-mode] input[value="cut"]').click(), true)`);
    const { x, y, z } = COLUMN;
    const top = [x + 0.5, y + 1, z + 0.5];
    const mx = META.A[0][0] * top[0] + META.A[0][1] * top[1] + META.A[0][2] * top[2] + META.b[0];
    const my = META.A[1][0] * top[0] + META.A[1][1] * top[1] + META.A[1][2] * top[2] + META.b[1];
    // the column's top-face centre on screen, from the view the box publishes (--k, --tx, --ty)
    const at = `(() => { const bx = document.querySelector('[data-map-box]'), r = bx.getBoundingClientRect(), s = bx.style, k = +s.getPropertyValue('--k'); return [r.left + ${mx} * k + +s.getPropertyValue('--tx'), r.top + ${my} * k + +s.getPropertyValue('--ty')]; })()`;
    // zoom in on it with the wheel, as a visitor would, so one block covers many pixels
    for (let i = 0; i < 2; i++) await p.ev(`(() => { const [cx, cy] = ${at}; document.querySelector('[data-map-box]').dispatchEvent(new WheelEvent('wheel', { clientX: cx, clientY: cy, deltaY: -1000, bubbles: true, cancelable: true })); return true; })()`);
    const sample = async (cut) => {
      await p.ev(`window.__dm.setCut(${cut})`);
      if (!(await until(p, `window.__dm.label() === 'CUT AT Y ${cut}'`, 3000))) return null;
      const [cx, cy] = await p.ev(at);
      const r = await p.ev(`(() => { const r = document.querySelector('[data-map-box] canvas').getBoundingClientRect(); return [r.left, r.top]; })()`);
      const img = await shot(p);
      return img && px(img, Math.round(cx - r[0]), Math.round(cy - r[1]));
    };
    const where = `${COLUMN.state} at X ${x} Y ${y} Z ${z}`;
    const atN = await sample(y);
    check(`T2 cut at Y ${y}: the top face of ${where} is drawn (not the cut colour, not background)`, !atN ? ['no sample'] : dist3(atN, CUT_RGB) <= 30 || dist3(atN, BG_RGB) <= 30 ? [`pixel rgb(${atN.join(', ')})`] : []);
    const below = await sample(y - 1);
    check(`T2 cut at Y ${y - 1}: the cut face covers ${where} (rgb(46, 48, 56))`, !below ? ['no sample'] : dist3(below, CUT_RGB) <= 12 ? [] : [`pixel rgb(${below.join(', ')})`]);
  });
}

// ------------------------------------------ run 20261121-dungeon-ui U1 --
// The controls and the info card float on a full-width map (spec .orch/runs/20261121-dungeon-ui/spec-U1.md).
// Hooks added by that spec: [data-map-close] (aria-label "Close") and details[data-map-legend] (summary LEGEND).

const inside = (a, o) => a.l >= o.l - 0.5 && a.r <= o.r + 0.5 && a.t >= o.t - 0.5 && a.b <= o.b + 0.5;
const overlap = (a, o) => Math.min(a.r, o.r) - Math.max(a.l, o.l) > 0.5 && Math.min(a.b, o.b) - Math.max(a.t, o.t) > 0.5;
const fmt = (r) => (r ? `${Math.round(r.l)}..${Math.round(r.r)} x ${Math.round(r.t)}..${Math.round(r.b)}` : 'missing');
const GL_UP = `document.querySelector('[data-map-box]')?.dataset.gl === 'on'`;
const MK = q(`[data-marker-id="${MOSSBACK.id}"]`);
/** Dispatch a wheel (zoom in) on the element at the point `pick` returns; report --k before and after. */
const wheelAt = (p, pick) => p.ev(`(async () => {
  const bx = document.querySelector('[data-map-box]'), k = () => +bx.style.getPropertyValue('--k');
  const pt = (${pick})(); if (!pt || !pt.el) return null;
  const k0 = k();
  pt.el.dispatchEvent(new WheelEvent('wheel', { clientX: pt.x, clientY: pt.y, deltaY: -500, bubbles: true, cancelable: true }));
  await window.__dm.frames();
  return { k0, k1: k(), inPanel: !!pt.el.closest('[data-map-panel]'), inBox: bx.contains(pt.el), tag: pt.el.tagName + '.' + pt.el.className };
})()`);

async function u1(b, origin) {
  await page(b, origin, 'U1 1280px', '/dungeon/', 1280, async (p) => {
    await until(p, GL_UP, GL_WAIT_MS);
    // AC1
    const r = await p.ev(`({ box: window.__dm.rect('[data-map-box]'), search: window.__dm.rect('[data-map-search]'), mode: window.__dm.rect('[data-map-mode]'),
      slider: window.__dm.rect('[data-map-slider]'), panel: window.__dm.rect('[data-map-panel]'),
      main: (() => { const m = document.querySelector('main.dm'), s = getComputedStyle(m); return m.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight); })() })`);
    check('U1-AC1 at 1280 px the search, mode switch, slider and [data-map-panel] lie inside [data-map-box]', !r.box ? ['no [data-map-box]'] : ['search', 'mode', 'slider', 'panel'].map((k) =>
      !r[k] ? `no ${k}` : r[k].w < 1 || r[k].h < 1 ? `${k} not shown (${r[k].w}x${r[k].h})` : inside(r[k], r.box) ? null : `${k} ${fmt(r[k])} outside the box ${fmt(r.box)}`));
    check("U1-AC1 the search's left edge is in the left third of the map box", !r.box || !r.search ? ['no box or search'] : r.search.l >= r.box.l - 0.5 && r.search.l <= r.box.l + r.box.w / 3 ? [] : [`search left ${Math.round(r.search.l)}, box ${fmt(r.box)}`]);
    check("U1-AC1 the map box spans the content width of main.dm (>= 95%, no side column)", !r.box ? ['no [data-map-box]'] : r.box.w >= 0.95 * r.main ? [] : [`box ${Math.round(r.box.w)} px of ${Math.round(r.main)} px`]);

    // AC2: nothing picked, the card is the legend: four tiers and every boss as a button.
    const lg = await p.ev(`(() => { const d = document.querySelector('[data-map-panel] details[data-map-legend]'); return d && { open: d.open, sum: d.querySelector('summary')?.textContent.trim(),
      text: d.textContent.replace(/\\s+/g, ' '), buttons: [...d.querySelectorAll('button')].map((x) => x.textContent.trim()) }; })()`);
    const bosses = ZONES.filter((z) => z.b).map((z) => z.b.n);
    check('U1-AC2 nothing picked: the card holds an open details[data-map-legend] titled LEGEND with the four tiers and every boss as a button', !lg ? ['no [data-map-panel] details[data-map-legend]'] : [
      lg.sum === 'LEGEND' ? null : `summary ${q(lg.sum)}`,
      lg.open ? null : 'closed at 1280 px',
      ...DIFF.map((d) => (lg.text.includes(d[0]) ? null : `no tier ${q(d[0])}`)),
      ...bosses.map((n) => (lg.buttons.includes(n) ? null : `no button ${q(n)}`)),
    ]);
    const body = await p.ev('document.body.textContent');
    check('U1-AC2 "Drag to pan" and "stacked inside one floating island" are not on the page', ['Drag to pan', 'stacked inside one floating island'].map((t) => (body.includes(t) ? `page says ${q(t)}` : null)));

    // AC4: a wheel over the card leaves the zoom; one over bare map zooms.
    const card = await wheelAt(p, `() => { const e = document.querySelector('[data-map-panel]'); if (!e) return null; e.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, 40); return { x, y, el: document.elementFromPoint(x, y) }; }`);
    check('U1-AC4 a wheel over the info card (inside the map box) does not change the zoom (--k unchanged)', !card ? ['no [data-map-panel] under its own centre'] : [
      card.inPanel && card.inBox ? null : `the point hits ${card.tag}: in the panel ${card.inPanel}, in the map box ${card.inBox}`,
      card.k1 === card.k0 ? null : `--k ${card.k0} -> ${card.k1}`,
    ]);
    const bare = await wheelAt(p, `() => { const bx = document.querySelector('[data-map-box]'), r = bx.getBoundingClientRect();
      for (let y = Math.max(r.top, 0) + 10; y < Math.min(r.bottom, innerHeight) - 10; y += 16) for (let x = r.left + 10; x < r.right - 10; x += 16) {
        const el = document.elementFromPoint(x, y);
        if (el && bx.contains(el) && !el.closest('.dm-ctl, [data-map-panel], button, input, label, summary, details, .dm-zl')) return { x, y, el };
      } return null; }`);
    check('U1-AC4 a wheel over bare map changes the zoom (--k changes)', !bare ? ['no point of the map box free of overlays'] : bare.k1 !== bare.k0 ? [] : [`--k stayed ${bare.k0} (at ${bare.tag})`]);

    // AC3: pick a marker, close it.
    await p.ev(`(document.querySelector(${MK}).click(), true)`);
    await until(p, `window.__dm.panel().includes(${q(MOSSBACK.name)}) && !!document.querySelector('[data-map-panel] [data-map-close]')`, 3000);
    const st = () => p.ev(`(() => { const c = document.querySelector('[data-map-panel] [data-map-close]'), d = document.querySelector('[data-map-panel] details[data-map-legend]');
      return { hash: location.hash, sel: document.querySelector(${MK}).classList.contains('sel'), named: window.__dm.panel().includes(${q(MOSSBACK.name)}),
        close: c && { label: c.getAttribute('aria-label'), vis: c.checkVisibility({ visibilityProperty: true, opacityProperty: true }) }, legend: !!d && d.checkVisibility() }; })()`);
    const s1 = await st();
    check(`U1-AC3 picking ${MOSSBACK.name} shows its panel with a visible close button (aria-label "Close"), no legend`, [
      s1.named ? null : `[data-map-panel] lacks ${q(MOSSBACK.name)}`,
      !s1.close ? 'no [data-map-panel] [data-map-close]' : s1.close.label !== 'Close' ? `aria-label ${q(s1.close.label)}` : s1.close.vis ? null : 'close button hidden',
      s1.legend ? 'the legend is still shown' : null,
      s1.hash === `#${MOSSBACK.id}` ? null : `hash ${q(s1.hash)} before closing`,
      s1.sel ? null : 'the marker has no .sel ring before closing',
    ]);
    const closed = s1.close && (await p.ev(`(document.querySelector('[data-map-panel] [data-map-close]').click(), true)`)) && (await until(p, `!!document.querySelector('[data-map-panel] details[data-map-legend]')`, 3000));
    const s2 = await st();
    check('U1-AC3 the close button brings the legend back, clears the hash and the marker\'s selected ring', !s1.close ? ['no close button to press'] : [
      closed && s2.legend ? null : 'no visible legend after closing',
      s2.hash === '' ? null : `hash ${q(s2.hash)}`,
      s2.sel ? 'the marker still has .sel' : null,
      s2.close ? 'the close button is still there' : null,
    ]);
  });

  // AC5: 400 px, a marker picked: the sheet sits in the map box above the bottom bar, its close button in view.
  await page(b, origin, 'U1 400px', '/dungeon/', 400, async (p) => {
    await until(p, GL_UP, GL_WAIT_MS);
    await p.ev(`(document.querySelector(${MK}).click(), true)`);
    await until(p, `!!document.querySelector('[data-map-panel] [data-map-close]')`, 3000);
    const r = await p.ev(`(() => { const c = document.querySelector('[data-map-panel] [data-map-close]'); c?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      return { close: c && window.__dm.rect(c), vis: !!c && c.checkVisibility({ visibilityProperty: true }), sheet: window.__dm.rect('[data-map-panel]'), box: window.__dm.rect('[data-map-box]'),
        mode: window.__dm.rect('[data-map-mode]'), slider: window.__dm.rect('[data-map-slider]'), vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth }; })()`);
    check('U1-AC5 at 400 px with a marker picked there is no horizontal scroll (scrollWidth <= 400)', r.sw <= 400 ? [] : [`scrollWidth ${r.sw}`]);
    check('U1-AC5 at 400 px the close button ([data-map-close]) is shown fully inside the viewport', !r.close ? ['no [data-map-panel] [data-map-close]'] : !r.vis || r.close.w < 1 ? ['not shown'] : inside(r.close, { l: 0, r: r.vw, t: 0, b: r.vh }) ? [] : [`box ${fmt(r.close)} in a ${r.vw}x${r.vh} viewport`]);
    check('U1-AC5 at 400 px the sheet lies inside the map box and covers neither the mode switch nor the slider', !r.sheet || !r.box ? ['no [data-map-panel] or [data-map-box]'] : [
      inside(r.sheet, r.box) ? null : `sheet ${fmt(r.sheet)} outside the box ${fmt(r.box)}`,
      r.mode && overlap(r.sheet, r.mode) ? `sheet ${fmt(r.sheet)} overlaps the mode switch ${fmt(r.mode)}` : null,
      r.slider && overlap(r.sheet, r.slider) ? `sheet ${fmt(r.sheet)} overlaps the slider ${fmt(r.slider)}` : null,
      r.mode && r.slider ? null : 'no mode switch or slider',
    ]);
  });
}

// ------------------------------------------------------------------ run --

let ran = 0;
try {
  await withBrowser(DIST, async (b, origin) => (ran++, await glOn(b, origin), await r2(b, origin), await u1(b, origin)), GL_ON);
  await withBrowser(DIST, async (b, origin) => (ran++, glOff(b, origin)), GL_OFF);
} catch (e) {
  check('dungeon-browser-check', [`threw ${e?.stack?.split('\n')[0] ?? e}`]);
}
if (ran < 2) check('browsers started', [`${ran} of 2 Chrome runs started (see the lines above: no Chrome, no build, or vite preview down)`]);
console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
process.exitCode = failed ? 1 : 0;
