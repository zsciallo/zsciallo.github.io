import { ladderTiers } from '../../lib/pvp';

/** The seven tiers as bordered rungs in their own colours, lowest first. */
export function TierLadder({ doc }) {
  return (
    <section class="pvp-section reveal" data-tiers aria-labelledby="pvp-tiers-title">
      <p class="section-eyebrow">THE CLIMB</p>
      <h2 class="section-title" id="pvp-tiers-title">SEVEN TIERS</h2>
      <ol class="pvp-ladder">
        {ladderTiers(doc).map((t) => (
          <li key={t.name} class="pvp-rung" data-tier={t.name} style={t.colour ? { color: t.colour } : undefined}>
            <b class="pvp-rung-name">{t.name}</b>
            <span class="pvp-rung-min">{t.minLabel}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
