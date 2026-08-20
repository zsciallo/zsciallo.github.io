// Client for the auction market documents.
//
// Today these are static files under /market/, generated from auctions.db by
// tools/build_market_data.py. When the Auction Tracker plugin ships it serves
// the same document shapes over HTTP, so pointing BASE at the plugin's origin
// is the whole migration - nothing below this line changes.
export const BASE = '/market';

// Item keys are URL-safe by construction, but ':' and '#' are awkward as
// filenames, so the generator flattens them. The plugin will serve the key
// verbatim; this is the one place that difference lives.
export const itemPath = (key) => `${BASE}/items/${key.replace(/:/g, '_').replace(/#/g, '__')}.json`;

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

export const fetchIndex = () => getJson(`${BASE}/index.json`);
export const fetchMeta = () => getJson(`${BASE}/meta.json`);
export const fetchItem = (key) => getJson(itemPath(key));

export const iconUrl = (materialId) => `${BASE}/icons/${materialId.split(':').pop()}.png`;

// ─── formatting ───

const COMPACT = [
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

/** Economy numbers span six orders of magnitude, so lists get compact forms. */
export function money(value, { compact = true } = {}) {
  if (value == null || Number.isNaN(value)) return '—';
  if (!compact) return `$${Math.round(value).toLocaleString('en-US')}`;
  for (const [size, suffix] of COMPACT) {
    if (Math.abs(value) >= size) {
      const scaled = value / size;
      return `$${scaled.toFixed(scaled < 10 ? 1 : 0)}${suffix}`;
    }
  }
  return `$${value < 10 ? value.toFixed(2).replace(/\.?0+$/, '') : Math.round(value).toLocaleString('en-US')}`;
}

export function count(value) {
  if (value == null) return '—';
  return value >= 1e4 ? `${(value / 1e3).toFixed(1)}K` : value.toLocaleString('en-US');
}

export function percent(value) {
  if (value == null) return null;
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

// [upper bound, suffix, divisor] - the divisor is the unit the suffix names,
// so a delta under the bound is reported in that unit.
const UNITS = [
  [3_600_000, 'm', 60_000],
  [86_400_000, 'h', 3_600_000],
];

export function ago(timestamp, now = Date.now()) {
  if (!timestamp) return '—';
  const delta = Math.max(0, now - timestamp);
  if (delta < 60_000) return 'just now';
  for (const [limit, suffix, size] of UNITS) {
    if (delta < limit) return `${Math.floor(delta / size)}${suffix} ago`;
  }
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

export function until(timestamp, now = Date.now()) {
  if (!timestamp) return '—';
  const delta = timestamp - now;
  if (delta <= 0) return 'expired';
  if (delta < 3_600_000) return `${Math.max(1, Math.round(delta / 60_000))}m`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h`;
  return `${Math.round(delta / 86_400_000)}d`;
}

export const shortDate = (timestamp) =>
  new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export const fullDate = (timestamp) =>
  new Date(timestamp).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

/** Sellers arrive as raw UUIDs until the plugin can resolve them against the
 *  server's user cache. A short stable handle beats a 36-character string. */
export const sellerLabel = (uuid) =>
  uuid?.startsWith('00000000-0000-0000-0009')
    ? `Bedrock·${uuid.slice(-4)}`
    : `Player·${uuid?.slice(0, 4) ?? '????'}`;

export const enchantName = (id) =>
  id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const ROMAN = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];

export function roman(n) {
  if (!(n > 0 && n < 40)) return String(n);
  let out = '';
  for (const [value, symbol] of ROMAN) {
    while (n >= value) { out += symbol; n -= value; }
  }
  return out;
}

// ─── list shaping ───

export const SORTS = [
  { id: 'traded', label: 'Most traded', key: (i) => i.salesAll },
  { id: 'volume', label: 'Highest volume', key: (i) => i.volumeAll },
  { id: 'active', label: 'Most listed now', key: (i) => i.activeListings },
  { id: 'movers', label: 'Biggest movers', key: (i) => Math.abs(i.changeWow ?? 0) },
  { id: 'price', label: 'Highest price', key: (i) => i.vwap7d ?? i.lastSale?.price ?? 0 },
  { id: 'recent', label: 'Recently sold', key: (i) => i.lastSale?.at ?? 0 },
];

/** Matches on display name, material and enchantments, so "mending" finds the
 *  book and "pick" finds every pickaxe variant. */
export function matches(item, query) {
  if (!query) return true;
  const haystack = [
    item.name,
    item.materialName,
    item.id,
    ...(item.enchants ?? []).map((e) => `${enchantName(e.id)} ${roman(e.level)}`),
  ].join(' ').toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
}
