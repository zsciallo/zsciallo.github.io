import { useEffect, useState } from 'preact/hooks';
import { fetchIndex, fetchItem, fetchMeta } from '../lib/market';

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
