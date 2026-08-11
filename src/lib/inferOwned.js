import { listPrice } from './price';

// Prices are floats from JSON, so compare with a cent of slack rather than ===.
const EPSILON = 0.005;

/**
 * Works out which packages a player already owns from the upgrade credits in a
 * basket-scoped catalog.
 *
 * Tebex exposes no ownership flag, and asking outright needs a private key. But
 * when a player holds a lower tier, the credit applied to the tiers above is
 * exactly the full price of the highest one they hold — so the ladder below it
 * is implied. Verified live: an account owning VIP ($2.99) and VIP+ ($4.99) got
 * MVP discounted by $4.99, which resolves back to VIP+ and everything cheaper.
 *
 * Costs nothing: it reads the catalog already fetched for pricing.
 *
 * Only works for laddered packages. A standalone capped package like the Battle
 * Pass has nothing above it to discount, so it reports `discount: 0` even for an
 * owner and is left out — those are still learned from a rejected add.
 */
export function inferOwnedPackages(categories) {
  const owned = [];

  for (const category of categories) {
    const packages = category.packages || [];
    const credits = packages.map((p) => p.discount || 0).filter((d) => d > 0);
    if (!credits.length) continue;

    // Several tiers can be discounted at once; the largest credit corresponds
    // to the highest tier held.
    const topCredit = Math.max(...credits);
    const held = packages.find((p) => Math.abs(listPrice(p) - topCredit) < EPSILON);
    // A credit that matches no package price means the store is configured in
    // some way this doesn't model — infer nothing rather than guess.
    if (!held) continue;

    const heldPrice = listPrice(held);
    packages.forEach((p) => {
      if (listPrice(p) <= heldPrice + EPSILON) owned.push(p.id);
    });
  }

  return owned;
}
