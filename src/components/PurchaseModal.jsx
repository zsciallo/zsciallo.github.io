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
          Thanks for supporting ChromaBit{username ? <>, <strong>{username}</strong></> : ''}! Your items
          are delivered in-game within a few minutes — you need to be online to receive them.
        </p>

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
