import { useState } from 'preact/hooks';
import { CartIcon } from './CartDrawer';
import { QuantityStepper } from './QuantityStepper';

function formatPrice(amount, currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
}

export function PackageCard({ pkg, busy, onView, onBuy, onAddToCart }) {
  const onSale = pkg.discount > 0;
  const allowQuantity = !pkg.disable_quantity;
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
          {onSale && <span class="pkg-price-old">{formatPrice(pkg.base_price, pkg.currency)}</span>}
          <span class="pkg-price-now">{formatPrice(pkg.total_price, pkg.currency)}</span>
        </p>
        <p class="pkg-details-hint">VIEW DETAILS</p>

        {allowQuantity && (
          <div class="pkg-qty">
            <QuantityStepper value={qty} onChange={setQty} disabled={busy} label={`${pkg.name} quantity`} />
            {qty > 1 && <span class="pkg-qty-sub">{formatPrice(pkg.total_price * qty, pkg.currency)}</span>}
          </div>
        )}

        <div class="pkg-actions" onClick={(e) => e.stopPropagation()}>
          <button
            class="btn btn-primary pkg-buy"
            disabled={busy}
            onClick={() => onBuy(pkg, qty)}
            aria-label={`Buy ${qty} × ${pkg.name}`}
          >
            {busy ? 'ADDING…' : 'BUY'}
          </button>
          <button
            class="pkg-cart-btn"
            disabled={busy}
            onClick={() => onAddToCart(pkg, qty)}
            aria-label={`Add ${qty} × ${pkg.name} to cart`}
            title="Add to cart"
          >
            <CartIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
