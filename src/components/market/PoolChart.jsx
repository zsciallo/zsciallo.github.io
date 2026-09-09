import { useState } from 'preact/hooks';
import { count, fullDate, money, shortDate, shortTime } from '../../lib/market';
import { extent, linePath, nearest, PAD, padded, scale, SERIES, ticks, useMeasure } from './chart';
import { CandleChart, candlesFor } from './CandleChart';

const PLOT_HEIGHT = 190;
const DEPTH_HEIGHT = 54;
const DAY = 86_400_000;

// `grain` is the candle bucket the range asks for. The mid only moves when
// someone trades, so a window has to be wide enough to hold a reversal before a
// candle has a wick to draw - an hour rarely does, four hours sometimes, a day
// usually. It is the coarsest grain that still fills the window with candles.
const RANGES = [
  { id: '24h', label: '24H', days: 1, grain: 'hourly' },
  { id: '7d', label: '7D', days: 7, grain: 'fourHour' },
  { id: 'all', label: 'ALL', days: Infinity, grain: 'daily' },
];

const MODES = [
  { id: 'line', label: 'LINE' },
  { id: 'candles', label: 'CANDLES' },
];

/**
 * A market's price over time, drawn either way.
 *
 * The line view carries the pool's inventory underneath it, because the two are
 * the same story told twice: the pool quotes off what it is holding, so a mid
 * that climbs while inventory drains is players buying the shelf empty, and one
 * that climbs on flat inventory is not. The candle view trades that for the
 * shape of each bucket and the units that moved in it.
 */
export function PoolChart({ title = 'Pool price', history, candles, now }) {
  const [mode, setMode] = useState('line');
  const [range, setRange] = useState('7d');

  const spec = RANGES.find((r) => r.id === range) ?? RANGES[1];
  const candle = mode === 'candles' ? candlesFor(candles, spec, now) : null;

  return (
    <div class="chart-card">
      <div class="chart-head">
        <h3 class="chart-title">{title}</h3>
        <div class="chart-controls">
          <div class="range-tabs" role="group" aria-label="Chart type">
            {MODES.map((m) => (
              <button key={m.id} type="button" class={`range-tab${m.id === mode ? ' active' : ''}`}
                aria-pressed={m.id === mode} onClick={() => setMode(m.id)}>{m.label}</button>
            ))}
          </div>
          <div class="range-tabs" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button key={r.id} type="button" class={`range-tab${r.id === range ? ' active' : ''}`}
                aria-pressed={r.id === range} onClick={() => setRange(r.id)}>{r.label}</button>
            ))}
          </div>
        </div>
      </div>

      {candle
        ? <CandleChart rows={candle.rows} grain={candle.grain} />
        : <LineView history={history} spec={spec} now={now} />}
    </div>
  );
}

/** The quoted mid as one line, with the inventory behind it below. */
function LineView({ history, spec, now }) {
  const [ref, width] = useMeasure();
  const [hover, setHover] = useState(null);

  const from = spec.days === Infinity ? -Infinity : now - spec.days * DAY;
  const series = (history ?? []).filter((d) => d.t >= from);

  if (series.length < 2) {
    return (
      <p class="chart-empty">
        {history?.length ? 'No price samples in this window.' : 'This market has no price history yet.'}
      </p>
    );
  }

  const innerWidth = Math.max(240, width - PAD.left - PAD.right);
  const plotBottom = PAD.top + PLOT_HEIGHT;
  const timeDomain = extent(series.map((d) => d.t));
  const priceDomain = padded(extent(series.map((d) => d.mid)));

  const x = (t) => PAD.left + scale(t, timeDomain, [0, innerWidth]);
  const y = (v) => scale(v, priceDomain, [plotBottom, PAD.top]);

  const points = series.map((d) => [x(d.t), y(d.mid)]);

  const depthTop = plotBottom + PAD.bottom + 8;
  const maxInventory = Math.max(1, ...series.map((d) => d.inv));
  const depthY = (v) => depthTop + DEPTH_HEIGHT - (v / maxInventory) * DEPTH_HEIGHT;
  const depthArea = `${linePath(series.map((d) => [x(d.t), depthY(d.inv)]))}`
    + ` L${x(series[series.length - 1].t).toFixed(1)} ${depthTop + DEPTH_HEIGHT}`
    + ` L${x(series[0].t).toFixed(1)} ${depthTop + DEPTH_HEIGHT} Z`;

  const height = depthTop + DEPTH_HEIGHT + 20;
  const priceTicks = ticks(priceDomain, 4);
  const timeTicks = ticks(timeDomain, Math.min(5, Math.max(2, Math.floor(innerWidth / 90))));
  const label = timeDomain[1] - timeDomain[0] <= 2 * DAY ? shortTime : shortDate;

  const active = hover != null ? series[hover] : null;

  const onMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    setHover(nearest(points, event.clientX - box.left));
  };

  return (
    <>
      <div class="chart-legend">
        <span class="legend-key"><i style={`background:${SERIES.price}`} />Quoted mid</span>
        <span class="legend-key legend-key--wash"><i style={`background:${SERIES.floor}`} />Pool inventory</span>
      </div>

      <div class="chart-body" ref={ref}>
        {width > 0 && (
          <svg width={width} height={height} class="chart-svg" role="img"
            aria-label="Mid price and pool inventory over time"
            onMouseMove={onMove} onMouseLeave={() => setHover(null)}>

            {priceTicks.map((value) => (
              <g key={value}>
                <line x1={PAD.left} x2={PAD.left + innerWidth} y1={y(value)} y2={y(value)} class="chart-grid" />
                <text x={PAD.left - 8} y={y(value) + 4} class="chart-tick chart-tick--y">{money(value)}</text>
              </g>
            ))}

            {timeTicks.map((t) => (
              <text key={t} x={x(t)} y={plotBottom + 16} class="chart-tick chart-tick--x">{label(t)}</text>
            ))}

            <path d={linePath(points)} fill="none" stroke={SERIES.price} stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round" />

            <line x1={PAD.left} x2={PAD.left + innerWidth} y1={depthTop + DEPTH_HEIGHT}
              y2={depthTop + DEPTH_HEIGHT} class="chart-axis" />
            <path d={depthArea} fill={SERIES.floor} opacity="0.16" />
            <path d={linePath(series.map((d) => [x(d.t), depthY(d.inv)]))} fill="none"
              stroke={SERIES.floor} stroke-width="1.5" />
            <text x={PAD.left - 8} y={depthTop + 10} class="chart-tick chart-tick--y">{count(maxInventory)}</text>
            <text x={PAD.left - 8} y={depthTop + DEPTH_HEIGHT + 4} class="chart-tick chart-tick--y">0</text>
            <text x={PAD.left} y={height - 4} class="chart-tick chart-axis-label">UNITS IN POOL</text>

            {active && (
              <g class="chart-crosshair">
                <line x1={x(active.t)} x2={x(active.t)} y1={PAD.top} y2={depthTop + DEPTH_HEIGHT} />
                <circle cx={x(active.t)} cy={y(active.mid)} r="4.5" fill={SERIES.price}
                  stroke="var(--bg2)" stroke-width="2" />
                <circle cx={x(active.t)} cy={depthY(active.inv)} r="3.5" fill={SERIES.floor}
                  stroke="var(--bg2)" stroke-width="2" />
              </g>
            )}
          </svg>
        )}

        {active && (
          <div class="chart-tip" style={`left:${Math.min(Math.max(x(active.t), 90), Math.max(width - 90, 90))}px`}>
            <p class="chart-tip-time">{fullDate(active.t)}</p>
            <dl>
              <div><dt><i style={`background:${SERIES.price}`} />Mid</dt><dd>{money(active.mid, { compact: false })}</dd></div>
              <div><dt><i style={`background:${SERIES.floor}`} />Inventory</dt><dd>{count(active.inv)} units</dd></div>
            </dl>
          </div>
        )}
      </div>
    </>
  );
}
