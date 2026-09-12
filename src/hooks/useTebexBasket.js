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
// A Tebex basket freezes the name it was created for - delivery uses that, not
// whatever the site thinks the buyer is called now - so the ident is stored
// with its owner and an age, and is only ever reused for that same player.
// Older builds stored a bare ident string; those parse as junk here and are
// dropped, which is the point: they are exactly the baskets that might predate
// a rename.
const BASKET_MAX_AGE_MS = 12 * 60 * 60 * 1000;
// Which packages in the saved basket were added as subscriptions. Tebex accepts
// the choice on the way in but never reports it back on the basket, so it is
// only knowable by remembering what we sent - and the cart has to be able to
// tell the buyer that a line renews.
const TYPES_KEY = 'chromabit_basket_types';

/**
 * Manages a persistent Tebex basket (the cart). The basket ident is kept in
 * localStorage so the cart survives reloads; stale or completed baskets are
 * silently discarded on load.
 */
export function useTebexBasket(token, username) {
  const [basket, setBasket] = useState(null);
  // Package ids in the current basket that were added as subscriptions.
  const [recurringIds, setRecurringIds] = useState([]);
  // Mirrors `basket` so callers that clear and immediately re-add within one
  // event handler (changing username) don't act on the pre-clear state.
  const basketRef = useRef(null);
  // The create that's already in flight, as { username, promise }. Without this
  // a click that lands before the page-load basket settles starts a second POST
  // for the same name, and two concurrent Xbox Live lookups is a good way to
  // draw a rate-limited "Invalid username" on a gamertag that's perfectly real.
  // Tagged with its name so only a create for the *same* player is joined - one
  // for a name they have left has to be retired, not waited on.
  const creating = useRef(null);
  // Resolves once the saved basket has been looked up. A create that races the
  // restore leaves two baskets and whichever lands last wins, which is how a
  // cart already on disk got dropped.
  const restored = useRef(null);
  // Bumped by clearBasket, so a create started under the previous username
  // can't land afterwards and reinstate it.
  const generation = useRef(0);
  // Why the basket couldn't be made. Kept rather than thrown: the buyer hasn't
  // done anything yet, but this used to fail in silence and only surface two
  // clicks later as an add-to-cart error, which blamed the wrong step.
  const [basketError, setBasketError] = useState(null);

  function store(value) {
    basketRef.current = value;
    setBasket(value);
  }

  useEffect(() => {
    // Runs once, but not until we know who is buying: a saved basket can only
    // be reused if it belongs to them.
    if (!token || restored.current) return;
    const saved = loadSavedBasket();
    if (!saved) {
      restored.current = Promise.resolve();
      return;
    }
    if (!username) return;
    // Saved under a different name, or old enough that the player may have
    // renamed since. Either way the basket would deliver to whoever it was
    // created for, so it is not worth the round trip.
    if (!sameName(saved.username, username) || Date.now() - saved.at > BASKET_MAX_AGE_MS) {
      forgetBasket();
      restored.current = Promise.resolve();
      return;
    }
    const gen = generation.current;
    restored.current = getBasket(token, saved.ident)
      .then((b) => {
        // Retired by a clearBasket while this was in flight. Without this the
        // restore lands afterwards and reinstates the basket that was just
        // thrown away - which is how a basket created under the old name
        // survived the buyer correcting it and kept delivering there.
        if (gen !== generation.current) return;
        // Tebex's own answer, not our stored string, decides who it delivers to.
        if (b && !b.complete && sameName(b.username, username)) {
          store(b);
          setRecurringIds(loadRecurring(saved.ident));
        } else {
          forgetBasket();
        }
      })
      .catch(() => forgetBasket());
  }, [token, username]);

  /**
   * Create the basket for `username`, or join the one already being created.
   *
   * Every path to a new basket goes through here, so there is only ever one
   * name lookup in flight and only one winner writing BASKET_KEY.
   */
  function createOnce(username) {
    const inFlight = creating.current;
    if (inFlight && sameName(inFlight.username, username)) return inFlight.promise;
    const gen = generation.current;
    const pending = (async () => {
      await restored.current;
      // The saved basket may have arrived while we waited, in which case there
      // is nothing to create - but only if it is this player's. One belonging
      // to a name they have since left would deliver there.
      const settled = basketRef.current;
      if (gen === generation.current && settled && sameName(settled.username, username)) return settled;
      const created = await createBasket(token, username);
      // Superseded by a username change mid-flight: hand it back to the caller
      // that asked for it, but don't let it become the current basket.
      if (gen !== generation.current) return created;
      // Tebex echoes the name it resolved, so save that rather than what we
      // sent - it is the name the commands will actually run against.
      saveBasket(created.ident, created.username || username);
      store(created);
      return created;
    })();
    creating.current = { username, promise: pending };
    const release = () => {
      if (creating.current?.promise === pending) creating.current = null;
    };
    // Both arms, so the slot frees on failure too, and so the rejection counts
    // as handled here as well as by whoever awaits `pending`.
    pending.then(release, release);
    return pending;
  }

  /**
   * Drop the current basket if it isn't the one `username` buys with.
   *
   * The last line of defence, checked at the moment of use rather than trusted
   * from load: Tebex bakes the name into the basket at creation and delivers
   * there whatever happens afterwards, so a basket carrying a name the buyer
   * has moved off runs every command against a player that no longer exists.
   * `clearBasket` handles the buyer changing their name here; this catches the
   * paths that never went through it.
   *
   * A create still in flight for the old name is retired too, since it would
   * otherwise land and reinstate exactly what was just dropped. One running for
   * *this* name is left alone - it is the basket we want.
   */
  function dropForeignBasket(username) {
    const current = basketRef.current;
    const inFlight = creating.current;
    const foreignCreate = Boolean(inFlight) && !sameName(inFlight.username, username);
    const foreignBasket = Boolean(current) && !sameName(current.username, username);
    if (!foreignCreate && !foreignBasket) return;
    if (foreignCreate) {
      generation.current += 1;
      creating.current = null;
    }
    forgetBasket();
    store(null);
    setRecurringIds([]);
  }

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
   * failure - a stale saved username must not raise an error before the buyer
   * has done anything. The reason is kept in `basketError` instead, so the page
   * can surface it at the step that actually failed.
   */
  async function ensureBasket(username) {
    if (!token || !username) return null;
    dropForeignBasket(username);
    if (basketRef.current) return basketRef.current;
    try {
      const created = await createOnce(username);
      setBasketError(null);
      return created;
    } catch (err) {
      setBasketError(err);
      return null;
    }
  }

  /**
   * Add a package, creating the basket first if needed. Returns the updated
   * basket.
   *
   * `type` is the buyer's single/subscription choice, and only means anything
   * for packages sold both ways - `resolveType` pins everything else to what
   * the package actually is, so a stale choice can't ride along.
   */
  async function addItem(pkg, username, quantity = 1, type) {
    dropForeignBasket(username);
    let current = basketRef.current;
    if (!current) current = await createOnce(username);
    setBasketError(null);
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
    // Retire any create still in flight before dropping the basket, so one
    // started under the old username can't land and undo this.
    generation.current += 1;
    creating.current = null;
    restored.current = Promise.resolve();
    forgetBasket();
    store(null);
    setRecurringIds([]);
    setBasketError(null);
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
    basket, items, count, coupons, giftcards, recurringIds, basketError,
    ensureBasket, addItem, setQuantity, removeItem, clearBasket,
    addCoupon, dropCoupon, addGiftCard, dropGiftCard,
  };
}

/**
 * Minecraft names are matched case-insensitively, because Tebex answers with
 * Mojang's canonical spelling rather than the one the buyer typed. Bedrock
 * gamertags carry the Geyser dot on both sides by the time they reach here.
 */
function sameName(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}

/** Save the basket ident together with the player it delivers to. */
function saveBasket(ident, username) {
  try {
    localStorage.setItem(BASKET_KEY, JSON.stringify({ ident, username, at: Date.now() }));
  } catch {
    // Private-mode storage failure only costs the cart across reloads.
  }
}

/**
 * Read back the saved basket, or null if there is nothing usable. A bare ident
 * string from an older build fails to parse, which is the intended outcome:
 * those records carry no owner, so there is no way to tell whether they predate
 * a rename.
 */
function loadSavedBasket() {
  try {
    const saved = JSON.parse(localStorage.getItem(BASKET_KEY));
    if (!saved?.ident || !saved?.username) return null;
    return { ident: saved.ident, username: saved.username, at: saved.at || 0 };
  } catch {
    return null;
  }
}

/** Drop the saved basket and the subscription choices that belonged to it. */
function forgetBasket() {
  localStorage.removeItem(BASKET_KEY);
  localStorage.removeItem(TYPES_KEY);
}

/**
 * Read back the subscription choices for `ident`. Stamped with the basket they
 * belong to, so a leftover record from a previous cart can't mislabel a line in
 * this one - a wrong "renews automatically" badge is worse than none.
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
 * Compare two card numbers ignoring the separators a buyer may have typed -
 * Tebex accepts `1234-5678-…` and `12345678…` as the same card, so the
 * duplicate check has to as well.
 */
function sameCard(a, b) {
  return String(a || '').replace(/\D/g, '') === String(b || '').replace(/\D/g, '');
}
