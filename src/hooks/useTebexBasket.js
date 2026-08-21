import { useState, useEffect, useRef } from 'preact/hooks';
import {
  createBasket,
  getBasket,
  addToBasket,
  removeFromBasket,
  setBasketQuantity,
  applyCoupon,
  removeCoupon,
  applyGiftCard,
  removeGiftCard,
} from '../lib/tebex';
import { resolveType, isRecurring } from '../lib/packageType';

const BASKET_KEY = 'chromabit_basket';
// Which packages in the saved basket were added as subscriptions. Tebex accepts
// the choice on the way in but never reports it back on the basket, so it is
// only knowable by remembering what we sent — and the cart has to be able to
// tell the buyer that a line renews.
const TYPES_KEY = 'chromabit_basket_types';

/**
 * Manages a persistent Tebex basket (the cart). The basket ident is kept in
 * localStorage so the cart survives reloads; stale or completed baskets are
 * silently discarded on load.
 */
export function useTebexBasket(token) {
  const [basket, setBasket] = useState(null);
  // Package ids in the current basket that were added as subscriptions.
  const [recurringIds, setRecurringIds] = useState([]);
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
        if (b && !b.complete) {
          store(b);
          setRecurringIds(loadRecurring(ident));
        } else {
          forgetBasket();
        }
      })
      .catch(() => forgetBasket());
  }, [token]);

  /** Record that `packageId` was added as a subscription (or no longer is). */
  function rememberRecurring(ident, packageId, recurring) {
    setRecurringIds((prev) => {
      const next = recurring
        ? [...new Set([...prev, packageId])]
        : prev.filter((id) => id !== packageId);
      saveRecurring(ident, next);
      return next;
    });
  }

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

  /**
   * Add a package, creating the basket first if needed. Returns the updated
   * basket.
   *
   * `type` is the buyer's single/subscription choice, and only means anything
   * for packages sold both ways — `resolveType` pins everything else to what
   * the package actually is, so a stale choice can't ride along.
   */
  async function addItem(pkg, username, quantity = 1, type) {
    let current = basketRef.current;
    if (!current) {
      current = await createBasket(token, username);
      localStorage.setItem(BASKET_KEY, current.ident);
      basketRef.current = current;
    }
    const resolved = resolveType(pkg, type);
    const updated = await addToBasket(current.ident, pkg.id, quantity, resolved);
    store(updated);
    rememberRecurring(current.ident, pkg.id, isRecurring(resolved));
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
    rememberRecurring(basket.ident, packageId, false);
  }

  /** Forget the basket (e.g. after a completed checkout, or a username change). */
  function clearBasket() {
    forgetBasket();
    store(null);
    setRecurringIds([]);
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

  /**
   * Redeem a gift card. Deliberately missing the one-at-a-time guard `addCoupon`
   * has: cards are stored value, so a buyer with two half-used ones should be
   * able to put both towards the same order.
   */
  async function addGiftCard(cardNumber) {
    const current = basketRef.current;
    if (!current) throw new Error('Add something to your cart first.');
    if (current.giftcards?.some((g) => sameCard(g.card_number, cardNumber))) {
      throw new Error('That gift card is already applied.');
    }
    await applyGiftCard(token, current.ident, cardNumber);
    store(await getBasket(token, current.ident));
  }

  /** Take a gift card back off the basket and re-fetch for the restored total. */
  async function dropGiftCard(cardNumber) {
    const current = basketRef.current;
    if (!current) return;
    await removeGiftCard(token, current.ident, cardNumber);
    store(await getBasket(token, current.ident));
  }

  const items = basket?.packages || [];
  const count = items.reduce((n, p) => n + (p.in_basket?.quantity || 0), 0);
  const coupons = basket?.coupons || [];
  const giftcards = basket?.giftcards || [];

  return {
    basket, items, count, coupons, giftcards, recurringIds,
    ensureBasket, addItem, setQuantity, removeItem, clearBasket,
    addCoupon, dropCoupon, addGiftCard, dropGiftCard,
  };
}

/** Drop the saved basket and the subscription choices that belonged to it. */
function forgetBasket() {
  localStorage.removeItem(BASKET_KEY);
  localStorage.removeItem(TYPES_KEY);
}

/**
 * Read back the subscription choices for `ident`. Stamped with the basket they
 * belong to, so a leftover record from a previous cart can't mislabel a line in
 * this one — a wrong "renews automatically" badge is worse than none.
 */
function loadRecurring(ident) {
  try {
    const saved = JSON.parse(localStorage.getItem(TYPES_KEY));
    return saved?.ident === ident && Array.isArray(saved.ids) ? saved.ids : [];
  } catch {
    return [];
  }
}

function saveRecurring(ident, ids) {
  try {
    localStorage.setItem(TYPES_KEY, JSON.stringify({ ident, ids }));
  } catch {
    // Private-mode storage failure only costs the cart badge, not the sale.
  }
}

/**
 * Compare two card numbers ignoring the separators a buyer may have typed —
 * Tebex accepts `1234-5678-…` and `12345678…` as the same card, so the
 * duplicate check has to as well.
 */
function sameCard(a, b) {
  return String(a || '').replace(/\D/g, '') === String(b || '').replace(/\D/g, '');
}
