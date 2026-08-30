export function Logo() {
    const logoSrc = '/server-icon-old-2.png';
  return (
    <div class="logo-wrap">
        <a href="/" class="logo-link" aria-label="Back to Chromabit SMP home">
            <img class="logo" src={logoSrc} alt="Chromabit SMP" />
          </a>
    </div>
  );
}