import { useState } from 'preact/hooks';
import { count, fullDate, money, percent, shortDate, shortTime } from '../../lib/market';
import { axisMoney, bollinger, extent, linePath, nearest, PAD, padded, scale, SERIES, sma, ticks, useMeasure } from './chart';

const PLOT_HEIGHT = 210;
const VOLUME_HEIGHT = 54;
const DAY = 86_400_000;

// Finest first is the order they are stepped down through when a market is too
// young for the grain a range asked for.
const GRAINS = ['hourly', 'fourHour', 'daily'];

const GRAIN_LABEL = {
  hourly: 'One candle per hour',
  fourHour: 'One candle per 4 hours',
  daily: 'One candle per day',
};

// Hues that stay clear of the up/down pair and of the purple the page is built
// from, so an overlay never reads as part of the market.
const INDICATORS = [
  { id: 'ma7', label: 'MA 7', period: 7, colour: '#f5c451' },
  { id: 'ma25', label: 'MA 25', period: 25, colour: '#4fa3f7' },
  { id: 'boll', label: 'BOLL 20', period: 20, colour: '#e07be0', band: true },
];

/**
 * Open/high/low/close of a market's quoted mid, with traded units beneath.
 *
 * The line view answers "where is the price"; this one answers "how did it get
 * there" - a bucket that opened low, spiked and closed flat is one candle and
 * two line segments that hide the spike.
 *
 * Candles are spaced by index rather than by time. A market that goes quiet for
 * six hours would otherwise draw one candle six slots wide, which reads as a
 * long trade rather than a long silence.
 */
export function CandleChart({ rows, grain }) {
  const [ref, width] = useMeasure();
  const [hover, setHover] = useState(null);
  const [shown, setShown] = useState([]);

  const toggle = (id) =>
    setShown((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const available = INDICATORS.filter((i) => rows && rows.length >= i.period);
  const active = available.filter((i) => shown.includes(i.id));
  const closes = (rows ?? []).map((d) => d.c);

  const overlays = active.filter((i) => !i.band)
    .map((i) => ({ ...i, values: sma(closes, i.period) }));
  const bands = active.filter((i) => i.band)
    .map((i) => ({ ...i, ...bollinger(closes, i.period, 2) }));

  const picker = (
    <div class="chart-indicators" role="group" aria-label="Indicators">
      {INDICATORS.map((indicator) => {
        const ready = available.includes(indicator);
        return (
          <button key={indicator.id} type="button" disabled={!ready}
            class={`indicator-tab${ready && shown.includes(indicator.id) ? ' active' : ''}`}
            aria-pressed={ready && shown.includes(indicator.id)}
            title={ready ? undefined : `Needs ${indicator.period} candles in this window`}
            onClick={() => toggle(indicator.id)}>
            <i style={`background:${indicator.colour}`} />{indicator.label}
          </button>
        );
      })}
    </div>
  );

  if (!rows || rows.length === 0) {
    return (
      <>
        {picker}
        <p class="chart-empty">No price samples in this window.</p>
      </>
    );
  }

  const innerWidth = Math.max(240, width - PAD.left - PAD.right);
  const plotBottom = PAD.top + PLOT_HEIGHT;
  // Overlays can sit outside the candles - a band by construction does - so the
  // scale has to know about whatever is switched on.
  const priceDomain = padded(extent([
    ...rows.flatMap((d) => [d.h, d.l]),
    ...overlays.flatMap((o) => o.values),
    ...bands.flatMap((b) => [...b.upper, ...b.lower]),
  ]));

  const step = innerWidth / rows.length;
  const cx = (i) => PAD.left + step * (i + 0.5);
  const y = (v) => scale(v, priceDomain, [plotBottom, PAD.top]);
  // Leave a hairline between neighbours so a dense window still reads as
  // separate candles rather than a solid block.
  const bodyWidth = Math.max(1.5, Math.min(15, step * 0.66));

  const volumeTop = plotBottom + PAD.bottom + 8;
  const maxUnits = Math.max(1, ...rows.map((d) => d.units));
  const height = volumeTop + VOLUME_HEIGHT + 20;

  const priceTicks = ticks(priceDomain, 4);
  const priceLabels = axisMoney(priceTicks);
  const span = rows[rows.length - 1].t - rows[0].t;
  const label = span > 2 * DAY ? shortDate : shortTime;
  // Ticks by index, not by value: the axis is a sequence of buckets.
  const every = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor(innerWidth / 90))));
  const timeTicks = rows.map((row, i) => [i, row]).filter(([i]) => i % every === 0);

  const current = hover != null ? rows[hover] : null;
  const direction = (row) => (row.c > row.o ? 'up' : row.c < row.o ? 'down' : 'flat');
  const colourOf = (row) => SERIES[direction(row)];

  /** A value series as a path, skipping the leading window it has no value for. */
  const overlayPath = (values) => {
    const points = [];
    values.forEach((value, i) => { if (value != null) points.push([cx(i), y(value)]); });
    return points.length > 1 ? linePath(points) : null;
  };

  const bandArea = (band) => {
    const upper = [];
    const lower = [];
    band.upper.forEach((value, i) => {
      if (value == null) return;
      upper.push([cx(i), y(value)]);
      lower.push([cx(i), y(band.lower[i])]);
    });
    if (upper.length < 2) return null;
    return `${linePath(upper)} L${lower.reverse().map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`).join(' L')} Z`;
  };

  const onMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    setHover(nearest(rows.map((_, i) => [cx(i)]), event.clientX - box.left));
  };

  return (
    <>
      {picker}

      <div class="chart-legend">
        <span class="legend-key"><i class="legend-candle legend-candle--up" />Closed up</span>
        <span class="legend-key"><i class="legend-candle legend-candle--down" />Closed down</span>
        <span class="legend-key"><i class="legend-candle legend-candle--flat" />Unchanged</span>
        <span class="legend-key">{GRAIN_LABEL[grain] ?? GRAIN_LABEL.hourly}</span>
      </div>

      <div class="chart-body" ref={ref}>
        {width > 0 && (
          <svg width={width} height={height} class="chart-svg" role="img"
            aria-label={`${GRAIN_LABEL[grain] ?? ''}: open, high, low and close, with traded units`}
            onMouseMove={onMove} onMouseLeave={() => setHover(null)}>

            {priceTicks.map((value, i) => (
              <g key={value}>
                <line x1={PAD.left} x2={PAD.left + innerWidth} y1={y(value)} y2={y(value)} class="chart-grid" />
                <text x={PAD.left - 8} y={y(value) + 4} class="chart-tick chart-tick--y">{priceLabels[i]}</text>
              </g>
            ))}

            {timeTicks.map(([i, row]) => (
              <text key={row.t} x={cx(i)} y={plotBottom + 16} class="chart-tick chart-tick--x">{label(row.t)}</text>
            ))}

            {/* Bands sit under the candles; a line drawn over them would read
                as the market rather than as a channel around it. */}
            {bands.map((band) => {
              const area = bandArea(band);
              return (
                <g key={band.id}>
                  {area && <path d={area} fill={band.colour} opacity="0.1" />}
                  {[band.upper, band.lower].map((edge, i) => {
                    const d = overlayPath(edge);
                    return d && <path key={i} d={d} fill="none" stroke={band.colour}
                      stroke-width="1" opacity="0.6" stroke-dasharray="3 3" />;
                  })}
                </g>
              );
            })}

            {rows.map((row, i) => {
              const colour = colourOf(row);
              const top = y(Math.max(row.o, row.c));
              const bottom = y(Math.min(row.o, row.c));
              return (
                // crispEdges because every mark here is axis-aligned: a 1px
                // wick at a fractional x would otherwise be anti-aliased into
                // two half-lit columns and read as nothing at all. The body
                // takes fill only - stroking it in its own colour grew it half
                // a pixel on each side, which is enough to swallow a short
                // wick whole.
                <g key={row.t} shape-rendering="crispEdges"
                  opacity={hover == null || hover === i ? 1 : 0.55}>
                  <line x1={cx(i)} x2={cx(i)} y1={y(row.h)} y2={y(row.l)}
                    stroke={colour} stroke-width="1" />
                  <rect x={cx(i) - bodyWidth / 2} y={top} width={bodyWidth}
                    height={Math.max(1, bottom - top)} fill={colour} />
                </g>
              );
            })}

            {overlays.map((overlay) => {
              const d = overlayPath(overlay.values);
              return d && <path key={overlay.id} d={d} fill="none" stroke={overlay.colour}
                stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" />;
            })}

            <line x1={PAD.left} x2={PAD.left + innerWidth} y1={volumeTop + VOLUME_HEIGHT}
              y2={volumeTop + VOLUME_HEIGHT} class="chart-axis" />
            {rows.map((row, i) => {
              const barHeight = row.units ? Math.max(1, (row.units / maxUnits) * VOLUME_HEIGHT) : 0;
              return barHeight ? (
                <rect key={row.t} x={cx(i) - bodyWidth / 2} y={volumeTop + VOLUME_HEIGHT - barHeight}
                  width={bodyWidth} height={barHeight} rx={Math.min(2, bodyWidth / 2)}
                  fill={colourOf(row)} opacity={hover === i ? 0.95 : 0.55} />
              ) : null;
            })}
            <text x={PAD.left - 8} y={volumeTop + 10} class="chart-tick chart-tick--y">{count(maxUnits)}</text>
            <text x={PAD.left - 8} y={volumeTop + VOLUME_HEIGHT + 4} class="chart-tick chart-tick--y">0</text>
            <text x={PAD.left} y={height - 4} class="chart-tick chart-axis-label">UNITS TRADED</text>

            {current && (
              <g class="chart-crosshair">
                <line x1={cx(hover)} x2={cx(hover)} y1={PAD.top} y2={volumeTop + VOLUME_HEIGHT} />
              </g>
            )}
          </svg>
        )}

        {current && (
          <div class="chart-tip" style={`left:${Math.min(Math.max(cx(hover), 90), Math.max(width - 90, 90))}px`}>
            <p class="chart-tip-time">{fullDate(current.t)}</p>
            <dl>
              <div><dt>Open</dt><dd>{money(current.o, { compact: false })}</dd></div>
              <div><dt>High</dt><dd>{money(current.h, { compact: false })}</dd></div>
              <div><dt>Low</dt><dd>{money(current.l, { compact: false })}</dd></div>
              <div>
                <dt><i style={`background:${colourOf(current)}`} />Close</dt>
                <dd class={`change${direction(current) === 'flat' ? '' : ` ${direction(current)}`}`}>
                  {money(current.c, { compact: false })}
                  {current.o ? ` (${percent(((current.c - current.o) / current.o) * 100)})` : ''}
                </dd>
              </div>
              <div>
                <dt>Traded</dt>
                <dd>{current.units ? `${count(current.units)} units · ${current.n} trade${current.n === 1 ? '' : 's'}` : 'nothing'}</dd>
              </div>
              {overlays.map((overlay) => overlay.values[hover] != null && (
                <div key={overlay.id}>
                  <dt><i style={`background:${overlay.colour}`} />{overlay.label}</dt>
                  <dd>{money(overlay.values[hover], { compact: false })}</dd>
                </div>
              ))}
              {bands.map((band) => band.upper[hover] != null && (
                <div key={band.id}>
                  <dt><i style={`background:${band.colour}`} />{band.label}</dt>
                  <dd>{money(band.lower[hover])} – {money(band.upper[hover])}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </>
  );
}

/** The candles a range should draw. A young market has only a handful of days
 *  in it, and four daily candles is not a chart, so the requested grain steps
 *  down to a finer one until there is enough to plot. */
export function candlesFor(candles, spec, now) {
  const from = spec.days === Infinity ? -Infinity : now - spec.days * DAY;
  for (let i = GRAINS.indexOf(spec.grain); i >= 0; i -= 1) {
    const grain = GRAINS[i];
    const rows = (candles?.[grain] ?? []).filter((d) => d.t >= from);
    if (rows.length >= 6 || i === 0) return { rows, grain };
  }
  return { rows: [], grain: spec.grain };
}
