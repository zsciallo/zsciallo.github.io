import { useState } from 'preact/hooks';
import { CartIcon } from './CartDrawer';
import { QuantityStepper } from './QuantityStepper';
import { limitLabel, limitCount } from '../lib/packageLimit';
import { listPrice } from '../lib/price';

function formatPrice(amount, currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
}

export function PackageCard({ pkg, busy, cartQty = 0, owned = false, onView, onBuy, onAddToCart }) {
  const onSale = pkg.discount > 0;
  const allowQuantity = !pkg.disable_quantity;
  const limit = limitLabel(pkg.user_limit);
  const cap = limitCount(pkg.user_limit);
  // `owned` comes from Tebex having already refused this package for the player;
  // `inCart` is the cheaper case where they simply have it queued up. Both block
  // the purchase, but they read differently to the buyer.
  const inCart = cap > 0 && cartQty >= cap;
  const blocked = owned || inCart;
  const [qty, setQty] = useState(1);

  return (
    <div
      class="pkg-card reveal"
      role="button"
      tabIndex={0}
      onClick={() => onView(pkg)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onView(pkg); } }}
      aria-label={`View details for ${pkg.name}`}
    >
      {pkg.image && (
        <div class="pkg-image-wrap">
          <img class="pkg-image" src={pkg.image} alt="" loading="lazy" />
        </div>
      )}
      <div class="pkg-body">
        <p class="pkg-name">{pkg.name}</p>
        <p class="pkg-price">
          {onSale && <span class="pkg-price-old">{formatPrice(listPrice(pkg), pkg.currency)}</span>}
          <span class="pkg-price-now">{formatPrice(pkg.total_price, pkg.currency)}</span>
        </p>
        {onSale && <p class="pkg-upgrade">UPGRADE PRICE — {formatPrice(pkg.discount, pkg.currency)} CREDIT APPLIED</p>}
        {(limit || owned) && (
          <p class={`pkg-limit${blocked ? ' pkg-limit--hit' : ''}`}>
            {owned ? 'YOU ALREADY OWN THIS' : inCart ? 'ALREADY IN CART' : limit}
          </p>
        )}
        <p class="pkg-details-hint">VIEW DETAILS</p>

        {allowQuantity && !blocked && (
          <div class="pkg-qty">
            <QuantityStepper value={qty} onChange={setQty} disabled={busy} label={`${pkg.name} quantity`} />
            {qty > 1 && <span class="pkg-qty-sub">{formatPrice(pkg.total_price * qty, pkg.currency)}</span>}
          </div>
        )}

        <div class="pkg-actions" onClick={(e) => e.stopPropagation()}>
          <button
            class="btn btn-primary pkg-buy"
            disabled={busy || blocked}
            onClick={() => onBuy(pkg, qty)}
            aria-label={
              owned ? `You already own ${pkg.name}`
                : inCart ? `${pkg.name} is already in your cart`
                  : `Buy ${qty} × ${pkg.name}`
            }
          >
            {owned ? 'OWNED' : inCart ? 'IN CART' : busy ? 'ADDING…' : 'BUY'}
          </button>
          <button
            class="pkg-cart-btn"
            disabled={busy || blocked}
            onClick={() => onAddToCart(pkg, qty)}
            aria-label={`Add ${qty} × ${pkg.name} to cart`}
            title={owned ? 'You already own this' : inCart ? 'Already in your cart' : 'Add to cart'}
          >
            <CartIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
