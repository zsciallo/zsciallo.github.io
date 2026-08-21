import { SINGLE, SUBSCRIPTION, offersBothTypes, defaultType } from './packageType';

/**
 * Works out the distinct ways a package can be bought, ready to render as a
 * choice for the buyer.
 *
 * Tebex prices a dual-type (`both`) package identically either way — per their
 * docs, "both options will use the same price; separate pricing for one-time vs
 * subscription is not currently supported". So a real subscribe-and-save
 * discount can't come from the package itself. It comes from a *second*,
 * cheaper, subscription-only package, paired to the first in `config.json`
 * (`subscriptionPairs`). When a pair is configured the subscribe choice buys
 * that package instead, and the saving shown is the genuine difference between
 * two real prices rather than a number we invented.
 *
 * With no pair configured a `both` package still offers both choices — just at
 * the one price Tebex gives it, and with no saving claimed.
 *
 * Returns [] when there is nothing to ask: a package sold exactly one way.
 */
export function purchaseOptions(pkg, packagesById = {}, pairs = {}) {
  if (!pkg) return [];

  const oneTime = offersBothTypes(pkg) || defaultType(pkg) === SINGLE
    ? { key: SINGLE, pkg, type: SINGLE, price: pkg.total_price }
    : null;

  // A pair only counts if the partner is actually in the catalog — a package
  // that's been disabled or deleted in Tebex must not leave a dead option
  // behind, and pairing something to itself is a config slip, not a choice.
  const partnerId = pairs?.[pkg.id];
  const partner = partnerId && partnerId !== pkg.id ? packagesById[partnerId] : null;

  let subscription = null;
  if (partner) {
    subscription = { key: SUBSCRIPTION, pkg: partner, type: SUBSCRIPTION, price: partner.total_price };
  } else if (offersBothTypes(pkg) || defaultType(pkg) === SUBSCRIPTION) {
    subscription = { key: SUBSCRIPTION, pkg, type: SUBSCRIPTION, price: pkg.total_price };
  }

  if (!oneTime || !subscription) return [];

  // Percentage off the one-time price, and only when it's a real saving —
  // never a "SAVE 0%" badge, and never a negative one if the pair is priced
  // the wrong way round.
  const diff = oneTime.price - subscription.price;
  subscription.save = diff > 0.005 && oneTime.price > 0
    ? Math.round((diff / oneTime.price) * 100)
    : 0;

  return [oneTime, subscription];
}

/**
 * The package ids that stand for the same purchase — a pair's two halves, or
 * just the one id when nothing is paired to it.
 *
 * The buyer thinks of "Battle Pass" as one thing, so having it in the cart
 * one way has to block adding it the other; without this the card stays on BUY
 * after they subscribe and they can buy the same pass twice.
 */
export function pairMembers(pkg, pairs = {}) {
  const partnerId = pkg && pairs?.[pkg.id];
  return partnerId && Number(partnerId) !== pkg.id ? [pkg.id, Number(partnerId)] : [pkg?.id];
}

/**
 * Ids of packages that exist only as the subscribe half of a pair. They are
 * bought through their partner's choice popup, so showing them in the grid as
 * well would list the same thing twice.
 */
export function pairedSubscriptionIds(pairs = {}) {
  return new Set(Object.values(pairs).filter(Boolean).map(Number));
}
