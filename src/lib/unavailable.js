const KEY = 'chromabit_unavailable';

/*
 * How long a refusal is trusted.
 *
 * This has to expire. An unavailable package has both its buttons disabled, so
 * a successful add — the only thing that clears an entry — can never happen
 * once one is set. Without a TTL, a Battle Pass owner would be locked out of
 * rebuying it forever instead of just until the four-week limit rolls over.
 * A day is short enough to self-heal and long enough to spare the buyer
 * repeating a failed click all session.
 */
const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Remembers which packages Tebex refused to sell to a given player, learned
 * from real add-to-cart rejections.
 *
 * Keyed by username, because this describes the player rather than the browser:
 * two siblings on one PC must not inherit each other's answers.
 *
 * Shape: { "steve": { ids: [7564223], markedAt: 1699999999999 } }
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
    // Private-mode quota errors are survivable — the buyer just sees the
    // rejection again on their next attempt.
  }
}

/**
 * Normalises whatever is in storage into `{ ids, markedAt }`.
 *
 * Earlier builds stored a bare array, and later `{ ids, probedAt }`; browsers
 * that ran either still hold those shapes. Returning one untouched left `.ids`
 * undefined, which threw in render the moment the catalog arrived and froze the
 * page on the loading message — so anything unrecognised degrades to empty
 * rather than propagating.
 */
function entry(all, username) {
  const raw = all[username.toLowerCase()];
  if (Array.isArray(raw)) return { ids: raw, markedAt: 0 };
  if (raw && Array.isArray(raw.ids)) {
    return { ids: raw.ids, markedAt: raw.markedAt ?? raw.probedAt ?? 0 };
  }
  return { ids: [], markedAt: 0 };
}

/** Package ids currently believed unavailable, or [] once the entry has aged out. */
export function loadUnavailable(username) {
  if (!username) return [];
  const { ids, markedAt } = entry(readAll(), username);
  return Date.now() - markedAt > TTL_MS ? [] : ids;
}

/** Record a refusal seen during a real add. Returns the updated list. */
export function markUnavailable(username, packageId) {
  if (!username) return [];
  const all = readAll();
  const key = username.toLowerCase();
  // Read through loadUnavailable so an expired entry starts fresh instead of
  // having a new id appended to stale ones.
  const ids = loadUnavailable(username);
  all[key] = { ids: [...new Set([...ids, packageId])], markedAt: Date.now() };
  write(all);
  return all[key].ids;
}

/** Forget a refusal after a package adds successfully after all. */
export function unmarkUnavailable(username, packageId) {
  if (!username) return [];
  const all = readAll();
  const key = username.toLowerCase();
  const cur = entry(all, username);
  all[key] = { ids: cur.ids.filter((id) => id !== packageId), markedAt: cur.markedAt };
  write(all);
  return all[key].ids;
}

/** Drop everything known about a player, e.g. straight after a purchase. */
export function clearUnavailable(username) {
  if (!username) return [];
  const all = readAll();
  delete all[username.toLowerCase()];
  write(all);
  return [];
}
