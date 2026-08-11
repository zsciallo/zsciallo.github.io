const KEY = 'chromabit_unavailable';

// How long a probe result is trusted before it's worth re-checking. Ownership
// only changes when the player buys something, and that path invalidates the
// entry directly, so this is just a backstop for limits expiring on their own.
const TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Remembers which packages Tebex won't sell to a given player.
 *
 * Keyed by username, because this describes the player rather than the browser:
 * two siblings on one PC must not inherit each other's answers.
 *
 * Shape: { "steve": { ids: [7564223], probedAt: 1699999999999 } }
 */
function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function write(all) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Private-mode quota errors are survivable — the buyer just gets probed
    // again next visit.
  }
}

/**
 * Normalises whatever is in storage into `{ ids, probedAt }`.
 *
 * An earlier build stored a bare array of ids per player, and browsers that ran
 * it still hold that shape. Returning it untouched left `.ids` undefined, which
 * threw in render the moment the catalog arrived and froze the page on the
 * loading message — so anything unrecognised degrades to an empty entry rather
 * than propagating.
 */
function entry(all, username) {
  const raw = all[username.toLowerCase()];
  if (Array.isArray(raw)) return { ids: raw, probedAt: 0 };
  if (raw && Array.isArray(raw.ids)) return { ids: raw.ids, probedAt: raw.probedAt || 0 };
  return { ids: [], probedAt: 0 };
}

/** Package ids currently believed unavailable to this player. */
export function loadUnavailable(username) {
  if (!username) return [];
  return entry(readAll(), username).ids;
}

/** True when this player has no fresh probe result. */
export function shouldProbe(username) {
  if (!username) return false;
  return Date.now() - entry(readAll(), username).probedAt > TTL_MS;
}

/** Record a refusal seen during a real add. Returns the updated list. */
export function markUnavailable(username, packageId) {
  if (!username) return [];
  const all = readAll();
  const key = username.toLowerCase();
  const cur = entry(all, username);
  all[key] = { ...cur, ids: [...new Set([...cur.ids, packageId])] };
  write(all);
  return all[key].ids;
}

/** Forget a refusal after a package adds successfully after all. */
export function unmarkUnavailable(username, packageId) {
  if (!username) return [];
  const all = readAll();
  const key = username.toLowerCase();
  const cur = entry(all, username);
  all[key] = { ...cur, ids: cur.ids.filter((id) => id !== packageId) };
  write(all);
  return all[key].ids;
}

/**
 * Fold in a probe result.
 *
 * Authoritative for the ids it actually tested and nothing else: those are
 * cleared first, then the confirmed-owned ones re-added. Being able to *clear*
 * matters — an owned package's buttons are disabled, so a successful add can
 * never happen to un-stick it, and a purely additive cache would lock a player
 * out for good once a Battle Pass limit expired.
 */
export function applyProbe(username, testedIds, ownedIds) {
  if (!username) return [];
  const all = readAll();
  const key = username.toLowerCase();
  const next = new Set(entry(all, username).ids);
  testedIds.forEach((id) => next.delete(id));
  ownedIds.forEach((id) => next.add(id));
  all[key] = { ids: [...next], probedAt: Date.now() };
  write(all);
  return all[key].ids;
}

/** Force the next visit to re-probe, e.g. straight after a purchase. */
export function invalidateProbe(username) {
  if (!username) return;
  const all = readAll();
  const key = username.toLowerCase();
  all[key] = { ...entry(all, username), probedAt: 0 };
  write(all);
}
