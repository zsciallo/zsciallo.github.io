/**
 * The pre-discount price to show struck through.
 *
 * When a player already owns a lower rank, Tebex credits what they paid and
 * returns the upgrade price in BOTH `total_price` and `base_price`, with the
 * credited amount in `discount`. So `base_price` is already discounted and
 * rendering it as the "was" price prints the same number twice — the original
 * is `total_price + discount`.
 *
 * Verified against a live account owning VIP+: MVP came back as
 * total_price 4.00, base_price 4.00, discount 4.99 — original 8.99.
 */
export function listPrice(pkg) {
  return (pkg.total_price ?? 0) + (pkg.discount ?? 0);
}
