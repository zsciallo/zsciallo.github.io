import { ArcadeButton } from '../ArcadeButton';

/**
 * The PVP | SMP switch at the top of the store. One radio per Tebex mode,
 * labelled with the Tebex name; `active` is a mode key, or null while the
 * first-visit pop-up is still waiting for a pick (nothing is checked then).
 * Same buttons as the category tabs: the checked mode is the primary one.
 */
export function ModeSwitch({ modes, active, onSelect }) {
  return (
    <div class="mode-switch" role="radiogroup" aria-label="Store mode" data-mode-switch>
      {modes.map((m) => (
        <ArcadeButton
          key={m.key}
          type="button"
          role="radio"
          aria-checked={active === m.key}
          class="mode-switch-opt"
          variant={active === m.key ? 'primary' : 'secondary'}
          data-mode={m.key}
          onClick={() => onSelect(m.key)}
        >
          {m.name}
        </ArcadeButton>
      ))}
    </div>
  );
}
