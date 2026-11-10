import { useEffect, useState } from 'preact/hooks';
import { fetchBoards, fetchSeason } from '../lib/pvp';

/** The feed rebuilds every minute, so asking more often would only repeat it. */
export const REFRESH_MS = 60_000;

/**
 * The /pvp/ page's one data source: boards.json and season.json, fetched on
 * mount and again every minute while the tab is visible. A hidden tab stops
 * the clock; coming back fetches at once if a refresh is due.
 *
 * Never throws. `boards` / `season` stay null until a document arrives; a
 * refresh that fails keeps the last good document on screen rather than
 * blanking the board for a minute over one dropped request. `now` moves on
 * every attempt so the season countdown ticks with the refresh.
 */
export function usePvpFeed() {
  const [feed, setFeed] = useState({ boards: null, season: null, loaded: false, now: 0 });

  useEffect(() => {
    let live = true;
    let timer = null;
    let busy = false;
    let last = 0;

    const visible = () => document.visibilityState !== 'hidden';
    const stop = () => {
      clearTimeout(timer);
      timer = null;
    };
    const schedule = (ms) => {
      stop();
      if (live && visible()) timer = setTimeout(load, ms);
    };

    async function load() {
      stop();
      if (busy) return;
      busy = true;
      last = Date.now();
      let boards = null;
      let season = null;
      try {
        [boards, season] = await Promise.all([fetchBoards(), fetchSeason()]);
      } catch {
        // fetchBoards / fetchSeason already resolve to null; this is belt and braces.
      }
      busy = false;
      if (!live) return;
      setFeed((prev) => ({ boards: boards ?? prev.boards, season: season ?? prev.season, loaded: true, now: Date.now() }));
      schedule(REFRESH_MS);
    }

    const onVisibility = () => {
      if (!visible()) return stop();
      if (busy || timer) return;
      const due = REFRESH_MS - (Date.now() - last);
      if (due <= 0) load();
      else schedule(due);
    };

    load();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      live = false;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return feed;
}
