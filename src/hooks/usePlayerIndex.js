import { useEffect, useState } from 'preact/hooks';
import { fetchPlayers } from '../lib/pvp';

/**
 * players.json, the search index of ranked players, fetched once with the
 * page. Search filters it locally, so it never needs a refresh while the page
 * is open. Null until it arrives, and for good when the feed has none.
 */
export function usePlayerIndex() {
  const [index, setIndex] = useState(null);

  useEffect(() => {
    let live = true;
    fetchPlayers().then((doc) => {
      if (live && doc) setIndex(doc);
    });
    return () => {
      live = false;
    };
  }, []);

  return index;
}
