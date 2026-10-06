import { useState } from 'preact/hooks';
import { CartIcon } from './CartDrawer';
import { QuantityStepper } from './QuantityStepper';
import { limitLabel, limitCount } from '../lib/packageLimit';
import { listPrice } from '../lib/price';
import { contentFor } from '../lib/storeContent';
import { ArcadeButton } from './ArcadeButton';
import { m } from 'motion/react';
import { spring } from '../lib/motion';
import { freeKeysFor } from '../lib/freeKeys';
import { MAX_QUANTITY } from '../lib/tebex';

function formatPrice(amount, currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
}

export function PackageCard({ pkg, busy, cartQty = 0, freeKeySpend = null, owned = false, requires = null, onView, onBuy, onAddToCart }) {
  const onSale = pkg.discount > 0;
  const allowQuantity = !pkg.disable_quantity;
  const limit = limitLabel(pkg.user_limit);
  const cap = limitCount(pkg.user_limit);
  // Three ways to be unbuyable, all of which read differently to the buyer.
  // `inCart` is the cheap one: they simply have it queued up already. `owned`
  // and `requires` both come from Tebex refusing the add, which it does with
  // one message for two opposite reasons - so `requires` names the rank this
  // package upgrades when there's no sign the player holds it, and it reads
  // first. Telling an upgrade buyer they already own what they were just
  // refused is what this did before, and it sent them to support.
  const inCart = cap > 0 && cartQty >= cap;
  // Tebex holds at most MAX_QUANTITY of a package per basket, so the room
  // left is what this control may add.
  const room = Math.max(0, MAX_QUANTITY - cartQty);
  const full = room === 0;
  const blocked = owned || inCart || full || Boolean(requires);
  const [qty, setQty] = useState(1);
  const sendQty = Math.min(qty, Math.max(1, room));
  const freeGain = freeKeySpend == null ? 0
    : freeKeysFor(freeKeySpend + sendQty * pkg.total_price) - freeKeysFor(freeKeySpend);
  const summary = contentFor(pkg)?.summary;

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
        {summary && <p class="pkg-summary">{summary}</p>}
        <p class="pkg-price">
          {onSale && <span class="pkg-price-old">{formatPrice(listPrice(pkg), pkg.currency)}</span>}
          <span class="pkg-price-now">{formatPrice(pkg.total_price, pkg.currency)}</span>
        </p>
        {onSale && <p class="pkg-upgrade">UPGRADE PRICE: {formatPrice(pkg.discount, pkg.currency)} CREDIT APPLIED</p>}
        {(limit || owned || requires || full) && (
          <p class={`pkg-limit${blocked ? ' pkg-limit--hit' : ''}`}>
            {requires ? `REQUIRES ${requires.toUpperCase()}`
              : owned ? 'YOU ALREADY OWN THIS' : inCart ? 'ALREADY IN CART' : full ? `MAX ${MAX_QUANTITY} PER ORDER - ALL IN YOUR CART` : limit}
          </p>
        )}
        <p class="pkg-details-hint">VIEW DETAILS</p>

        {allowQuantity && !blocked && (
          <div class="pkg-qty">
            <QuantityStepper value={sendQty} onChange={setQty} disabled={busy} max={Math.max(1, room)}
            label={`${pkg.name} quantity`}
              rewardAt={freeKeySpend == null ? null : (q) => freeKeysFor(freeKeySpend + q * pkg.total_price)} />
            {freeGain > 0 && <span class="pkg-freekey-chip">+{freeGain} FREE KEY{freeGain > 1 ? 'S' : ''}</span>}
            {qty > 1 && (
              // Keyed on qty so the running total pops each time it changes.
              <m.span key={qty} class="pkg-qty-sub" initial={{ scale: 1.35 }} animate={{ scale: 1 }} transition={spring.pop}>
                {formatPrice(pkg.total_price * qty, pkg.currency)}
              </m.span>
            )}
          </div>
        )}

        <div class="pkg-actions" onClick={(e) => e.stopPropagation()}>
          <ArcadeButton
            variant="primary"
            class="pkg-buy"
            disabled={busy || blocked}
            onClick={() => onBuy(pkg, sendQty)}
            aria-label={
              requires ? `${pkg.name} requires ${requires}`
                : owned ? `You already own ${pkg.name}`
                  : inCart || full ? `${pkg.name} is already in your cart`
                    : `Buy ${qty} × ${pkg.name}`
            }
          >
            {requires ? 'LOCKED' : owned ? 'OWNED' : inCart || full ? 'IN CART' : busy ? 'ADDING…' : 'BUY'}
          </ArcadeButton>
          <button
            class="pkg-cart-btn"
            disabled={busy || blocked}
            onClick={() => onAddToCart(pkg, sendQty)}
            aria-label={`Add ${qty} × ${pkg.name} to cart`}
            title={requires ? `Requires ${requires}`
              : owned ? 'You already own this' : inCart || full ? 'Already in your cart' : 'Add to cart'}
          >
            <CartIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
