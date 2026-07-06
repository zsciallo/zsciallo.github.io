export function RewardRow({ icon, label }) {
  return (
    <li class="reward-row">
      <div class="reward-icon">{icon}</div>
      <span>{label}</span>
    </li>
  );
}

export function EventCard({ badge, badgeClass, isPink, title, prize, prizeClass, ariaLabel, description, children }) {
  return (
    <article class={`event-card reveal${isPink ? ' pink-card' : ''}`} aria-label={ariaLabel}>
      <span class={`event-badge ${badgeClass}`}>{badge}</span>
      <h3>{title}</h3>
      <div class={`event-prize ${prizeClass}`}>{prize}</div>
      <p>{description}</p>
      <ul>{children}</ul>
    </article>
  );
}
