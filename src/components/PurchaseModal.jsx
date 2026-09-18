import { useState } from 'preact/hooks';

/**
 * Shown when the buyer lands back on the store from Tebex with
 * `?checkout=complete`. Replaces the old inline banner, which sat above the
 * fold and was easy to scroll straight past.
 */
export function PurchaseModal({ serverIP, username, onClose }) {
  const [closing, setClosing] = useState(false);
  const [copied, setCopied] = useState(false);

  function close() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 200);
  }

  function copyIP() {
    navigator.clipboard?.writeText(serverIP).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {
        // Clipboard is blocked in some embedded browsers; the IP is on screen
        // anyway, so there's nothing to recover from.
      },
    );
  }

  return (
    <div
      class={`modal-overlay${closing ? ' closing' : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div class="modal-card card purchase-modal" role="alertdialog" aria-labelledby="purchase-title">
        <div class="purchase-check" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>

        <p class="modal-title" id="purchase-title">PURCHASE COMPLETE</p>
        <p class="modal-sub">
          Thanks for supporting Chromabit{username ? <>, <strong>{username}</strong></> : ''}! Your items
          are delivered in-game within a few minutes. You need to be online to receive them.
        </p>

        {/* The one way a paid order can strand itself. Delivery is queued
            against the name on the order and waits for that name to log in, so
            a player who renames before collecting is never matched again and
            the commands sit as due forever - it takes a manual re-queue on the
            Tebex side to recover. Nothing on this site can prevent it once the
            payment is through; saying so here is the whole defence. */}
        {username && (
          <p class="modal-note">
            Log in as <strong>{username}</strong> to collect before you change your
            Minecraft name - delivery waits for this name, and a rename in between
            leaves the order stuck.
          </p>
        )}

        <button class="purchase-ip" onClick={copyIP} title="Copy server IP">
          <span class="ip-label">SERVER IP</span>
          <span class="ip-value">{serverIP}</span>
          <span class="purchase-ip-copy">{copied ? 'COPIED' : 'COPY'}</span>
        </button>

        <div class="modal-actions">
          <button type="button" class="btn btn-primary" onClick={close}>DONE</button>
        </div>
      </div>
    </div>
  );
}
