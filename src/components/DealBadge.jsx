import { dealFor } from '../lib/deal';

function formatPrice(amount, currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
}

/**
 * The sticker on a discounted package: a sale, or the credit a player gets on
 * a rank above one they hold. It bobs so it's read before the price - a
 * discount is the one thing on the store that wants to be seen first.
 *
 * `sales` is the store's anonymous-catalog discounts (see lib/deal), which is
 * what tells the two apart.
 */
export function DealBadge({ pkg, sales, class: cls = '' }) {
  const deal = dealFor(pkg, sales);
  if (!deal) return null;
  const sale = deal.kind === 'sale';
  // A sale reads as a percentage ("50% OFF"); a credit as the amount, since it
  // is literally the price of the rank they already paid for. A sale too small
  // to make a whole percent shows the amount too.
  const figure = sale && deal.percent >= 5 ? `${deal.percent}% OFF` : `−${formatPrice(deal.amount, pkg.currency)}`;
  return (
    <span class={`pkg-deal pkg-deal--${deal.kind}${cls ? ` ${cls}` : ''}`}>
      <b>{figure}</b>
      <small>{sale ? 'SALE' : 'UPGRADE CREDIT'}</small>
    </span>
  );
}
