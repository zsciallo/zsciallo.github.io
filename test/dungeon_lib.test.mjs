#!/usr/bin/env node
// Unit tests for the pure dungeon map helpers in src/lib/dungeonMap/data.js
// (run 20261121-dungeon-map, U2 AC9).
//
//   node test/dungeon_lib.test.mjs          (no build, no npm, no browser needed)
//
// Prints `PASS <name>` / `FAIL <name>: <why>` per case, then `RESULT: PASS n checks`
// or `RESULT: FAIL k of n`, and exits 0 or 1 (same format as test/pvp_lib.test.mjs).
//
// REQUIREMENT on data.js: importable by plain Node (no JSX, no DOM, no bare or
// extensionless imports, nothing touching window at import time).
//
// THE INTERFACE (formats: .orch/runs/20261121-dungeon-map/spec-U1.md; extra fields allowed):
//
// parseBlocks(arrayBuffer) -> { nBlocks, nChunks, origin: [x, y, z], size: [sx, sy, sz], nStates,
//     chunks: [{ cx, cz, start, count }], x, y, z, state }
//   arrayBuffer is the DECOMPRESSED blocks.bin. x/y/z/state are array-likes (Uint16Array) of
//   nBlocks values, file-relative, exactly as stored. A buffer whose magic is not "HWB1" throws.
// cutCount(y, start, count, cut) -> number of the blocks y[start .. start+count-1] (sorted
//   ascending) with y <= cut. `cut` is in the same units as y (file-relative).
// project(meta, x, y, z) -> [mx, my] = meta.A . (x, y, z) + meta.b, world coordinates.
// unproject(meta, mx, my, y) -> [x, z]: the world x, z whose projection at height y is (mx, my).
// capMask(solidBits, size, cut) -> Uint8Array of size[2] * size[0] bytes (row z, column x:
//   index z * sx + x). Non-zero exactly where solid[cut][z][x] AND solid[cut + 1][z][x]; a
//   layer outside 0..sy-1 counts as not solid. solidBits is numpy.packbits (MSB first) over
//   [y, z, x], as solid.bin.gz decompressed. `cut` is file-relative.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const META = JSON.parse(readFileSync(join(ROOT, 'public', 'dungeon', 'meta.json'), 'utf-8'));

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${detail}`}`);
}
const q = JSON.stringify;
/** Run one case; a throw is a failure, not a crash. fn returns true or a reason. */
function test(name, fn) {
  try {
    const r = fn();
    check(name, r === true, typeof r === 'string' ? r : `returned ${q(r)}`);
  } catch (e) {
    check(name, false, `threw ${e?.message ?? e}`);
  }
}
const eq = (got, want) => (q(got) === q(want) ? true : `got ${q(got)}, want ${q(want)}`);
const near = (got, want, eps = 1e-6) =>
  Array.isArray(got) && got.length === want.length && got.every((v, i) => Math.abs(v - want[i]) <= eps) ? true : `got ${q(got)}, want ${q(want)} (+-${eps})`;

let lib = {};
try {
  // DUNGEON_LIB (a path) swaps in another module; only for validating these tests against a reference.
  lib = await import(pathToFileURL(process.env.DUNGEON_LIB ? resolve(process.env.DUNGEON_LIB) : join(ROOT, 'src', 'lib', 'dungeonMap', 'data.js')).href);
  check('src/lib/dungeonMap/data.js imports in plain Node', true);
} catch (e) {
  check('src/lib/dungeonMap/data.js imports in plain Node', false, `${e?.message ?? e}`);
}
const { parseBlocks, cutCount, project, unproject, capMask } = lib;

// ------------------------------------------------------------ parseBlocks --

/** A hand-built blocks.bin: 3 blocks in 2 chunks. */
function tinyBlocks(magic = 'HWB1') {
  const chunks = [[0, 0, 0, 2], [1, 0, 2, 1]];
  const cols = { x: [1, 2, 17], y: [0, 4, 3], z: [5, 6, 7], state: [0, 4, 2] };
  const buf = new ArrayBuffer(32 + chunks.length * 12 + 4 * 3 * 2);
  const v = new DataView(buf);
  for (let i = 0; i < 4; i++) v.setUint8(i, magic.charCodeAt(i));
  v.setUint32(4, 3, true);
  v.setUint32(8, 2, true);
  [-1168, -60, -832].forEach((n, i) => v.setInt32(12 + i * 4, n, true));
  [368, 277, 384, 5].forEach((n, i) => v.setUint16(24 + i * 2, n, true));
  chunks.forEach(([cx, cz, start, count], i) => {
    const o = 32 + i * 12;
    v.setUint16(o, cx, true);
    v.setUint16(o + 2, cz, true);
    v.setUint32(o + 4, start, true);
    v.setUint32(o + 8, count, true);
  });
  let o = 32 + chunks.length * 12;
  for (const k of ['x', 'y', 'z', 'state']) for (const n of cols[k]) (v.setUint16(o, n, true), (o += 2));
  return buf;
}

test('parseBlocks reads the header and chunk table of a hand-built buffer', () => {
  const r = parseBlocks(tinyBlocks());
  return eq(
    { nBlocks: r.nBlocks, nChunks: r.nChunks, origin: Array.from(r.origin), size: Array.from(r.size), nStates: r.nStates, chunks: r.chunks.map(({ cx, cz, start, count }) => ({ cx, cz, start, count })) },
    { nBlocks: 3, nChunks: 2, origin: [-1168, -60, -832], size: [368, 277, 384], nStates: 5, chunks: [{ cx: 0, cz: 0, start: 0, count: 2 }, { cx: 1, cz: 0, start: 2, count: 1 }] },
  );
});
test('parseBlocks reads the four columns in order x, y, z, state', () => {
  const r = parseBlocks(tinyBlocks());
  return eq({ x: Array.from(r.x), y: Array.from(r.y), z: Array.from(r.z), state: Array.from(r.state) }, { x: [1, 2, 17], y: [0, 4, 3], z: [5, 6, 7], state: [0, 4, 2] });
});
test('parseBlocks throws on a wrong magic', () => {
  try {
    parseBlocks(tinyBlocks('HWB0'));
  } catch {
    return true;
  }
  return 'accepted a buffer with magic "HWB0"';
});
test('parseBlocks reads the committed public/dungeon/blocks.bin.gz (counts agree with meta.json)', () => {
  const b = gunzipSync(readFileSync(join(ROOT, 'public', 'dungeon', 'blocks.bin.gz')));
  const r = parseBlocks(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  const last = r.chunks[r.chunks.length - 1];
  return eq([r.nBlocks, r.nChunks, r.chunks.length, r.state.length, last.start + last.count], [META.nBlocks, META.nChunks, META.nChunks, META.nBlocks, META.nBlocks]);
});

// --------------------------------------------------------------- cutCount --

// One chunk at start 2, count 5 inside a longer column: [1, 3, 3, 6, 9]; the 7s and 0 around it are other chunks.
const Y = Uint16Array.from([7, 7, 1, 3, 3, 6, 9, 0]);
for (const [cut, want, what] of [
  [0, 0, 'below the lowest'],
  [1, 1, 'exactly the lowest'],
  [3, 3, 'exactly a repeated height (both counted)'],
  [4, 3, 'between two heights'],
  [9, 5, 'exactly the highest'],
  [20, 5, 'above the highest'],
])
  test(`cutCount: cut ${cut}, ${what} -> ${want}`, () => eq(cutCount(Y, 2, 5, cut), want));

// ----------------------------------------------------- project / unproject --

test('project = A . (x, y, z) + b with the committed meta.json', () => {
  const [x, y, z] = [-885.5, 67, -722.5];
  const { A, b } = META;
  return near(Array.from(project(META, x, y, z)), [A[0][0] * x + A[0][1] * y + A[0][2] * z + b[0], A[1][0] * x + A[1][1] * y + A[1][2] * z + b[1]], 1e-9);
});
test('unproject inverts project at the same height (3 points)', () => {
  for (const [x, y, z] of [[-885.5, 67, -722.5], [-987.5, -55, -636.5], [-1168, 216, -449]]) {
    const [mx, my] = project(META, x, y, z);
    const r = near(Array.from(unproject(META, mx, my, y)), [x, z], 1e-6);
    if (r !== true) return `(${x}, ${y}, ${z}): ${r}`;
  }
  return true;
});

// ---------------------------------------------------------------- capMask --

// 2x2x2 grid, solid[y][z][x]: y0 = [[1, 1], [1, 0]], y1 = [[1, 1], [0, 0]].
// Bits (index y*4 + z*2 + x, MSB first): 1110 1100 = 0xEC.
const SOLID = Uint8Array.from([0xec]);
const truthy = (m) => Array.from(m, (v) => (v ? 1 : 0));
test('capMask on a 2x2x2 grid, cut 0: solid at y 0 and y 1 -> [1, 1, 0, 0] (z0x0, z0x1, z1x0, z1x1)', () => {
  const m = capMask(SOLID, [2, 2, 2], 0);
  return m?.length !== 4 ? `length ${m?.length}, want 4` : eq(truthy(m), [1, 1, 0, 0]);
});
test('capMask on a 2x2x2 grid, cut 1 (top layer, nothing above) -> all 0', () => eq(truthy(capMask(SOLID, [2, 2, 2], 1)), [0, 0, 0, 0]));

console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
process.exitCode = failed ? 1 : 0;
