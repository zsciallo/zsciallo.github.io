import config from '../config.json';

export function Footer() {
  return (
    <footer>
      <nav class="footer-nav">
        <a href="/">HOME</a>
        <a href="/smp/">ECONOMY SMP</a>
        <a href="/faq/">FAQ</a>
        <a href="/store/">STORE</a>
        <a href={config.discord} target="_blank" rel="noopener">DISCORD</a>
        <a href="/privacy/">PRIVACY</a>
      </nav>
      &copy; 2026 ChromaBit LLC &nbsp;·&nbsp; play.chromabit.us
    </footer>
  );
}
