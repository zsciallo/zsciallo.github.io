import { useState, useEffect } from 'preact/hooks';
import { fetchCategories } from '../lib/tebex';

/**
 * Loads the webstore catalog (categories + packages) from the Tebex
 * Headless API. Returns { loading, error, categories, packagesById } where
 * categories are sorted by their configured order and empty ones are dropped.
 * packagesById is a flat lookup, since basket entries carry only a package id.
 *
 * Pass `basketIdent` once one exists and the catalog re-fetches with that
 * player's pricing, so rank upgrade discounts show up. The re-fetch keeps the
 * current catalog on screen rather than flipping back to the loading state —
 * only the very first load has nothing to show.
 */
export function useTebexStore(token, basketIdent) {
  const [state, setState] = useState({ loading: true, error: false, categories: [], packagesById: {} });

  useEffect(() => {
    if (!token) {
      setState({ loading: false, error: true, categories: [], packagesById: {} });
      return;
    }
    let cancelled = false;
    fetchCategories(token, basketIdent)
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
        // A failed re-price shouldn't wipe a catalog that's already rendering;
        // the buyer keeps the anonymous prices instead of an error page.
        if (!cancelled) {
          setState((prev) => (prev.categories.length
            ? prev
            : { loading: false, error: true, categories: [], packagesById: {} }));
        }
      });
    return () => { cancelled = true; };
  }, [token, basketIdent]);

  return state;
}
