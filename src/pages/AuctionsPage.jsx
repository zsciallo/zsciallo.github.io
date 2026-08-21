import { useEffect, useMemo, useState } from 'preact/hooks';
import { ago, count, matches, SORTS } from '../lib/market';
import { useMarketIndex, useMarketItem } from '../hooks/useMarket';
import { MarketList } from '../components/market/MarketList';
import { ItemDetail } from '../components/market/ItemDetail';
import { Footer } from '../components/Footer';
import { NavBar } from '../components/NavBar';

const PAGE_SIZE = 40;

/** Which item is open lives in the query string, so a market page is linkable
 *  and the browser's back button does the obvious thing. */
function readKey() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('item');
}

export function AuctionsPage() {
  const { loading, error, items, meta } = useMarketIndex();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('traded');
  const [listedOnly, setListedOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [openKey, setOpenKey] = useState(readKey);

  const detail = useMarketItem(openKey);
  // Relative times are measured against when the data was pulled, not against
  // the newest row in it - otherwise a sale that closed just before the pull
  // reads as 'just now' hours later.
  const now = meta?.fetchedAt ?? Date.now();

  useEffect(() => {
    const onPop = () => setOpenKey(readKey());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const open = (key) => {
    history.pushState(null, '', `?item=${encodeURIComponent(key)}`);
    setOpenKey(key);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const back = () => {
    history.pushState(null, '', window.location.pathname);
    setOpenKey(null);
  };

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
                updated {ago(meta.fetchedAt ?? meta.generatedAt)} ·
                last trade {ago(meta.generatedAt)}
              </p>
            )}
          </div>
        </header>

        <section class="market-section">
          <div class="market-container">
            {openKey ? (
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
                      Generate the stand-in dataset with <code>npm run market</code>, or point
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
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
