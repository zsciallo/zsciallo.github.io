import { useEffect, useMemo, useState } from 'preact/hooks';
import { ago, count, fullDate, money, sellerLabel, sellerMatches, until } from '../../lib/market';
import { ItemIcon } from './ItemIcon';

const PAGE_SIZE = 40;

const STATUSES = [
  { id: 'active', label: 'For sale now' },
  { id: 'sold', label: 'Sold' },
];

/**
 * The marketplace view: every live listing on the auction house, newest first,
 * or the last week of sales, filterable by seller.
 *
 * `player` is the seller filter and lives in the URL (?player=) so a player can
 * link straight to their own listings. Names come from the API box's
 * names.json via sellerLabel; a seller still unresolved there shows as the
 * usual short handle, and the filter also matches on the raw uuid so those
 * rows are still findable.
 */
export function RecentListings({ loading, error, data, now, player, onPlayer, onOpen }) {
  const [status, setStatus] = useState('active');
  const [draft, setDraft] = useState(player || '');
  const [limit, setLimit] = useState(PAGE_SIZE);

  // The URL is the source of truth for the filter (back button, shared links);
  // the box only mirrors it until the next keystroke.
  useEffect(() => setDraft(player || ''), [player]);

  const rows = useMemo(() => {
    const source = (status === 'sold' ? data?.sold : data?.active) || [];
    return player ? source.filter((row) => sellerMatches(row.seller, player)) : source;
  }, [data, status, player]);

  const sellers = useMemo(() => new Set(rows.map((r) => r.seller)).size, [rows]);

  useEffect(() => setLimit(PAGE_SIZE), [status, player]);

  const submit = (e) => {
    e.preventDefault();
    onPlayer(draft.trim());
  };

  return (
    <>
      <div class="market-controls">
        <form class="market-search" onSubmit={submit}>
          <span class="sr-only">Search by seller</span>
          <input type="search" placeholder="Seller name…" value={draft}
            onInput={(e) => setDraft(e.currentTarget.value)}
            onChange={(e) => onPlayer(e.currentTarget.value.trim())} />
        </form>

        {STATUSES.map((s) => (
          <button key={s.id} type="button" class={`market-toggle${status === s.id ? ' active' : ''}`}
            aria-pressed={status === s.id} onClick={() => setStatus(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {loading && <p class="market-status">Loading listings…</p>}
      {error && <p class="market-status market-status--error">Listings aren't available right now.</p>}

      {data && (
        <>
          <p class="market-count">
            {count(rows.length)} {status === 'sold' ? `sold in the last ${data.windowDays ?? 7} days` : 'for sale'}
            {player ? <> by <b>{player}</b></> : <> · {count(sellers)} sellers</>}
            {' · '}updated {ago(data.fetchedAt ?? data.generatedAt, now)}
          </p>

          {rows.length === 0 ? (
            <p class="market-status">
              {player
                ? `No ${status === 'sold' ? 'sales' : 'listings'} by “${player}”${status === 'sold' ? ' in the last week' : ''}.`
                : 'Nothing here yet.'}
            </p>
          ) : (
            <>
              <section class="mini-table listings-table">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th class="num">Qty</th>
                      <th class="num">Unit price</th>
                      <th class="num">Total</th>
                      <th>Seller</th>
                      <th class="num">{status === 'sold' ? 'Sold' : 'Listed'}</th>
                      {status !== 'sold' && <th class="num">Ends</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, limit).map((row) => (
                      <tr key={row.listingId}>
                        <td class="listing-item">
                          <button type="button" class="listing-open" onClick={() => onOpen(row.key)}>
                            <ItemIcon item={{ id: row.material, name: row.name, materialName: row.materialName, custom: row.custom }} size={20} />
                            <span>{row.name}</span>
                            {row.variant ? <em class="market-tag">{row.variant}</em> : null}
                          </button>
                        </td>
                        <td class="num">{row.count}</td>
                        <td class="num mono">{money(row.unitPrice, { compact: false })}</td>
                        <td class="num mono">{money(row.totalPrice)}</td>
                        <td class="seller">
                          <button type="button" class="listing-seller" title={row.seller}
                            onClick={() => onPlayer(sellerLabel(row.seller))}>
                            {sellerLabel(row.seller)}
                          </button>
                        </td>
                        <td class="num" title={fullDate(status === 'sold' ? row.at : row.listedAt)}>
                          {ago(status === 'sold' ? row.at : row.listedAt, now)}
                        </td>
                        {status !== 'sold' && <td class="num">{until(row.expiresAt, now)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              {rows.length > limit && (
                <button type="button" class="market-more" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                  Show {Math.min(PAGE_SIZE, rows.length - limit)} more
                </button>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
