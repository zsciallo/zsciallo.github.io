// Client for the ChromaPVP ladder feed.
//
// The staff bot builds the documents from the arena database every minute
// (discord-bot repo, pvp_tools/build_pvp_data.py, served by web/server.py as
// /pvp/{season,boards,meta}.json). Unlike the market there is no static copy
// in this repo, so a feed that is down or not deployed yet simply means no
// ladder on the page: every call here resolves to null instead of throwing.
//
// VITE_PVP_BASE overrides the origin at build time. Production builds never set
// it; it exists so a local build can point at a fixture folder for screenshots
// (e.g. VITE_PVP_BASE=/pvp-fixture npm run build).
export const BASE = import.meta.env?.VITE_PVP_BASE || 'https://api.chromabit.us/pvp';

async function getJson(path) {
  try {
    const response = await fetch(`${BASE}${path}`, { cache: 'no-cache', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/** boards.json, or null when the feed is unreachable or not a boards document. */
export async function fetchBoards() {
  const doc = await getJson('/boards.json');
  return doc && Array.isArray(doc.boards) ? doc : null;
}

/** The rows of one board (`overall`, `sword`, ...), [] when it is missing or empty. */
export function boardRows(doc, key) {
  const board = doc?.boards?.find((b) => b?.key === key);
  return Array.isArray(board?.rows) ? board.rows : [];
}

// The seven tiers have colour tokens in index.css (--tier-tin ... --tier-chroma).
const TIERS = new Set(['tin', 'bronze', 'silver', 'gold', 'emerald', 'mithril', 'chroma']);
const HEX = /^#[0-9a-f]{3,8}$/i;

/** CSS colour for a tier: the site's token for a known tier, else the feed's own hex, else null. */
export function tierColour(tier, doc) {
  const name = String(tier ?? '').toLowerCase();
  if (TIERS.has(name)) return `var(--tier-${name})`;
  const colour = doc?.ladder?.tiers?.find((t) => String(t?.name).toLowerCase() === name)?.colour;
  return HEX.test(colour ?? '') ? colour : null;
}

/** "Mithril I", or just "Chroma" for the top tier, which has no division. */
export const tierLabel = (row) => [row?.tier, row?.division].filter(Boolean).join(' ');
