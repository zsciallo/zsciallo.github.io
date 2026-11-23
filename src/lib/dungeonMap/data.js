// Pure helpers for the Heartwood map data (formats: tools/dungeon_map/README.md). No DOM, plain Node can import it.

/** blocks.bin (decompressed) -> header, chunk table and the four u16 columns, file-relative as stored. */
export function parseBlocks(buf) {
  const v = new DataView(buf);
  if (String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3)) !== 'HWB1') throw new Error('blocks.bin: bad magic');
  const nBlocks = v.getUint32(4, true);
  const nChunks = v.getUint32(8, true);
  const origin = [v.getInt32(12, true), v.getInt32(16, true), v.getInt32(20, true)];
  const size = [v.getUint16(24, true), v.getUint16(26, true), v.getUint16(28, true)];
  const chunks = [];
  for (let i = 0, o = 32; i < nChunks; i++, o += 12)
    chunks.push({ cx: v.getUint16(o, true), cz: v.getUint16(o + 2, true), start: v.getUint32(o + 4, true), count: v.getUint32(o + 8, true) });
  const col = (i) => new Uint16Array(buf, 32 + nChunks * 12 + i * nBlocks * 2, nBlocks);
  return { nBlocks, nChunks, origin, size, nStates: v.getUint16(30, true), chunks, x: col(0), y: col(1), z: col(2), state: col(3) };
}

/** How many of y[start .. start+count-1] (ascending) are <= cut. */
export function cutCount(y, start, count, cut) {
  let lo = start, hi = start + count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (y[mid] <= cut) lo = mid + 1;
    else hi = mid;
  }
  return lo - start;
}

/** World point -> map point: A . (x, y, z) + b. */
export const project = ({ A, b }, x, y, z) => [A[0][0] * x + A[0][1] * y + A[0][2] * z + b[0], A[1][0] * x + A[1][1] * y + A[1][2] * z + b[1]];

/** Map point at world height y -> world [x, z]. */
export function unproject({ A, b }, mx, my, y) {
  const u = mx - b[0] - A[0][1] * y, w = my - b[1] - A[1][1] * y, det = A[0][0] * A[1][2] - A[0][2] * A[1][0];
  return [(u * A[1][2] - A[0][2] * w) / det, (A[0][0] * w - A[1][0] * u) / det];
}

/** sz*sx bytes (index z*sx + x), non-zero where the cube is solid at layer cut and at cut + 1 (packbits, MSB first, over [y, z, x]). */
export function capMask(bits, [sx, sy, sz], cut) {
  const out = new Uint8Array(sz * sx);
  if (cut < 0 || cut + 1 >= sy) return out;
  const layer = sx * sz;
  const bit = (i) => (bits[i >> 3] >> (7 - (i & 7))) & 1;
  for (let i = 0, a = cut * layer; i < layer; i++) out[i] = bit(a + i) & bit(a + layer + i);
  return out;
}
