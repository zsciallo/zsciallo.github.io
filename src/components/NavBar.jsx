import { useEffect, useState } from 'preact/hooks';

const LINKS = [
  { id: 'home', href: '/', label: 'HOME' },
  { id: 'store', href: '/store/', label: 'STORE' },
  { id: 'auctions', href: '/auctions/', label: 'AUCTIONS' },
];

/** Sticky site nav. `current` is the id of the page rendering it, passed in
 *  rather than read from location so the server-rendered markup matches. */
export function NavBar({ current = null }) {
  const [open, setOpen] = useState(false);

  // The panel is a mobile-only layout, so a rotate to landscape (or a desktop
  // resize) has to dismiss it — otherwise it lingers as a stray dropdown.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const mq = window.matchMedia('(min-width: 701px)');
    const onWide = (e) => e.matches && setOpen(false);
    window.addEventListener('keydown', onKey);
    mq.addEventListener('change', onWide);
    return () => {
      window.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', onWide);
    };
  }, [open]);

  return (
    <header class="site-nav">
      <nav class="site-nav-inner" aria-label="Primary">
        <a class="site-nav-brand" href="/">
          <img src="/server-icon-old-2.png" alt="" width="30" height="30" />
          <span>CHROMABIT</span>
        </a>

        <button type="button" class={`nav-toggle${open ? ' open' : ''}`}
          aria-expanded={open} aria-controls="site-nav-links"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}>
          <span class="nav-toggle-bar" />
          <span class="nav-toggle-bar" />
          <span class="nav-toggle-bar" />
        </button>

        <ul id="site-nav-links" class={`site-nav-links${open ? ' open' : ''}`}>
          {LINKS.map((link) => (
            <li key={link.id}>
              <a href={link.href} onClick={() => setOpen(false)}
                class={link.id === current ? 'active' : undefined}
                aria-current={link.id === current ? 'page' : undefined}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
