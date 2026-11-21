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

/** The map canvas alone (everything else in the map box made invisible for the capture), decoded. */
async function shot(page) {
  const box = await page.ev(`(() => {
    const st = document.createElement('style'); st.id = '__dm_only';
    st.textContent = '[data-map-box] * { visibility: hidden !important } [data-map-box] canvas { visibility: visible !important }';
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

async function glOff(b, origin) {
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

// ------------------------------------------------------------------ run --

let ran = 0;
try {
  await withBrowser(DIST, async (b, origin) => (ran++, glOn(b, origin)), GL_ON);
  await withBrowser(DIST, async (b, origin) => (ran++, glOff(b, origin)), GL_OFF);
} catch (e) {
  check('dungeon-browser-check', [`threw ${e?.stack?.split('\n')[0] ?? e}`]);
}
if (ran < 2) check('browsers started', [`${ran} of 2 Chrome runs started (see the lines above: no Chrome, no build, or vite preview down)`]);
console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
process.exitCode = failed ? 1 : 0;
