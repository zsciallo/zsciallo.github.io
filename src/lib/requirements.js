/**
 * The package a package can't be bought without.
 *
 * Tebex can gate a package behind a previous purchase - MVP+ is an upgrade,
 * sold only to players who already hold MVP - but the Headless API exposes
 * nothing about that gate. A blocked add comes back as the same flat "The
 * product isn't purchasable" that an already-owned package returns, so without
 * this map the store tells a player who owns no ranks at all that they already
 * own MVP+.
 *
 * Verified live against a fresh basket: MVP+ is refused even with MVP sitting
 * in the basket, which is what makes this a purchase requirement rather than
 * something the buyer can satisfy in one checkout.
 *
 * Configured in `config.json` as `packageRequires: { "<package>": <required> }`.
 */
export function requiredPackage(pkg, packagesById = {}, requires = {}) {
  const id = pkg && requires?.[pkg.id];
  // Same guards as the subscription pairs: nothing can require itself, and a
  // requirement pointing at a package that's been disabled or deleted in Tebex
  // must not leave "REQUIRES UNDEFINED" on the card.
  return (id && Number(id) !== pkg.id ? packagesById[Number(id)] : null) || null;
}
