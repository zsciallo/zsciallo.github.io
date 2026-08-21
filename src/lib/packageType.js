/**
 * Tebex sells a package as a one-off (`single`), as a recurring subscription
 * (`subscription`), or — when the store is configured to let the buyer decide —
 * as `both`.
 *
 * `both` is the case that needs handling here: the add-to-basket endpoint 400s
 * with "Please indicate in the request if the package type is single or
 * subscription" unless the request names which one the buyer picked. So the
 * choice has to be offered in the UI and carried down to the API call. The
 * catalog is the only place that reports it — a basket line doesn't echo back
 * which type it was added as.
 */
export const SINGLE = 'single';
export const SUBSCRIPTION = 'subscription';

/** True when the buyer has to choose, because the package is sold either way. */
export function offersBothTypes(pkg) {
  return pkg?.type === 'both';
}

/**
 * The type to send for a package when the buyer hasn't picked one.
 *
 * A `both` package defaults to the one-time purchase. Defaulting the other way
 * would enrol someone in a recurring charge through a button that only says
 * BUY, so subscribing stays something the buyer opts into.
 */
export function defaultType(pkg) {
  return offersBothTypes(pkg) || !pkg?.type ? SINGLE : pkg.type;
}

/**
 * Normalise a caller's choice against what the package actually supports, so a
 * stale bit of UI state can't send `subscription` for a one-off package (Tebex
 * accepts that silently rather than rejecting it).
 */
export function resolveType(pkg, chosen) {
  if (offersBothTypes(pkg)) return chosen === SUBSCRIPTION ? SUBSCRIPTION : SINGLE;
  return defaultType(pkg);
}

/**
 * Whether a purchase of this type recurs. Used to warn before checkout and to
 * label the line in the cart — a recurring charge should never be a surprise.
 */
export function isRecurring(type) {
  return type === SUBSCRIPTION;
}

/**
 * How often a subscription package renews — "every 4 weeks" — read from the
 * package's own `expiry_period` and never inferred from anything else.
 *
 * Only subscription-only packages carry it; a dual-type (`both`) package
 * reports no period at all, so this returns null and callers fall back to
 * saying the terms are confirmed at checkout rather than guessing a cycle.
 */
export function renewalLabel(pkg) {
  const period = pkg?.expiry_period;
  if (!period?.unit) return null;
  const count = period.count > 0 ? period.count : 1;
  // Tebex sends the unit singular ("week"), so pluralise for counts above one.
  return count === 1 ? `every ${period.unit}` : `every ${count} ${period.unit}s`;
}
