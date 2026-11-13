#!/usr/bin/env node
// Unit tests for the pure image-crop helpers in src/lib/imageCrop.js and for the
// committed crop table src/data/imageCrops.json (run 20261112-store-modes, unit
// U2: "the images from the tebex pages for prism tokens display too small, get
// them more inframe (larger)").
//
//   node test/image_crop.test.mjs          (no build, no npm, no browser needed)
//   (npm script: "test:images": "node test/image_crop.test.mjs && node test/image_crop_check.mjs")
//
// Prints `PASS <name>` / `FAIL <name>: <why>` per case, then `RESULT: PASS n checks`
// or `RESULT: FAIL k of n`, and exits 0 or 1 (same format as test/store_modes.test.mjs).
//
// REQUIREMENT on src/lib/imageCrop.js: a pure ES module importable by plain Node
// (no JSX, no DOM, nothing that touches window/document at import time). It
// never mutates its input (the tests pass deep-frozen data).
//
// THE INTERFACE (the plan's contract):
//
// A crop table maps a full image URL to { w, h, box: [x0, y0, x1, y1] }: the
// canvas size and the art's bounding box in source pixels, x1/y1 exclusive.
//
// cropFor(url, crops) -> the entry for that EXACT url, or null. null when url is
//   null/undefined/'' or unknown (also an inherited key such as 'constructor'),
//   when crops is null/undefined, or when the entry is malformed: w or h missing
//   or not a positive number, box not an array of 4 finite numbers, x1 <= x0,
//   y1 <= y0, or the box outside the canvas (x0 < 0, y0 < 0, x1 > w, y1 > h).
//
// cropBox(entry, margin = 0.06) -> { x, y, w, h } in source pixels: the box grown
//   by margin * max(box width, box height) on every side, then clamped to the
//   canvas [0, w] x [0, h]. margin 0 means no growth (not the default).
//
// cropStyle(url, crops, margin) -> null when cropFor is null, else a plain style
//   object { aspectRatio: "<w> / <h>", objectViewBox: "inset(<top>px <right>px
//   <bottom>px <left>px)" } built from cropBox(entry, margin): each inset is the
//   distance from that canvas edge to the grown box, rounded to whole pixels;
//   aspectRatio is the grown box's width / height. margin undefined -> 0.06.
//
// src/data/imageCrops.json is such a table, written by tools/image_crops.py. It
// has an entry for each of the five live Prism Token images (their URLs are read
// from test/fixtures/image-crops/tebex-categories.json, category 3501348, the
// live catalogue of 2026-11-12), and no entry for any other package image of
// that catalogue (AC7: nothing else on the page changes).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'image-crops', 'tebex-categories.json'), 'utf-8')).data;
/** Tebex category "Prism Coins" (slug prism-tokens) under PVP. */
export const PRISM_CATEGORY = 3501348;
const PRISM = FIXTURE.find((c) => c.id === PRISM_CATEGORY).packages.map((p) => ({ id: p.id, name: p.name, url: p.image }));
const OTHERS = FIXTURE.filter((c) => c.id !== PRISM_CATEGORY).flatMap((c) => c.packages ?? []).filter((p) => p.image).map((p) => ({ id: p.id, name: p.name, url: p.image }));
const CROPS_FILE = process.env.IMAGE_CROPS_JSON ? resolve(process.env.IMAGE_CROPS_JSON) : join(ROOT, 'src', 'data', 'imageCrops.json');

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${detail}`}`);
}
const q = JSON.stringify;

function same(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
}
/** Run one case; a throw (e.g. "cropFor is not a function") is a failure, not a crash. */
function test(name, fn) {
  try {
    const r = fn();
    if (r === true) check(name, true);
    else check(name, false, typeof r === 'string' ? r : `returned ${q(r)}`);
  } catch (e) {
    check(name, false, `threw ${e?.message ?? e}`);
  }
}
const eq = (got, want) => (same(got, want) ? true : `got ${q(got)}, want ${q(want)}`);
const all = (...results) => results.find((r) => r !== true) ?? true;
function deepFreeze(o) {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}
/** { x, y, w, h } within `tol` source pixels of the expected one. */
function near(got, want, tol = 1e-6) {
  if (!got || typeof got !== 'object') return `got ${q(got)}, want ${q(want)}`;
  for (const k of ['x', 'y', 'w', 'h']) if (typeof got[k] !== 'number' || Math.abs(got[k] - want[k]) > tol) return `got ${q(got)}, want ${q(want)} (within ${tol}px)`;
  return true;
}
/** "a / b" -> a / b, or NaN. */
function ratioOf(s) {
  const m = typeof s === 'string' && s.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
  return m ? Number(m[1]) / Number(m[2]) : NaN;
}

// ------------------------------------------------------------------ import --

let lib = {};
try {
  // IMAGE_CROP_LIB (a path) swaps in another module; only for validating these tests against a reference.
  lib = await import(pathToFileURL(process.env.IMAGE_CROP_LIB ? resolve(process.env.IMAGE_CROP_LIB) : join(ROOT, 'src', 'lib', 'imageCrop.js')).href);
  check('src/lib/imageCrop.js imports in plain Node', true);
} catch (e) {
  check('src/lib/imageCrop.js imports in plain Node', false, `${e?.message ?? e} (a pure ES module: no JSX, no DOM, no imports Node cannot resolve)`);
}
const { cropFor, cropBox, cropStyle } = lib;
for (const [name, fn] of Object.entries({ cropFor, cropBox, cropStyle })) check(`exports ${name}()`, typeof fn === 'function', `typeof ${name} is ${typeof fn}`);

// ------------------------------------------------------------------ tables --

const A = 'https://cdn.example.test/packages/images/aaaa.png';
const B = 'https://cdn.example.test/packages/images/bbbb.png';
/** Integral example: box 800 x 500, 6% of 800 = 48 px of growth on every side. */
const ENTRY_A = { w: 2000, h: 2000, box: [700, 700, 1500, 1200] };
/** Fractional example (roughly the 3,000 Prism Token art): 6% of 770 = 46.2 px. */
const ENTRY_B = { w: 2000, h: 2000, box: [750, 715, 1520, 1215] };
const CROPS = deepFreeze({ [A]: ENTRY_A, [B]: ENTRY_B });
const one = (entry) => deepFreeze({ [A]: entry });

// ----------------------------------------------------------------- cropFor --

test('cropFor: a known URL gives its entry', () => eq(cropFor(A, CROPS), ENTRY_A));
test('cropFor: each URL gives its own entry', () => eq(cropFor(B, CROPS), ENTRY_B));
test('cropFor: an unknown URL gives null', () => eq(cropFor('https://cdn.example.test/packages/images/cccc.png', CROPS), null));
test('cropFor: the match is exact (a query string or a trailing space is another URL)', () => all(eq(cropFor(`${A}?v=2`, CROPS), null), eq(cropFor(`${A} `, CROPS), null), eq(cropFor(A.toUpperCase(), CROPS), null)));
test('cropFor: null, undefined and empty url give null', () => all(eq(cropFor(null, CROPS), null), eq(cropFor(undefined, CROPS), null), eq(cropFor('', CROPS), null)));
test('cropFor: an inherited key ("constructor", "__proto__", "toString") gives null', () => all(eq(cropFor('constructor', CROPS), null), eq(cropFor('__proto__', CROPS), null), eq(cropFor('toString', CROPS), null)));
test('cropFor: a missing table (null / undefined / {}) gives null', () => all(eq(cropFor(A, null), null), eq(cropFor(A, undefined), null), eq(cropFor(A, {}), null)));

const MALFORMED = {
  'a null entry': null,
  'no box': { w: 2000, h: 2000 },
  'box not an array': { w: 2000, h: 2000, box: '700,700,1500,1200' },
  'box of 3 numbers': { w: 2000, h: 2000, box: [700, 700, 1500] },
  'box of 5 numbers': { w: 2000, h: 2000, box: [700, 700, 1500, 1200, 1] },
  'box with a string': { w: 2000, h: 2000, box: ['700', 700, 1500, 1200] },
  'box with NaN': { w: 2000, h: 2000, box: [700, NaN, 1500, 1200] },
  'x1 == x0': { w: 2000, h: 2000, box: [700, 700, 700, 1200] },
  'x1 < x0': { w: 2000, h: 2000, box: [1500, 700, 700, 1200] },
  'y1 == y0': { w: 2000, h: 2000, box: [700, 700, 1500, 700] },
  'y1 < y0': { w: 2000, h: 2000, box: [700, 1200, 1500, 700] },
  'x0 < 0': { w: 2000, h: 2000, box: [-1, 700, 1500, 1200] },
  'y0 < 0': { w: 2000, h: 2000, box: [700, -1, 1500, 1200] },
  'x1 > w': { w: 2000, h: 2000, box: [700, 700, 2001, 1200] },
  'y1 > h': { w: 2000, h: 2000, box: [700, 700, 1500, 2001] },
  'box wholly outside the canvas': { w: 2000, h: 2000, box: [2100, 2100, 2500, 2500] },
  'w missing': { h: 2000, box: [700, 700, 1500, 1200] },
  'h missing': { w: 2000, box: [700, 700, 1500, 1200] },
  'w 0': { w: 0, h: 2000, box: [0, 700, 0, 1200] },
  'h a string': { w: 2000, h: '2000', box: [700, 700, 1500, 1200] },
};
for (const [label, entry] of Object.entries(MALFORMED)) test(`cropFor: a malformed entry (${label}) gives null`, () => eq(cropFor(A, one(entry)), null));
test('cropFor: a box touching every canvas edge is valid (x1 == w, y1 == h)', () => eq(cropFor(A, one({ w: 2000, h: 1000, box: [0, 0, 2000, 1000] })), { w: 2000, h: 1000, box: [0, 0, 2000, 1000] }));

// ----------------------------------------------------------------- cropBox --

test('cropBox: margin 0.06 grows the box by 6% of its larger side on every side', () => near(cropBox(ENTRY_A, 0.06), { x: 652, y: 652, w: 896, h: 596 }));
test('cropBox: the default margin is 0.06', () => near(cropBox(ENTRY_A), { x: 652, y: 652, w: 896, h: 596 }));
test('cropBox: margin 0 is the box itself (0 is not "use the default")', () => near(cropBox(ENTRY_A, 0), { x: 700, y: 700, w: 800, h: 500 }));
test('cropBox: margin 0.25 (200 px)', () => near(cropBox(ENTRY_A, 0.25), { x: 500, y: 500, w: 1200, h: 900 }));
test('cropBox: fractional growth (46.2 px) within half a pixel', () => near(cropBox(ENTRY_B), { x: 703.8, y: 668.8, w: 862.4, h: 592.4 }, 0.5));
test('cropBox: the larger side is the height for a tall box', () => near(cropBox({ w: 1000, h: 1000, box: [400, 100, 600, 900] }, 0.06), { x: 352, y: 52, w: 296, h: 896 }));
test('cropBox: clamped at the left edge', () => near(cropBox({ w: 1000, h: 1000, box: [10, 500, 810, 900] }, 0.06), { x: 0, y: 452, w: 858, h: 496 }));
test('cropBox: clamped at the right edge', () => near(cropBox({ w: 1000, h: 1000, box: [190, 100, 990, 400] }, 0.06), { x: 142, y: 52, w: 858, h: 396 }));
test('cropBox: clamped at the top edge', () => near(cropBox({ w: 1000, h: 1000, box: [100, 20, 900, 300] }, 0.06), { x: 52, y: 0, w: 896, h: 348 }));
test('cropBox: clamped at the bottom edge', () => near(cropBox({ w: 1000, h: 1000, box: [100, 700, 900, 990] }, 0.06), { x: 52, y: 652, w: 896, h: 348 }));
test('cropBox: clamped on all four edges at once (a box that fills the canvas)', () => near(cropBox({ w: 1000, h: 1000, box: [0, 0, 1000, 1000] }, 0.06), { x: 0, y: 0, w: 1000, h: 1000 }));
test('cropBox: a non-square canvas (1600 x 900)', () => near(cropBox({ w: 1600, h: 900, box: [400, 100, 1200, 800] }, 0.06), { x: 352, y: 52, w: 896, h: 796 }));
test('cropBox: a non-square canvas clamps against its own height', () => near(cropBox({ w: 1600, h: 900, box: [400, 400, 1200, 880] }, 0.06), { x: 352, y: 352, w: 896, h: 548 }));
test('cropBox: does not mutate the (frozen) entry', () => {
  const e = deepFreeze({ w: 2000, h: 2000, box: [700, 700, 1500, 1200] });
  cropBox(e, 0.06);
  return eq(e, ENTRY_A);
});

// --------------------------------------------------------------- cropStyle --

test('cropStyle: a miss gives null', () => eq(cropStyle('https://cdn.example.test/none.png', CROPS), null));
test('cropStyle: null url and a malformed entry give null', () => all(eq(cropStyle(null, CROPS), null), eq(cropStyle(A, one({ w: 2000, h: 2000, box: [1500, 700, 700, 1200] })), null)));
test('cropStyle: worked example, default margin: insets from each canvas edge and the grown aspect ratio', () => {
  const s = cropStyle(A, CROPS);
  if (!s || typeof s !== 'object') return `got ${q(s)}`;
  return all(eq(s.objectViewBox, 'inset(652px 452px 752px 652px)'), eq(s.aspectRatio, '896 / 596'));
});
test('cropStyle: an explicit margin is used (0 -> the box itself)', () => {
  const s = cropStyle(A, CROPS, 0);
  if (!s || typeof s !== 'object') return `got ${q(s)}`;
  return all(eq(s.objectViewBox, 'inset(700px 500px 800px 700px)'), eq(s.aspectRatio, '800 / 500'));
});
test('cropStyle: fractional insets are rounded to whole pixels', () => {
  const s = cropStyle(B, CROPS);
  if (!s || typeof s !== 'object') return `got ${q(s)}`;
  return eq(s.objectViewBox, 'inset(669px 434px 739px 704px)');
});
test('cropStyle: the fractional aspect ratio is the grown box (862.4 / 592.4) within 0.5%', () => {
  const s = cropStyle(B, CROPS);
  const r = ratioOf(s?.aspectRatio);
  return Math.abs(r / (862.4 / 592.4) - 1) <= 0.005 ? true : `aspectRatio ${q(s?.aspectRatio)} (${r}), want "<w> / <h>" of the grown box, ${862.4 / 592.4}`;
});
test('cropStyle: a clamped edge has a 0px inset', () => {
  const s = cropStyle(A, one({ w: 1000, h: 1000, box: [10, 500, 810, 900] }));
  return s ? all(eq(s.objectViewBox, 'inset(452px 142px 52px 0px)'), eq(s.aspectRatio, '858 / 496')) : `got ${q(s)}`;
});
test('cropStyle: a plain object with string aspectRatio and objectViewBox', () => {
  const s = cropStyle(A, CROPS);
  return s && Object.getPrototypeOf(s) === Object.prototype && typeof s.aspectRatio === 'string' && typeof s.objectViewBox === 'string' ? true : `got ${q(s)}`;
});

// ---------------------------------------------- src/data/imageCrops.json (AC6) --

check('fixture (setup): five Prism Token packages with CDN image URLs', PRISM.length === 5 && PRISM.every((p) => /^https:\/\/dunb17ur4ymx4\.cloudfront\.net\/packages\/images\/[0-9a-f]{40}\.png$/.test(p.url ?? '')), q(PRISM));

let crops = null;
try {
  if (!existsSync(CROPS_FILE)) throw new Error(`${CROPS_FILE} does not exist (tools/image_crops.py writes it)`);
  crops = JSON.parse(readFileSync(CROPS_FILE, 'utf-8'));
  check('AC6 src/data/imageCrops.json parses as a JSON object', crops !== null && typeof crops === 'object' && !Array.isArray(crops), `got ${q(crops)?.slice(0, 120)}`);
} catch (e) {
  check('AC6 src/data/imageCrops.json parses as a JSON object', false, e?.message ?? String(e));
}
const table = crops && typeof crops === 'object' && !Array.isArray(crops) ? crops : {};

/** Problems with one entry: shape, integers, inside the canvas, and the inclusion rule (larger relative extent below 0.9). */
function entryProblems(e) {
  if (!e || typeof e !== 'object') return [`entry ${q(e)}`];
  const out = [];
  const { w, h, box } = e;
  if (!Number.isInteger(w) || w <= 0 || !Number.isInteger(h) || h <= 0) out.push(`w/h ${q(w)} x ${q(h)}, want positive integers`);
  if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isInteger)) return [...out, `box ${q(box)}, want 4 integers`];
  const [x0, y0, x1, y1] = box;
  if (!(x0 >= 0 && y0 >= 0 && x1 > x0 && y1 > y0 && x1 <= w && y1 <= h)) out.push(`box ${q(box)} is not inside the ${w} x ${h} canvas`);
  const extent = Math.max((x1 - x0) / w, (y1 - y0) / h);
  if (!(extent < 0.9)) out.push(`larger relative extent ${extent.toFixed(3)} is not below 0.9 (an image that fills its canvas gets no entry)`);
  return out;
}

for (const p of PRISM) {
  const e = Object.prototype.hasOwnProperty.call(table, p.url) ? table[p.url] : undefined;
  const probs = e === undefined ? [`no entry for ${p.url}`] : entryProblems(e);
  if (e && !probs.length && (e.w !== 2000 || e.h !== 2000)) probs.push(`canvas ${e.w} x ${e.h}, the live image is 2000 x 2000`);
  check(`AC6 imageCrops.json: "${p.name}" has a valid entry inside its 2000 x 2000 canvas`, !probs.length, probs.join('; '));
}

{
  const p = PRISM.find((x) => x.id === 7808723);
  const e = p && table[p.url];
  const probs = [];
  if (!e || !Array.isArray(e.box)) probs.push(`no entry for ${p?.url}`);
  else {
    const [x0, y0, x1, y1] = e.box;
    if (!(x0 >= 650)) probs.push(`x0 ${x0} < 650: the soft shadow left of the coins (x about 400-650) is part of the box`);
    if (!(x1 - x0 >= 600 && x1 - x0 <= 1000)) probs.push(`box width ${x1 - x0}, want 600..1000`);
    if (!(y1 - y0 >= 380 && y1 - y0 <= 650)) probs.push(`box height ${y1 - y0}, want 380..650`);
  }
  check('AC6 imageCrops.json: the 3,000 box is the coin piles without the shadow (x0 >= 650, width 600-1000, height 380-650)', !probs.length, probs.join('; '));
}

{
  const bad = Object.entries(table).map(([url, e]) => [url, entryProblems(e)]).filter(([, p]) => p.length);
  check('AC6 imageCrops.json: every entry is well formed, inside its canvas and below the 0.9 extent rule', !bad.length, bad.map(([u, p]) => `${u}: ${p.join(', ')}`).join('; '));
  const keys = Object.keys(table);
  check('AC6 imageCrops.json: every key is a full https image URL', keys.every((k) => /^https:\/\/[^\s]+$/.test(k)), q(keys.filter((k) => !/^https:\/\/[^\s]+$/.test(k))));
}

{
  const cropped = OTHERS.filter((p) => Object.prototype.hasOwnProperty.call(table, p.url));
  check('AC7 imageCrops.json: no entry for any other (SMP) package image of the live catalogue', crops !== null && !cropped.length, crops === null ? 'no table to read' : `entries for ${cropped.map((p) => `${p.name} (${p.url})`).join(', ')}`);
}

for (const p of PRISM) test(`AC6 cropFor() accepts the committed "${p.name}" entry`, () => (crops === null ? 'no table to read' : cropFor(p.url, crops) ? true : `cropFor(${p.url}) is null`));

console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
process.exitCode = failed ? 1 : 0;
