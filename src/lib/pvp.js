// Client for the ChromaPVP ladder feed, and the pure view helpers the /pvp/
// page renders from.
//
// The staff bot builds the documents from the arena database every minute
// (discord-bot repo, pvp_tools/build_pvp_data.py, served by web/server.py as
// /pvp/{season,boards,meta}.json). Unlike the market there is no static copy
// in this repo, so a feed that is down or not deployed yet simply means no
// ladder on the page: every call here resolves to null instead of throwing.
//
// This module has no imports and touches no browser globals at import time, so
// plain Node can load it (test/pvp_lib.test.mjs).
//
// VITE_PVP_BASE overrides the origin at build time. Production builds never set
// it; it exists so a local build can point at a fixture folder for screenshots
// (e.g. VITE_PVP_BASE=/pvp-fixture npm run build).
export const BASE = import.meta.env?.VITE_PVP_BASE || 'https://api.chromabit.us/pvp';

/**
 * One feed document: { status: 'ok', doc } on a JSON answer, { status: 'missing' }
 * on a 404, { status: 'error' } on any other failure (another status, a network
 * error, the 8 s timeout, a body that is not JSON). Never throws.
 */
async function request(path) {
  try {
    const response = await fetch(`${BASE}${path}`, { cache: 'no-cache', signal: AbortSignal.timeout(8000) });
    if (response.status === 404) return { status: 'missing' };
    if (!response.ok) return { status: 'error' };
    return { status: 'ok', doc: await response.json() };
  } catch {
    return { status: 'error' };
  }
}

async function getJson(path) {
  const answer = await request(path);
  return answer.status === 'ok' ? answer.doc : null;
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** boards.json, or null when the feed is unreachable or not a boards document. */
export async function fetchBoards() {
  const doc = await getJson('/boards.json');
  return doc && Array.isArray(doc.boards) ? doc : null;
}

/** season.json, or null when the feed is unreachable or not an object. */
export async function fetchSeason() {
  const doc = await getJson('/season.json');
  return isObject(doc) ? doc : null;
}

/** players.json (the search index), or null when the feed is unreachable or not an index. */
export async function fetchPlayers() {
  const doc = await getJson('/players.json');
  return isObject(doc) && Array.isArray(doc.players) ? doc : null;
}

/**
 * One player's profile: { status: 'ok', doc }, { status: 'missing' } (not
 * ranked this season: a 404, or a key that is not valid, which is never
 * requested), or { status: 'error' } (the feed failed). Never throws.
 */
export async function fetchPlayer(key) {
  if (!isValidPlayerKey(key)) return { status: 'missing' };
  const answer = await request(`/players/${key}.json`);
  if (answer.status !== 'ok') return answer;
  return isObject(answer.doc) ? answer : { status: 'error' };
}

/** The rows of one board (`overall`, `sword`, ...), [] when it is missing or empty. */
export function boardRows(doc, key) {
  const board = feedBoard(doc, key);
  return Array.isArray(board?.rows) ? board.rows : [];
}

// ------------------------------------------------------------- the ladder --

/**
 * The ladder as the feed ships it (pvp_tools/ladder.json in the discord-bot
 * repo). The page prerenders from this and swaps in `doc.ladder.tiers` once
 * boards.json answers, so a ladder change shows up without a site build.
 * Keep it in step with the --tier-* tokens in index.css.
 */
export const LADDER = Object.freeze([
  { name: 'Tin', min: 0, colour: '#8A8F98' },
  { name: 'Bronze', min: 1350, colour: '#CD7F32' },
  { name: 'Silver', min: 1500, colour: '#C0C0C0' },
  { name: 'Gold', min: 1600, colour: '#FFD700' },
  { name: 'Emerald', min: 1700, colour: '#50C878' },
  { name: 'Mithril', min: 1800, colour: '#FF77E9' },
  { name: 'Chroma', min: 1950, colour: '#B24BF3' },
]);

const HEX = /^#[0-9a-f]{3,8}$/i;
const hexOrNull = (colour) => (typeof colour === 'string' && HEX.test(colour) ? colour : null);

/**
 * The tier rungs to show: the feed's ladder when it has a usable one, else
 * LADDER. Each is { name, min, minLabel, colour }; the lowest tier reads START.
 */
export function ladderTiers(doc) {
  const feed = doc?.ladder?.tiers;
  const usable = Array.isArray(feed) && feed.length > 0 && feed.every((t) => typeof t?.name === 'string' && Number.isFinite(t?.min));
  const tiers = usable ? feed : LADDER;
  return tiers.map((t, i) => ({
    name: t.name,
    min: t.min,
    minLabel: i === 0 ? 'START' : String(t.min),
    colour: hexOrNull(t.colour),
  }));
}

// The seven tiers have colour tokens in index.css (--tier-tin ... --tier-chroma).
const TIERS = new Set(['tin', 'bronze', 'silver', 'gold', 'emerald', 'mithril', 'chroma']);

/** CSS colour for a tier: the site's token for a known tier, else the feed's own hex, else null. */
export function tierColour(tier, doc) {
  const name = String(tier ?? '').toLowerCase();
  if (TIERS.has(name)) return `var(--tier-${name})`;
  return ladderHex(doc, name);
}

/** The ladder's hex for a tier name (case-insensitive), or null. */
function ladderHex(doc, name) {
  const tiers = doc?.ladder?.tiers;
  if (!Array.isArray(tiers)) return null;
  const want = String(name ?? '').toLowerCase();
  return hexOrNull(tiers.find((t) => String(t?.name).toLowerCase() === want)?.colour);
}

/** "Mithril I", or just "Chroma" for the top tier, which has no division. */
export const tierLabel = (row) => [row?.tier, row?.division].filter(Boolean).join(' ');

// ------------------------------------------------------------- the boards --

/** What the page shows before (or without) the feed: the six boards of season 1. */
const DEFAULT_BOARDS = [
  { key: 'overall', label: 'Overall' },
  { key: 'sword', label: 'Sword' },
  { key: 'mace', label: 'Mace' },
  { key: 'axe', label: 'Axe', soon: true },
  { key: 'chaos', label: 'Chaos', soon: true },
  { key: 'tournament', label: 'Tournament Wins' },
];

const tabOf = (board) => {
  const soon = board.soon === true;
  return { key: board.key, label: `${String(board.label ?? board.key).toUpperCase()}${soon ? ' · SOON' : ''}`, soon };
};

/** The board tabs, in feed order; the six defaults when the feed has none. */
export function tabList(doc) {
  const boards = isObject(doc) && Array.isArray(doc.boards) ? doc.boards : [];
  const tabs = boards.filter((b) => isObject(b) && typeof b.key === 'string').map(tabOf);
  return tabs.length ? tabs : DEFAULT_BOARDS.map(tabOf);
}

/** `requested` when it names a live (not soon) tab, else 'overall'. */
export function selectBoardKey(doc, requested) {
  return tabList(doc).some((t) => t.key === requested && !t.soon) ? requested : 'overall';
}

/**
 * The query string the address bar should carry for `requested`: '' for the
 * default board (and so for any unknown or soon request), else '?board=<key>'.
 * The page replaces the URL with it on load, so a bad ?board= does not linger.
 */
export function boardQuery(doc, requested) {
  const key = selectBoardKey(doc, requested);
  return key === 'overall' ? '' : `?board=${encodeURIComponent(key)}`;
}

/** The built-in ladder's hex for a tier name (case-insensitive), or null. */
export function builtinTierColour(name) {
  const want = String(name ?? '').toLowerCase();
  return LADDER.find((t) => t.name.toLowerCase() === want)?.colour ?? null;
}

function feedBoard(doc, key) {
  const boards = isObject(doc) && Array.isArray(doc.boards) ? doc.boards : [];
  return boards.find((b) => isObject(b) && b.key === key) ?? null;
}

const RATING_COLUMNS = ['#', 'PLAYER', 'TIER', 'RATING', 'W - L', 'WIN %'];
const COUNT_COLUMNS = ['#', 'PLAYER', 'TOURNAMENTS WON'];

/** One feed row as the table shows it. */
function rowView(row, kind, doc) {
  const edition = row.edition === 'bedrock' ? 'bedrock' : 'java';
  const uuid = typeof row.uuid === 'string' && row.uuid ? row.uuid : null;
  const base = {
    rank: row.rank,
    name: row.name,
    edition,
    // Bedrock skins need a different lookup; the page shows its default head.
    headUrl: edition === 'java' && uuid ? `https://mc-heads.net/avatar/${encodeURIComponent(uuid)}/32` : null,
    top: [1, 2, 3].includes(row.rank) ? row.rank : null,
  };
  if (kind === 'count') return { ...base, tier: null, rating: null, record: null, winPct: null, value: row.value };
  const wins = Number(row.wins) || 0;
  const losses = Number(row.losses) || 0;
  const games = wins + losses;
  return {
    ...base,
    tier: row.tier ? { label: tierLabel(row), colour: ladderHex(doc, row.tier) } : null,
    rating: row.rating,
    record: `${wins} - ${losses}`,
    winPct: `${games ? Math.round((100 * wins) / games) : 0}%`,
    value: null,
  };
}

/** Everything the table needs for one board; empty rows when the feed lacks it. */
export function boardView(doc, key) {
  const tab = tabList(doc).find((t) => t.key === key);
  const board = feedBoard(doc, key);
  const kind = board ? (board.kind === 'count' ? 'count' : 'rating') : key === 'tournament' ? 'count' : 'rating';
  const rows = Array.isArray(board?.rows) ? board.rows.filter(isObject).map((row) => rowView(row, kind, doc)) : [];
  return {
    key,
    label: tab ? tab.label : String(key).toUpperCase(),
    kind,
    soon: tab ? tab.soon : false,
    columns: [...(kind === 'count' ? COUNT_COLUMNS : RATING_COLUMNS)],
    rows,
  };
}

// ------------------------------------------------------------- the season --

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** { name, endsIn } for the season strip, or null without a season. */
export function seasonView(season, now) {
  if (!isObject(season) || season.id == null) return null;
  const at = now instanceof Date ? now.getTime() : Number(now);
  const end = typeof season.endsAt === 'string' ? Date.parse(season.endsAt) : NaN;
  const left = end - at;
  let endsIn = null;
  if (Number.isFinite(left) && left > 0) {
    const d = Math.floor(left / DAY);
    const h = Math.floor((left % DAY) / HOUR);
    const m = Math.floor((left % HOUR) / MINUTE);
    endsIn = d >= 1 ? `${d}d ${h}h` : h >= 1 ? `${h}h ${m}m` : `${m}m`;
  }
  return { name: season.name ?? '', endsIn };
}

// ------------------------------------------------- players and profiles --
//
// The feed also publishes players.json (one entry per ranked player: key,
// name, edition, bestTier, bestDivision) for the search box, and
// players/<key>.json per player for /pvp/player/?name=<key>. The key is the
// server's: playerKey() mirrors it, but the index's own key wins when the
// server had to tell two names apart.

/** The server's key for a name: lower case, a leading '.' as 'b-', anything else outside [a-z0-9_] as '-'. */
export function playerKey(name) {
  if (typeof name !== 'string') return '';
  const lower = name.toLowerCase();
  const bedrock = lower.startsWith('.');
  return (bedrock ? 'b-' : '') + (bedrock ? lower.slice(1) : lower).replace(/[^a-z0-9_]/g, '-');
}

const KEY = /^[a-z0-9_-]{1,40}$/;

/** True for a string that can be a profile key; nothing else is ever requested. */
export const isValidPlayerKey = (s) => typeof s === 'string' && KEY.test(s);

/** The profile page of a key. */
export const profileHref = (key) => `/pvp/player/?name=${key}`;

const indexPlayers = (index) => (isObject(index) && Array.isArray(index.players) ? index.players.filter(isObject) : []);

/** A board row's profile link: the index key for that exact name, else the derived key. */
export function rowHref(row, index) {
  const hit = indexPlayers(index).find((p) => p.name === row?.name);
  return profileHref(hit && typeof hit.key === 'string' ? hit.key : playerKey(row?.name));
}

/** A name for matching: no leading '.', lower case. */
const fold = (name) => name.replace(/^\./, '').toLowerCase();

const indexTierLabel = (p) => (p.bestTier ? tierLabel({ tier: p.bestTier, division: p.bestDivision }) : 'UNPLACED');

/**
 * Index players whose name contains the query (no leading '.', any case):
 * names that start with it first, then the rest, each group alphabetical.
 */
export function searchPlayers(index, query, limit = 8) {
  const q = fold(String(query ?? '').trim());
  if (!q) return [];
  const hits = indexPlayers(index)
    .filter((p) => typeof p.name === 'string' && fold(p.name).includes(q))
    .map((p) => ({ p, folded: fold(p.name), prefix: fold(p.name).startsWith(q) }));
  hits.sort((a, b) => (a.prefix !== b.prefix ? (a.prefix ? -1 : 1) : a.folded < b.folded ? -1 : a.folded > b.folded ? 1 : 0));
  return hits.slice(0, limit).map(({ p }) => ({
    key: p.key,
    name: p.name,
    edition: p.edition === 'bedrock' ? 'bedrock' : 'java',
    href: profileHref(p.key),
    tierLabel: indexTierLabel(p),
  }));
}

/** 1234567 -> '1,234,567'. */
export function formatCount(n) {
  return String(Math.trunc(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** '1 win' / '2 wins'. */
const count = (n, one, many, format = String) => `${format(n ?? 0)} ${n === 1 ? one : many}`;

const RESULTS = { win: 'WIN', loss: 'LOSS', draw: 'DRAW' };

/** The size the profile asks mc-heads for (the masthead shows it at 64 CSS px or less). */
const PROFILE_HEAD_PX = 128;

/**
 * Everything the profile page shows for one players/<key>.json, or null for a
 * document that is not an object. `ladder` is boards.json's `ladder` (or
 * { tiers: LADDER }); tier colours are its hex values only. An unplaced kit
 * shows its placement progress and its record, never a rating, tier, peak or rank.
 */
export function profileView(doc, ladder) {
  if (!isObject(doc)) return null;
  const colourOf = (tier) => ladderHex({ ladder }, tier);
  const edition = doc.edition === 'bedrock' ? 'bedrock' : 'java';
  const uuid = typeof doc.uuid === 'string' && doc.uuid ? doc.uuid : null;
  const best = isObject(doc.best)
    ? { label: tierLabel(doc.best), colour: colourOf(doc.best.tier), overallRank: doc.best.overallRank }
    : null;

  const kitDocs = Array.isArray(doc.kits) ? doc.kits.filter(isObject) : [];
  const kits = kitDocs.map((k) => {
    const record = `${count(k.wins, 'win', 'wins')}, ${count(k.losses, 'loss', 'losses')}`;
    if (k.placed !== true) {
      return { key: k.key, label: k.label, placed: false, tier: null, lines: [`Placing ${k.games ?? 0}/${k.placementMatches ?? 0}`, record] };
    }
    return {
      key: k.key,
      label: k.label,
      placed: true,
      tier: k.tier ? { label: tierLabel(k), colour: colourOf(k.tier) } : null,
      lines: [`Rating ${k.rating}`, `Peak ${k.peak}`, record, `Win streak ${k.streak ?? 0}`, `#${k.rank}`],
    };
  });

  const c = isObject(doc.career) ? doc.career : {};
  const career = {
    lines: [
      count(c.kills, 'kill', 'kills', formatCount),
      count(c.deaths, 'death', 'deaths', formatCount),
      `Best streak ${formatCount(c.bestStreak)}`,
      count(c.tournamentWins, 'tournament won', 'tournaments won', formatCount),
    ],
  };

  const kitLabel = (key) => kitDocs.find((k) => k.key === key)?.label ?? String(key ?? '');
  const recent = (Array.isArray(doc.recent) ? doc.recent.filter(isObject) : []).map((r) => {
    const opp = isObject(r.opponent) ? r.opponent : {};
    const change = r.ratingChange;
    return {
      result: RESULTS[r.result] ?? 'DRAW',
      kit: kitLabel(r.kit),
      opponent: {
        name: typeof opp.name === 'string' && opp.name ? opp.name : 'Unknown player',
        edition: opp.edition === 'bedrock' ? 'bedrock' : 'java',
        href: isValidPlayerKey(opp.key) ? profileHref(opp.key) : null,
      },
      rating: typeof change !== 'number' ? '' : change > 0 ? `+${change}` : String(change),
    };
  });

  return {
    name: doc.name,
    edition,
    headUrl: edition === 'java' && uuid ? `https://mc-heads.net/avatar/${encodeURIComponent(uuid)}/${PROFILE_HEAD_PX}` : null,
    best,
    kits,
    career,
    recent,
    empty: recent.length === 0,
  };
}
