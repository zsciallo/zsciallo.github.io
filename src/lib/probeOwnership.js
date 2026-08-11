import { createBasket, addToBasket, removeFromBasket } from './tebex';

// Tebex's refusal for a package the player can't buy — in practice, one they
// already own. Kept here alongside the probe that provokes it.
export const NOT_PURCHASABLE = /isn.?t purchasable|not purchasable/i;

/**
 * Works out which capped packages a player already owns.
 *
 * There is no endpoint for this. `/packages?basketIdent=` sounds like it should
 * filter by what the player can buy, but it doesn't — verified against two
 * accounts with known purchases, both of which got the full catalog back. The
 * only thing that distinguishes an owned package is that adding it to a basket
 * fails, so the probe provokes that failure deliberately.
 *
 * Runs against a throwaway basket, never the buyer's own, and removes whatever
 * it successfully added so it doesn't leave a stocked cart behind. Only
 * packages with a `user_limit` are worth probing — nothing else can be
 * exhausted — which keeps this to a handful of requests.
 */
export async function probeOwnership(token, username, packageIds) {
  if (!token || !username || !packageIds.length) return [];

  const basket = await createBasket(token, username);
  const owned = [];
  const added = [];

  for (const id of packageIds) {
    try {
      await addToBasket(basket.ident, id, 1);
      added.push(id);
    } catch (err) {
      if (NOT_PURCHASABLE.test(err.message)) owned.push(id);
      // Any other failure (network, rate limit) is left out of the result
      // rather than guessed at — a wrong "owned" would block a real sale.
    }
  }

  // Best-effort tidy-up; an abandoned basket is harmless if this doesn't land.
  await Promise.all(added.map((id) => removeFromBasket(basket.ident, id).catch(() => {})));

  return owned;
}
