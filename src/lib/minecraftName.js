/**
 * Java usernames and Bedrock gamertags are separate namespaces that Tebex
 * resolves against Mojang and Xbox Live respectively — and they collide. There
 * is a real Xbox account with the gamertag "Notch" that is a different person
 * from Java Notch, and Tebex will happily resolve either. Nothing in the
 * response says which namespace was used, so the platform has to be known
 * before the name is sent, not guessed from a failure.
 */

/** Strip the Geyser dot and the spaces Tebex removes from gamertags. */
function bareGamertag(raw) {
  return raw.trim().replace(/^\./, '').replace(/\s+/g, '');
}

/**
 * The exact string to send to Tebex.
 *
 * Bedrock players arrive through Geyser, which prefixes their gamertag with a
 * dot and drops spaces — ".Toast Enjoyer" is stored as ".Toastenjoyer". Applying
 * that here means the buyer types their gamertag as they know it.
 */
export function normalizeName(raw, platform) {
  if (platform === 'bedrock') return `.${bareGamertag(raw)}`;
  return raw.trim();
}

/**
 * Loose sanity check only — Tebex is the real validator. Over-strict rules here
 * previously locked out every Bedrock player whose gamertag contained a space,
 * with no error to explain the dead button.
 */
export function isValidName(raw, platform) {
  if (platform === 'bedrock') return /^[A-Za-z0-9_]{3,16}$/.test(bareGamertag(raw));
  return /^[A-Za-z0-9_]{3,16}$/.test(raw.trim());
}

/** Turn a stored Tebex name back into what the buyer typed, for re-editing. */
export function displayName(stored, platform) {
  if (platform === 'bedrock') return (stored || '').replace(/^\./, '');
  return stored || '';
}

/** Infer the platform of an already-saved name, for buyers from before the toggle. */
export function platformOf(stored) {
  return (stored || '').startsWith('.') ? 'bedrock' : 'java';
}
