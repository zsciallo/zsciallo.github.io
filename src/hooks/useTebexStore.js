import { useState, useEffect } from 'preact/hooks';
import { fetchCategories } from '../lib/tebex';

/**
 * Loads the webstore catalog (categories + packages) from the Tebex
 * Headless API. Returns { loading, error, categories } where categories
 * are sorted by their configured order and empty ones are dropped.
 */
export function useTebexStore(token) {
  const [state, setState] = useState({ loading: true, error: false, categories: [] });

  useEffect(() => {
    if (!token) {
      setState({ loading: false, error: true, categories: [] });
      return;
    }
    let cancelled = false;
    fetchCategories(token)
      .then((data) => {
        if (cancelled) return;
        const categories = data
          .filter((c) => c.packages && c.packages.length > 0)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        categories.forEach((c) => c.packages.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
        setState({ loading: false, error: false, categories });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, error: true, categories: [] });
      });
    return () => { cancelled = true; };
  }, [token]);

  return state;
}
