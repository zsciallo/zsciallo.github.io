import { useEffect, useRef, useState } from 'preact/hooks';

// Series hues for the market charts. Both sit inside the dark-mode lightness
// band and clear CVD separation against the panel surface (#16102a), so the two
// lines stay distinguishable for deuteranopic and tritanopic readers. Changing
// either one means re-running the palette check.
export const SERIES = {
  price: '#ab68f2',
  floor: '#1ba873',
};

/** SVG needs a pixel width, and the panel is fluid. */
export function useMeasure() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    setWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

export const scale = (value, [d0, d1], [r0, r1]) =>
  d1 === d0 ? (r0 + r1) / 2 : r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);

export function extent(values) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const value of values) {
    if (value == null || Number.isNaN(value)) continue;
    if (value < lo) lo = value;
    if (value > hi) hi = value;
  }
  return lo === Infinity ? [0, 1] : [lo, hi];
}

/** Pad a domain so marks never graze the plot edge, and keep a flat series
 *  from collapsing onto a single row of pixels. */
export function padded([lo, hi], fraction = 0.08) {
  if (lo === hi) {
    const nudge = Math.abs(lo) * 0.1 || 1;
    return [lo - nudge, hi + nudge];
  }
  const pad = (hi - lo) * fraction;
  return [lo - pad, hi + pad];
}

/** Round tick values, at most `wanted` of them, inside the domain. */
export function ticks([lo, hi], wanted = 4) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / wanted;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;
  const out = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(t);
  return out;
}

export const linePath = (points) =>
  points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

/** Index of the datum whose x is closest to a pointer position. */
export function nearest(points, x) {
  let best = 0;
  let bestDistance = Infinity;
  points.forEach(([px], i) => {
    const distance = Math.abs(px - x);
    if (distance < bestDistance) { bestDistance = distance; best = i; }
  });
  return best;
}
