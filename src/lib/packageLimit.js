/**
 * Turns a package's `user_limit` into a short badge label.
 *
 * Tebex enforces these limits at checkout, and the Headless API gives no way to
 * ask what a given player already owns — that needs the server-side API and a
 * secret key. So the best we can do on a static site is warn up front rather
 * than hide packages the buyer may already have.
 *
 * The published OpenAPI types `user_limit` as an integer, but the live API
 * returns an object, so handle both.
 */
/** The numeric cap from a `user_limit`, or 0 when the package is unlimited. */
export function limitCount(userLimit) {
  if (!userLimit) return 0;
  if (typeof userLimit === 'number') return userLimit > 0 ? userLimit : 0;
  return userLimit.limit > 0 ? userLimit.limit : 0;
}

export function limitLabel(userLimit) {
  if (!userLimit) return null;

  if (typeof userLimit === 'number') {
    return userLimit > 0 ? `LIMIT ${userLimit} PER PLAYER` : null;
  }

  const { limit, period_length: length, period_unit: unit } = userLimit;
  if (!limit) return null;

  // No period means the cap is for life, which is how the rank packages are set
  // up — one VIP per account, ever.
  if (!unit) return `LIMIT ${limit} PER PLAYER`;

  // Tebex sends the unit already pluralised ("weekly"), so map to a noun.
  const noun = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[unit] || unit;
  if (!length || length === 1) return `LIMIT ${limit} PER ${noun.toUpperCase()}`;
  return `LIMIT ${limit} PER ${length} ${noun.toUpperCase()}S`;
}
