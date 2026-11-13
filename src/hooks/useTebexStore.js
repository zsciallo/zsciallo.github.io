import { useState, useEffect, useRef } from 'preact/hooks';
import { fetchCategories } from '../lib/tebex';
import { fetchOffers } from '../lib/storeApi';
import { applyRules } from '../lib/freeKeys';
import { buildModes } from '../lib/storeModes';

const NO_MODES = { modes: [], shared: [] };
const EMPTY = { loading: false, error: true, categories: [], modes: NO_MODES, packagesById: {}, salesById: {}, offers: null };

/**
 * Loads the webstore catalog (categories + packages) from the Tebex
 * Headless API. Returns { loading, error, categories, modes, packagesById, salesById, offers }
 * where categories are sorted by their configured order and empty ones are
 * dropped. modes is lib/storeModes buildModes() of the raw list: the top-level
 * Tebex categories (PVP, SMP) the store page filters by, empty for a flat list.
 * packagesById is a flat lookup, since basket entries carry only a package id.
 *
 * Pass `basketIdent` once one exists and the catalog re-fetches with that
 * player's pricing, so rank upgrade discounts show up. The re-fetch keeps the
 * current catalog on screen rather than flipping back to the loading state -
 * only the very first load has nothing to show.
 *
 * salesById is what the store backend says is on sale (api.chromabit.us
 * /store/offers). The priced catalog reports sales and upgrade credits through
 * the same `discount` field and can't tell them apart on its own (see lib/deal);
 * the backend reads the anonymous catalog, which only ever carries sales. With
 * the API down there are simply no sale badges - prices stay right regardless,
 * they come from Tebex.
 */
export function useTebexStore(token, basketIdent) {
  const [state, setState] = useState({ ...EMPTY, loading: true, error: false });
  const offers = useRef(null);

  useEffect(() => {
    if (!token) {
      setState(EMPTY);
      return;
    }
    let cancelled = false;
    offers.current ??= fetchOffers();
    Promise.all([fetchCategories(token, basketIdent), offers.current])
      .then(([data, offer]) => {
        if (cancelled) return;
        // Read before the empty-category filter: the mode parents (PVP, SMP)
        // hold no packages of their own and would be dropped by it.
        const modes = buildModes(data);
        const categories = data
          .filter((c) => c.packages && c.packages.length > 0)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        categories.forEach((c) => c.packages.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
        const packagesById = {};
        categories.forEach((c) => c.packages.forEach((p) => { packagesById[p.id] = p; }));
        const salesById = {};
        Object.entries(offer?.sales || {}).forEach(([id, sale]) => { salesById[Number(id)] = sale.amount; });
        if (offer?.freeKeys) applyRules(offer.freeKeys);
        setState({ loading: false, error: false, categories, modes, packagesById, salesById, offers: offer });
      })
      .catch(() => {
        // A failed re-price shouldn't wipe a catalog that's already rendering;
        // the buyer keeps the previous prices instead of an error page.
        if (!cancelled) {
          setState((prev) => (prev.categories.length ? prev : EMPTY));
        }
      });
    return () => { cancelled = true; };
  }, [token, basketIdent]);

  return state;
}
