import { useState, useEffect, useRef } from 'preact/hooks';
import { fetchCategories } from '../lib/tebex';

const EMPTY = { loading: false, error: true, categories: [], packagesById: {}, salesById: {} };

/**
 * Loads the webstore catalog (categories + packages) from the Tebex
 * Headless API. Returns { loading, error, categories, packagesById, salesById }
 * where categories are sorted by their configured order and empty ones are
 * dropped. packagesById is a flat lookup, since basket entries carry only a
 * package id.
 *
 * Pass `basketIdent` once one exists and the catalog re-fetches with that
 * player's pricing, so rank upgrade discounts show up. The re-fetch keeps the
 * current catalog on screen rather than flipping back to the loading state -
 * only the very first load has nothing to show.
 *
 * salesById is the discount each package carries on the *anonymous* catalog,
 * which is fetched once and kept. Those are the storewide sales; the priced
 * catalog reports sales and upgrade credits through the same field and can't
 * tell them apart on its own (see lib/deal).
 */
export function useTebexStore(token, basketIdent) {
  const [state, setState] = useState({ ...EMPTY, loading: true, error: false });
  const anonymous = useRef(null);

  useEffect(() => {
    if (!token) {
      setState(EMPTY);
      return;
    }
    let cancelled = false;
    // Without a basket the priced catalog *is* the anonymous one, so the first
    // load costs one request, and a basket arriving later re-prices without
    // asking for the anonymous prices again.
    anonymous.current ??= fetchCategories(token);
    const priced = basketIdent ? fetchCategories(token, basketIdent) : anonymous.current;
    Promise.all([anonymous.current, priced])
      .then(([plain, data]) => {
        if (cancelled) return;
        const categories = data
          .filter((c) => c.packages && c.packages.length > 0)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        categories.forEach((c) => c.packages.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
        const packagesById = {};
        categories.forEach((c) => c.packages.forEach((p) => { packagesById[p.id] = p; }));
        const salesById = {};
        plain.forEach((c) => (c.packages || []).forEach((p) => { if (p.discount > 0) salesById[p.id] = p.discount; }));
        setState({ loading: false, error: false, categories, packagesById, salesById });
      })
      .catch(() => {
        // Don't keep a failed anonymous fetch around for the next attempt.
        anonymous.current = null;
        // A failed re-price shouldn't wipe a catalog that's already rendering;
        // the buyer keeps the anonymous prices instead of an error page.
        if (!cancelled) {
          setState((prev) => (prev.categories.length ? prev : EMPTY));
        }
      });
    return () => { cancelled = true; };
  }, [token, basketIdent]);

  return state;
}
