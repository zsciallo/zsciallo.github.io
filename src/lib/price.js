/**
 * The pre-discount price to show struck through.
 *
 * When a player already owns a lower rank, Tebex credits what they paid and
 * returns the upgrade price in BOTH `total_price` and `base_price`, with the
 * credited amount in `discount`. So `base_price` is already discounted and
 * rendering it as the "was" price prints the same number twice - the original
 * is `total_price + discount`.
 *
 * Verified against a live account owning VIP+: MVP came back as
 * total_price 4.00, base_price 4.00, discount 4.99 - original 8.99.
 *
 * Built from `base_price` rather than `total_price` because only the total is
 * rounded to the cent: the Halloween Key at half price reported base 0.495,
 * total 0.50, discount 0.495, and total + discount strikes through "$1.00" on
 * a $0.99 key. Tax is added back since the total carries it where VAT applies.
 */
export function listPrice(pkg) {
  return (pkg.base_price ?? 0) + (pkg.sales_tax ?? 0) + (pkg.discount ?? 0);
}
