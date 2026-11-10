// Vite plugin: `import sizes from 'virtual:image-sizes'` gives
// { '<file name>': [width, height] } for every image in src/assets/serverImages,
// read from the file headers at build time. The carousel uses it for the
// width/height attributes, so the browser knows each slide's box before the
// image arrives. Supports PNG, JPEG, GIF and WebP; an unreadable file is left
// out (its <img> then simply has no size attributes).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ID = 'virtual:image-sizes';
const RESOLVED = `\0${ID}`;
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

/** [width, height] from an image file's header, or null. */
export function imageSize(buf) {
  // PNG: signature, then the IHDR chunk.
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.toString('latin1', 12, 16) === 'IHDR') {
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  }
  // GIF: logical screen size.
  if (buf.length >= 10 && buf.toString('latin1', 0, 3) === 'GIF') return [buf.readUInt16LE(6), buf.readUInt16LE(8)];
  // WebP: RIFF container with a VP8, VP8L or VP8X chunk first.
  if (buf.length >= 30 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const chunk = buf.toString('latin1', 12, 16);
    if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1];
    }
    if (chunk === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
    return null;
  }
  // JPEG: walk the segments to the first start-of-frame marker.
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      const len = buf.readUInt16BE(i + 2);
      const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (sof) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
      i += 2 + len;
    }
  }
  return null;
}

export function imageSizes({ dir }) {
  return {
    name: 'chromabit-image-sizes',
    resolveId(id) {
      return id === ID ? RESOLVED : null;
    },
    load(id) {
      if (id !== RESOLVED) return null;
      const sizes = {};
      for (const name of readdirSync(dir).filter((f) => IMAGE.test(f)).sort()) {
        const file = join(dir, name);
        this.addWatchFile(file);
        const size = imageSize(readFileSync(file));
        if (size && size[0] > 0 && size[1] > 0) sizes[name] = size;
      }
      return `export default ${JSON.stringify(sizes)};`;
    },
  };
}
