/** One figure with its label and a line of context under it. Every tab leads
 *  with a row of these, so they live here rather than three times over. */
export function Stat({ label, value, note, tone }) {
  return (
    <div class="stat">
      <p class="stat-label">{label}</p>
      <p class={`stat-value${tone ? ` change ${tone}` : ''}`}>{value}</p>
      {note && <p class="stat-note">{note}</p>}
    </div>
  );
}
