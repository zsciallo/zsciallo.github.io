import { listPrice } from './price';

// "Free Chroma Keys as you spend" promo.
//
// The keys are real basket lines made free by coupons that Tebex enforces
// itself: FREEKEYn takes $0.99 off the Chroma Key package once per basket, and
// Tebex re-checks every code whenever the basket changes, so nothing here has
// to be trusted - the site only adds the keys, applies the codes, and shows
// what stuck.
//
// Each code's minimum is held against the basket total after *every* FREEKEY
// discount, its own included - so it is the buyer's real spend, and FREEKEYn
// needs the full minimum of it (US$10.99, not $10). Assuming $10 steps had the
// site promising a key at $30.69 that Tebex then refused. `minimums` must
// match the panel exactly.
//
// Those minimums are in the store's base currency, USD, but Tebex quotes every
// price in the buyer's own currency. So spend is converted to USD before it is
// held against them - otherwise CA$21 reads as two keys when it is about
// US$15, and Tebex (rightly) refuses the second code.
//
// Spend is also counted before sales tax. Catalog prices include VAT where it
// applies, but basket totals don't, so a tax-inclusive rate undercounts an EU
// basket by the VAT - the cart said two keys where the cards said three.
// Amounts shown to the buyer use the tax-inclusive rate, so they add up with
// the prices on the cards.
//
// The coupons live in the Tebex panel. Adding a fourth key means creating
// FREEKEY4 ($0.99 off Chroma Key, basket rule, minimum $40.99) first, then
// adding its code and minimum below.

export const FREE_KEY = {
  packageId: 7557969,
  name: 'Chroma Key',
  // USD list price, as set in the Tebex panel. Also the exchange-rate
  // reference (see usdRate), so it must change if the panel price does.
  price: 0.99,
  // USD each FREEKEYn needs actually spent, in code order - the panel's
  // "minimum basket value" for that coupon.
  minimums: [10.99, 20.99, 30.99],
  codes: ['FREEKEY1', 'FREEKEY2', 'FREEKEY3'],
};
FREE_KEY.max = FREE_KEY.codes.length;

export function isFreeKeyCode(code) {
  return FREE_KEY.codes.includes(String(code || '').toUpperCase());
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

/** Free keys earned by `spend` US dollars of real (non-free-key) basket value. */
export function freeKeysFor(spend) {
  // A hair of tolerance so $10.989999 of float drift still counts as $10.99.
  return FREE_KEY.minimums.filter((min) => spend + 1e-6 >= min).length;
}

/**
 * Where a buyer with `keys` free keys stands on the way to the next one:
 * USD still to spend (null once at the cap) and how far along the step is.
 * Counted from keys held rather than from spend, so it never runs ahead of
 * what Tebex actually granted.
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
