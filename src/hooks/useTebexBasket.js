import { useState, useEffect } from 'preact/hooks';
import { createBasket, getBasket, addToBasket, removeFromBasket } from '../lib/tebex';

const BASKET_KEY = 'chromabit_basket';

/**
 * Manages a persistent Tebex basket (the cart). The basket ident is kept in
 * localStorage so the cart survives reloads; stale or completed baskets are
 * silently discarded on load.
 */
export function useTebexBasket(token) {
  const [basket, setBasket] = useState(null);

  useEffect(() => {
    if (!token) return;
    const ident = localStorage.getItem(BASKET_KEY);
    if (!ident) return;
    getBasket(token, ident)
      .then((b) => {
        if (b && !b.complete) setBasket(b);
        else localStorage.removeItem(BASKET_KEY);
      })
      .catch(() => localStorage.removeItem(BASKET_KEY));
  }, [token]);

  /** Add a package, creating the basket first if needed. Returns the updated basket. */
  async function addItem(pkg, username) {
    let current = basket;
    if (!current) {
      current = await createBasket(token, username);
      localStorage.setItem(BASKET_KEY, current.ident);
    }
    const updated = await addToBasket(current.ident, pkg.id);
    setBasket(updated);
    return updated;
  }

  /** Remove a package from the basket. */
  async function removeItem(packageId) {
    if (!basket) return;
    const updated = await removeFromBasket(basket.ident, packageId);
    setBasket(updated);
  }

  /** Forget the basket (e.g. after a completed checkout). */
  function clearBasket() {
    localStorage.removeItem(BASKET_KEY);
    setBasket(null);
  }

  const items = basket?.packages || [];
  const count = items.reduce((n, p) => n + (p.in_basket?.quantity || 0), 0);

  return { basket, items, count, addItem, removeItem, clearBasket };
}
