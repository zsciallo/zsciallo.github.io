/**
 * The PVP | SMP switch at the top of the store. One radio per Tebex mode,
 * labelled with the Tebex name; `active` is a mode key, or null while the
 * first-visit pop-up is still waiting for a pick (nothing is checked then).
 */
export function ModeSwitch({ modes, active, onSelect }) {
  return (
    <div class="platform-toggle mode-switch" role="radiogroup" aria-label="Store mode" data-mode-switch>
      {modes.map((m) => (
        <button
          key={m.key}
          type="button"
          role="radio"
          aria-checked={active === m.key}
          class={`platform-opt${active === m.key ? ' active' : ''}`}
          data-mode={m.key}
          onClick={() => onSelect(m.key)}
        >
          {m.name}
        </button>
      ))}
    </div>
  );
}
