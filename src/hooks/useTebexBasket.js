import { useState, useEffect, useRef } from 'preact/hooks';
import {
  createBasket,
  getBasket,
  addToBasket,
  removeFromBasket,
  setBasketQuantity,
  MAX_QUANTITY,
  applyCoupon,
  removeCoupon,
  applyGiftCard,
  removeGiftCard,
} from '../lib/tebex';
import { resolveType, isRecurring } from '../lib/packageType';
import { FREE_KEY, isFreeKeyCode, freeKeysFor } from '../lib/freeKeys';

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
// How many of the basket's Chroma Keys are the promo's free ones. Tebex sees
// one Chroma Key line either way, so like the subscription flags this is only
// knowable by remembering what we added - stamped with the basket ident.
const FREE_KEYS_KEY = 'chromabit_basket_freekeys';

/**
 * Manages a persistent Tebex basket (the cart). The basket ident is kept in
 * localStorage so the cart survives reloads; stale or completed baskets are
 * silently discarded on load.
 */
export function useTebexBasket(token, username, rate = 1) {
  const [basket, setBasket] = useState(null);
  // Local currency per US dollar (see usdRate). The free-key minimums are in
  // USD, so spend is divided by this before it is counted. A ref so a reconcile
  // already queued uses the rate the catalog has since reported.
  const rateRef = useRef(rate);
  rateRef.current = rate;
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
  // Basket changes run one at a time. Two at once (a quick second click while
  // the first is still posting) would each reconcile the free keys from a
  // basket the other is about to change, and lose track of which are free.
  const queue = useRef(Promise.resolve());
  function serial(task) {
    const run = queue.current.then(task, task);
    queue.current = run.catch(() => {});
    return run;
  }

  function store(value) {
    basketRef.current = value;
    setBasket(value);
  }

  /**
   * Bring the free keys in line with what the basket has earned: add or take
   * away free Chroma Keys, apply or drop the FREEKEY codes, then re-read and
   * believe only what Tebex kept - a code it refused means that key isn't free,
   * so it comes back out rather than being charged for.
   *
   * Never throws. The promo failing is no reason to fail the add or quantity
   * change that triggered it; the basket just stays as it was.
   */
  async function reconcileFreeKeys(b) {
    if (!b?.ident || b.complete) return b;
    const ident = b.ident;
    const id = FREE_KEY.packageId;
    const qtyIn = (basket) => basket?.packages?.find((p) => p.id === id)?.in_basket?.quantity ?? 0;
    const codesIn = (basket) => (basket?.coupons || []).map((c) => String(c.code).toUpperCase()).filter(isFreeKeyCode);
    try {
      const qty = qtyIn(b);
      const applied = codesIn(b);
      // Each code on the basket is a free key in it, so that's the floor even
      // if the stored count was lost.
      const bonus = Math.min(Math.max(loadFreeKeys(ident), applied.length), qty);
      const fx = rateRef.current;
      const unit = b.packages?.find((p) => p.id === id)?.in_basket?.price ?? FREE_KEY.price * fx;
      // Real spend: the total, less any free keys not (yet) covered by a code.
      const spend = b.total_price - Math.max(0, bonus - applied.length) * unit;
      // Only as many as still fit on the Chroma Key line beside the bought ones.
      const target = Math.min(freeKeysFor(spend / fx), Math.max(0, MAX_QUANTITY - (qty - bonus)));
      const want = FREE_KEY.codes.slice(0, target);
      if (bonus === target && applied.length === want.length && want.every((c) => applied.includes(c))) {
        saveFreeKeys(ident, bonus);
        return b;
      }

      // Keys first: each code needs a Chroma Key to discount.
      const nextQty = qty - bonus + target;
      if (nextQty !== qty) {
        if (nextQty <= 0) await removeFromBasket(ident, id);
        else if (qty === 0) await addToBasket(ident, id, nextQty, 'single');
        else await setBasketQuantity(ident, id, nextQty);
      }
      // Then the codes, lowest first: each one's minimum is checked against
      // the total with every code on taken off, its own included.
      for (const code of applied) {
        if (!want.includes(code)) await removeCoupon(token, ident, code).catch(() => {});
      }
      for (const code of want) {
        if (applied.includes(code)) continue;
        try {
          await applyCoupon(token, ident, code);
        } catch {
          break;
        }
      }

      let settled = await getBasket(token, ident);
      const kept = codesIn(settled).length;
      if (kept < target) {
        // Tebex turned a code down: take back the key it would have covered.
        const q = qtyIn(settled) - (target - kept);
        if (q <= 0) await removeFromBasket(ident, id);
        else await setBasketQuantity(ident, id, q);
        settled = await getBasket(token, ident);
      }
      const finalBonus = Math.min(kept, target);
      saveFreeKeys(ident, finalBonus);
      return settled;
    } catch {
      return b;
    }
  }

  /** Store a basket after letting the free-key promo catch up with it. */
  async function settle(b) {
    const reconciled = await reconcileFreeKeys(b);
    store(reconciled);
    return reconciled;
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
    revokeBasket(current);
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
  function addItem(pkg, username, quantity = 1, type) {
    return serial(() => addItemNow(pkg, username, quantity, type));
  }

  async function addItemNow(pkg, username, quantity, type) {
    dropForeignBasket(username);
    let current = basketRef.current;
    if (!current) current = await createOnce(username);
    setBasketError(null);
    const resolved = resolveType(pkg, type);
    const added = await addToBasket(current.ident, pkg.id, quantity, resolved);
    rememberRecurring(current.ident, pkg.id, isRecurring(resolved));
    return settle(added);
  }

  /** Set the exact quantity of a package already in the basket. */
  function setQuantity(packageId, quantity) {
    return serial(async () => {
      const current = basketRef.current;
      if (!current) return;
      const updated = await setBasketQuantity(current.ident, packageId, quantity);
      await settle(updated);
    });
  }

  /** Remove a package from the basket. */
  function removeItem(packageId) {
    return serial(async () => {
      const current = basketRef.current;
      if (!current) return;
      const updated = await removeFromBasket(current.ident, packageId);
      rememberRecurring(current.ident, packageId, false);
      await settle(updated);
    });
  }

  /** Forget the basket (e.g. after a completed checkout, or a username change). */
  function clearBasket() {
    // Retire any create still in flight before dropping the basket, so one
    // started under the old username can't land and undo this.
    generation.current += 1;
    creating.current = null;
    restored.current = Promise.resolve();
    revokeBasket(basketRef.current);
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
  function addCoupon(code) {
    return serial(() => addCouponNow(code));
  }

  async function addCouponNow(code) {
    const current = basketRef.current;
    if (!current) throw new Error('Add something to your cart first.');
    if (isFreeKeyCode(code)) {
      throw new Error('Free keys are added to your cart automatically - no code needed.');
    }
    // Promo codes are single-use per player and don't stack, so refuse a second
    // one here rather than relying on the drawer to hide the input. The free
    // key codes ride alongside and don't count.
    if ((current.coupons || []).some((c) => !isFreeKeyCode(c.code))) {
      throw new Error('Only one promo code can be used per order.');
    }
    await applyCoupon(token, current.ident, code);
    // A discount lowers the spend, which can cost a free key.
    await settle(await getBasket(token, current.ident));
  }

  /** Drop an applied coupon and re-fetch for the restored pricing. */
  function dropCoupon(code) {
    return serial(() => dropCouponNow(code));
  }

  async function dropCouponNow(code) {
    const current = basketRef.current;
    if (!current) return;
    await removeCoupon(token, current.ident, code);
    await settle(await getBasket(token, current.ident));
  }

  /**
   * Redeem a gift card. Deliberately missing the one-at-a-time guard `addCoupon`
   * has: cards are stored value, so a buyer with two half-used ones should be
   * able to put both towards the same order.
   */
  function addGiftCard(cardNumber) {
    return serial(() => addGiftCardNow(cardNumber));
  }

  async function addGiftCardNow(cardNumber) {
    const current = basketRef.current;
    if (!current) throw new Error('Add something to your cart first.');
    if (current.giftcards?.some((g) => sameCard(g.card_number, cardNumber))) {
      throw new Error('That gift card is already applied.');
    }
    await applyGiftCard(token, current.ident, cardNumber);
    await settle(await getBasket(token, current.ident));
  }

  /** Take a gift card back off the basket and re-fetch for the restored total. */
  function dropGiftCard(cardNumber) {
    return serial(() => dropGiftCardNow(cardNumber));
  }

  async function dropGiftCardNow(cardNumber) {
    const current = basketRef.current;
    if (!current) return;
    await removeGiftCard(token, current.ident, cardNumber);
    await settle(await getBasket(token, current.ident));
  }

  const items = basket?.packages || [];
  const count = items.reduce((n, p) => n + (p.in_basket?.quantity || 0), 0);
  // The promo's own codes are bookkeeping, not something the buyer typed, so
  // they stay out of the promo-code UI.
  const coupons = (basket?.coupons || []).filter((c) => !isFreeKeyCode(c.code));
  const giftcards = basket?.giftcards || [];
  // Real spend toward the next free key, in USD. Once reconciled, each free
  // key is netted out by its code, so the basket total is the spend.
  const freeKeySpend = basket ? basket.total_price / rate : 0;
  // Free keys in the basket: one per FREEKEY code Tebex is honouring, never
  // more than the Chroma Keys actually there.
  const chromaQty = items.find((p) => p.id === FREE_KEY.packageId)?.in_basket?.quantity ?? 0;
  const bonusKeys = Math.min(chromaQty, (basket?.coupons || []).filter((c) => isFreeKeyCode(c.code)).length);

  return {
    basket, items, count, coupons, giftcards, recurringIds, basketError,
    bonusKeys, freeKeySpend, rate,
    ensureBasket, addItem, setQuantity, removeItem, clearBasket,
    addCoupon, dropCoupon, addGiftCard, dropGiftCard,
  };
}

/**
 * Empty a basket on Tebex before letting go of it locally.
 *
 * Forgetting the ident only hides the basket from this browser. Tebex keeps it
 * payable indefinitely with the username frozen in at creation, and
 * `links.checkout` is an ordinary URL that outlives us in an open tab, in
 * history, or in whatever the buyer bookmarked. So a player who fills a cart,
 * renames in-game, and then tells us the new name can still pay on the old
 * basket - and delivery runs every command against the name they left, which
 * no longer resolves. Every local guard in this file is powerless there: the
 * payment never comes back through the site.
 *
 * Emptying is the only revocation Headless offers - there is no delete-basket
 * endpoint - and a basket with nothing in it cannot be checked out.
 *
 * Deliberately not awaited. This runs behind a rename or a completed checkout,
 * where the buyer is already on to the next thing, and a failure leaves them no
 * worse off than not trying: the basket is gone from this session either way.
 */
function revokeBasket(basket) {
  const packages = basket?.packages || [];
  if (!basket?.ident || basket.complete || !packages.length) return;
  void (async () => {
    for (const pkg of packages) {
      try {
        // One at a time: Tebex answers each change with the whole basket, and
        // concurrent removes against one ident have no defined winner.
        await removeFromBasket(basket.ident, pkg.id);
      } catch {
        // Nothing useful to retry into - we have already stopped tracking this
        // basket, and the buyer has no view of it to correct.
      }
    }
  })();
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
  localStorage.removeItem(FREE_KEYS_KEY);
}

/** Free keys recorded for `ident`; 0 for any other basket or bad data. */
function loadFreeKeys(ident) {
  try {
    const saved = JSON.parse(localStorage.getItem(FREE_KEYS_KEY));
    return saved?.ident === ident && Number.isInteger(saved.count) ? saved.count : 0;
  } catch {
    return 0;
  }
}

function saveFreeKeys(ident, count) {
  try {
    localStorage.setItem(FREE_KEYS_KEY, JSON.stringify({ ident, count }));
  } catch {
    // Without storage the count is lost on reload. The reconcile falls back
    // to counting the FREEKEY codes on the basket, which says the same thing.
  }
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
