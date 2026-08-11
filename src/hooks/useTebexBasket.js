import { useState, useEffect, useRef } from 'preact/hooks';
import {
  createBasket,
  getBasket,
  addToBasket,
  removeFromBasket,
  setBasketQuantity,
  applyCoupon,
  removeCoupon,
} from '../lib/tebex';

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

  /**
   * Get the current basket, creating an empty one for `username` if needed.
   *
   * Required for pricing, not just convenience: upgrade discounts only appear
   * on a basket-scoped catalog request, so a player with no cart yet would be
   * quoted full price for a rank they should get credit on. Returns null on
   * failure — a stale saved username must not raise an error before the buyer
   * has done anything.
   */
  async function ensureBasket(username) {
    if (basketRef.current) return basketRef.current;
    if (!token || !username) return null;
    try {
      const created = await createBasket(token, username);
      localStorage.setItem(BASKET_KEY, created.ident);
      store(created);
      return created;
    } catch {
      return null;
    }
  }

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

  /**
   * Apply a coupon code. Tebex answers with a bare success flag rather than the
   * updated basket, so re-fetch to pick up the new prices. Throws with Tebex's
   * own message ("The selected coupon code is invalid.") on a bad code.
   */
  async function addCoupon(code) {
    const current = basketRef.current;
    if (!current) throw new Error('Add something to your cart first.');
    // Promo codes are single-use per player and don't stack, so refuse a second
    // one here rather than relying on the drawer to hide the input.
    if (current.coupons?.length) {
      throw new Error('Only one promo code can be used per order.');
    }
    await applyCoupon(token, current.ident, code);
    store(await getBasket(token, current.ident));
  }

  /** Drop an applied coupon and re-fetch for the restored pricing. */
  async function dropCoupon(code) {
    const current = basketRef.current;
    if (!current) return;
    await removeCoupon(token, current.ident, code);
    store(await getBasket(token, current.ident));
  }

  const items = basket?.packages || [];
  const count = items.reduce((n, p) => n + (p.in_basket?.quantity || 0), 0);
  const coupons = basket?.coupons || [];

  return {
    basket, items, count, coupons,
    ensureBasket, addItem, setQuantity, removeItem, clearBasket, addCoupon, dropCoupon,
  };
}
