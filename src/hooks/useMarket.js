import { useEffect, useState } from 'preact/hooks';
import { fetchFutures, fetchIndex, fetchItem, fetchMeta, fetchPools } from '../lib/market';

/** The index and meta documents load once and drive the whole page. */
export function useMarketIndex() {
  const [state, setState] = useState({ loading: true, error: null, items: [], meta: null });

  useEffect(() => {
    let live = true;
    Promise.all([fetchIndex(), fetchMeta()])
      .then(([index, meta]) => {
        if (live) setState({ loading: false, error: null, items: index.items, meta });
      })
      .catch((error) => {
        if (live) setState({ loading: false, error, items: [], meta: null });
      });
    return () => { live = false; };
  }, []);

  return state;
}

// Detail documents are immutable between generations, so a session-lifetime
// cache makes going back and forth between items feel instant.
const cache = new Map();

export function useMarketItem(key) {
  const [state, setState] = useState(() =>
    key && cache.has(key)
      ? { loading: false, error: null, item: cache.get(key) }
      : { loading: Boolean(key), error: null, item: null });

  useEffect(() => {
    if (!key) {
      setState({ loading: false, error: null, item: null });
      return undefined;
    }
    if (cache.has(key)) {
      setState({ loading: false, error: null, item: cache.get(key) });
      return undefined;
    }
    let live = true;
    setState({ loading: true, error: null, item: null });
    fetchItem(key)
      .then((item) => {
        cache.set(key, item);
        if (live) setState({ loading: false, error: null, item });
      })
      .catch((error) => {
        if (live) setState({ loading: false, error, item: null });
      });
    return () => { live = false; };
  }, [key]);

  return state;
}

/**
 * A whole document, fetched the first time its tab is opened.
 *
 * The pools and futures documents together are a couple of hundred kilobytes,
 * and most visitors only ever read the items table, so they are not part of
 * the page's first load. Once fetched the result is kept for the session:
 * these documents only change when the deploy regenerates them.
 */
function useDocument(load, active) {
  const [state, setState] = useState({ loading: false, error: null, data: null });

  useEffect(() => {
    if (!active || state.data || state.error) return undefined;
    let live = true;
    setState({ loading: true, error: null, data: null });
    load()
      .then((data) => live && setState({ loading: false, error: null, data }))
      .catch((error) => live && setState({ loading: false, error, data: null }));
    return () => { live = false; };
  }, [active]);

  return state;
}

export const usePools = (active) => useDocument(fetchPools, active);
export const useFutures = (active) => useDocument(fetchFutures, active);
