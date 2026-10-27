import { useEffect, useMemo, useState } from 'preact/hooks';
import { ago, count, fullDate, money, sellerLabel, sellerMatches, until } from '../../lib/market';
import { ItemIcon } from './ItemIcon';

const PAGE_SIZE = 40;

// Phones get a list of collapsed entries instead of the card grid; this matches
// the max-width: 560px block in market.css.
const COMPACT_QUERY = '(max-width: 560px)';

function useCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY);
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return compact;
}

/**
 * One listing as a marketplace card: the item tile and price up top, the
 * seller and timing underneath. On a phone the card collapses to a single row
 * (icon, name, price) and the head toggles the details instead of opening the
 * item, which moves to its own button inside the expanded part.
 */
function ListingCard({ row, sold, now, compact, onPlayer, onOpen }) {
  const [expanded, setExpanded] = useState(false);
  const at = sold ? row.at : row.listedAt;
  const item = { id: row.material, name: row.name, materialName: row.materialName, custom: row.custom };
  const showMeta = !compact || expanded;

  return (
    <li class={`listing-card${compact ? ' listing-card--compact' : ''}${expanded ? ' open' : ''}`}>
      <button type="button" class="listing-head"
        aria-expanded={compact ? expanded : undefined}
        onClick={() => (compact ? setExpanded((v) => !v) : onOpen(row.key))}>
        <span class="listing-thumb">
          <ItemIcon item={item} size={compact ? 32 : 56} />
          {row.count > 1 && <span class="listing-qty">×{row.count}</span>}
        </span>
        <span class="listing-body">
          <span class="listing-price">{money(row.totalPrice)}</span>
          <span class="listing-name">{row.name}</span>
          {row.variant ? <em class="market-tag">{row.variant}</em> : null}
        </span>
        {compact && <span class="listing-chevron" aria-hidden="true" />}
      </button>

      {showMeta && (
        <div class="listing-meta">
          <button type="button" class="listing-seller" title={row.seller}
            onClick={() => onPlayer(sellerLabel(row.seller))}>
            {sellerLabel(row.seller)}
          </button>
          <dl class="listing-facts">
            {row.count > 1 && (
              <div><dt>Each</dt><dd>{money(row.unitPrice, { compact: false })}</dd></div>
            )}
            <div>
              <dt>{sold ? 'Sold' : 'Listed'}</dt>
              <dd title={fullDate(at)}>{ago(at, now)}</dd>
            </div>
            {!sold && <div><dt>Ends in</dt><dd>{until(row.expiresAt, now)}</dd></div>}
          </dl>
          {compact && (
            <button type="button" class="listing-view" onClick={() => onOpen(row.key)}>
              View item prices
            </button>
          )}
        </div>
      )}
    </li>
  );
}

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
  const compact = useCompact();

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
              <ul class="listing-grid">
                {rows.slice(0, limit).map((row) => (
                  <ListingCard key={row.listingId} row={row} sold={status === 'sold'} now={now}
                    compact={compact} onPlayer={onPlayer} onOpen={onOpen} />
                ))}
              </ul>
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
