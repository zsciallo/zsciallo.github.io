import { useState } from 'preact/hooks';

/**
 * Asks for the buyer's Minecraft username before checkout — Tebex needs it
 * to attribute the basket and deliver the items in-game.
 */
export function UsernameModal({ initial, error, busy, onConfirm, onClose }) {
  const [value, setValue] = useState(initial || '');
  const valid = /^[A-Za-z0-9_]{3,16}$/.test(value.trim());

  function submit(e) {
    e.preventDefault();
    if (valid && !busy) onConfirm(value.trim());
  }

  return (
    <div class="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form class="modal-card card" onSubmit={submit}>
        <p class="modal-title">MINECRAFT USERNAME</p>
        <p class="modal-sub">Your items are delivered in-game, so we need to know who to send them to.</p>
        <input
          class="modal-input"
          type="text"
          value={value}
          onInput={(e) => setValue(e.target.value)}
          placeholder="e.g. Steve"
          maxLength={16}
          autocomplete="off"
          spellcheck={false}
          autoFocus
        />
        {error && <p class="modal-error">{error}</p>}
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onClick={onClose} disabled={busy}>CANCEL</button>
          <button type="submit" class="btn btn-primary" disabled={!valid || busy}>
            {busy ? 'REDIRECTING…' : 'CONTINUE'}
          </button>
        </div>
      </form>
    </div>
  );
}
