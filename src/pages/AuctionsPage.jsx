import { useEffect, useMemo, useState } from 'preact/hooks';
import { ago, count, matches, SORTS } from '../lib/market';
import { useFutures, useMarketIndex, useMarketItem, usePools } from '../hooks/useMarket';
import { MarketList } from '../components/market/MarketList';
import { ItemDetail } from '../components/market/ItemDetail';
import { PoolsPanel } from '../components/market/PoolsPanel';
import { FuturesPanel } from '../components/market/FuturesPanel';
import { Footer } from '../components/Footer';
import { NavBar } from '../components/NavBar';

const PAGE_SIZE = 40;

// The three halves of the economy, in the order a reader meets them: what
// players sell each other, what the server will always trade, and what you can
// bet on either doing next.
const TABS = [
  { id: 'items', label: 'ITEMS' },
  { id: 'markets', label: 'MARKETS' },
  { id: 'futures', label: 'FUTURES' },
];

/** Which tab is open, and which item or pool inside it, live in the query
 *  string, so any of them is linkable and the browser's back button does the
 *  obvious thing. An item link implies the tab that shows items. */
function readView() {
  if (typeof window === 'undefined') return { tab: 'items', key: null, pool: null };
  const params = new URLSearchParams(window.location.search);
  const key = params.get('item');
  const named = TABS.find((tab) => tab.id === params.get('tab'));
  return {
    tab: key || !named ? 'items' : named.id,
    key,
    pool: params.get('pool'),
  };
}

const search = ({ tab, key, pool }) => {
  if (key) return `?item=${encodeURIComponent(key)}`;
  if (tab === 'items') return '';
  return pool ? `?tab=${tab}&pool=${encodeURIComponent(pool)}` : `?tab=${tab}`;
};

export function AuctionsPage() {
  const { loading, error, items, meta } = useMarketIndex();
  const [view, setView] = useState(readView);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('traded');
  const [listedOnly, setListedOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const detail = useMarketItem(view.key);
  // Both documents are a good deal larger than the tab that opens them is
  // likely to be read, so neither is fetched until it is. Futures settle
  // against the pool mids and chart them, so that tab needs both.
  const pools = usePools(view.tab === 'markets' || view.tab === 'futures');
  const futures = useFutures(view.tab === 'futures');

  // Relative times are measured against when the data was pulled, not against
  // the newest row in it - otherwise a sale that closed just before the pull
  // reads as 'just now' hours later.
  const now = meta?.fetchedAt ?? Date.now();

  useEffect(() => {
    const onPop = () => setView(readView());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = (next, { top = false } = {}) => {
    history.pushState(null, '', `${window.location.pathname}${search(next)}`);
    setView(next);
    if (top) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const open = (key) => go({ tab: 'items', key, pool: null }, { top: true });
  const back = () => go({ tab: 'items', key: null, pool: null });

  const visible = useMemo(() => {
    const rank = (SORTS.find((s) => s.id === sort) ?? SORTS[0]).key;
    return items
      .filter((item) => (!listedOnly || item.activeListings > 0) && matches(item, query))
      .sort((a, b) => rank(b) - rank(a));
  }, [items, query, sort, listedOnly]);

  // A new search should start at the top of its own results, not 200 rows deep.
  useEffect(() => setLimit(PAGE_SIZE), [query, sort, listedOnly]);

  return (
    <>
      <NavBar current="auctions" />
      <main>
        {/* A slim masthead rather than the site's full hero: this page is read
            for the table, and a screen-height title between the reader and the
            data costs a scroll on every visit. */}
        <header class="market-head">
          <div class="market-container market-head-inner">
            <div class="market-titles">
              <p class="section-eyebrow market-eyebrow">MARKET DATA</p>
              <h1 class="market-h1">
                Auction <span class="accent">House</span>
                <span class="beta-tag">BETA</span>
              </h1>
            </div>
            {meta && (
              <p class="market-meta">
                <b>{count(meta.itemCount)}</b> items ·
                <b> {count(meta.salesRecorded)}</b> sales ·
                <b> {count(meta.activeListings)}</b> listed ·
                {meta.poolCount ? <><b> {meta.poolCount}</b> pools · </> : null}
                updated {ago(meta.fetchedAt ?? meta.generatedAt)} ·
                last trade {ago(meta.generatedAt)}
              </p>
            )}
          </div>
        </header>

        <section class="market-section">
          <div class="market-container">
            <div class="market-tabs" role="tablist" aria-label="Market sections">
              {TABS.map((tab) => (
                <button key={tab.id} type="button" role="tab" aria-selected={view.tab === tab.id}
                  class={`market-tab${view.tab === tab.id ? ' active' : ''}`}
                  onClick={() => go({ tab: tab.id, key: null, pool: null })}>
                  {tab.label}
                  {/* meta knows whether the desk is open without loading the
                      futures document, so the tab can say so up front. */}
                  {tab.id === 'futures' && meta && meta.futuresLive === false && (
                    <span class="market-tab-flag">soon</span>
                  )}
                </button>
              ))}
            </div>

            {view.tab === 'markets' && (
              <PoolsPanel {...pools} now={now} openId={view.pool}
                onOpen={(pool) => go({ tab: 'markets', key: null, pool })} />
            )}
            {view.tab === 'futures' && <FuturesPanel {...futures} pools={pools} now={now} />}

            {view.tab === 'items' && (view.key ? (
              <ItemDetail item={detail.item} now={now} loading={detail.loading}
                error={detail.error} onBack={back} />
            ) : (
              <>
                <div class="market-controls">
                  <label class="market-search">
                    <span class="sr-only">Search items</span>
                    <input type="search" placeholder="Search items, materials, enchantments…"
                      value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
                  </label>

                  <label class="market-sort">
                    <span class="sr-only">Sort by</span>
                    <select value={sort} onChange={(e) => setSort(e.currentTarget.value)}>
                      {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </label>

                  <button type="button" class={`market-toggle${listedOnly ? ' active' : ''}`}
                    aria-pressed={listedOnly} onClick={() => setListedOnly((v) => !v)}>
                    On sale now
                  </button>
                </div>

                {loading && <p class="market-status">Loading market data…</p>}

                {error && (
                  <div class="market-status market-status--error">
                    <p>No market data on this site yet.</p>
                    <p class="market-status-hint">
                      Generate the dataset with <code>npm run market</code>, or point
                      <code>BASE</code> in <code>src/lib/market.js</code> at the Auction Tracker plugin.
                    </p>
                  </div>
                )}

                {!loading && !error && (
                  <>
                    <p class="market-count">
                      {query || listedOnly
                        ? `${count(visible.length)} of ${count(items.length)} items`
                        : `Top ${Math.min(limit, visible.length)} of ${count(items.length)} items`}
                    </p>

                    {visible.length === 0 ? (
                      <p class="market-status">Nothing matches “{query}”.</p>
                    ) : (
                      <>
                        <MarketList items={visible.slice(0, limit)} now={now} onOpen={open} />
                        {visible.length > limit && (
                          <button type="button" class="market-more"
                            onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                            Show {Math.min(PAGE_SIZE, visible.length - limit)} more
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
