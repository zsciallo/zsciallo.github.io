import { useState } from 'preact/hooks';
import { SUBSCRIPTION, renewalLabel } from '../lib/packageType';

function formatPrice(amount, currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
}

/**
 * Asks how the buyer wants to pay for a package that's sold both ways.
 *
 * Tebex rejects the add-to-basket outright unless the request says which, so
 * this can't be left implicit — but it also shouldn't clutter every card, which
 * is why it's a popup raised by the buy button rather than a control sitting in
 * the grid.
 *
 * Each option is its own button and commits immediately. The recurring one
 * states the commitment on its face, so nobody starts a subscription off a
 * button that only said BUY.
 */
export function PurchaseTypeModal({ pkg, options, quantity = 1, mode, onChoose, onClose }) {
  const [closing, setClosing] = useState(false);

  function close() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 200);
  }

  return (
    <div
      class={`modal-overlay${closing ? ' closing' : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div class="type-modal card" role="dialog" aria-label={`How to buy ${pkg.name}`}>
        <button class="pkg-modal-close" onClick={close} aria-label="Close">✕</button>

        <p class="type-modal-eyebrow">{pkg.name}</p>
        <h2 class="type-modal-title">HOW DO YOU WANT TO <span class="accent">BUY IT?</span></h2>

        <div class="type-options">
          {options.map((option) => {
            const recurring = option.key === SUBSCRIPTION;
            // Only present when Tebex actually publishes a billing cycle for
            // the package; otherwise the tile stays silent about the interval.
            const every = recurring ? renewalLabel(option.pkg) : null;
            return (
              <button
                key={option.key}
                type="button"
                class={`type-option${recurring ? ' type-option--sub' : ''}`}
                onClick={() => onChoose(option)}
              >
                <span class="type-option-head">
                  <span class="type-option-name">{recurring ? 'SUBSCRIBE' : 'ONE-TIME'}</span>
                  {recurring && option.save > 0 && (
                    <span class="type-option-save">SAVE {option.save}%</span>
                  )}
                </span>
                <span class="type-option-price">
                  {formatPrice(option.price * quantity, option.pkg.currency)}
                  {recurring && (
                    <span class="type-option-per"> {every ? `/ ${every.replace('every ', '')}`.toUpperCase() : '/ RENEWAL'}</span>
                  )}
                </span>
                <span class="type-option-desc">
                  {recurring
                    ? `Renews automatically ${every || ''} until you cancel. Cancel anytime from your Tebex receipt.`.replace('  ', ' ')
                    : 'Pay once. Nothing renews.'}
                </span>
                <span class="type-option-go">
                  {mode === 'buy' ? 'CHECKOUT →' : 'ADD TO CART →'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Any interval shown above comes from the package's own expiry_period —
            never inferred from its purchase limit. Tebex confirms the exact
            dates on its own checkout. */}
        <p class="type-modal-note">Exact billing dates and terms are confirmed at checkout.</p>
      </div>
    </div>
  );
}
