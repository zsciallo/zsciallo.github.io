import { useState } from 'preact/hooks';
import { ago, count, fullDate, money, poolIsReal, sellerLabel, units, until } from '../../lib/market';
import { PoolChart } from './PoolChart';
import { Stat } from './Stat';

const ROWS = 14;

/**
 * The futures desk.
 *
 * The server writes contracts against the pool mids, so everything here hangs
 * off the same prices the markets tab charts. The desk is not switched on yet,
 * which is a server-side setting rather than a gap in this page: the document
 * says whether a contract has ever been written, and the tab either reads the
 * book or explains that there is not one to read.
 */
export function FuturesPanel({ loading, error, data, now, pools }) {
  if (loading) return <p class="market-status">Loading futures…</p>;
  if (error) {
    return (
      <div class="market-status market-status--error">
        <p>No futures data on this site yet.</p>
        <p class="market-status-hint">
          Generate it with <code>npm run market</code>, which reads
          <code>cah_position</code> from the server database.
        </p>
      </div>
    );
  }
  if (!data) return null;

  // The desk offers contracts on the exchange pools, so it inherits the pools
  // tab's view of which of those are real markets rather than admin leftovers.
  const tradable = (data.markets ?? []).filter(poolIsReal);

  return data.live
    ? <OpenBook data={data} markets={tradable} pools={pools} now={now} />
    : <NotYet data={data} markets={tradable} pools={pools} now={now} />;
}

/**
 * Price history for one market, picked by ticker.
 *
 * A future settles against the pool mid, so there is no separate price series
 * to draw - this is the pools tab's chart pointed at the underlying, which is
 * what a trader is actually reading when they size a position.
 */
function SettlementChart({ markets, pools, now }) {
  const [picked, setPicked] = useState(null);
  if (markets.length === 0) return null;

  // Nothing is picked until someone picks, and a ticker can leave the list
  // between deploys, so the busiest market is always the fallback.
  const id = markets.some((m) => m.market === picked) ? picked : markets[0].market;
  const pool = pools?.data?.pools?.find((p) => p.id === id);

  return (
    <div class="futures-chart">
      <div class="market-picker" role="group" aria-label="Market">
        {markets.map((market) => (
          <button key={market.market} type="button"
            class={`range-tab${market.market === id ? ' active' : ''}`}
            aria-pressed={market.market === id} onClick={() => setPicked(market.market)}>
            {market.market}
          </button>
        ))}
      </div>

      {pool ? (
        <PoolChart title={`${pool.name} settlement price`} history={pool.history}
          candles={pool.candles} now={now} />
      ) : (
        <p class="market-status">
          {pools?.loading ? 'Loading price history…' : 'No price history for this market yet.'}
        </p>
      )}
    </div>
  );
}

/** Nothing has been traded, so the tab explains the instrument and shows the
 *  prices it will settle against rather than a grid of zeroes. */
function NotYet({ data, markets, pools, now }) {
  return (
    <>
      <div class="futures-intro">
        <p class="futures-badge">NOT LIVE YET</p>
        <h2>The futures desk hasn’t opened.</h2>
        <p>
          Futures let you take a leveraged position on where a market is heading
          without ever holding the item: go long if you think the price climbs,
          short if you think it falls, and settle the difference in cash against
          the pool’s mid price.
        </p>
        <p>
          The desk is switched off on the server, so no contracts exist to
          report. This page is already reading the table it will write to — the
          book below fills in the moment it opens.
        </p>
      </div>

      {data.house && (
        <div class="stat-row stat-row--tight">
          <Stat label="House bankroll" value={money(data.house.bankroll)}
            note="capital backing the desk" />
          <Stat label="Open liability" value={money(data.house.liability)}
            note="owed to open positions" />
          <Stat label="Markets" value={`${markets.length}`}
            note="pools contracts can settle on" />
          <Stat label="Contracts written" value="0"
            note={`checked ${ago(data.fetchedAt, now)}`} />
        </div>
      )}

      <SettlementChart markets={markets} pools={pools} now={now} />
      <Markets markets={markets} live={false} />
    </>
  );
}

function OpenBook({ data, markets, pools, now }) {
  const { totals } = data;
  return (
    <>
      <div class="stat-row stat-row--tight">
        <Stat label="Open positions" value={count(totals.openPositions)}
          note={`${units(totals.openContracts)} contracts`} />
        <Stat label="Open interest" value={money(totals.openInterest)}
          note="notional at the mid" />
        <Stat label="Margin posted" value={money(totals.marginPosted)}
          note={`${count(totals.traders)} traders`} />
        <Stat label="Realised P&L" value={money(totals.realisedPnl)}
          tone={totals.realisedPnl > 0 ? 'up' : totals.realisedPnl < 0 ? 'down' : ''}
          note={`over ${count(totals.settledPositions)} settled`} />
        {data.house && (
          <Stat label="House bankroll" value={money(data.house.bankroll)}
            note={`${money(data.house.liability)} owed out`} />
        )}
        <Stat label="Fees paid" value={money(totals.commission + totals.fundingPaid)}
          note="commission and funding" />
      </div>

      <SettlementChart markets={markets} pools={pools} now={now} />
      <Markets markets={markets} live />

      <div class="detail-cols">
        <Positions rows={data.open} now={now} />
        <Settled rows={data.settled} now={now} />
      </div>
    </>
  );
}

function Markets({ markets, live }) {
  return (
    <section class="mini-table futures-markets">
      <h4>{live ? 'Open interest by market' : 'Markets and their settlement price'} <em>{markets.length}</em></h4>
      {markets.length === 0 ? (
        <p class="mini-empty">No markets are configured on the server.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Market</th>
              <th class="num">Settles at</th>
              {live && <th class="num">Long</th>}
              {live && <th class="num">Short</th>}
              {live && <th class="num">Open interest</th>}
              {live && <th class="num">Margin</th>}
            </tr>
          </thead>
          <tbody>
            {markets.map((market) => (
              <tr key={market.market}>
                <td>
                  <span class="pool-ticker">{market.market}</span>
                  <span class="futures-market-name">{market.name}</span>
                </td>
                <td class="num mono">{money(market.mid, { compact: false })}</td>
                {live && <td class="num">{units(market.longContracts)}</td>}
                {live && <td class="num">{units(market.shortContracts)}</td>}
                {live && <td class="num mono">{money(market.openInterest)}</td>}
                {live && <td class="num mono">{money(market.marginPosted)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Positions({ rows, now }) {
  return (
    <section class="mini-table">
      <h4>Open positions <em>{rows.length}</em></h4>
      {rows.length === 0 ? (
        <p class="mini-empty">Nothing open right now.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Side</th><th>Market</th><th class="num">Size</th><th class="num">Entry</th><th class="num">Ends</th></tr>
          </thead>
          <tbody>
            {rows.slice(0, ROWS).map((row) => (
              <tr key={row.id}>
                <td>
                  <span class={`side side--${row.side.toLowerCase()}`}>{row.side}</span>
                  <em class="futures-lev">{row.leverage}×</em>
                </td>
                <td><span class="pool-ticker">{row.market}</span></td>
                <td class="num">{units(row.contracts)}</td>
                <td class="num mono">{money(row.entryPrice, { compact: false })}</td>
                <td class="num" title={fullDate(row.expiresAt)}>{until(row.expiresAt, now)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > ROWS && <p class="mini-more">+{rows.length - ROWS} more open</p>}
    </section>
  );
}

function Settled({ rows, now }) {
  return (
    <section class="mini-table">
      <h4>Recently settled <em>{rows.length}</em></h4>
      {rows.length === 0 ? (
        <p class="mini-empty">Nothing has settled yet.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Side</th><th>Market</th><th class="num">Settled at</th><th class="num">P&L</th><th>Trader</th></tr>
          </thead>
          <tbody>
            {rows.slice(0, ROWS).map((row) => (
              <tr key={row.id}>
                <td><span class={`side side--${row.side.toLowerCase()}`}>{row.side}</span></td>
                <td><span class="pool-ticker">{row.market}</span></td>
                <td class="num mono" title={row.settledAt ? fullDate(row.settledAt) : undefined}>
                  {money(row.settlePrice, { compact: false })}
                  <em class="market-when">{ago(row.settledAt, now)}</em>
                </td>
                <td class={`num mono change${row.pnl > 0 ? ' up' : row.pnl < 0 ? ' down' : ''}`}>
                  {money(row.pnl)}
                </td>
                <td class="seller">{sellerLabel(row.player)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > ROWS && <p class="mini-more">+{rows.length - ROWS} more settled</p>}
    </section>
  );
}
