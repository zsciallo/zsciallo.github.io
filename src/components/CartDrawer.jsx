import { useEffect, useRef, useState } from 'preact/hooks';
import { QuantityStepper } from './QuantityStepper';
import { SUBSCRIPTION, renewalLabel } from '../lib/packageType';
import { ArcadeButton } from './ArcadeButton';
import { FREE_KEY, freeKeysFor, toNextFreeKey } from '../lib/freeKeys';
import { freeKey as freeKeySound } from '../lib/sound';
import { MAX_QUANTITY } from '../lib/tebex';

export const WELCOME_CODE = 'WELCOME20';

function formatPrice(amount, currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
}

/**
 * Decide which of the two redemption endpoints a typed code belongs to.
 *
 * Gift card numbers are long digit strings (dashes and spaces optional), while
 * promo codes are words like WELCOME20 - so anything that isn't purely numeric
 * can only be a coupon. Short numbers stay coupons because a promo code of
 * "2026" is plausible and a four-digit gift card isn't.
 */
function looksLikeGiftCard(value) {
  return /^[\d\s-]+$/.test(value) && value.replace(/\D/g, '').length >= 8;
}

/** Show only the tail of a card number, the way a receipt would. */
function maskCard(number) {
  const digits = String(number || '').replace(/\D/g, '');
  return digits ? `•••• ${digits.slice(-4)}` : 'APPLIED';
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
  recurringIds = [],
  busy,
  coupons = [],
  giftcards = [],
  bonusKeys = 0,
  freeKeySpend = 0,
  rate = 1,
  shownRate = 1,
  onSetQuantity,
  onRemove,
  onApplyCoupon,
  onRemoveCoupon,
  onApplyGiftCard,
  onRemoveGiftCard,
  onClose,
}) {
  const currency = basket?.currency || 'USD';
  const [code, setCode] = useState('');
  const [couponError, setCouponError] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);

  // The free keys' value is named as such in the totals, separate from any
  // promo code or gift card, so the buyer sees what they earned.
  const keyUnit = packagesById[FREE_KEY.packageId]?.total_price ?? FREE_KEY.price * shownRate;
  const subtotal = fullSubtotal(items, packagesById);
  const freeValue = bonusKeys * keyUnit;
  const total = basket?.total_price ?? 0;
  const nextKeyIn = toNextFreeKey(freeKeySpend);
  // Fill of the bar toward the next key; full once at the cap.
  const keyProgress = nextKeyIn == null ? 1 : 1 - nextKeyIn / FREE_KEY.every;
  // Sub-cent drift from Tebex's own rounding shouldn't render as "you saved $0.00".
  const saved = subtotal - freeValue - total > 0.005 ? subtotal - freeValue - total : 0;

  // A key landing gets its moment: the box flares, the new pips pop, the
  // jingle plays. Only on an increase the buyer caused, not on first load.
  const [celebrating, setCelebrating] = useState(null);
  const prevKeys = useRef(null);
  useEffect(() => {
    const prev = prevKeys.current;
    prevKeys.current = bonusKeys;
    if (prev == null || bonusKeys <= prev) return;
    setCelebrating({ from: prev, gained: bonusKeys - prev });
    freeKeySound();
    const t = setTimeout(() => setCelebrating(null), 1900);
    return () => clearTimeout(t);
  }, [bonusKeys]);
  const hasWelcome = coupons.some((c) => c.code?.toUpperCase() === WELCOME_CODE);

  /**
   * One box for both kinds of code. The shape of what was typed picks the
   * endpoint, and a rejected gift card is retried as a coupon - the guess is
   * only a guess, and an all-numeric promo code shouldn't be turned away.
   */
  async function submitCode(e) {
    e.preventDefault();
    // Card numbers get pasted with the spacing they're printed in; neither
    // endpoint wants that, and no code of either kind contains a space.
    const value = code.trim().replace(/\s+/g, '');
    if (!value || couponBusy) return;
    setCouponBusy(true);
    setCouponError(null);
    const asGiftCard = looksLikeGiftCard(value);
    try {
      await (asGiftCard ? onApplyGiftCard(value) : onApplyCoupon(value));
      setCode('');
    } catch (err) {
      let applied = false;
      if (asGiftCard) {
        try {
          await onApplyCoupon(value);
          setCode('');
          applied = true;
        } catch {
          // Not a coupon either - report the gift card failure below, since
          // that's what the buyer was most likely holding.
        }
      }
      // Tebex's messages are already buyer-readable ("The selected coupon code
      // is invalid."), so surface them rather than inventing our own.
      if (!applied) setCouponError(err.message);
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

  async function dropGiftCard(number) {
    setCouponBusy(true);
    setCouponError(null);
    try {
      await onRemoveGiftCard(number);
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
              // On the Chroma Key line, only the keys the buyer chose count
              // toward its stepper and price; the promo's free ones sit beside.
              const free = item.id === FREE_KEY.packageId ? Math.min(bonusKeys, item.in_basket.quantity) : 0;
              const qty = item.in_basket.quantity - free;
              const unit = item.in_basket.price;
              // A quantity change here moves the spend, so the stepper can
              // shout FREE KEY! when it crosses the next US$10.
              const rewardAt = (q) => freeKeysFor(freeKeySpend + (q - qty) * unit / rate);

              if (free > 0 && qty === 0) {
                return (
                  <div class="cart-item cart-item--free" key={item.id}>
                    {item.image && <img class="cart-item-img" src={item.image} alt="" loading="lazy" />}
                    <div class="cart-item-info">
                      <p class="cart-item-name">{item.name}</p>
                      <p class="cart-item-sub cart-item-sub--free">{free} FREE · FOR EVERY US${FREE_KEY.every} SPENT</p>
                    </div>
                    <div class="cart-item-end">
                      <p class="cart-item-line cart-item-line--free">FREE</p>
                    </div>
                  </div>
                );
              }
              // Basket entries don't carry the catalog flags, so look them up.
              const allowQuantity = !packagesById[item.id]?.disable_quantity;
              // Nor do they say whether the line was added as a subscription.
              // A subscription-only package is self-evident from the catalog;
              // a dual-type one is only knowable from what we sent, hence the
              // remembered ids as well.
              const catalogPkg = packagesById[item.id];
              const recurring = recurringIds.includes(item.id) || catalogPkg?.type === SUBSCRIPTION;
              const every = recurring ? renewalLabel(catalogPkg) : null;

              return (
                <div class="cart-item" key={item.id}>
                  {item.image && <img class="cart-item-img" src={item.image} alt="" loading="lazy" />}
                  <div class="cart-item-info">
                    <p class="cart-item-name">{item.name}</p>
                    {recurring && (
                      <p class="cart-item-sub">
                        {every ? `SUBSCRIPTION: RENEWS ${every.toUpperCase()}` : 'SUBSCRIPTION: RENEWS AUTOMATICALLY'}
                      </p>
                    )}
                    {free > 0 && (
                      <p class="cart-item-sub cart-item-sub--free">+{free} FREE</p>
                    )}
                    {allowQuantity ? (
                      <QuantityStepper
                        value={qty}
                        onChange={(next) => onSetQuantity(item.id, next + free)}
                        disabled={busy}
                        size="sm"
                        label={`${item.name} quantity`}
                        rewardAt={rewardAt}
                        commitDelay={650}
                        max={MAX_QUANTITY - free}
                      />
                    ) : (
                      <p class="cart-item-meta">
                        {qty} × {formatPrice(item.in_basket.price, currency)}
                      </p>
                    )}
                  </div>
                  <div class="cart-item-end">
                    <p class="cart-item-line">{formatPrice(unit * qty, currency)}</p>
                    <button
                      class="cart-item-remove"
                      // Removing the bought keys leaves the free ones in place.
                      onClick={() => (free > 0 ? onSetQuantity(item.id, free) : onRemove(item.id))}
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
            {/* Progress toward the next free key, pips for each earned. */}
            <div class={`cart-keys${celebrating ? ' is-celebrating' : ''}`} aria-live="polite">
              <div class="cart-keys-head">
                <span class="cart-keys-pips" aria-hidden="true">
                  {Array.from({ length: FREE_KEY.max }, (_, i) => (
                    <i key={i} class={[
                      i < bonusKeys && 'is-earned',
                      celebrating && i >= celebrating.from && i < bonusKeys && 'is-new',
                    ].filter(Boolean).join(' ') || undefined} />
                  ))}
                </span>
                <span class="cart-keys-text">
                  {celebrating
                    ? `FREE KEY${celebrating.gained > 1 ? 'S' : ''} EARNED!`
                    : nextKeyIn == null
                      ? `ALL ${FREE_KEY.max} FREE KEYS UNLOCKED`
                      : `${formatPrice(nextKeyIn * shownRate, currency)} MORE FOR ${bonusKeys > 0 ? 'ANOTHER' : 'A'} FREE KEY`}
                </span>
              </div>
              <div class="cart-keys-bar" role="progressbar" aria-label="Progress to next free Chroma Key"
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(keyProgress * 100)}>
                <span style={{ width: `${keyProgress * 100}%` }} />
              </div>
            </div>

            {/* Stays open even with a coupon applied - a gift card can still go
                on top of one. A second *coupon* is refused by the hook, since
                promo codes here are single-use-per-player and don't stack. */}
            <form class="cart-coupon" onSubmit={submitCode}>
              <input
                class="cart-coupon-input"
                type="text"
                value={code}
                onInput={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="PROMO OR GIFT CARD"
                aria-label="Promo code or gift card number"
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

            {giftcards.map((g, i) => (
              <p class="cart-coupon-active" key={g.card_number || i}>
                <span>GIFT CARD {maskCard(g.card_number)}</span>
                <button
                  type="button"
                  onClick={() => dropGiftCard(g.card_number)}
                  disabled={couponBusy || busy}
                  aria-label={`Remove gift card ending ${String(g.card_number).replace(/\D/g, '').slice(-4)}`}
                >
                  ✕
                </button>
              </p>
            ))}

            {coupons.length > 0 && (
              <p class="cart-coupon-note">
                Remove this code to use a different one. Only one promo code applies per order.
                Gift cards can still be added.
              </p>
            )}

            {(saved > 0 || freeValue > 0) && (
              <p class="cart-line">
                <span>SUBTOTAL</span>
                <span>{formatPrice(subtotal, currency)}</span>
              </p>
            )}

            {freeValue > 0 && (
              <p class="cart-line cart-line--free">
                <span>{bonusKeys} FREE CHROMA KEY{bonusKeys > 1 ? 'S' : ''}</span>
                <span>−{formatPrice(freeValue, currency)}</span>
              </p>
            )}

            {saved > 0 && (
              <>
                <p class="cart-line cart-line--save">
                  {/* Both a coupon and a redeemed card land in `total_price`,
                      and nothing in the basket separates them - so name
                      whichever is in play rather than calling it all discount. */}
                  <span>{giftcards.length > 0 ? (coupons.length > 0 ? 'DISCOUNT + GIFT CARD' : 'GIFT CARD') : 'DISCOUNT'}</span>
                  <span>−{formatPrice(saved, currency)}</span>
                </p>
              </>
            )}

            <p class="cart-total">
              <span>TOTAL</span>
              <span>{formatPrice(total, currency)}</span>
            </p>
            <ArcadeButton variant="primary" class="cart-checkout" href={basket.links?.checkout}>
              CHECKOUT
            </ArcadeButton>
          </div>
        )}
      </aside>
    </>
  );
}
