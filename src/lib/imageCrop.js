// Crops for store images whose art sits small in the middle of a large
// transparent canvas (the Prism Token renders). Pure: no DOM, never mutates its
// input. The table (src/data/imageCrops.json, written by tools/image_crops.py)
// maps a full image URL to { w, h, box: [x0, y0, x1, y1] }: the canvas size and
// the art's bounding box in source pixels, x1/y1 exclusive.

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const round2 = (n) => Math.round(n * 100) / 100;

/** The entry for that exact URL, or null when there is none or it is malformed. */
export function cropFor(url, crops) {
  if (!url || !crops || typeof crops !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(crops, url)) return null;
  const e = crops[url];
  if (!e || typeof e !== 'object') return null;
  const { w, h, box } = e;
  if (!isNum(w) || !isNum(h) || w <= 0 || h <= 0) return null;
  if (!Array.isArray(box) || box.length !== 4 || !box.every(isNum)) return null;
  const [x0, y0, x1, y1] = box;
  if (x1 <= x0 || y1 <= y0 || x0 < 0 || y0 < 0 || x1 > w || y1 > h) return null;
  return e;
}

/** The box grown by margin x its larger side on every side, clamped to the canvas: { x, y, w, h }. */
export function cropBox(entry, margin = 0.06) {
  const [x0, y0, x1, y1] = entry.box;
  const grow = margin * Math.max(x1 - x0, y1 - y0);
  const left = Math.max(0, x0 - grow);
  const top = Math.max(0, y0 - grow);
  const right = Math.min(entry.w, x1 + grow);
  const bottom = Math.min(entry.h, y1 + grow);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** The inline style that shows only the (grown) art box, or null for an image with no crop. */
export function cropStyle(url, crops, margin) {
  const entry = cropFor(url, crops);
  if (!entry) return null;
  const b = cropBox(entry, margin);
  const top = Math.round(b.y);
  const left = Math.round(b.x);
  const right = Math.round(entry.w - (b.x + b.w));
  const bottom = Math.round(entry.h - (b.y + b.h));
  return {
    aspectRatio: `${round2(b.w)} / ${round2(b.h)}`,
    objectViewBox: `inset(${top}px ${right}px ${bottom}px ${left}px)`,
  };
}

/** The <img> attributes for a crop: { 'data-cropped', style }, or {} so an uncropped image renders as before. */
export function cropAttrs(url, crops, margin) {
  const style = cropStyle(url, crops, margin);
  return style ? { 'data-cropped': 'true', style } : {};
}
