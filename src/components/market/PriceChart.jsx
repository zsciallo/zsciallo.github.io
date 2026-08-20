import { useState } from 'preact/hooks';
import { count, fullDate, money, shortDate } from '../../lib/market';
import { extent, linePath, nearest, padded, scale, SERIES, ticks, useMeasure } from './chart';

const PLOT_HEIGHT = 210;
const VOLUME_HEIGHT = 56;
const PAD = { top: 12, right: 14, bottom: 22, left: 58 };

export const RANGES = [
  { id: '7d', label: '7D', days: 7, grain: 'hourly' },
  { id: '30d', label: '30D', days: 30, grain: 'daily' },
  { id: 'all', label: 'ALL', days: Infinity, grain: 'daily' },
];

/**
 * Sale price over time with the live-listing floor beneath it, and traded
 * quantity on its own axis below.
 *
 * Price and floor share one y-axis because they are the same measure in the
 * same units. Quantity is a different measure, so it gets its own panel rather
 * than a second scale on this one - the two panels share the x-axis, which is
 * what makes them readable together.
 */
export function PriceChart({ history, range, onRange }) {
  const [ref, width] = useMeasure();
  const [hover, setHover] = useState(null);

  const spec = RANGES.find((r) => r.id === range) ?? RANGES[1];
  const source = spec.grain === 'hourly' && history.hourly?.length ? history.hourly : history.daily;
  const latest = source?.length ? source[source.length - 1].t : Date.now();
  const from = spec.days === Infinity ? -Infinity : latest - spec.days * 86_400_000;

  const sales = (source ?? []).filter((d) => d.t >= from);
  const floors = (history.floor ?? []).filter((d) => d.t >= from);

  if (sales.length === 0 && floors.length === 0) {
    return (
      <div class="chart-card">
        <ChartHead range={range} onRange={onRange} />
        <p class="chart-empty">No trades recorded in this window.</p>
      </div>
    );
  }

  const innerWidth = Math.max(240, width - PAD.left - PAD.right);
  const plotBottom = PAD.top + PLOT_HEIGHT;

  const timeDomain = extent([
    ...sales.map((d) => d.t),
    ...floors.map((d) => d.t),
  ]);
  const priceDomain = padded(extent([
    ...sales.flatMap((d) => [d.lo, d.hi]),
    ...floors.map((d) => d.floor),
  ]));

  const x = (t) => PAD.left + scale(t, timeDomain, [0, innerWidth]);
  const y = (v) => scale(v, priceDomain, [plotBottom, PAD.top]);

  const salePoints = sales.map((d) => [x(d.t), y(d.med)]);
  const floorPoints = floors.map((d) => [x(d.t), y(d.floor)]);
  // The lo-hi wash shows how wide a bucket's trades were spread; without it a
  // median line implies a precision the market does not have.
  const spread = sales.length > 1
    ? `${linePath(sales.map((d) => [x(d.t), y(d.hi)]))} L${sales.map((d) => [x(d.t), y(d.lo)]).reverse().map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`).join(' L')} Z`
    : null;

  const volumeTop = plotBottom + PAD.bottom + 8;
  const maxQty = Math.max(1, ...sales.map((d) => d.qty));
  const barWidth = Math.max(1.5, Math.min(14, innerWidth / Math.max(sales.length, 1) - 2));

  const height = volumeTop + VOLUME_HEIGHT + 20;
  const priceTicks = ticks(priceDomain, 4);
  const timeTicks = ticks(timeDomain, Math.min(5, Math.max(2, Math.floor(innerWidth / 90))));

  const active = hover != null ? sales[hover] : null;
  const activeFloor = active && floors.length
    ? floors.reduce((best, d) => (Math.abs(d.t - active.t) < Math.abs(best.t - active.t) ? d : best))
    : null;

  const onMove = (event) => {
    if (!salePoints.length) return;
    const box = event.currentTarget.getBoundingClientRect();
    setHover(nearest(salePoints, event.clientX - box.left));
  };

  return (
    <div class="chart-card">
      <ChartHead range={range} onRange={onRange} />

      <div class="chart-legend">
        <span class="legend-key"><i style={`background:${SERIES.price}`} />Median sale price</span>
        <span class="legend-key"><i style={`background:${SERIES.floor}`} />Listing floor</span>
        <span class="legend-key legend-key--wash"><i style={`background:${SERIES.price}`} />Low–high range</span>
      </div>

      <div class="chart-body" ref={ref}>
        {width > 0 && (
          <svg width={width} height={height} class="chart-svg" role="img"
            aria-label="Price history and traded quantity"
            onMouseMove={onMove} onMouseLeave={() => setHover(null)}>

            {priceTicks.map((value) => (
              <g key={value}>
                <line x1={PAD.left} x2={PAD.left + innerWidth} y1={y(value)} y2={y(value)} class="chart-grid" />
                <text x={PAD.left - 8} y={y(value) + 4} class="chart-tick chart-tick--y">{money(value)}</text>
              </g>
            ))}

            {timeTicks.map((t) => (
              <text key={t} x={x(t)} y={plotBottom + 16} class="chart-tick chart-tick--x">{shortDate(t)}</text>
            ))}

            {spread && <path d={spread} fill={SERIES.price} opacity="0.1" />}

            {floorPoints.length > 1 && (
              <path d={linePath(floorPoints)} fill="none" stroke={SERIES.floor} stroke-width="2"
                stroke-linejoin="round" stroke-linecap="round" />
            )}
            {salePoints.length > 1 && (
              <path d={linePath(salePoints)} fill="none" stroke={SERIES.price} stroke-width="2"
                stroke-linejoin="round" stroke-linecap="round" />
            )}
            {salePoints.length === 1 && (
              <circle cx={salePoints[0][0]} cy={salePoints[0][1]} r="4" fill={SERIES.price} />
            )}

            {/* Traded quantity, own baseline, same x-axis. */}
            <line x1={PAD.left} x2={PAD.left + innerWidth} y1={volumeTop + VOLUME_HEIGHT}
              y2={volumeTop + VOLUME_HEIGHT} class="chart-axis" />
            <text x={PAD.left - 8} y={volumeTop + 10} class="chart-tick chart-tick--y">{count(maxQty)}</text>
            <text x={PAD.left - 8} y={volumeTop + VOLUME_HEIGHT + 4} class="chart-tick chart-tick--y">0</text>
            {sales.map((d, i) => {
              const barHeight = Math.max(1, (d.qty / maxQty) * VOLUME_HEIGHT);
              return (
                <rect key={d.t} x={x(d.t) - barWidth / 2} y={volumeTop + VOLUME_HEIGHT - barHeight}
                  width={barWidth} height={barHeight} rx={Math.min(2, barWidth / 2)}
                  fill={SERIES.price} opacity={hover === i ? 0.95 : 0.5} />
              );
            })}
            <text x={PAD.left} y={height - 4} class="chart-tick chart-axis-label">QUANTITY TRADED</text>

            {active && (
              <g class="chart-crosshair">
                <line x1={x(active.t)} x2={x(active.t)} y1={PAD.top} y2={volumeTop + VOLUME_HEIGHT} />
                <circle cx={x(active.t)} cy={y(active.med)} r="4.5" fill={SERIES.price}
                  stroke="var(--bg2)" stroke-width="2" />
                {activeFloor && (
                  <circle cx={x(activeFloor.t)} cy={y(activeFloor.floor)} r="4.5" fill={SERIES.floor}
                    stroke="var(--bg2)" stroke-width="2" />
                )}
              </g>
            )}
          </svg>
        )}

        {active && (
          <div class="chart-tip" style={`left:${Math.min(Math.max(x(active.t), 90), Math.max(width - 90, 90))}px`}>
            <p class="chart-tip-time">{fullDate(active.t)}</p>
            <dl>
              <div><dt><i style={`background:${SERIES.price}`} />Median</dt><dd>{money(active.med, { compact: false })}</dd></div>
              <div><dt>Low–high</dt><dd>{money(active.lo)} – {money(active.hi)}</dd></div>
              <div><dt>VWAP</dt><dd>{money(active.vwap, { compact: false })}</dd></div>
              <div><dt>Sales</dt><dd>{active.n} · {count(active.qty)} units</dd></div>
              {activeFloor && (
                <div><dt><i style={`background:${SERIES.floor}`} />Floor</dt><dd>{money(activeFloor.floor, { compact: false })}</dd></div>
              )}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

function ChartHead({ range, onRange }) {
  return (
    <div class="chart-head">
      <h3 class="chart-title">Price history</h3>
      <div class="range-tabs" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button key={r.id} type="button" class={`range-tab${r.id === range ? ' active' : ''}`}
            aria-pressed={r.id === range} onClick={() => onRange(r.id)}>{r.label}</button>
        ))}
      </div>
    </div>
  );
}
