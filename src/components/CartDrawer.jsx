import { QuantityStepper } from './QuantityStepper';

function formatPrice(amount, currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
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
export function CartDrawer({ open, basket, items, packagesById = {}, busy, onSetQuantity, onRemove, onClose }) {
  const currency = basket?.currency || 'USD';

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
            <p class="cart-total">
              <span>TOTAL</span>
              <span>{formatPrice(basket.total_price, currency)}</span>
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
