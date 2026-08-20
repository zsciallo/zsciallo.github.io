import { extent, linePath, padded, scale, SERIES } from './chart';

const WIDTH = 84;
const HEIGHT = 26;

/**
 * Trailing-fortnight median price, one line, no axes. It exists to make the
 * list scannable, not readable - the number beside it carries the actual
 * change, and the detail chart carries the values.
 */
export function Sparkline({ points, label }) {
  if (!points || points.length < 2) {
    return <div class="spark spark--empty" aria-hidden="true" />;
  }

  const domain = padded(extent(points), 0.15);
  const coords = points.map((value, i) => [
    scale(i, [0, points.length - 1], [1.5, WIDTH - 1.5]),
    scale(value, domain, [HEIGHT - 3, 3]),
  ]);
  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg class="spark" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT}
      role="img" aria-label={label}>
      <path d={linePath(coords)} fill="none" stroke={SERIES.price} stroke-width="1.75"
        stroke-linejoin="round" stroke-linecap="round" opacity="0.85" />
      <circle cx={lastX} cy={lastY} r="2.4" fill={SERIES.price} />
    </svg>
  );
}
