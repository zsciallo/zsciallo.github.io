// Site theme: "dark" (Obsidian, the default) or "light" (Quartz).
//
// The inline head snippet of every page picks the theme before <body> is
// parsed (stored choice, else the OS preference, else dark) and writes it to
// <html data-theme>, so the first paint is already right. This module takes
// over from there: the nav toggle, the stored choice, the `storage` event
// from other tabs, and the <meta name="theme-color"> (the browser chrome).
// The colours live in index.css only; the meta reads the page's --bg.
//
// SSR-safe: nothing touches window or document at import time on the server.

const KEY = 'chromabit:theme';
const listeners = new Set();
const isBrowser = typeof document !== 'undefined';

const valid = (t) => (t === 'light' || t === 'dark' ? t : null);

function stored() {
  try {
    return valid(localStorage.getItem(KEY));
  } catch {
    // Blocked storage (private mode, sandbox): no stored choice.
    return null;
  }
}

function prefersLight() {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  } catch {
    return false;
  }
}

/** The theme the head snippet would pick now. */
function initial() {
  if (!isBrowser) return 'dark';
  return valid(document.documentElement.dataset.theme) || stored() || (prefersLight() ? 'light' : 'dark');
}

let current = initial();

/** Point the browser chrome colour at the page background. Empty while the
 *  stylesheet has not applied yet; the caller retries on load. */
function syncMeta() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (!bg) return false;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
  return true;
}

function apply(theme) {
  current = theme;
  document.documentElement.dataset.theme = theme;
  syncMeta();
  listeners.forEach((fn) => fn(theme));
}

export function getTheme() {
  return current;
}

export function setTheme(theme) {
  const t = valid(theme) || 'dark';
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // Not persisted, but the choice still holds for this page.
  }
  if (isBrowser) apply(t);
  else current = t;
}

export function toggleTheme() {
  setTheme(current === 'light' ? 'dark' : 'light');
}

export function subscribeTheme(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (isBrowser) {
  // The head snippet normally set this already; keep the two in step.
  if (document.documentElement.dataset.theme !== current) document.documentElement.dataset.theme = current;
  if (!syncMeta()) window.addEventListener('load', syncMeta, { once: true });

  // A toggle in another tab applies here too.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    const t = valid(e.newValue);
    if (t && t !== current) apply(t);
  });
}
