export function FeatureCard({ icon, title, desc }) {
  return (
    <div class="feature-card">
      <span class="feature-icon">{icon}</span>
      <div class="feature-title">{title}</div>
      <p class="feature-desc">{desc}</p>
    </div>
  );
}
