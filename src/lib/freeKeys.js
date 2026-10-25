import { listPrice } from './price';

// "Free Chroma Keys as you spend" promo.
//
// The promo is decided and enforced by the store backend (api.chromabit.us,
// POST /store/basket/{ident}/freekeys): it reads the basket, works out the keys
// earned from real spend in USD, adds them as real basket lines and makes them
// free with a one-time coupon locked to the basket's player. Nothing in the
// browser can grant a key - these helpers only *predict* what a quantity change
// will earn, so a stepper can shout FREE KEY! before the round trip, and show
// progress toward the next one.
//
// The numbers below are the defaults; `applyRules` overwrites them with what
// the backend reports, so a threshold change on the server reaches the UI
// without a deploy.

export const FREE_KEY = {
  packageId: 7557969,
  name: 'Chroma Key',
  // USD list price, as set in the Tebex panel. Also the exchange-rate
  // reference (see usdRate).
  price: 0.99,
  // USD of real spend each free key needs, in order.
  minimums: [10.99, 20.99, 30.99],
  max: 3,
};

/** Overwrite the promo numbers with the backend's (`rules` from /store/offers or the sync response). */
export function applyRules(rules) {
  if (!rules?.minimumsUsd?.length) return;
  FREE_KEY.packageId = Number(rules.packageId) || FREE_KEY.packageId;
  FREE_KEY.price = Number(rules.priceUsd) || FREE_KEY.price;
  FREE_KEY.minimums = rules.minimumsUsd.map(Number);
  FREE_KEY.max = rules.max || FREE_KEY.minimums.length;
}

/** Coupon codes the backend mints for this promo; bookkeeping, never shown as a promo code. */
export function isMintedFreeKeyCode(code) {
  return /^CBK-/i.test(String(code || ''));
}

/** What a package adds to the basket total: its price less sales tax. */
export function preTaxPrice(pkg) {
  return (pkg.total_price ?? 0) - (pkg.sales_tax ?? 0);
}

/**
 * Local currency per US dollar, read off the Chroma Key: Tebex has no
 * exchange-rate field, but it quotes this package's known USD price in the
 * buyer's currency. 1 when the key isn't in the catalog (yet) or it's USD.
 *
 * `rate` is pre-tax, for counting basket spend. `shownRate` includes tax, for
 * turning a USD amount into what the buyer's card prices add up to.
 */
export function usdRate(packagesById = {}) {
  const pkg = packagesById[FREE_KEY.packageId];
  const shown = pkg ? listPrice(pkg) : 0;
  const preTax = pkg ? shown - (pkg.sales_tax ?? 0) : 0;
  if (!pkg?.currency || pkg.currency === 'USD' || preTax <= 0) {
    return { rate: 1, shownRate: preTax > 0 ? shown / preTax : 1 };
  }
  return { rate: preTax / FREE_KEY.price, shownRate: shown / FREE_KEY.price };
}

/** Free keys earned by `spend` US dollars of real (non-free-key) basket value. Prediction only. */
export function freeKeysFor(spend) {
  // A hair of tolerance so $10.989999 of float drift still counts as $10.99.
  return FREE_KEY.minimums.filter((min) => spend + 1e-6 >= min).length;
}

/**
 * Where a buyer with `keys` free keys stands on the way to the next one:
 * USD still to spend (null once at the cap) and how far along the step is.
 * Counted from keys held rather than from spend, so it never runs ahead of
 * what the backend actually granted.
 */
export function nextFreeKey(keys, spend) {
  if (keys >= FREE_KEY.max) return { left: null, progress: 1 };
  const from = keys > 0 ? FREE_KEY.minimums[keys - 1] : 0;
  const to = FREE_KEY.minimums[keys];
  return {
    // Never "$0.00 more": at the line, Tebex's own rounding has the last word.
    left: Math.max(0.01, to - spend),
    progress: Math.min(1, Math.max(0, (spend - from) / (to - from))),
  };
}
