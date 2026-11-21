import { useEffect, useState } from 'preact/hooks';
import { m, useReducedMotion } from 'motion/react';
import { spring } from '../lib/motion';
import { useSound } from '../hooks/useSound';
import { useTheme } from '../hooks/useTheme';
import { click } from '../lib/sound';

const LINKS = [
  { id: 'home', href: '/', label: 'HOME' },
  { id: 'pvp', href: '/pvp/', label: 'PVP' },
  { id: 'store', href: '/store/', label: 'STORE' },
  { id: 'smp', href: '/smp/', label: 'SMP' },
  { id: 'faq', href: '/faq/', label: 'FAQ' },
];

/** One nav link. Hover is tracked here and passed to the underline as an
 *  explicit target - Motion's variant propagation from parent to child does
 *  not fire under preact/compat. The active link's bar draws itself in once
 *  on load (the site is multi-page, so it can't glide between links). */
function NavLink({ link, active, still, onNavigate }) {
  const [hover, setHover] = useState(false);
  return (
    <m.a href={link.href} onClick={onNavigate}
      class={active ? 'active' : undefined}
      aria-current={active ? 'page' : undefined}
      onHoverStart={() => setHover(true)} onHoverEnd={() => setHover(false)}
      whileTap={still ? undefined : { y: 1 }}>
      {link.label}
      <m.span class="nav-bar" aria-hidden="true"
        initial={active ? { scaleX: 0 } : false}
        animate={{ scaleX: active || hover ? 1 : 0 }}
        transition={active ? { ...spring.hover, delay: 0.25 } : spring.hover} />
    </m.a>
  );
}

function Brand({ still }) {
  const [hop, setHop] = useState(0);
  return (
    <m.a class="site-nav-brand" href="/" onHoverStart={() => setHop((n) => n + 1)}>
      {/* Keyed on a counter so every hover replays the hop from the start. */}
      <m.img key={hop} src="/server-icon-old-2.png" alt="" width="30" height="30"
        initial={false}
        animate={hop && !still ? { y: [0, -4, 0], rotate: [0, -8, 0] } : undefined}
        transition={{ duration: 0.35, ease: 'easeOut' }} />
      <span>CHROMABIT</span>
    </m.a>
  );
}

/** Speaker in pixel steps: waves when sound is on, an X when it's muted. */
function SpeakerIcon({ on }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M2 7h3l5-4v14l-5-4H2z" />
      {on ? (
        <>
          <rect x="12" y="8" width="2" height="4" />
          <rect x="15" y="5" width="2" height="2" />
          <rect x="17" y="7" width="2" height="6" />
          <rect x="15" y="13" width="2" height="2" />
        </>
      ) : (
        <>
          <rect x="12" y="7" width="2" height="2" />
          <rect x="14" y="9" width="2" height="2" />
          <rect x="16" y="11" width="2" height="2" />
          <rect x="16" y="7" width="2" height="2" />
          <rect x="12" y="11" width="2" height="2" />
        </>
      )}
    </svg>
  );
}

/** Global sound on/off, remembered per visitor (lib/sound.js). Turning it on
 *  answers with a click so the visitor hears what they just enabled. */
function SoundToggle() {
  const [on, toggle] = useSound();
  return (
    <button type="button" class="sound-toggle" aria-pressed={on}
      aria-label={on ? 'Sound on' : 'Sound off'} title={on ? 'Mute sounds' : 'Turn sounds on'}
      onClick={() => { const wasOn = on; toggle(); if (!wasOn) click(); }}>
      <SpeakerIcon on={on} />
    </button>
  );
}

/** Moon (dark theme) or sun (light theme), in the same pixel steps as the
 *  speaker: the glyph shows the theme the page is in. */
function ThemeIcon({ light }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      {light ? (
        <>
          <rect x="7" y="6" width="6" height="8" />
          <rect x="6" y="7" width="8" height="6" />
          <rect x="9" y="1" width="2" height="3" />
          <rect x="9" y="16" width="2" height="3" />
          <rect x="1" y="9" width="3" height="2" />
          <rect x="16" y="9" width="3" height="2" />
          <rect x="3" y="3" width="2" height="2" />
          <rect x="15" y="3" width="2" height="2" />
          <rect x="3" y="15" width="2" height="2" />
          <rect x="15" y="15" width="2" height="2" />
        </>
      ) : (
        <>
          <rect x="7" y="2" width="6" height="2" />
          <rect x="5" y="4" width="4" height="2" />
          <rect x="3" y="6" width="4" height="8" />
          <rect x="5" y="14" width="4" height="2" />
          <rect x="7" y="16" width="6" height="2" />
          <rect x="13" y="14" width="3" height="2" />
          <rect x="16" y="12" width="2" height="2" />
        </>
      )}
    </svg>
  );
}

/** Dark / light theme switch (lib/theme.js), beside the sound toggle and in
 *  its shell (it carries .sound-toggle for the look; .theme-toggle sets it
 *  apart). */
function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const light = theme === 'light';
  return (
    <button type="button" class="sound-toggle theme-toggle"
      aria-label={light ? 'Switch to dark theme' : 'Switch to light theme'}
      onClick={() => { toggle(); click(); }}>
      <ThemeIcon light={light} />
    </button>
  );
}

/** Sticky site nav. `current` is the id of the page rendering it, passed in
 *  rather than read from location so the server-rendered markup matches. */
export function NavBar({ current = null }) {
  const [open, setOpen] = useState(false);
  const still = useReducedMotion();

  // The panel is a mobile-only layout, so a rotate to landscape (or a desktop
  // resize) has to dismiss it - otherwise it lingers as a stray dropdown.
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
        <Brand still={still} />

        <SoundToggle />
        <ThemeToggle />

        <button type="button" class={`nav-toggle${open ? ' open' : ''}`}
          aria-expanded={open} aria-controls="site-nav-links"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}>
          <span class="nav-toggle-bar" />
          <span class="nav-toggle-bar" />
          <span class="nav-toggle-bar" />
        </button>

        <ul id="site-nav-links" class={`site-nav-links${open ? ' open' : ''}`}>
          {LINKS.map((link, i) => (
            <li key={link.id} style={{ '--i': i }}>
              <NavLink link={link} active={link.id === current} still={still}
                onNavigate={() => setOpen(false)} />
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
