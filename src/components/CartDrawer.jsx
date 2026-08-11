import { useState } from 'preact/hooks';
import { QuantityStepper } from './QuantityStepper';

export const WELCOME_CODE = 'WELCOME20';

function formatPrice(amount, currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
}

/**
 * Undiscounted subtotal, taken from the catalog rather than the basket.
 *
 * Applying a coupon rewrites the basket's own `base_price` to the *discounted*
 * figure and Tebex exposes no "price before discount" field, so the only way to
 * show what the buyer saved is to re-add it up from catalog prices. Falls back
 * to the basket's line price for anything missing from the catalog, which just
 * makes that line contribute zero savings rather than breaking the total.
 */
function fullSubtotal(items, packagesById) {
  return items.reduce((sum, item) => {
    const unit = packagesById[item.id]?.total_price ?? item.in_basket.price;
    return sum + unit * item.in_basket.quantity;
  }, 0);
}

export function CartIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.66a2 2 0 001.99-1.61L23 6H6" />
    </svg>
  );
}

/** Floating cart button, fixed to the top-right of the store page. */
export function CartFab({ count, onClick }) {
  return (
    <button class="cart-fab" onClick={onClick} aria-label={`Open cart (${count} items)`}>
      <CartIcon size={20} />
      {count > 0 && <span class="cart-fab-badge">{count}</span>}
    </button>
  );
}

/** Slide-in side cart listing everything in the user's basket. */
export function CartDrawer({
  open,
  basket,
  items,
  packagesById = {},
  busy,
  coupons = [],
  onSetQuantity,
  onRemove,
  onApplyCoupon,
  onRemoveCoupon,
  onClose,
}) {
  const currency = basket?.currency || 'USD';
  const [code, setCode] = useState('');
  const [couponError, setCouponError] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);

  const subtotal = fullSubtotal(items, packagesById);
  const total = basket?.total_price ?? 0;
  // Sub-cent drift from Tebex's own rounding shouldn't render as "you saved $0.00".
  const saved = subtotal - total > 0.005 ? subtotal - total : 0;
  const hasWelcome = coupons.some((c) => c.code?.toUpperCase() === WELCOME_CODE);

  async function submitCoupon(e) {
    e.preventDefault();
    const value = code.trim();
    if (!value || couponBusy) return;
    setCouponBusy(true);
    setCouponError(null);
    try {
      await onApplyCoupon(value);
      setCode('');
    } catch (err) {
      // Tebex's messages are already buyer-readable ("The selected coupon code
      // is invalid."), so surface them rather than inventing our own.
      setCouponError(err.message);
    }
    setCouponBusy(false);
  }

  async function dropCoupon(value) {
    setCouponBusy(true);
    setCouponError(null);
    try {
      await onRemoveCoupon(value);
    } catch (err) {
      setCouponError(err.message);
    }
    setCouponBusy(false);
  }

  return (
    <>
      <div class={`cart-scrim${open ? ' open' : ''}`} onClick={onClose} />
      <aside class={`cart-drawer${open ? ' open' : ''}`} aria-label="Shopping cart" aria-hidden={!open}>
        <div class="cart-head">
          <p class="cart-title"><CartIcon /> YOUR CART</p>
          <button class="cart-close" onClick={onClose} aria-label="Close cart">✕</button>
        </div>

        {basket?.username && <p class="cart-user">Delivering to <strong>{basket.username}</strong></p>}

        {items.length === 0 ? (
          <p class="cart-empty">Your cart is empty.</p>
        ) : (
          <div class="cart-items">
            {items.map((item) => {
              const qty = item.in_basket.quantity;
              // Basket entries don't carry the catalog flags, so look them up.
              const allowQuantity = !packagesById[item.id]?.disable_quantity;

              return (
                <div class="cart-item" key={item.id}>
                  {item.image && <img class="cart-item-img" src={item.image} alt="" loading="lazy" />}
                  <div class="cart-item-info">
                    <p class="cart-item-name">{item.name}</p>
                    {allowQuantity ? (
                      <QuantityStepper
                        value={qty}
                        onChange={(next) => onSetQuantity(item.id, next)}
                        disabled={busy}
                        size="sm"
                        label={`${item.name} quantity`}
                      />
                    ) : (
                      <p class="cart-item-meta">
                        {qty} × {formatPrice(item.in_basket.price, currency)}
                      </p>
                    )}
                  </div>
                  <div class="cart-item-end">
                    <p class="cart-item-line">{formatPrice(item.in_basket.price * qty, currency)}</p>
                    <button
                      class="cart-item-remove"
                      onClick={() => onRemove(item.id)}
                      disabled={busy}
                      aria-label={`Remove ${item.name} from cart`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {items.length > 0 && (
          <div class="cart-foot">
            {/* One code at a time: promo codes here are single-use-per-player,
                so stacking them isn't allowed. The input only comes back once
                the active code is removed. */}
            {coupons.length === 0 && (
              <form class="cart-coupon" onSubmit={submitCoupon}>
                <input
                  class="cart-coupon-input"
                  type="text"
                  value={code}
                  onInput={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="PROMO CODE"
                  aria-label="Promo code"
                  autocomplete="off"
                  spellcheck={false}
                  disabled={couponBusy || busy}
                />
                <button
                  type="submit"
                  class="cart-coupon-apply"
                  disabled={!code.trim() || couponBusy || busy}
                >
                  {couponBusy ? '…' : 'APPLY'}
                </button>
              </form>
            )}

            {coupons.length === 0 && !hasWelcome && !code && (
              <button
                type="button"
                class="cart-coupon-hint"
                onClick={() => setCode(WELCOME_CODE)}
                disabled={couponBusy || busy}
              >
                First order? Tap to use <strong>{WELCOME_CODE}</strong> for 20% off
              </button>
            )}

            {couponError && <p class="cart-coupon-error">{couponError}</p>}

            {coupons.map((c) => (
              <p class="cart-coupon-active" key={c.code}>
                <span>{c.code} APPLIED</span>
                <button
                  type="button"
                  onClick={() => dropCoupon(c.code)}
                  disabled={couponBusy || busy}
                  aria-label={`Remove promo code ${c.code}`}
                >
                  ✕
                </button>
              </p>
            ))}

            {coupons.length > 0 && (
              <p class="cart-coupon-note">Remove this code to use a different one — only one applies per order.</p>
            )}

            {saved > 0 && (
              <>
                <p class="cart-line">
                  <span>SUBTOTAL</span>
                  <span>{formatPrice(subtotal, currency)}</span>
                </p>
                <p class="cart-line cart-line--save">
                  <span>DISCOUNT</span>
                  <span>−{formatPrice(saved, currency)}</span>
                </p>
              </>
            )}

            <p class="cart-total">
              <span>TOTAL</span>
              <span>{formatPrice(total, currency)}</span>
            </p>
            <a class="btn btn-primary cart-checkout" href={basket.links?.checkout}>
              CHECKOUT
            </a>
          </div>
        )}
      </aside>
    </>
  );
}
