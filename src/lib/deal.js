import { listPrice } from './price';

/**
 * What a package's `discount` is for.
 *
 * Tebex reports two unrelated things through the one field. A sale set in the
 * panel takes its cut off every buyer's price; a rank upgrade credits a player
 * what they paid for a lower tier. Nothing on the package says which - the
 * Halloween Key at half price came back as base 0.495, total 0.50, discount
 * 0.495 (measured 2026-10-23), the same shape as the upgrade case documented
 * in ./price. They differ in who sees them: the anonymous catalog carries sale
 * prices and never a credit, which only exists against a basket. So `sales` is
 * the discount each package showed with no basket attached, and a discount
 * that was already there is a sale.
 *
 * Returns null when the package costs full price.
 */
export function dealFor(pkg, sales = {}) {
  const amount = pkg.discount || 0;
  if (amount <= 0) return null;
  const was = listPrice(pkg);
  const kind = (sales[pkg.id] || 0) > 0 ? 'sale' : 'credit';
  return { kind, amount, percent: was > 0 ? Math.round((amount / was) * 100) : 0 };
}
