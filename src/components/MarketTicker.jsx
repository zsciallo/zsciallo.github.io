import { useEffect, useState } from 'preact/hooks';
import { ago, fetchTicker, money } from '../lib/market';
import { ItemIcon } from './market/ItemIcon';

/**
 * The day's biggest moves, as a two-row tape.
 *
 * Gainers run one way over losers running the other, the way a ticker board on
 * the side of an exchange does. It reads as decoration at a glance and as data
 * if you stop on it, which is the point: the homepage has to say "this server
 * has a market" before it says anything else.
 *
 * Reads ticker.json rather than the market index. The index is a megabyte and
 * this needs twenty rows of it.
 */
export function MarketTicker() {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let live = true;
    fetchTicker()
      .then((data) => live && setState({ loading: false, error: null, data }))
      .catch((error) => live && setState({ loading: false, error, data: null }));
    return () => { live = false; };
  }, []);

  // A homepage that shows a broken tape is worse than one that shows none, and
  // the market documents are generated at deploy time, so this is the state a
  // fresh clone is in before `npm run market` has ever run.
  if (state.error) return null;

  const gainers = state.data?.gainers ?? [];
  const losers = state.data?.losers ?? [];
  if (!state.loading && gainers.length === 0 && losers.length === 0) return null;

  return (
    <section class="tape" aria-label="Today's biggest market moves">
      <div class="tape-head">
        <h2 class="tape-title">TODAY’S TOP MOVERS</h2>
        {/* Both rows measure today, by the only method their side of the
            economy supports: a pool quotes continuously, so its move is 24
            hours of quotes; an item trades a few times a day, so its move is
            today against the week behind it. */}
        {state.data && (
          <span class="tape-when">updated {ago(state.data.fetchedAt)}</span>
        )}
      </div>
      <TapeRow tone="up" label="GAINERS" entries={gainers} loading={state.loading} />
      <TapeRow tone="down" label="LOSERS" entries={losers} loading={state.loading} />
    </section>
  );
}

function TapeRow({ tone, label, entries, loading }) {
  return (
    <div class={`tape-row tape-row--${tone}`}>
      <span class="tape-label">{label}</span>
      <div class="tape-viewport">
        {loading ? (
          <span class="tape-idle">reading the market…</span>
        ) : (
          <div class="tape-track">
            {/* Two identical runs, so translating the track by half its width
                lands exactly where it started and the loop has no seam. */}
            <div class="tape-run">
              {entries.map((entry) => <Cell key={entry.key} entry={entry} tone={tone} />)}
            </div>
            <div class="tape-run" aria-hidden="true">
              {entries.map((entry) => <Cell key={`${entry.key}-echo`} entry={entry} tone={tone} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The arrow carries the direction, so the number is a magnitude. Signing it
 *  as well would give a loser "-+70%", which helps nobody. */
const magnitude = (change) => `${Math.round(Math.abs(change) * 10) / 10}%`;

/** Every entry links to the market it came from, so the tape is a way in. */
const href = (entry) =>
  entry.kind === 'market'
    ? `/auctions/?tab=markets&pool=${encodeURIComponent(entry.key)}`
    : `/auctions/?item=${encodeURIComponent(entry.key)}`;

function Cell({ entry, tone }) {
  return (
    <a class="tape-cell" href={href(entry)}>
      <ItemIcon item={{ id: entry.id, materialName: entry.label }} size={18} />
      <span class="tape-name">{entry.label}</span>
      <span class="tape-price">{money(entry.price)}</span>
      <span class="tape-change">
        <span aria-hidden="true">{tone === 'up' ? '▲' : '▼'}</span>
        {magnitude(entry.change)}
      </span>
    </a>
  );
}
