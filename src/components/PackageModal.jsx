import { useState } from 'preact/hooks';
import { CartIcon } from './CartDrawer';
import { QuantityStepper } from './QuantityStepper';
import { limitLabel, limitCount } from '../lib/packageLimit';
import { listPrice } from '../lib/price';

function formatPrice(amount, currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
}

/** Full popout view of a package: image, price, and complete description. */
export function PackageModal({ pkg, busy, cartQty = 0, owned = false, onBuy, onAddToCart, onClose }) {
  const onSale = pkg.discount > 0;
  const allowQuantity = !pkg.disable_quantity;
  const limit = limitLabel(pkg.user_limit);
  const cap = limitCount(pkg.user_limit);
  const inCart = cap > 0 && cartQty >= cap;
  const blocked = owned || inCart;
  const [closing, setClosing] = useState(false);
  const [qty, setQty] = useState(1);

  function close() {
    if (busy || closing) return;
    setClosing(true);
    setTimeout(onClose, 200);
  }

  return (
    <div class={`modal-overlay${closing ? ' closing' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div class="pkg-modal card">
        <button class="pkg-modal-close" onClick={close} aria-label="Close">✕</button>

        {pkg.image && (
          <div class="pkg-modal-image-wrap">
            <img class="pkg-modal-image" src={pkg.image} alt="" />
          </div>
        )}

        <div class="pkg-modal-body">
          <p class="pkg-name">{pkg.name}</p>
          <p class="pkg-price">
            {onSale && <span class="pkg-price-old">{formatPrice(listPrice(pkg), pkg.currency)}</span>}
            <span class="pkg-price-now">{formatPrice(pkg.total_price, pkg.currency)}</span>
          </p>
          {onSale && (
            <p class="pkg-upgrade">
              UPGRADE PRICE — {formatPrice(pkg.discount, pkg.currency)} CREDIT FOR WHAT YOU ALREADY OWN
            </p>
          )}

          {(limit || owned) && (
            <p class={`pkg-limit${blocked ? ' pkg-limit--hit' : ''}`}>
              {owned ? 'YOU ALREADY OWN THIS' : inCart ? 'ALREADY IN YOUR CART' : limit}
            </p>
          )}

          {pkg.description && (
            <div class="pkg-desc pkg-modal-desc" dangerouslySetInnerHTML={{ __html: pkg.description }} />
          )}

          {allowQuantity && !blocked && (
            <div class="pkg-qty pkg-modal-qty">
              <span class="pkg-qty-label">QTY</span>
              <QuantityStepper value={qty} onChange={setQty} disabled={busy} label={`${pkg.name} quantity`} />
              {qty > 1 && <span class="pkg-qty-sub">{formatPrice(pkg.total_price * qty, pkg.currency)}</span>}
            </div>
          )}

          <div class="pkg-actions">
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
    </div>
  );
}
