import config from '../config.json';

// PostHog is loaded lazily so it stays out of the main bundle and never blocks
// first paint. Events fired before it lands are queued here and replayed once
// it does — the store funnel starts on mount, well before the network settles.
let posthog = null;
const queue = [];

// This module is imported by page components, which ssg.js renders through
// Vite's SSR loader. Nothing may touch `window` at import time.
const isBrowser = typeof window !== 'undefined';

export function initAnalytics() {
  if (!isBrowser || posthog || !config.posthogKey) return;

  import('posthog-js')
    .then(({ default: ph }) => {
      ph.init(config.posthogKey, {
        api_host: config.posthogHost || 'https://us.i.posthog.com',
        // Nothing here ever calls identify() — the Minecraft username is
        // deliberately never sent — so profiles for anonymous visitors would
        // cost more per event and buy nothing. Funnels work fine without them.
        person_profiles: 'identified_only',
        capture_pageview: true,
        // Deliberately off. Minecraft skews heavily under-13, and screen
        // recording a child-directed site is the highest-risk thing this SDK
        // can do. The funnel events carry the diagnostics instead.
        disable_session_recording: true,
      });
      posthog = ph;
      for (const [event, props] of queue) ph.capture(event, props);
      queue.length = 0;
    })
    .catch(() => {
      // Ad blockers take out PostHog routinely. Losing analytics must never
      // take the store down with it.
    });
}

/** Record a funnel event. Safe to call during SSR and before PostHog loads. */
export function capture(event, props) {
  if (!isBrowser || !config.posthogKey) return;
  if (posthog) posthog.capture(event, props);
  else queue.push([event, props]);
}
