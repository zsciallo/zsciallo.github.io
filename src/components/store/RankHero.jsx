const HEX = /^#[0-9a-f]{6}$/i;

/** `--rank-a` / `--rank-b` for an element, from a rank's in-game tag gradient. */
export function rankVars(colors) {
  if (!colors || !colors.every((c) => HEX.test(c))) return undefined;
  return `--rank-a:${colors[0]};--rank-b:${colors[1]}`;
}

/**
 * The rank as it looks in game: its tag in the server's own gradient, and its
 * place among the paid ranks. Both come from the generated content, which reads
 * the tag colours out of the server's TAB config.
 */
export function RankHero({ rank }) {
  const current = rank.ladder.findIndex((step) => step.current);
  return (
    <div class="rank-hero">
      <p class="rank-hero-label">IN-GAME TAG</p>
      <p class="rank-tag"><span>{rank.tag}</span></p>
      <ol class="rank-ladder" aria-label="Paid ranks, lowest to highest">
        {rank.ladder.map((step, i) => (
          <li
            key={step.label}
            class={`rank-step${step.current ? ' rank-step--current' : i < current ? ' rank-step--below' : ''}`}
            style={rankVars(step.colors)}
            aria-current={step.current ? 'step' : undefined}
          >
            {step.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
