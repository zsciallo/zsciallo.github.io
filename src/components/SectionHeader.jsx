export function SectionHeader({ eyebrow, title, sub }) {
  return (
    <div>
      {eyebrow && <p class="section-eyebrow">{eyebrow}</p>}
      <h2 class="section-title">{title}</h2>
      {sub && <p class="section-sub">{sub}</p>}
    </div>
  );
}
