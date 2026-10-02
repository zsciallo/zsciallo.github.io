// What each store package actually grants in game.
//
// src/data/storeContent.json is generated from the mc-server repo's main branch
// by the Tebex-Update tool - never edit it by hand, a regeneration overwrites
// it. It exists because Tebex descriptions are typed into a web panel and drift
// from the server config, and nothing in Tebex's API can write them. The store
// renders this instead of the Tebex description, keyed by Tebex package id.
import content from '../data/storeContent.json';
import { iconUrl } from './market';

/** Generated content for a package, or null to fall back to its Tebex description. */
export const contentFor = (pkg) => content.packages[String(pkg.id)] ?? null;

// Icon references are "mc:<material>" for a vanilla sprite (the same vendored
// set the auction pages use) or "custom:<path>" for a texture copied out of the
// server's resource pack into public/store/icons/.
export function iconSrc(ref) {
  if (!ref) return null;
  if (ref.startsWith('mc:')) return iconUrl(ref.slice(3));
  if (ref.startsWith('custom:')) return `/store/icons/${ref.slice(7)}.png`;
  return null;
}
