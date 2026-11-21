#!/usr/bin/env node
// Checks the committed dungeon map data in public/dungeon/ (run 20261121-dungeon-map, U1 AC5).
//
//   node test/dungeon_data.test.mjs          (no build, no npm install needed)
//
// Formats: .orch/runs/20261121-dungeon-map/spec-U1.md. Prints `PASS <name>` / `FAIL <name>: <why>`,
// then `RESULT: PASS n checks` or `RESULT: FAIL k of n`, exit 0 or 1 (same as test/pvp_lib.test.mjs).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const DIR = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'public', 'dungeon');

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${detail}`}`);
  return ok;
}
const q = JSON.stringify;

function load(file, decode = (b) => b) {
  const path = join(DIR, file);
  if (!check(`${file} exists`, existsSync(path), `missing ${path}`)) return null;
  try {
    const v = decode(readFileSync(path));
    check(`${file} decodes`, true);
    return v;
  } catch (e) {
    check(`${file} decodes`, false, e.message);
    return null;
  }
}

const meta = load('meta.json', (b) => JSON.parse(b.toString('utf-8')));
const blocks = load('blocks.bin.gz', gunzipSync);
const solid = load('solid.bin.gz', gunzipSync);
const atlas = load('atlas.png');
const preview = load('preview.jpg');

if (meta) {
  check('meta states has nStates names', Array.isArray(meta.states) && meta.states.length === meta.nStates
    && meta.states.every((s) => typeof s === 'string' && s), `states ${meta.states?.length} nStates ${meta.nStates}`);
}

if (blocks && meta) {
  const b = blocks;
  const magic = b.toString('latin1', 0, 4);
  check('blocks magic HWB1', magic === 'HWB1', `got ${q(magic)}`);
  const nBlocks = b.readUInt32LE(4), nChunks = b.readUInt32LE(8);
  const origin = [b.readInt32LE(12), b.readInt32LE(16), b.readInt32LE(20)];
  const [sx, sy, sz] = [b.readUInt16LE(24), b.readUInt16LE(26), b.readUInt16LE(28)];
  const nStates = b.readUInt16LE(30);
  check('header nBlocks = meta', nBlocks === meta.nBlocks && nBlocks > 0, `header ${nBlocks} meta ${meta.nBlocks}`);
  check('header nChunks = meta', nChunks === meta.nChunks && nChunks > 0, `header ${nChunks} meta ${meta.nChunks}`);
  check('header nStates = meta', nStates === meta.nStates && nStates > 0, `header ${nStates} meta ${meta.nStates}`);
  check('header origin = meta', q(origin) === q(meta.origin), `header ${q(origin)} meta ${q(meta.origin)}`);
  check('header size = meta', q([sx, sy, sz]) === q(meta.size), `header ${q([sx, sy, sz])} meta ${q(meta.size)}`);

  const colAt = 32 + 12 * nChunks;
  const want = colAt + 8 * nBlocks;
  if (check('blocks length = header + table + 4 columns', b.length === want, `got ${b.length} want ${want}`)) {
    const col = (c, i) => b.readUInt16LE(colAt + 2 * (c * nBlocks + i));
    let order = '', contig = '', empty = '', sum = 0, ysort = '', inside = '', stateBad = '', cell = '';
    const used = new Uint8Array(nStates);
    let prev = -1, next = 0;
    for (let k = 0; k < nChunks; k++) {
      const t = 32 + 12 * k;
      const cx = b.readUInt16LE(t), cz = b.readUInt16LE(t + 2), start = b.readUInt32LE(t + 4), count = b.readUInt32LE(t + 8);
      const key = cz * 65536 + cx;
      if (key <= prev && !order) order = `chunk ${k} (${cx},${cz}) not after previous`;
      prev = key;
      if (start !== next && !contig) contig = `chunk ${k} start ${start} want ${next}`;
      if (count === 0 && !empty) empty = `chunk ${k} (${cx},${cz}) is empty`;
      next = start + count;
      sum += count;
      if (start + count > nBlocks) { contig ||= `chunk ${k} runs past nBlocks`; continue; }
      for (let i = start; i < start + count; i++) {
        const x = col(0, i), y = col(1, i), z = col(2, i), s = col(3, i);
        if (i > start && y < col(1, i - 1) && !ysort) ysort = `chunk ${k} block ${i} y ${y} after ${col(1, i - 1)}`;
        if ((x >= sx || y >= sy || z >= sz) && !inside) inside = `block ${i} (${x},${y},${z}) size ${q([sx, sy, sz])}`;
        if (s >= nStates) stateBad ||= `block ${i} state ${s} nStates ${nStates}`;
        else used[s] = 1;
        if (((x >> 4) !== cx || (z >> 4) !== cz) && !cell) cell = `block ${i} (${x},${z}) in chunk (${cx},${cz})`;
      }
    }
    check('chunks ascending (cz, cx)', !order, order);
    check('chunk starts contiguous', !contig, contig);
    check('chunk counts sum to nBlocks', sum === nBlocks, `sum ${sum} nBlocks ${nBlocks}`);
    check('no empty chunks', !empty, empty);
    check('y sorted inside each chunk', !ysort, ysort);
    check('every x/y/z inside size', !inside, inside);
    check('every state < nStates', !stateBad, stateBad);
    check('every state index is used (dense)', used.every((u) => u), `unused ${used.indexOf(0)}`);
    check('block x>>4, z>>4 = chunk cx, cz', !cell, cell);
  }
  if (solid) {
    const want = Math.ceil((sx * sy * sz) / 8);
    check('solid length = ceil(sx*sy*sz/8)', solid.length === want, `got ${solid.length} want ${want}`);
  }
  if (atlas) {
    const sig = atlas.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && atlas.toString('latin1', 12, 16) === 'IHDR';
    if (check('atlas is a PNG with IHDR', sig, 'bad signature or first chunk')) {
      const w = atlas.readUInt32BE(16), h = atlas.readUInt32BE(20);
      check('atlas width = 40*48', w === 40 * 48, `got ${w}`);
      check('atlas height = ceil(nStates/40)*56', h === Math.ceil(nStates / 40) * 56, `got ${h} want ${Math.ceil(nStates / 40) * 56}`);
    }
  }
}

if (preview) {
  check('preview.jpg is a JPEG', preview[0] === 0xff && preview[1] === 0xd8, 'no FFD8 marker');
  check('preview.jpg under 400 KB', preview.length < 400_000, `${preview.length} bytes`);
}

if (existsSync(DIR)) {
  const total = readdirSync(DIR, { recursive: true }).reduce((n, f) => {
    const st = statSync(join(DIR, f));
    return st.isFile() ? n + st.size : n;
  }, 0);
  check('public/dungeon under 6 MB', total < 6_000_000, `${total} bytes`);
} else check('public/dungeon under 6 MB', false, `missing ${DIR}`);

console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
process.exitCode = failed ? 1 : 0;
