import { useEffect, useRef, useState } from 'preact/hooks';
import { money } from '../../lib/market';

// Series hues for the market charts. Both sit inside the dark-mode lightness
// band and clear CVD separation against the panel surface (#16102a), so the two
// lines stay distinguishable for deuteranopic and tritanopic readers. Changing
// either one means re-running the palette check.
export const SERIES = {
  price: '#ab68f2',
  floor: '#1ba873',
  // Candle direction. Green/red is the convention a trader already reads, but
  // it is never the only cue: an up candle is drawn hollow and a down candle
  // filled, so direction survives both colour blindness and a greyscale print.
  up: '#3fcf8e',
  down: '#f2707c',
  // A bucket that opened and closed at the same price is neither. These
  // markets sit still for hours at a time, and painting every quiet hour green
  // reports a climb that never happened.
  flat: '#7f6ea6',
};

/** Plot margins, shared so the price, pool and candle charts line up when a
 *  reader switches between them. Left is wide enough for a money tick. */
export const PAD = { top: 12, right: 14, bottom: 22, left: 58 };

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

// ─── indicators ───
// Computed in the browser rather than the build: they are a toy to play with,
// three of them would triple what a pool document carries, and a few hundred
// closes is nothing to a modern phone.

/**
 * Simple moving average, aligned to the input so index i is the average of the
 * `period` closes ending there. The leading window is null - the average of
 * three candles is not a 25-candle average, and drawing it as one would put a
 * confident line where there is no data.
 */
export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Bollinger bands: a moving average with a channel `k` standard deviations
 *  wide either side, so the channel widens exactly when the market gets noisy. */
export function bollinger(values, period, k = 2) {
  const mid = sma(values, period);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i += 1) {
    const mean = mid[i];
    let sum = 0;
    for (let j = i - period + 1; j <= i; j += 1) sum += (values[j] - mean) ** 2;
    const deviation = Math.sqrt(sum / period) * k;
    upper[i] = mean + deviation;
    lower[i] = mean - deviation;
  }
  return { mid, upper, lower };
}

/**
 * Money labels for a price axis, scaled and rounded to the axis's own step.
 *
 * `money` compacts for lists, where the reader wants the magnitude and nothing
 * else. An axis wants the opposite: a market trading in a $40 band around
 * $1,540 gets three ticks that all read "$1.5K", which is not an axis. Pick the
 * unit from the largest tick and the decimals from the gap between them, so one
 * tick apart is always one label apart.
 */
export function axisMoney(values) {
  if (values.length === 0) return [];
  const max = Math.max(...values.map(Math.abs), 1);
  const step = values.length > 1
    ? Math.min(...values.slice(1).map((value, i) => Math.abs(value - values[i])))
    : max;
  const [size, suffix] = max >= 1e6 ? [1e6, 'M'] : max >= 1e4 ? [1e3, 'K'] : [1, ''];
  const decimals = Math.max(0, Math.min(2, Math.ceil(Math.log10(size / (step || 1)))));
  return values.map((value) => {
    if (value === 0) return '$0';
    const scaled = value / size;
    return `$${size === 1 ? Math.round(scaled).toLocaleString('en-US') : scaled.toFixed(decimals)}${suffix}`;
  });
}
