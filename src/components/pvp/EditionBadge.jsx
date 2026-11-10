/** JAVA / BEDROCK, the board's edition tag. */
export function EditionBadge({ edition }) {
  const bedrock = edition === 'bedrock';
  return (
    <span class={`pvp-ed pvp-ed--${bedrock ? 'bedrock' : 'java'}`} data-edition={bedrock ? 'bedrock' : 'java'}>
      {bedrock ? 'BEDROCK' : 'JAVA'}
    </span>
  );
}
