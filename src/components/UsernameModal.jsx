import { useState } from 'preact/hooks';
import { isValidName, normalizeName } from '../lib/minecraftName';

/**
 * Asks which edition the buyer plays and for their name.
 *
 * The platform question isn't cosmetic: Java usernames and Bedrock gamertags
 * are different namespaces that share plenty of names, so asking first is the
 * only way to be sure the purchase reaches the right account.
 */
export function UsernameModal({ initial, initialPlatform = 'java', error, busy, onConfirm, onClose }) {
  const [platform, setPlatform] = useState(initialPlatform);
  const [value, setValue] = useState(initial || '');
  const [closing, setClosing] = useState(false);

  const valid = isValidName(value, platform);
  const bedrock = platform === 'bedrock';
  const preview = valid ? normalizeName(value, platform) : null;

  function submit(e) {
    e.preventDefault();
    if (valid && !busy) onConfirm(value.trim(), platform);
  }

  function close() {
    if (busy || closing) return;
    setClosing(true);
    setTimeout(onClose, 200);
  }

  return (
    <div class={`modal-overlay${closing ? ' closing' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <form class="modal-card card" onSubmit={submit}>
        <p class="modal-title">WHERE DO YOU PLAY?</p>

        <div class="platform-toggle" role="radiogroup" aria-label="Minecraft edition">
          <button
            type="button"
            role="radio"
            aria-checked={!bedrock}
            class={`platform-opt${!bedrock ? ' active' : ''}`}
            onClick={() => setPlatform('java')}
            disabled={busy}
          >
            JAVA
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={bedrock}
            class={`platform-opt${bedrock ? ' active' : ''}`}
            onClick={() => setPlatform('bedrock')}
            disabled={busy}
          >
            BEDROCK
          </button>
        </div>

        <p class="modal-sub">
          {bedrock
            ? 'Enter your Xbox gamertag exactly as it appears — spaces are fine, and we add the Geyser dot for you.'
            : 'Enter your Minecraft Java username. Your items are delivered in-game, so this has to match.'}
        </p>

        <input
          class="modal-input"
          type="text"
          value={value}
          onInput={(e) => setValue(e.target.value)}
          placeholder={bedrock ? 'e.g. Toast Enjoyer' : 'e.g. Steve'}
          maxLength={20}
          autocomplete="off"
          spellcheck={false}
          autoFocus
        />

        {/* Bedrock names are rewritten before they reach Tebex, so show the
            result rather than letting it look like the name was mangled. */}
        {bedrock && preview && (
          <p class="modal-preview">Delivering to <strong>{preview}</strong></p>
        )}

        {error && <p class="modal-error">{error}</p>}

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onClick={close} disabled={busy}>CANCEL</button>
          <button type="submit" class="btn btn-primary" disabled={!valid || busy}>
            {busy ? 'REDIRECTING…' : 'CONTINUE'}
          </button>
        </div>
      </form>
    </div>
  );
}
