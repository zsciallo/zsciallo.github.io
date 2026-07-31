import { useState, useEffect, useRef } from 'preact/hooks';
import { createBasket, getBasket, addToBasket, removeFromBasket, setBasketQuantity } from '../lib/tebex';

const BASKET_KEY = 'chromabit_basket';

/**
 * Manages a persistent Tebex basket (the cart). The basket ident is kept in
 * localStorage so the cart survives reloads; stale or completed baskets are
 * silently discarded on load.
 */
export function useTebexBasket(token) {
  const [basket, setBasket] = useState(null);
  // Mirrors `basket` so callers that clear and immediately re-add within one
  // event handler (changing username) don't act on the pre-clear state.
  const basketRef = useRef(null);

  function store(value) {
    basketRef.current = value;
    setBasket(value);
  }

  useEffect(() => {
    if (!token) return;
    const ident = localStorage.getItem(BASKET_KEY);
    if (!ident) return;
    getBasket(token, ident)
      .then((b) => {
        if (b && !b.complete) store(b);
        else localStorage.removeItem(BASKET_KEY);
      })
      .catch(() => localStorage.removeItem(BASKET_KEY));
  }, [token]);

  /** Add a package, creating the basket first if needed. Returns the updated basket. */
  async function addItem(pkg, username, quantity = 1) {
    let current = basketRef.current;
    if (!current) {
      current = await createBasket(token, username);
      localStorage.setItem(BASKET_KEY, current.ident);
      basketRef.current = current;
    }
    const updated = await addToBasket(current.ident, pkg.id, quantity);
    store(updated);
    return updated;
  }

  /** Set the exact quantity of a package already in the basket. */
  async function setQuantity(packageId, quantity) {
    if (!basket) return;
    const updated = await setBasketQuantity(basket.ident, packageId, quantity);
    store(updated);
  }

  /** Remove a package from the basket. */
  async function removeItem(packageId) {
    if (!basket) return;
    const updated = await removeFromBasket(basket.ident, packageId);
    store(updated);
  }

  /** Forget the basket (e.g. after a completed checkout, or a username change). */
  function clearBasket() {
    localStorage.removeItem(BASKET_KEY);
    store(null);
  }

  const items = basket?.packages || [];
  const count = items.reduce((n, p) => n + (p.in_basket?.quantity || 0), 0);

  return { basket, items, count, addItem, setQuantity, removeItem, clearBasket };
}
