import { listPrice } from './price';

// "A free Chroma Key for every $10" promo.
//
// The keys are real basket lines made free by coupons that Tebex enforces
// itself: FREEKEYn takes $0.99 off the Chroma Key package once per basket and
// needs a basket total of 10n + 0.99 with the *other* FREEKEY discounts taken
// off. That works out to $10 of real spend per free key, and Tebex re-checks
// every code whenever the basket changes, so nothing here has to be trusted -
// the site only adds the keys, applies the codes, and shows what stuck.
//
// Those minimums are in the store's base currency, USD, but Tebex quotes every
// price in the buyer's own currency. So spend is converted to USD before it is
// held against the $10 steps - otherwise CA$21 reads as two keys when it is
// about US$15, and Tebex (rightly) refuses the second code.
//
// Spend is also counted before sales tax. Catalog prices include VAT where it
// applies, but basket totals don't, so a tax-inclusive rate undercounts an EU
// basket by the VAT - the cart said two keys where the cards said three.
// Amounts shown to the buyer use the tax-inclusive rate, so they add up with
// the prices on the cards.
//
// The coupons live in the Tebex panel. Raising MAX means creating FREEKEY4
// ($0.99 off Chroma Key, basket rule, minimum $40.99) and so on first.

export const FREE_KEY = {
  packageId: 7557969,
  name: 'Chroma Key',
  // USD list price, as set in the Tebex panel. Also the exchange-rate
  // reference (see usdRate), so it must change if the panel price does.
  price: 0.99,
  every: 10,
  max: 3,
  codes: ['FREEKEY1', 'FREEKEY2', 'FREEKEY3'],
};

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
  // A hair of tolerance so $9.999999 of float drift still counts as $10.
  return Math.max(0, Math.min(FREE_KEY.max, Math.floor((spend + 1e-6) / FREE_KEY.every)));
}

/** US dollars still to spend for the next free key, or null once at the cap. */
export function toNextFreeKey(spend) {
  const earned = freeKeysFor(spend);
  if (earned >= FREE_KEY.max) return null;
  return Math.max(0, (earned + 1) * FREE_KEY.every - spend);
}
