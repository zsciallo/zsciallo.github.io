import { useState } from 'preact/hooks';
import { CartIcon } from './CartDrawer';

function formatPrice(amount, currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
}

/** Full popout view of a package: image, price, and complete description. */
export function PackageModal({ pkg, busy, onBuy, onAddToCart, onClose }) {
  const onSale = pkg.discount > 0;
  const [closing, setClosing] = useState(false);

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
            {onSale && <span class="pkg-price-old">{formatPrice(pkg.base_price, pkg.currency)}</span>}
            <span class="pkg-price-now">{formatPrice(pkg.total_price, pkg.currency)}</span>
          </p>

          {pkg.description && (
            <div class="pkg-desc pkg-modal-desc" dangerouslySetInnerHTML={{ __html: pkg.description }} />
          )}

          <div class="pkg-actions">
            <button
              class="btn btn-primary pkg-buy"
              disabled={busy}
              onClick={() => onBuy(pkg)}
              aria-label={`Buy ${pkg.name}`}
            >
              {busy ? 'ADDING…' : 'BUY'}
            </button>
            <button
              class="pkg-cart-btn"
              disabled={busy}
              onClick={() => onAddToCart(pkg)}
              aria-label={`Add ${pkg.name} to cart`}
              title="Add to cart"
            >
              <CartIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
