import { useState, useEffect } from 'preact/hooks';
import { fetchCategories } from '../lib/tebex';

/**
 * Loads the webstore catalog (categories + packages) from the Tebex
 * Headless API. Returns { loading, error, categories, packagesById } where
 * categories are sorted by their configured order and empty ones are dropped.
 * packagesById is a flat lookup, since basket entries carry only a package id.
 */
export function useTebexStore(token) {
  const [state, setState] = useState({ loading: true, error: false, categories: [], packagesById: {} });

  useEffect(() => {
    if (!token) {
      setState({ loading: false, error: true, categories: [], packagesById: {} });
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
        const packagesById = {};
        categories.forEach((c) => c.packages.forEach((p) => { packagesById[p.id] = p; }));
        setState({ loading: false, error: false, categories, packagesById });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, error: true, categories: [], packagesById: {} });
      });
    return () => { cancelled = true; };
  }, [token]);

  return state;
}
