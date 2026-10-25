// Client for the store backend on api.chromabit.us (the staff bot's box; see the
// discord-bot repo, store/). It holds the Tebex secret so it can answer the
// things the public Headless API won't: what is on sale, what a player already
// owns, and the free-key promo done with private one-time coupons.
//
// Every call here is best-effort. The store must keep selling with this API
// down - Tebex still enforces every price and limit - so failures resolve to
// null and the UI shows less (no sale badges, no OWNED, no free keys) rather
// than breaking.
const BASE = 'https://api.chromabit.us';
const TIMEOUT_MS = 8000;

async function call(path, options = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * What is on sale right now, plus package meta and the free-key rules.
 * { fetchedAt, sales: { [pkgId]: { amount, percent } }, packages: {...}, freeKeys: { packageId, priceUsd, minimumsUsd, max } }
 */
export const fetchOffers = () => call('/store/offers');

/**
 * What a player already holds, from Tebex's payment history (refunds excluded).
 * { username, known, rank, owned: [pkgId] } - `owned` includes the rank ladder
 * below the highest rank held, so "requires MVP" can be answered for MVP+ holders.
 */
export const fetchPlayer = (username) => (username ? call(`/store/player/${encodeURIComponent(username)}`) : Promise.resolve(null));

/**
 * Bring a basket's free Chroma Keys in line with what it has earned. The backend
 * reads the basket, adds or removes keys, and applies a coupon locked to this
 * basket's player. Returns { keys, max, spendUsd, next: { leftUsd, progress }, rules, basket }
 * with the settled basket, or null if the API is unavailable (then the basket
 * is left exactly as Tebex has it).
 */
export const syncFreeKeys = (ident) => (ident ? call(`/store/basket/${encodeURIComponent(ident)}/freekeys`, { method: 'POST' }) : Promise.resolve(null));
