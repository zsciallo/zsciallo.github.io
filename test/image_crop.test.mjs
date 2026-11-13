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
// cropFrame(url, crops, margin) -> null when cropFor is null, else the inline
//   styles of a clipped frame that shows exactly the grown box at any size, in
//   every engine (no object-view-box, which only Chromium has):
//     { frame: { aspectRatio: "<bw> / <bh>" },
//       img:   { width: "<W/bw*100>%", height: "<H/bh*100>%",
//                left: "<-bx/bw*100>%", top: "<-by/bh*100>%" } }
//   (bx, by, bw, bh) = cropBox(entry, margin), (W, H) = the canvas; percentages
//   rounded to 4 decimals (the tests compare the number, so "-109.396%" and
//   "-109.3960%" are both right). margin undefined -> 0.06. The render sites
//   wrap the <img> in <span class="crop-frame" data-crop-frame> with the frame
//   style, and the <img> (data-cropped="true") gets the img style.
//   (Round 1 pinned cropStyle -> { aspectRatio, objectViewBox: "inset(...)" };
//   replaced in round 2 because object-view-box does nothing in Firefox and
//   Safari/iOS. See test/image_crop_check.mjs for the rendered geometry.)
//
// src/data/imageCrops.json is such a table, written by tools/image_crops.py. It
// has an entry for each of the five live Prism Token images (their URLs are read
// from test/fixtures/image-crops/tebex-categories.json, category 3501348, the
// live catalogue of 2026-11-12), and no entry for any other package image of
// that catalogue (AC7: nothing else on the page changes). Each committed box must
// hold the art as measured independently (test/fixtures/image-crops/art-boxes.json,
// alpha >= 250 of the live files, never read from the table) and exceed it by at
// most 12 px per edge, so a box that cuts art off or takes in the soft shadow fails.

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
const { cropFor, cropBox, cropFrame } = lib;
for (const [name, fn] of Object.entries({ cropFor, cropBox, cropFrame })) check(`exports ${name}()`, typeof fn === 'function', `typeof ${name} is ${typeof fn}`);

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

// --------------------------------------------------------------- cropFrame --
// Replaces round 1's cropStyle cases one for one (object-view-box insets ->
// frame aspect-ratio plus img size/offset percentages); see the report table.

/** Round to 4 decimals, the spec's precision for the img percentages. */
const r4 = (n) => Math.round(n * 1e4) / 1e4;
/** "12.5%" -> 12.5; anything else (no %, exponent, empty) -> NaN. */
function pctOf(s) {
  const m = typeof s === 'string' && s.match(/^(-?\d+(?:\.\d+)?)%$/);
  return m ? Number(m[1]) : NaN;
}
/** The frame object for a grown box { x, y, w, h } on a W x H canvas, as numbers. */
const frameOf = (b, W, H) => ({ width: r4((W / b.w) * 100), height: r4((H / b.h) * 100), left: r4((-b.x / b.w) * 100), top: r4((-b.y / b.h) * 100) });
/** Each img percentage parses as "<number>%" and equals the 4-decimal value. */
function pctEq(img, want) {
  if (!img || typeof img !== 'object') return `img ${q(img)}`;
  // Equal to the 4-decimal value (1e-9 only absorbs float noise in the parse; "-0%" equals 0).
  const bad = ['width', 'height', 'left', 'top'].filter((k) => !(Math.abs(pctOf(img[k]) - want[k]) < 1e-9));
  return bad.length ? `img ${q(img)}, want ${bad.map((k) => `${k} ${want[k]}%`).join(', ')} (4 decimals)` : true;
}
const shapeOk = (f) => {
  if (!f || typeof f !== 'object') return `got ${q(f)}`;
  if (Object.getPrototypeOf(f) !== Object.prototype) return 'not a plain object';
  if (q(Object.keys(f).sort()) !== q(['frame', 'img'])) return `keys ${q(Object.keys(f))}, want frame and img`;
  if (!f.frame || q(Object.keys(f.frame)) !== q(['aspectRatio']) || typeof f.frame.aspectRatio !== 'string') return `frame ${q(f.frame)}, want { aspectRatio: "<w> / <h>" }`;
  if (!f.img || q(Object.keys(f.img).sort()) !== q(['height', 'left', 'top', 'width']) || !Object.values(f.img).every((v) => typeof v === 'string')) return `img ${q(f.img)}, want string width, height, left, top`;
  return true;
};

test('cropFrame: a miss gives null', () => eq(cropFrame('https://cdn.example.test/none.png', CROPS), null));
test('cropFrame: null url, a missing table and a malformed entry give null', () => all(eq(cropFrame(null, CROPS), null), eq(cropFrame(A, null), null), eq(cropFrame(A, one({ w: 2000, h: 2000, box: [1500, 700, 700, 1200] })), null)));
test('cropFrame: a plain { frame: { aspectRatio }, img: { width, height, left, top } } of strings', () => shapeOk(cropFrame(A, CROPS)));
test('cropFrame: worked example, default margin: frame "896 / 596", img 223.2143% x 335.5705% at -72.7679%, -109.396%', () => {
  const f = cropFrame(A, CROPS);
  const s = shapeOk(f);
  return s !== true ? s : all(eq(f.frame.aspectRatio, '896 / 596'), pctEq(f.img, { width: 223.2143, height: 335.5705, left: -72.7679, top: -109.396 }));
});
test('cropFrame: an explicit margin is used (0 -> the box itself: "800 / 500", 250% x 400% at -87.5%, -140%)', () => {
  const f = cropFrame(A, CROPS, 0);
  const s = shapeOk(f);
  return s !== true ? s : all(eq(f.frame.aspectRatio, '800 / 500'), pctEq(f.img, { width: 250, height: 400, left: -87.5, top: -140 }));
});
test('cropFrame: margin undefined is the 0.06 default', () => eq(cropFrame(A, CROPS, undefined), cropFrame(A, CROPS, 0.06)));
test('cropFrame: a clamped edge sits at 0% (box clamped at the left: "858 / 496", 116.5501% x 201.6129% at 0%, -91.129%)', () => {
  const f = cropFrame(A, one({ w: 1000, h: 1000, box: [10, 500, 810, 900] }));
  const s = shapeOk(f);
  return s !== true ? s : all(eq(f.frame.aspectRatio, '858 / 496'), pctEq(f.img, { width: 116.5501, height: 201.6129, left: 0, top: -91.129 }));
});
test('cropFrame: a non-square canvas uses W for width/left and H for height/top (1600 x 900: 178.5714% x 113.0653% at -39.2857%, -6.5327%)', () => {
  const f = cropFrame(A, one({ w: 1600, h: 900, box: [400, 100, 1200, 800] }));
  const s = shapeOk(f);
  return s !== true ? s : all(eq(f.frame.aspectRatio, '896 / 796'), pctEq(f.img, { width: 178.5714, height: 113.0653, left: -39.2857, top: -6.5327 }));
});
test('cropFrame: a fractional box is built from cropBox (percentages = 4-decimal rounding of cropBox) and its aspect ratio is the grown box (862.4 / 592.4) within 0.5%', () => {
  const f = cropFrame(B, CROPS);
  const s = shapeOk(f);
  if (s !== true) return s;
  const r = ratioOf(f.frame.aspectRatio);
  return all(pctEq(f.img, frameOf(cropBox(ENTRY_B), 2000, 2000)), Math.abs(r / (862.4 / 592.4) - 1) <= 0.005 ? true : `aspectRatio ${q(f.frame.aspectRatio)} (${r}), want the grown box ${862.4 / 592.4}`);
});
test('cropFrame: the percentages put exactly the grown box in the frame (round trip to source px within 0.05 px, worked, clamped and fractional examples)', () => {
  const cases = [[A, CROPS, ENTRY_A], [B, CROPS, ENTRY_B], [A, one({ w: 1000, h: 1000, box: [10, 500, 810, 900] }), { w: 1000, h: 1000, box: [10, 500, 810, 900] }], [A, one({ w: 1600, h: 900, box: [400, 100, 1200, 800] }), { w: 1600, h: 900, box: [400, 100, 1200, 800] }]];
  for (const [url, table, e] of cases) {
    const f = cropFrame(url, table);
    if (!f?.img) return `cropFrame(${url}) is ${q(f)}`;
    const [w, h, l, t] = ['width', 'height', 'left', 'top'].map((k) => pctOf(f.img[k]));
    // The img is the whole canvas at w% x h% of the frame, offset by l%, t%: the frame's [0, 100%] maps to source [-l/w*W, (100-l)/w*W].
    const shown = { x: (-l / w) * e.w, y: (-t / h) * e.h, w: (100 / w) * e.w, h: (100 / h) * e.h };
    const r = near(shown, cropBox(e), 0.05);
    if (r !== true) return `${q(e.box)} on ${e.w}x${e.h}: the frame shows ${r}`;
  }
  return true;
});
test('cropFrame: does not mutate the (frozen) table', () => {
  cropFrame(A, CROPS, 0.25);
  return eq(CROPS[A], ENTRY_A);
});
{
  // "No object-view-box anywhere": Firefox and Safari/iOS ignore it, so a crop built on it shows nothing there.
  const files = ['src/lib/imageCrop.js', 'src/components/PackageCard.jsx', 'src/components/PackageModal.jsx', 'src/components/CartDrawer.jsx', 'src/index.css'];
  const hits = files.filter((f) => existsSync(join(ROOT, f)) && /object-?view-?box/i.test(readFileSync(join(ROOT, f), 'utf-8')));
  check('cropFrame: no object-view-box left in the crop lib, the three render sites or index.css', !hits.length, `object-view-box / objectViewBox in ${hits.join(', ')}`);
}

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

// ---- AC6 against the independently measured art (review r1 U2-F1) --------------
// test/fixtures/image-crops/art-boxes.json: alpha >= 250 bounding box of each live
// file, measured by the test writer from the downloaded images. Never derived from
// imageCrops.json, so a wrong table cannot vouch for itself.
const ART_FILE = join(ROOT, 'test', 'fixtures', 'image-crops', 'art-boxes.json');
const ARTS = JSON.parse(readFileSync(ART_FILE, 'utf-8')).images;
/** A crop box may exceed the art by this much per edge (anti-aliased rims below alpha 250, about 4 px on the live files). */
export const ART_SLACK = 12;
/** Problems of a table box against the art: it must contain the art and exceed it by at most ART_SLACK px per edge. */
export function artProblems(box, art, slack = ART_SLACK) {
  if (!Array.isArray(box) || box.length !== 4) return [`box ${q(box)}`];
  const out = [];
  const edges = [
    ['left', art[0] - box[0]],
    ['top', art[1] - box[1]],
    ['right', box[2] - art[2]],
    ['bottom', box[3] - art[3]],
  ];
  for (const [edge, over] of edges) {
    if (over < 0) out.push(`cuts ${-over} px of art off at the ${edge} (box ${q(box)}, art ${q(art)})`);
    else if (over > slack) out.push(`reaches ${over} px past the art at the ${edge}, max ${slack} (box ${q(box)}, art ${q(art)}: shadow or empty canvas)`);
  }
  return out;
}

check('AC6 (setup) art-boxes.json covers the five Prism Token packages with the same URLs as the catalogue fixture', PRISM.every((p) => ARTS[p.id]?.url === p.url && Array.isArray(ARTS[p.id].art)) && Object.keys(ARTS).length === PRISM.length, q(PRISM.map((p) => [p.id, ARTS[p.id]?.url === p.url])));

for (const p of PRISM) {
  const e = Object.prototype.hasOwnProperty.call(table, p.url) ? table[p.url] : undefined;
  const art = ARTS[p.id]?.art;
  check(`AC6 imageCrops.json: the "${p.name}" box holds all of the independently measured art and exceeds it by at most ${ART_SLACK} px per edge`, !!e && !!art && !artProblems(e.box, art).length, !e ? `no entry for ${p.url}` : !art ? 'no measured art' : artProblems(e.box, art).join('; '));
}

{
  // Proof that the check above bites (the two counter-examples from review r1 U2-F1, plus each image's shadow box).
  const art26 = ARTS[7808728].art;
  const cases = [
    // [1000, 700, 1500, 1200] for 26,000: cuts the art (left of the pile from x 883, the top from y 426, the right to x 1709, the bottom to y 1540).
    ['[1000, 700, 1500, 1200] for 26,000 (cuts art off)', [1000, 700, 1500, 1200], art26, /cuts/],
    // [300, 400, 1720, 1560] for 26,000: holds the art but takes in the soft shadow to its left (extent 0.71, so the 0.9 rule alone lets it through).
    ['[300, 400, 1720, 1560] for 26,000 (includes the shadow)', [300, 400, 1720, 1560], art26, /reaches/],
    ...PRISM.map((p) => [`the alpha >= 64 shadow box of "${p.name}"`, ARTS[p.id].shadow, ARTS[p.id].art, /reaches/]),
  ];
  const missed = cases.filter(([, box, art, why]) => !artProblems(box, art).some((x) => why.test(x))).map(([label]) => label);
  const tight = PRISM.filter((p) => artProblems(ARTS[p.id].art, ARTS[p.id].art).length).map((p) => p.name);
  check('AC6 (proof) the art check rejects a box that cuts art off ([1000, 700, 1500, 1200] for 26,000) or includes the shadow ([300, 400, 1720, 1560]; each shadow box), and accepts the art box itself', !missed.length && !tight.length, [missed.length && `not rejected: ${missed.join(', ')}`, tight.length && `the art box itself rejected for ${tight.join(', ')}`].filter(Boolean).join('; '));
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
