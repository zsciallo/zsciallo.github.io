import { useEffect } from 'preact/hooks';

/**
 * Reveals any element with the `reveal` class as it scrolls into view by
 * toggling `is-visible`. The hidden starting state lives in CSS behind the
 * `html.js` class, so if this never runs the content simply stays visible.
 *
 * Pass `deps` when reveal elements are rendered asynchronously (e.g. after a
 * fetch) so the observer re-scans once they exist.
 */
export function useScrollReveal(deps = []) {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    if (!els.length) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, deps);
}
