import { useEffect, useRef } from 'preact/hooks';
import { ago, count, fullDate, money, percent, poolIsOpen, poolIsReal, sellerLabel, units } from '../../lib/market';
import { ItemIcon } from './ItemIcon';
import { MarketPrimer } from './MarketPrimer';
import { PoolChart } from './PoolChart';
import { Stat } from './Stat';
import { Sparkline } from './Sparkline';

const TRADE_ROWS = 14;

/**
 * The liquidity pools: the half of the economy that always has a price.
 *
 * The auction house is players quoting each other, so an item with nothing
 * listed has no price at all. A pool holds stock and cash and will trade either
 * way at any hour, which makes its mid the closest thing the server has to a
 * spot price - and moving it costs real inventory, so the two panels below are
 * the price and the stock behind it.
 *
 * Which pool is open is the page's business rather than this panel's, so a
 * single pool is linkable the same way a single item is.
 */
export function PoolsPanel({ loading, error, data, now, openId, onOpen }) {
  if (loading) return <p class="market-status">Loading pools…</p>;
  if (error) {
    return (
      <div class="market-status market-status--error">
        <p>No pool data on this site yet.</p>
        <p class="market-status-hint">
          Generate it with <code>npm run market</code>, which reads the
          <code>cah_market</code> tables from the server database.
        </p>
      </div>
    );
  }
  if (!data) return null;

  const pools = (data.pools ?? []).filter(poolIsReal);
  if (pools.length === 0) {
    return <p class="market-status">No pools are trading on the server.</p>;
  }

  const open = pools.filter(poolIsOpen);
  const selected = pools.find((pool) => pool.id === openId) ?? null;

  return (
    <>
      <MarketPrimer />

      <div class="stat-row stat-row--tight">
        <Stat label="Markets" value={`${pools.length}`}
          note={open.length === pools.length ? 'all quoting' : `${pools.length - open.length} not quoting`} />
        <Stat label="Total liquidity" value={money(pools.reduce((sum, p) => sum + p.depth, 0))}
          note="cash plus stock at mid" />
        <Stat label="Traded 24h" value={money(pools.reduce((sum, p) => sum + p.volume24h, 0))}
          note={`${count(pools.reduce((sum, p) => sum + p.trades24h, 0))} trades`} />
        <Stat label="Traded all time" value={money(pools.reduce((sum, p) => sum + p.volumeAll, 0))}
          note={`${count(pools.reduce((sum, p) => sum + p.tradesAll, 0))} trades`} />
      </div>

      <div class="pool-grid">
        {pools.map((pool) => (
          <PoolCard key={pool.id} pool={pool} selected={pool.id === openId}
            onOpen={() => onOpen(pool.id === openId ? null : pool.id)} />
        ))}
      </div>

      {selected && <PoolDetail pool={selected} now={now} onClose={() => onOpen(null)} />}
    </>
  );
}

function PoolCard({ pool, selected, onOpen }) {
  const change = percent(pool.change24h);
  const direction = pool.change24h == null ? '' : pool.change24h > 0 ? ' up' : pool.change24h < 0 ? ' down' : '';

  return (
    <button type="button" class={`pool-card${selected ? ' selected' : ''}`}
      aria-expanded={selected} onClick={onOpen}>
      <span class="pool-card-head">
        <ItemIcon item={{ id: pool.icon, materialName: pool.name }} size={30} />
        <span class="pool-card-titles">
          <span class="pool-ticker">{pool.id}</span>
          <span class="pool-name">{pool.name}</span>
        </span>
        {pool.halted && <span class="market-tag pool-flag">halted</span>}
        {!pool.halted && pool.depth === 0 && <span class="market-tag pool-flag">empty</span>}
      </span>

      <span class="pool-card-price">
        <b>{money(pool.mid, { compact: false })}</b>
        <em class={`change${direction}`}>{change ?? '-'} <span>24h</span></em>
      </span>

      <span class="pool-card-foot">
        <Sparkline points={pool.spark} label={`${pool.name} pool price trend`} />
        <span class="pool-card-depth">
          {units(pool.inventory)} in stock
          <em>{money(pool.depth)} pool</em>
        </span>
      </span>
    </button>
  );
}

function PoolDetail({ pool, now, onClose }) {
  const change = percent(pool.change24h);
  const direction = pool.change24h == null ? '' : pool.change24h > 0 ? ' up' : pool.change24h < 0 ? ' down' : '';
  const panel = useRef(null);

  useEffect(() => {
    panel.current?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [pool.id]);

  return (
    <div class="detail pool-detail" ref={panel}>
      <header class="detail-head">
        <ItemIcon item={{ id: pool.icon, materialName: pool.name }} size={56} />
        <div class="detail-titles">
          <h2 class="detail-name">{pool.name}</h2>
          <p class="detail-sub">
            Trade it in game with <code class="detail-key">/stock {pool.id}</code>
            {pool.halted && <span class="market-tag">halted</span>}
          </p>
        </div>
        <button type="button" class="detail-back pool-close" onClick={onClose}>Close</button>
      </header>

      <div class="stat-row">
        <Stat label="Quoted mid" value={money(pool.mid, { compact: false })}
          note={`updated ${ago(pool.updatedAt, now)}`} />
        <Stat label="24h move" value={change ?? '-'} tone={direction.trim()}
          note={pool.change7d == null ? 'vs. the mid a day ago' : `${percent(pool.change7d)} over 7 days`} />
        <Stat label="In stock" value={units(pool.inventory)}
          note="units the pool can sell" />
        <Stat label="Pool cash" value={money(pool.cash)} note="what it can buy with" />
        <Stat label="Traded 24h" value={money(pool.volume24h)}
          note={`${count(pool.trades24h)} of ${count(pool.tradesAll)} trades`} />
        <Stat label="Net flow" value={`${pool.netUnits > 0 ? '+' : ''}${units(pool.netUnits)}`}
          tone={pool.netUnits > 0 ? 'down' : pool.netUnits < 0 ? 'up' : ''}
          note={pool.netUnits >= 0 ? 'units sold into the pool' : 'units bought out of it'} />
      </div>

      <PoolChart history={pool.history} candles={pool.candles} now={now} />

      <div class="detail-cols">
        <Trades trades={pool.trades} now={now} />
        <section class="mini-table">
          <h4>Pool economics</h4>
          <table>
            <tbody>
              <tr><td>Bought by players</td><td class="num mono">{units(pool.unitsBought)} units</td></tr>
              <tr><td>Sold to the pool</td><td class="num mono">{units(pool.unitsSold)} units</td></tr>
              <tr><td>Spread taken</td><td class="num mono">{money(pool.spreadCut, { compact: false })}</td></tr>
              {/* The pool destroys a slice of what it buys, which is the sink
                  that keeps the item from piling up forever. */}
              <tr><td>Burned on sale</td><td class="num mono">{units(pool.burned)} units</td></tr>
              <tr><td>Liquidity at mid</td><td class="num mono">{money(pool.depth, { compact: false })}</td></tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function Trades({ trades, now }) {
  return (
    <section class="mini-table">
      <h4>Recent trades <em>{trades.length}</em></h4>
      {trades.length === 0 ? (
        <p class="mini-empty">Nobody has traded this pool yet.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Side</th><th class="num">Units</th><th class="num">Unit price</th><th>Trader</th><th class="num">When</th></tr>
          </thead>
          <tbody>
            {trades.slice(0, TRADE_ROWS).map((trade, i) => (
              <tr key={i}>
                <td><span class={`side side--${trade.side.toLowerCase()}`}>{trade.side}</span></td>
                <td class="num">{trade.units}</td>
                <td class="num mono">{money(trade.unitPrice, { compact: false })}</td>
                <td class="seller">{sellerLabel(trade.player)}</td>
                <td class="num" title={fullDate(trade.at)}>{ago(trade.at, now)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {trades.length > TRADE_ROWS && <p class="mini-more">+{trades.length - TRADE_ROWS} more trades</p>}
    </section>
  );
}
