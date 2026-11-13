import { useEffect, useRef } from 'preact/hooks';

export const MODE_PROMPT_TITLE = 'WHICH MODE ARE YOU SHOPPING FOR?';

/**
 * First-visit question: which mode the buyer is shopping for. One button per
 * Tebex mode, and picking one is the only way out: no close control, Escape
 * and a backdrop click do nothing, and focus stays on the options (Tab and
 * Shift+Tab cycle through them, focus that lands outside is pulled back).
 */
export function ModePrompt({ modes, onPick }) {
  const box = useRef(null);

  useEffect(() => {
    const options = () => [...box.current.querySelectorAll('[data-mode-option]')];
    options()[0].focus();
    function onKeyDown(e) {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      const list = options();
      const at = list.indexOf(document.activeElement);
      list[(Math.max(at, 0) + (e.shiftKey ? list.length - 1 : 1)) % list.length].focus();
    }
    function onFocusIn(e) {
      if (!box.current.contains(e.target)) options()[0].focus();
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);

  return (
    // A press on the dimmed backdrop would otherwise drop focus to the page.
    <div class="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}>
      <div
        ref={box}
        class="mode-modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mode-prompt-title"
        data-mode-prompt
      >
        <h2 id="mode-prompt-title" class="type-modal-title">{MODE_PROMPT_TITLE}</h2>
        <div class="type-options">
          {modes.map((m) => (
            <button key={m.key} type="button" class="type-option mode-option" data-mode-option={m.key} onClick={() => onPick(m.key)}>
              <span class="type-option-name">{m.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
