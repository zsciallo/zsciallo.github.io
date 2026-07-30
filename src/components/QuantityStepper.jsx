import { useState, useEffect } from 'preact/hooks';

export const MAX_QUANTITY = 99;

/**
 * −/+ quantity control with a typable field for larger amounts. Clicks and keys
 * are kept inside the control so it can sit on a clickable package card.
 */
export function QuantityStepper({
  value,
  onChange,
  disabled = false,
  min = 1,
  max = MAX_QUANTITY,
  size = 'md',
  label = 'Quantity',
}) {
  const [draft, setDraft] = useState(String(value));

  // Follow the outside value whenever it changes under us (e.g. a cart update).
  useEffect(() => setDraft(String(value)), [value]);

  function commit(raw) {
    const parsed = parseInt(raw, 10);
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
    setDraft(String(next));
    if (next !== value) onChange(next);
  }

  return (
    <div
      class={`qty-stepper qty-stepper--${size}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        class="qty-btn"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${label.toLowerCase()}`}
      >
        −
      </button>
      <input
        class="qty-input"
        type="text"
        inputMode="numeric"
        value={draft}
        disabled={disabled}
        aria-label={label}
        onInput={(e) => setDraft(e.currentTarget.value.replace(/[^0-9]/g, ''))}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
      <button
        type="button"
        class="qty-btn"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label={`Increase ${label.toLowerCase()}`}
      >
        +
      </button>
    </div>
  );
}
