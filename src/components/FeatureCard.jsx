export function FeatureCard({ icon, title, desc, delay }) {
  return (
    <div class="feature-card reveal" style={delay ? `--reveal-delay:${delay}s` : undefined}>
      <span class="feature-icon">{icon}</span>
      <div class="feature-title">{title}</div>
      <p class="feature-desc">{desc}</p>
    </div>
  );
}
