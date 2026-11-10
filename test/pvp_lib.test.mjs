#!/usr/bin/env node
// Unit tests for the pure PVP view helpers in src/lib/pvp.js (run U4).
//
//   node test/pvp_lib.test.mjs          (no build, no npm, no browser needed)
//
// Prints `PASS <name>` / `FAIL <name>: <why>` per case, then `RESULT: PASS n checks`
// or `RESULT: FAIL k of n`, and exits 0 or 1 (same format as test/check_site.mjs).
//
// REQUIREMENT on src/lib/pvp.js: it must stay importable by plain Node, outside
// Vite: no JSX, no extensionless or bare imports Node cannot resolve (ideally no
// imports at all), nothing that touches window/document at import time, and
// `import.meta.env` read defensively (`import.meta.env?.VITE_PVP_BASE`).
//
// THE INTERFACE (the contract for the implementer; extra fields are allowed,
// the named ones must be exactly as below):
//
// tabList(doc) -> [{ key, label, soon }]
//   doc with a non-empty `boards` array: one entry per board that has a string
//   `key`, in feed order. soon = (board.soon === true). label =
//   (board.label ?? key).toUpperCase(), plus ' · SOON' (space, U+00B7, space)
//   when soon. So the live feed gives OVERALL, SWORD, MACE, AXE · SOON,
//   CHAOS · SOON, TOURNAMENT WINS.
//   doc null / undefined / not an object / no boards array / empty boards ->
//   the six defaults, in this order: overall OVERALL, sword SWORD, mace MACE,
//   axe 'AXE · SOON' (soon), chaos 'CHAOS · SOON' (soon), tournament
//   'TOURNAMENT WINS'. (This is what the prerendered page shows.)
//
// selectBoardKey(doc, requested) -> string
//   `requested` when tabList(doc) has a tab with exactly that key (case
//   sensitive) that is not soon; otherwise 'overall' (unknown, soon, null,
//   undefined, '').
//
// boardView(doc, key) -> { key, label, kind, soon, columns, rows }
//   key: as passed. label/soon: from tabList(doc)'s tab with that key; for a
//   key with no tab, label = String(key).toUpperCase() and soon = false.
//   kind: 'count' when the feed board has kind 'count', 'rating' for any other
//   feed board; with no feed board: 'count' for 'tournament', else 'rating'.
//   columns: rating -> ['#', 'PLAYER', 'TIER', 'RATING', 'W - L', 'WIN %'],
//            count  -> ['#', 'PLAYER', 'TOURNAMENTS WON'].
//   rows: the feed board's rows in feed order (non-object entries skipped);
//   [] when the doc, the board or its rows array is missing. Each row:
//     rank     row.rank
//     name     row.name as given (raw: never escaped, '.' prefix kept)
//     edition  'bedrock' when row.edition === 'bedrock', else 'java'
//     headUrl  java with a non-empty string uuid:
//              'https://mc-heads.net/avatar/' + encodeURIComponent(uuid) + '/32';
//              otherwise null (Bedrock always null; the component shows the default head)
//     top      row.rank when it is 1, 2 or 3; otherwise null
//     rating rows: tier    { label: 'Gold II' | 'Chroma' (tier + ' ' + division,
//                            or just tier when division is null), colour } or
//                          null when row.tier is missing;
//                          colour = the `colour` of doc.ladder.tiers whose name
//                          equals row.tier case-insensitively, only if it
//                          matches /^#[0-9a-f]{3,8}$/i; else null (also when
//                          the ladder is missing). Never a CSS var().
//                  rating  row.rating
//                  record  `${wins} - ${losses}` (missing counts as 0): '41 - 16'
//                  winPct  Math.round(100 * wins / (wins + losses)) + '%';
//                          0 games -> '0%'
//                  value   null
//     count rows:  value   row.value; tier, rating, record, winPct all null
//   Pure: never mutates `doc` (tests pass deep-frozen input).
//
// seasonView(season, now) -> null | { name, endsIn }
//   null when season is null / not an object / season.id is null or missing.
//   name: season.name as given ('' when missing).
//   now: epoch milliseconds (a Date is accepted too).
//   endsIn: null when endsAt is missing / unparsable / not after now. Else, with
//   the remaining time floored to whole units:
//     >= 1 day   -> `${d}d ${h}h`     e.g. '12d 4h', '1d 0h'
//     >= 1 hour  -> `${h}h ${m}m`     e.g. '3h 20m', '1h 0m'
//     otherwise  -> `${m}m`           e.g. '45m', '0m' (under a minute left)
//
// boardQuery(doc, requested) -> string   (U4 review F6)
//   The query string the address bar should carry after load, so the page can
//   history.replaceState a bad `?board=` away. With key = selectBoardKey(doc,
//   requested): '' when key is 'overall' (the default, and so also for unknown,
//   soon, null, undefined or '' requests); otherwise
//   '?board=' + encodeURIComponent(key), e.g. '?board=sword'.
//   Pure: never mutates `doc`.
//
// ---- U7: player search and the profile page (all pure, all exported) ----
// Fixtures: test/fixtures/pvp/players.json (the index) and
// test/fixtures/pvp/players/<key>.json (one profile each). All strings below
// are compared exactly (case-sensitive, ASCII hyphen-minus, no extra spaces).
//
// playerKey(name) -> string   (the server's key rule, mirrored)
//   name lowercased; then a leading '.' becomes the prefix 'b-'; then every
//   character outside [a-z0-9_] becomes '-'. Only the first character counts
//   as "leading": '..x' -> 'b--x'. A non-string (null, undefined, 5) -> ''.
//   'Sample_01' -> 'sample_01', '.Sample_02' -> 'b-sample_02',
//   '<img src=x onerror=alert(1)>' -> '-img-src-x-onerror-alert-1--'.
//
// isValidPlayerKey(s) -> boolean
//   true exactly when s is a string matching /^[a-z0-9_-]{1,40}$/ (no
//   trailing newline, no upper case, 1 to 40 characters).
//
// profileHref(key) -> '/pvp/player/?name=' + key   (tests pass valid keys only)
//
// rowHref(row, index) -> string
//   profileHref(k) where k is the `key` of the first index.players entry whose
//   `name` equals row.name exactly; when there is none (index null/undefined,
//   no players array, name absent) k = playerKey(row.name).
//
// searchPlayers(index, query, limit = 8) -> [{ key, name, edition, href, tierLabel }]
//   q = String(query ?? '') trimmed, a leading '.' removed, lower-cased. q ''
//   -> []. A player matches when its name, with a leading '.' removed and
//   lower-cased, contains q. Order: names that START with q first, then the
//   rest; inside each group alphabetical by that folded name (the tests only
//   use names where localeCompare and plain < agree). At most `limit` entries.
//   index null / not an object / players not an array -> []; non-object
//   entries and entries without a string name are skipped.
//   Each entry: key (the index key), name (raw, '.' kept, never escaped),
//   edition ('bedrock' when 'bedrock', else 'java'), href = profileHref(key),
//   tierLabel = 'Mithril I' / 'Chroma' (bestTier + ' ' + bestDivision, or just
//   bestTier when bestDivision is null), or 'UNPLACED' when bestTier is null.
//
// formatCount(n) -> string   thousands commas: 0 '0', 999 '999', 1000 '1,000',
//   1234567 '1,234,567'.
//
// profileView(doc, ladder) -> null | {
//     name, edition, headUrl, best, kits, career, recent, empty }
//   doc null / undefined / not an object -> null.
//   `ladder` is the `ladder` object of boards.json ({ tiers: [{name, min,
//   colour}] }); null/undefined -> every colour is null. A colour is the hex of
//   the ladder tier whose name matches case-insensitively, only when it matches
//   /^#[0-9a-f]{3,8}$/i, else null (never a CSS var()), as in boardView.
//   name     doc.name raw ('.' kept, never escaped)
//   edition  'bedrock' when doc.edition === 'bedrock', else 'java'
//   headUrl  java with a non-empty string uuid: 'https://mc-heads.net/avatar/'
//            + encodeURIComponent(uuid) + '/' + <a size in px, digits>; else null
//   best     doc.best null -> null; else { label: tierLabel (as above, from
//            best.tier/best.division), colour, overallRank: best.overallRank }
//   kits     one per doc.kits entry, in order (non-objects skipped; kits
//            missing -> []): { key, label, placed, tier, lines }
//            placed === true -> placed: true, tier { label, colour }, lines
//              ['Rating <rating>', 'Peak <peak>', '<wins> wins, <losses> losses',
//               'Win streak <streak>', '#<rank>']      e.g. 'Rating 1987', '#3'
//            otherwise -> placed: false, tier null, lines
//              ['Placing <games>/<placementMatches>', '<wins> wins, <losses> losses']
//              and nothing else, even when the entry carries rating/peak/rank.
//            Kit numbers are printed as given (no thousands comma).
//   career   { lines: ['<kills> kills', '<deaths> deaths', 'Best streak <bestStreak>',
//            '<n> tournaments won' | '1 tournament won'] }, every number via
//            formatCount. (The singular rule is spec'd for tournaments only;
//            the tests never use 1 kill / 1 death / 1 win / 1 loss.)
//   recent   one per doc.recent entry, in order (recent missing -> []):
//            { result: 'WIN' | 'LOSS' | 'DRAW', kit: the label of the doc.kits
//              entry with that key, opponent: { name: opponent.name, or
//              'Unknown player' when it is null; edition ('bedrock' when
//              'bedrock', else 'java'); href: profileHref(opponent.key), or
//              null when the key is null }, rating: '+11' | '-13' | '0', or ''
//              when ratingChange is null }
//            U8 (defence in depth for the hidden placement rating): rating is
//            also '' whenever the doc.kits entry with that row's kit key is not
//            placed === true (unplaced, placed missing or not the boolean true,
//            or no such kit entry), even when ratingChange is a number.
//   U8 singulars: '1 win', '1 loss' in kit lines (placed and unplaced) and
//            '1 kill', '1 death' in career lines; 0 and 2+ stay plural.
//   empty    recent.length === 0
//   Pure: never mutates its input (tests pass deep-frozen docs).

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'pvp', 'boards.json'), 'utf-8'));

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${detail}`}`);
}
const q = JSON.stringify;

/** Deep structural equality for JSON-like values. */
function same(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
}

/** `got` has every key of `want` with an equal value (extra keys allowed). */
function hasFields(got, want) {
  return !!got && typeof got === 'object' && Object.entries(want).every(([k, v]) => same(got[k], v));
}
const pick = (got, want) => (got && typeof got === 'object' ? Object.fromEntries(Object.keys(want).map((k) => [k, got[k]])) : got);

/** Run one case; a throw (e.g. "boardView is not a function") is a failure, not a crash. */
function test(name, fn) {
  try {
    const r = fn();
    if (r === true) check(name, true);
    else check(name, false, typeof r === 'string' ? r : `returned ${q(r)}`);
  } catch (e) {
    check(name, false, `threw ${e?.message ?? e}`);
  }
}

/** Assert `got` equals `want` exactly. */
const eq = (got, want) => (same(got, want) ? true : `got ${q(got)}, want ${q(want)}`);
/** Assert `got` has the fields of `want`. */
const fields = (got, want) => (hasFields(got, want) ? true : `got ${q(pick(got, want))}, want ${q(want)}`);

function deepFreeze(o) {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const frozen = () => deepFreeze(clone(FIXTURE));

const RATING_COLUMNS = ['#', 'PLAYER', 'TIER', 'RATING', 'W - L', 'WIN %'];
const COUNT_COLUMNS = ['#', 'PLAYER', 'TOURNAMENTS WON'];
const DEFAULT_TABS = [
  { key: 'overall', label: 'OVERALL', soon: false },
  { key: 'sword', label: 'SWORD', soon: false },
  { key: 'mace', label: 'MACE', soon: false },
  { key: 'axe', label: 'AXE · SOON', soon: true },
  { key: 'chaos', label: 'CHAOS · SOON', soon: true },
  { key: 'tournament', label: 'TOURNAMENT WINS', soon: false },
];
const tabFields = (tabs) => (Array.isArray(tabs) ? tabs.map((t) => ({ key: t?.key, label: t?.label, soon: t?.soon })) : tabs);

// ------------------------------------------------------------------ import --

let lib = {};
try {
  // PVP_LIB (a path) swaps in another module; only for validating these tests against a reference.
  lib = await import(pathToFileURL(process.env.PVP_LIB ? resolve(process.env.PVP_LIB) : join(ROOT, 'src', 'lib', 'pvp.js')).href);
  check('src/lib/pvp.js imports in plain Node', true);
} catch (e) {
  check('src/lib/pvp.js imports in plain Node', false, `${e?.message ?? e} (no JSX, no imports Node cannot resolve, import.meta.env?. only)`);
}
const { boardView, selectBoardKey, seasonView, tabList } = lib;
for (const [name, fn] of Object.entries({ boardView, selectBoardKey, seasonView, tabList }))
  check(`exports ${name}()`, typeof fn === 'function', `typeof ${name} is ${typeof fn}`);
// U3's helpers stay (ModeCards uses them).
for (const name of ['fetchBoards', 'boardRows', 'tierColour', 'tierLabel'])
  check(`still exports ${name}()`, typeof lib[name] === 'function', `typeof ${name} is ${typeof lib[name]}`);

// ----------------------------------------------------------------- tabList --

test('tabList: live feed, feed order, labels and soon', () => eq(tabFields(tabList(frozen())), DEFAULT_TABS));
test('tabList: null doc -> the six defaults', () => eq(tabFields(tabList(null)), DEFAULT_TABS));
test('tabList: undefined doc -> the six defaults', () => eq(tabFields(tabList(undefined)), DEFAULT_TABS));
test('tabList: doc without boards -> the six defaults', () => eq(tabFields(tabList({ generatedAt: 'x' })), DEFAULT_TABS));
test('tabList: empty boards -> the six defaults', () => eq(tabFields(tabList({ boards: [] })), DEFAULT_TABS));
test('tabList: a non-object doc -> the six defaults', () => eq(tabFields(tabList('oops')), DEFAULT_TABS));
test('tabList: feed order wins over the default order', () =>
  eq(
    tabFields(tabList({ boards: [{ key: 'tournament', label: 'Tournament Wins', kind: 'count', rows: [] }, { key: 'overall', label: 'Overall', rows: [] }] })),
    [
      { key: 'tournament', label: 'TOURNAMENT WINS', soon: false },
      { key: 'overall', label: 'OVERALL', soon: false },
    ],
  ));
test('tabList: label falls back to the key, soon only when === true', () =>
  eq(tabFields(tabList({ boards: [{ key: 'bow', rows: [] }, { key: 'axe', label: 'Axe', soon: 'yes', rows: [] }, { label: 'no key' }, null] })), [
    { key: 'bow', label: 'BOW', soon: false },
    { key: 'axe', label: 'AXE', soon: false },
  ]));
test('tabList: SOON separator is space, U+00B7, space', () => {
  const axe = (tabList(frozen()) ?? []).find((t) => t.key === 'axe');
  return eq(axe && [...axe.label].map((c) => c.codePointAt(0).toString(16)), [...'AXE · SOON'].map((c) => c.codePointAt(0).toString(16)));
});

// ---------------------------------------------------------- selectBoardKey --

test('selectBoardKey: valid keys are kept', () => eq(['overall', 'sword', 'mace', 'tournament'].map((k) => selectBoardKey(frozen(), k)), ['overall', 'sword', 'mace', 'tournament']));
test('selectBoardKey: soon keys fall back to overall', () => eq(['axe', 'chaos'].map((k) => selectBoardKey(frozen(), k)), ['overall', 'overall']));
test('selectBoardKey: unknown, empty, null, undefined fall back to overall', () =>
  eq(['nope', '', null, undefined, 'SWORD', ' sword', 'constructor', '__proto__'].map((k) => selectBoardKey(frozen(), k)), Array(8).fill('overall')));
test('selectBoardKey: feed down uses the default tabs', () =>
  eq(['sword', 'tournament', 'axe', 'nope'].map((k) => selectBoardKey(null, k)), ['sword', 'tournament', 'overall', 'overall']));
test('selectBoardKey: a key the feed does not have falls back', () => eq(selectBoardKey({ boards: [{ key: 'overall', rows: [] }] }, 'sword'), 'overall'));

// -------------------------------------------------------------- boardQuery --
// U4 review F6: a bad ?board= (unknown or soon) is replaced away on load.

const { boardQuery } = lib;
check('exports boardQuery()', typeof boardQuery === 'function', `typeof boardQuery is ${typeof boardQuery}`);
test('boardQuery: valid non-default keys -> ?board=<key>', () =>
  eq(['sword', 'mace', 'tournament'].map((k) => boardQuery(frozen(), k)), ['?board=sword', '?board=mace', '?board=tournament']));
test('boardQuery: overall (the default) -> ""', () => eq(boardQuery(frozen(), 'overall'), ''));
test('boardQuery: soon keys -> ""', () => eq(['axe', 'chaos'].map((k) => boardQuery(frozen(), k)), ['', '']));
test('boardQuery: unknown, wrong case, empty, null, undefined -> ""', () =>
  eq(['nope', 'SWORD', ' sword', '', null, undefined, '__proto__'].map((k) => boardQuery(frozen(), k)), Array(7).fill('')));
test('boardQuery: feed down uses the default tabs', () =>
  eq(['sword', 'tournament', 'axe', 'nope'].map((k) => boardQuery(null, k)), ['?board=sword', '?board=tournament', '', '']));
test('boardQuery: a key the feed does not have -> ""', () => eq(boardQuery({ boards: [{ key: 'overall', rows: [] }] }, 'sword'), ''));
test('boardQuery: the key is URL-encoded', () => eq(boardQuery({ boards: [{ key: 'overall', rows: [] }, { key: 'a&b c', rows: [] }] }, 'a&b c'), '?board=a%26b%20c'));
test('boardQuery: agrees with selectBoardKey on every request', () => {
  const doc = frozen();
  const bad = ['overall', 'sword', 'mace', 'axe', 'chaos', 'tournament', 'nope', '', null].filter((k) => {
    const key = selectBoardKey(doc, k);
    return boardQuery(doc, k) !== (key === 'overall' ? '' : `?board=${key}`);
  });
  return bad.length === 0 || `disagrees for ${q(bad)}`;
});

// --------------------------------------------------------------- boardView --

const OVERALL_EXPECT = [
  // rank, name, edition, uuid, tier label, colour, rating, record, winPct
  [1, 'Sample_01', 'java', '00000000-0000-4000-8000-000000000001', 'Chroma', '#B24BF3', 1987, '40 - 12', '77%'],
  [2, '.Sample_02', 'bedrock', null, 'Mithril I', '#FF77E9', 1912, '33 - 15', '69%'],
  [3, 'Sample_03', 'java', '00000000-0000-4000-8000-000000000003', 'Mithril II', '#FF77E9', 1861, '29 - 18', '62%'],
  [4, '<img src=x onerror=alert(1)>', 'java', '00000000-0000-4000-8000-000000000004', 'Emerald II', '#50C878', 1745, '20 - 20', '50%'],
  [5, '.Sample_05', 'bedrock', null, 'Gold II', '#FFD700', 1640, '41 - 16', '72%'],
  [6, 'Sample_06', 'java', '00000000-0000-4000-8000-000000000006', 'Gold II', '#FFD700', 1640, '10 - 30', '25%'],
  [7, 'Sample_07', 'java', '00000000-0000-4000-8000-000000000007', 'Silver III', '#C0C0C0', 1520, '1 - 7', '13%'],
  [8, 'Sample_08', 'java', '00000000-0000-4000-8000-000000000008', 'Bronze II', '#CD7F32', 1400, '0 - 0', '0%'],
  [9, '.Sample_09', 'bedrock', null, 'Tin I', '#8A8F98', 1200, '5 - 9', '36%'],
].map(([rank, name, edition, uuid, label, colour, rating, record, winPct]) => ({
  rank,
  name,
  edition,
  headUrl: uuid ? `https://mc-heads.net/avatar/${uuid}/32` : null,
  tier: { label, colour },
  rating,
  record,
  winPct,
  value: null,
  top: rank <= 3 ? rank : null,
}));

test('boardView overall: header fields', () =>
  fields(boardView(frozen(), 'overall'), { key: 'overall', label: 'OVERALL', kind: 'rating', soon: false, columns: RATING_COLUMNS }));
OVERALL_EXPECT.forEach((want, i) => {
  test(`boardView overall row ${i + 1} (${want.name})`, () => fields(boardView(frozen(), 'overall')?.rows?.[i], want));
});
test('boardView overall: row count and order', () => eq(boardView(frozen(), 'overall')?.rows?.map((r) => r.name), OVERALL_EXPECT.map((r) => r.name)));
test('boardView: a rating tie keeps feed order and ranks', () =>
  eq(boardView(frozen(), 'overall')?.rows?.slice(4, 6).map((r) => [r.rank, r.name, r.rating]), [[5, '.Sample_05', 1640], [6, 'Sample_06', 1640]]));
test('boardView: hostile name is returned raw (escaping is the renderer\'s job)', () => eq(boardView(frozen(), 'overall')?.rows?.[3]?.name, '<img src=x onerror=alert(1)>'));

test('boardView sword: header fields', () =>
  fields(boardView(frozen(), 'sword'), { key: 'sword', label: 'SWORD', kind: 'rating', soon: false, columns: RATING_COLUMNS }));
test('boardView sword: rows', () =>
  eq(boardView(frozen(), 'sword')?.rows?.map((r) => [r.rank, r.name, r.tier?.label, r.record, r.winPct, r.top]), [
    [1, '.Sample_02', 'Mithril I', '21 - 9', '70%', 1],
    [2, 'Sample_06', 'Gold II', '10 - 30', '25%', 2],
  ]));
test('boardView mace', () => eq(boardView(frozen(), 'mace')?.rows?.map((r) => [r.rank, r.name, r.edition, r.top]), [[1, 'Sample_03', 'java', 1]]));
test('boardView soon board: soon, label, no rows', () =>
  fields(boardView(frozen(), 'axe'), { key: 'axe', label: 'AXE · SOON', kind: 'rating', soon: true, columns: RATING_COLUMNS, rows: [] }));

test('boardView tournament: count board header', () =>
  fields(boardView(frozen(), 'tournament'), { key: 'tournament', label: 'TOURNAMENT WINS', kind: 'count', soon: false, columns: COUNT_COLUMNS }));
test('boardView tournament: count rows', () =>
  eq(
    boardView(frozen(), 'tournament')?.rows?.map((r) => pick(r, { rank: 0, name: 0, edition: 0, headUrl: 0, value: 0, top: 0, tier: 0, rating: 0, record: 0, winPct: 0 })),
    [
      { rank: 1, name: 'Sample_01', edition: 'java', headUrl: 'https://mc-heads.net/avatar/00000000-0000-4000-8000-000000000001/32', value: 3, top: 1, tier: null, rating: null, record: null, winPct: null },
      { rank: 2, name: '.Sample_09', edition: 'bedrock', headUrl: null, value: 1, top: 2, tier: null, rating: null, record: null, winPct: null },
    ],
  ));

// edge cases
const one = (row, extra = {}) => ({ boards: [{ key: 'overall', label: 'Overall', kind: 'rating', rows: [row] }], ...extra });
const LADDER = { ladder: clone(FIXTURE.ladder) };
test('boardView: 0 games -> 0% and "0 - 0"', () =>
  fields(boardView(deepFreeze(one({ rank: 1, name: 'A', edition: 'java', uuid: 'u', rating: 1000, tier: 'Tin', division: 'III', wins: 0, losses: 0 }, LADDER)), 'overall')?.rows?.[0], {
    record: '0 - 0',
    winPct: '0%',
  }));
test('boardView: missing wins/losses count as 0', () =>
  fields(boardView(deepFreeze(one({ rank: 1, name: 'A', edition: 'java', uuid: 'u', rating: 1000, tier: 'Tin', division: 'III', losses: 3 }, LADDER)), 'overall')?.rows?.[0], {
    record: '0 - 3',
    winPct: '0%',
  }));
test('boardView: win % rounds half up (1 of 8 -> 13%), 2 of 3 -> 67%, all wins -> 100%', () =>
  eq(
    [
      [1, 7],
      [2, 1],
      [5, 0],
    ].map(([wins, losses]) => boardView(one({ rank: 4, name: 'A', edition: 'java', uuid: null, rating: 1, tier: 'Tin', division: 'I', wins, losses }), 'overall')?.rows?.[0]?.winPct),
    ['13%', '67%', '100%'],
  ));
test('boardView: missing ladder -> tier colour null, label kept', () =>
  fields(boardView(deepFreeze(one({ rank: 1, name: 'A', edition: 'java', uuid: 'u', rating: 1700, tier: 'Gold', division: 'II', wins: 1, losses: 1 })), 'overall')?.rows?.[0], {
    tier: { label: 'Gold II', colour: null },
  }));
test('boardView: tier matched case-insensitively against the ladder', () =>
  fields(boardView(deepFreeze(one({ rank: 1, name: 'A', edition: 'java', uuid: 'u', rating: 1700, tier: 'gold', division: null, wins: 1, losses: 1 }, LADDER)), 'overall')?.rows?.[0], {
    tier: { label: 'gold', colour: '#FFD700' },
  }));
test('boardView: a ladder colour that is not a hex is dropped', () =>
  fields(
    boardView(
      deepFreeze(one({ rank: 1, name: 'A', edition: 'java', uuid: 'u', rating: 1700, tier: 'Gold', division: 'I', wins: 1, losses: 0 }, { ladder: { tiers: [{ name: 'Gold', min: 1600, colour: 'red;background:url(x)' }] } })),
      'overall',
    )?.rows?.[0],
    { tier: { label: 'Gold I', colour: null } },
  ));
test('boardView: tier not in the ladder -> colour null', () =>
  fields(boardView(deepFreeze(one({ rank: 1, name: 'A', edition: 'java', uuid: 'u', rating: 1, tier: 'Diamond', division: 'I', wins: 1, losses: 0 }, LADDER)), 'overall')?.rows?.[0], {
    tier: { label: 'Diamond I', colour: null },
  }));
test('boardView: a rating row without a tier -> tier null', () =>
  fields(boardView(deepFreeze(one({ rank: 1, name: 'A', edition: 'java', uuid: 'u', rating: 1, wins: 1, losses: 0 }, LADDER)), 'overall')?.rows?.[0], { tier: null }));
test('boardView: unknown edition counts as java; java without uuid has no head url', () =>
  fields(boardView(deepFreeze(one({ rank: 1, name: 'A', edition: 'pc', uuid: null, rating: 1, tier: 'Tin', division: 'I', wins: 0, losses: 0 })), 'overall')?.rows?.[0], {
    edition: 'java',
    headUrl: null,
  }));
test('boardView: Bedrock never gets a head url, even with a uuid', () =>
  fields(boardView(deepFreeze(one({ rank: 1, name: '.B', edition: 'bedrock', uuid: '00000000-0000-0000-0009-01f0aabbccdd', rating: 1, tier: 'Tin', division: 'I', wins: 0, losses: 0 })), 'overall')?.rows?.[0], {
    name: '.B',
    edition: 'bedrock',
    headUrl: null,
  }));
test('boardView: the uuid is URL-encoded into one path segment', () =>
  fields(boardView(deepFreeze(one({ rank: 1, name: 'A', edition: 'java', uuid: '../x?y', rating: 1, tier: 'Tin', division: 'I', wins: 0, losses: 0 })), 'overall')?.rows?.[0], {
    headUrl: 'https://mc-heads.net/avatar/..%2Fx%3Fy/32',
  }));
test('boardView: top is 1..3 by rank, else null', () =>
  eq(
    boardView({ boards: [{ key: 'overall', rows: [3, 4, 1, 2, 10].map((rank) => ({ rank, name: `P${rank}`, edition: 'java', uuid: null, rating: 1, tier: 'Tin', division: 'I', wins: 0, losses: 0 })) }] }, 'overall')?.rows?.map((r) => r.top),
    [3, null, 1, 2, null],
  ));
test('boardView: non-object rows are skipped', () =>
  eq(boardView({ boards: [{ key: 'overall', rows: [null, 'x', { rank: 1, name: 'A', edition: 'java', uuid: null, rating: 1, tier: 'Tin', division: 'I', wins: 0, losses: 0 }] }] }, 'overall')?.rows?.map((r) => r.name), ['A']));

// feed down / missing pieces: safe empty views
test('boardView: doc null, overall -> empty rating view', () =>
  fields(boardView(null, 'overall'), { key: 'overall', label: 'OVERALL', kind: 'rating', soon: false, columns: RATING_COLUMNS, rows: [] }));
test('boardView: doc null, tournament -> empty count view', () =>
  fields(boardView(null, 'tournament'), { key: 'tournament', label: 'TOURNAMENT WINS', kind: 'count', soon: false, columns: COUNT_COLUMNS, rows: [] }));
test('boardView: doc null, axe -> soon, empty', () => fields(boardView(null, 'axe'), { key: 'axe', label: 'AXE · SOON', soon: true, rows: [] }));
test('boardView: doc undefined -> empty', () => fields(boardView(undefined, 'sword'), { key: 'sword', rows: [] }));
test('boardView: board missing from the feed -> empty', () => fields(boardView({ boards: [{ key: 'overall', rows: [] }] }, 'mace'), { key: 'mace', label: 'MACE', rows: [] }));
test('boardView: board with rows not an array -> empty', () => fields(boardView({ boards: [{ key: 'overall', rows: 'x' }] }, 'overall'), { rows: [] }));
test('boardView: board with no rows key -> empty', () => fields(boardView({ boards: [{ key: 'overall' }] }, 'overall'), { rows: [] }));
test('boardView: empty rows -> empty', () => fields(boardView({ boards: [{ key: 'overall', kind: 'rating', rows: [] }] }, 'overall'), { rows: [], kind: 'rating' }));
test('boardView: unknown key -> label from the key, empty, not soon', () =>
  fields(boardView(frozen(), 'nope'), { key: 'nope', label: 'NOPE', soon: false, rows: [] }));
test('boardView: feed kind wins over the key (a count board named overall)', () =>
  fields(boardView({ boards: [{ key: 'overall', kind: 'count', rows: [] }] }, 'overall'), { kind: 'count', columns: COUNT_COLUMNS }));
test('boardView: does not mutate the doc (deep-frozen input, no throw) and equal input gives equal output', () => {
  const a = boardView(frozen(), 'overall');
  const b = boardView(frozen(), 'overall');
  return same(a, b) || `two calls differ: ${q(a)} vs ${q(b)}`;
});

// -------------------------------------------------------------- seasonView --

const SEASON = { id: 1, name: 'Season 1', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-12-01T00:00:00.000Z', state: 'ACTIVE' };
const END = Date.parse(SEASON.endsAt);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const at = (ms) => seasonView(deepFreeze(clone(SEASON)), END - ms);

test('seasonView: { id: null } -> null', () => eq(seasonView({ id: null }, END - DAY), null));
test('seasonView: no id -> null', () => eq(seasonView({ name: 'x', endsAt: SEASON.endsAt }, END - DAY), null));
test('seasonView: null / undefined / non-object -> null', () => eq([null, undefined, 'x', 5].map((s) => seasonView(s, END - DAY)), [null, null, null, null]));
test('seasonView: 12d 4h', () => fields(at(12 * DAY + 4 * HOUR + 30 * MIN), { name: 'Season 1', endsIn: '12d 4h' }));
test('seasonView: exactly one day -> 1d 0h', () => fields(at(DAY), { endsIn: '1d 0h' }));
test('seasonView: 3h 20m', () => fields(at(3 * HOUR + 20 * MIN + 59_000), { endsIn: '3h 20m' }));
test('seasonView: exactly one hour -> 1h 0m', () => fields(at(HOUR), { endsIn: '1h 0m' }));
test('seasonView: 45m', () => fields(at(45 * MIN + 30_000), { endsIn: '45m' }));
test('seasonView: under a minute -> 0m', () => fields(at(59_000), { endsIn: '0m' }));
test('seasonView: just under a day -> 23h 59m', () => fields(at(DAY - 1), { endsIn: '23h 59m' }));
test('seasonView: ends exactly now -> endsIn null, name kept', () => fields(at(0), { name: 'Season 1', endsIn: null }));
test('seasonView: ended -> endsIn null, name kept', () => fields(at(-5 * DAY), { name: 'Season 1', endsIn: null }));
test('seasonView: endsAt missing or unparsable -> endsIn null', () =>
  eq([undefined, null, 'soon'].map((endsAt) => seasonView({ ...SEASON, endsAt }, END - DAY)?.endsIn), [null, null, null]));
test('seasonView: a Date for now works like epoch ms', () => fields(seasonView(SEASON, new Date(END - 2 * HOUR)), { endsIn: '2h 0m' }));
test('seasonView: missing name -> ""', () => fields(seasonView({ id: 2, endsAt: SEASON.endsAt }, END - MIN), { name: '', endsIn: '1m' }));
test('seasonView: far future (fixture 2099) has the day shape', () => {
  const v = seasonView(JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'pvp', 'season.json'), 'utf-8')), Date.parse('2026-11-10T00:00:00Z'));
  return (v && /^\d+d \d{1,2}h$/.test(v.endsIn ?? '') && v.name === 'Season 1') || `got ${q(v)}`;
});

// ====================================================================== U7 ==
// Player search and the profile page. Interface at the top of this file.

const fixtureJson = (...parts) => JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'pvp', ...parts), 'utf-8'));
const INDEX = fixtureJson('players.json');
const PROFILE = (key) => deepFreeze(fixtureJson('players', `${key}.json`));
const index = () => deepFreeze(clone(INDEX));
const LADDER_DOC = () => deepFreeze(clone(FIXTURE.ladder));
const HOSTILE = '<img src=x onerror=alert(1)>';
const HOSTILE_KEY = '-img-src-x-onerror-alert-1--';
const href = (key) => `/pvp/player/?name=${key}`;

const { playerKey, isValidPlayerKey, profileHref, rowHref, searchPlayers, profileView, formatCount } = lib;
for (const [name, fn] of Object.entries({ playerKey, isValidPlayerKey, profileHref, rowHref, searchPlayers, profileView, formatCount }))
  check(`exports ${name}()`, typeof fn === 'function', `typeof ${name} is ${typeof fn}`);

// --------------------------------------------------------------- playerKey --

test('playerKey: Java names lowercased', () => eq(['Sample_01', 'sample_01', 'ABC_def_9'].map((n) => playerKey(n)), ['sample_01', 'sample_01', 'abc_def_9']));
test('playerKey: a leading "." becomes the prefix b-', () => eq(['.Sample_02', '.x'].map((n) => playerKey(n)), ['b-sample_02', 'b-x']));
test('playerKey: a 16-char Bedrock name with its dot', () => eq(playerKey('.Sample_16_chars'), 'b-sample_16_chars'));
test('playerKey: characters outside [a-z0-9_] become "-"', () => eq(['a b', 'a.b', 'a-b', 'é', 'x!y?z'].map((n) => playerKey(n)), ['a-b', 'a-b', 'a-b', '-', 'x-y-z']));
test('playerKey: only the first "." is the Bedrock prefix', () => eq(['..x', 'a.', 'x.y'].map((n) => playerKey(n)), ['b--x', 'a-', 'x-y']));
test('playerKey: hostile name folds to a safe key', () => eq(playerKey(HOSTILE), HOSTILE_KEY));
test('playerKey: non-strings -> ""', () => eq([null, undefined, 5].map((n) => playerKey(n)), ['', '', '']));
test('playerKey: agrees with every fixture index key except the disambiguated Sample_06', () => {
  const bad = INDEX.players.filter((p) => p.name !== 'Sample_06' && playerKey(p.name) !== p.key).map((p) => [p.name, p.key, playerKey(p.name)]);
  return bad.length === 0 || `disagrees: ${q(bad)}`;
});

// -------------------------------------------------------- isValidPlayerKey --

test('isValidPlayerKey: valid keys', () =>
  eq(['sample_01', 'b-sample_02', HOSTILE_KEY, 'a', 'a'.repeat(40), '0', '_', '-'].map((k) => isValidPlayerKey(k)), Array(8).fill(true)));
test('isValidPlayerKey: invalid keys', () =>
  eq(['', 'a'.repeat(41), 'Sample_01', 'a b', 'a/b', '../boards', 'a.b', 'abc\n', '%2e', 'é', 'a?b', 'a#b'].map((k) => isValidPlayerKey(k)), Array(12).fill(false)));
test('isValidPlayerKey: non-strings -> false', () => eq([null, undefined, 5, ['a'], { toString: () => 'a' }].map((k) => isValidPlayerKey(k)), Array(5).fill(false)));

// ------------------------------------------------------ profileHref, rowHref --

test('profileHref', () => eq(['sample_01', 'b-sample_02', HOSTILE_KEY].map((k) => profileHref(k)), [href('sample_01'), href('b-sample_02'), href(HOSTILE_KEY)]));
test('rowHref: name in the index -> the index key', () =>
  eq(['Sample_01', '.Sample_02', '.Sample_09', HOSTILE].map((name) => rowHref({ name }, index())), [href('sample_01'), href('b-sample_02'), href('b-sample_09'), href(HOSTILE_KEY)]));
test('rowHref: the index key wins over the derived one (Sample_06 -> sample_06-2)', () => eq(rowHref({ name: 'Sample_06' }, index()), href('sample_06-2')));
test('rowHref: name not in the index -> derived key', () => eq(['Sample_07', 'Sample_08', '.New_one'].map((name) => rowHref({ name }, index())), [href('sample_07'), href('sample_08'), href('b-new_one')]));
test('rowHref: index null / undefined / without players -> derived key', () =>
  eq([null, undefined, {}, { players: 'x' }].map((ix) => rowHref({ name: 'Sample_06' }, ix)), Array(4).fill(href('sample_06'))));
test('rowHref: works on a boardView row', () => eq(boardView(frozen(), 'overall')?.rows?.map((r) => rowHref(r, index())), [
  href('sample_01'), href('b-sample_02'), href('sample_03'), href(HOSTILE_KEY), href('b-sample_05'), href('sample_06-2'), href('sample_07'), href('sample_08'), href('b-sample_09'),
]));

// ----------------------------------------------------------- searchPlayers --

const names = (list) => (Array.isArray(list) ? list.map((p) => p?.name) : list);
test('searchPlayers: "sample" -> prefix matches, alphabetical ignoring the dot, capped at 8', () =>
  eq(names(searchPlayers(index(), 'sample')), ['Sample_01', '.Sample_02', 'Sample_03', '.Sample_05', 'Sample_06', '.Sample_09', 'Sample_10', 'Sample_11']));
test('searchPlayers: limit argument', () => eq(names(searchPlayers(index(), 'sample', 3)), ['Sample_01', '.Sample_02', 'Sample_03']));
test('searchPlayers: a large limit returns all matches', () => eq(searchPlayers(index(), 'sample', 50)?.length, 9));
test('searchPlayers: substring (not prefix) matches', () =>
  eq(names(searchPlayers(index(), 'mple_0')), ['Sample_01', '.Sample_02', 'Sample_03', '.Sample_05', 'Sample_06', '.Sample_09']));
test('searchPlayers: prefix matches first, then the rest, each alphabetical', () => {
  const ix = deepFreeze({ players: ['Zed_ab', 'abc', '.Abz', 'xab', 'Ab_q', 'nothing'].map((name) => ({ key: name.toLowerCase().replace(/[^a-z0-9_]/g, '-'), name, edition: 'java', bestTier: null, bestDivision: null })) });
  return eq(names(searchPlayers(ix, 'ab')), ['Ab_q', 'abc', '.Abz', 'xab', 'Zed_ab']);
});
test('searchPlayers: case-insensitive', () => eq([names(searchPlayers(index(), 'SAMPLE_02')), names(searchPlayers(index(), 'sAmPlE_1'))], [['.Sample_02'], ['Sample_10', 'Sample_11', '.Sample_16_chars']]));
test('searchPlayers: a leading "." on the query is ignored', () => eq([names(searchPlayers(index(), '.sample_02')), names(searchPlayers(index(), '.Sample_0'))?.length], [['.Sample_02'], 6]));
test('searchPlayers: empty, whitespace-only and "." queries -> []', () => eq(['', '   ', '.', null, undefined].map((qq) => searchPlayers(index(), qq)), [[], [], [], [], []]));
test('searchPlayers: no match -> []', () => eq(searchPlayers(index(), 'nobody_here'), []));
test('searchPlayers: index null / not an object / players not an array -> []', () => eq([null, undefined, 'x', {}, { players: 'x' }].map((ix) => searchPlayers(ix, 'sample')), [[], [], [], [], []]));
test('searchPlayers: non-object entries and entries without a string name are skipped', () =>
  eq(names(searchPlayers({ players: [null, 'Sample_x', { key: 'a', name: 5 }, { key: 'sample_z', name: 'Sample_z', edition: 'java', bestTier: null, bestDivision: null }] }, 'sample')), ['Sample_z']));
test('searchPlayers: entry fields (Bedrock, placed with division)', () =>
  eq(searchPlayers(index(), 'sample_02')?.map((p) => pick(p, { key: 0, name: 0, edition: 0, href: 0, tierLabel: 0 })), [
    { key: 'b-sample_02', name: '.Sample_02', edition: 'bedrock', href: href('b-sample_02'), tierLabel: 'Mithril I' },
  ]));
test('searchPlayers: entry fields (Chroma has no division; unplaced -> UNPLACED; index key kept)', () =>
  eq(['sample_01', 'sample_10', 'sample_06'].map((qq) => pick(searchPlayers(index(), qq)?.[0], { key: 0, name: 0, edition: 0, href: 0, tierLabel: 0 })), [
    { key: 'sample_01', name: 'Sample_01', edition: 'java', href: href('sample_01'), tierLabel: 'Chroma' },
    { key: 'sample_10', name: 'Sample_10', edition: 'java', href: href('sample_10'), tierLabel: 'UNPLACED' },
    { key: 'sample_06-2', name: 'Sample_06', edition: 'java', href: href('sample_06-2'), tierLabel: 'Gold II' },
  ]));
test('searchPlayers: hostile name returned raw', () =>
  eq(searchPlayers(index(), '<img')?.map((p) => [p.name, p.key, p.href]), [[HOSTILE, HOSTILE_KEY, href(HOSTILE_KEY)]]));
test('searchPlayers: unknown edition counts as java', () =>
  eq(searchPlayers({ players: [{ key: 'pc_one', name: 'Pc_one', edition: 'pc', bestTier: 'Tin', bestDivision: 'III' }] }, 'pc')?.map((p) => [p.edition, p.tierLabel]), [['java', 'Tin III']]));

// ------------------------------------------------------------- formatCount --

test('formatCount: thousands commas', () =>
  eq([0, 7, 999, 1000, 1234, 2048, 99999, 1234567, 987654321].map((n) => formatCount(n)), ['0', '7', '999', '1,000', '1,234', '2,048', '99,999', '1,234,567', '987,654,321']));

// ------------------------------------------------------------- profileView --

const HEAD = (uuid) => new RegExp(`^https://mc-heads\\.net/avatar/${uuid}/\\d+$`);
const kitView = (k) => (k && typeof k === 'object' ? { key: k.key, label: k.label, placed: k.placed, tier: k.tier, lines: k.lines } : k);
const recentView = (r) => (r && typeof r === 'object' ? { result: r.result, kit: r.kit, opponent: r.opponent && { name: r.opponent.name, edition: r.opponent.edition, href: r.opponent.href }, rating: r.rating } : r);

test('profileView: null / undefined / non-object doc -> null', () => eq([null, undefined, 'x', 5].map((d) => profileView(d, LADDER_DOC())), [null, null, null, null]));

// Sample_01: Java, placed on two kits, four recent matches.
test('profileView Sample_01: header', () => {
  const v = profileView(PROFILE('sample_01'), LADDER_DOC());
  return fields(v, { name: 'Sample_01', edition: 'java', best: { label: 'Chroma', colour: '#B24BF3', overallRank: 1 }, empty: false });
});
test('profileView Sample_01: Java head url by uuid', () => {
  const u = profileView(PROFILE('sample_01'), LADDER_DOC())?.headUrl;
  return HEAD('00000000-0000-4000-8000-000000000001').test(u ?? '') || `headUrl ${q(u)}`;
});
test('profileView Sample_01: kits (placed, lines, tier colours)', () =>
  eq(profileView(PROFILE('sample_01'), LADDER_DOC())?.kits?.map(kitView), [
    { key: 'sword', label: 'Sword', placed: true, tier: { label: 'Chroma', colour: '#B24BF3' }, lines: ['Rating 1987', 'Peak 2004', '40 wins, 12 losses', 'Win streak 5', '#3'] },
    { key: 'mace', label: 'Mace', placed: true, tier: { label: 'Emerald III', colour: '#50C878' }, lines: ['Rating 1702', 'Peak 1755', '18 wins, 9 losses', 'Win streak 0', '#2'] },
  ]));
test('profileView Sample_01: career with a thousands comma', () =>
  eq(profileView(PROFILE('sample_01'), LADDER_DOC())?.career?.lines, ['1,234 kills', '987 deaths', 'Best streak 12', '3 tournaments won']));
test('profileView Sample_01: recent (win/loss/draw, 0 vs null rating, null key, null name)', () =>
  eq(profileView(PROFILE('sample_01'), LADDER_DOC())?.recent?.map(recentView), [
    { result: 'WIN', kit: 'Sword', opponent: { name: '.Sample_02', edition: 'bedrock', href: href('b-sample_02') }, rating: '+11' },
    { result: 'LOSS', kit: 'Mace', opponent: { name: 'Sample_03', edition: 'java', href: href('sample_03') }, rating: '-13' },
    { result: 'DRAW', kit: 'Sword', opponent: { name: 'Sample_12', edition: 'java', href: null }, rating: '0' },
    { result: 'WIN', kit: 'Mace', opponent: { name: 'Unknown player', edition: 'java', href: null }, rating: '' },
  ]));

// .Sample_02: Bedrock, placed on sword, placing on mace, 1 tournament.
test('profileView .Sample_02: header (dot kept, no head url)', () =>
  fields(profileView(PROFILE('b-sample_02'), LADDER_DOC()), { name: '.Sample_02', edition: 'bedrock', headUrl: null, best: { label: 'Mithril I', colour: '#FF77E9', overallRank: 2 }, empty: false }));
test('profileView .Sample_02: one placed kit, one placing', () =>
  eq(profileView(PROFILE('b-sample_02'), LADDER_DOC())?.kits?.map(kitView), [
    { key: 'sword', label: 'Sword', placed: true, tier: { label: 'Mithril I', colour: '#FF77E9' }, lines: ['Rating 1912', 'Peak 1930', '21 wins, 9 losses', 'Win streak 3', '#1'] },
    { key: 'mace', label: 'Mace', placed: false, tier: null, lines: ['Placing 4/10', '2 wins, 2 losses'] },
  ]));
test('profileView .Sample_02: "1 tournament won" (singular)', () =>
  eq(profileView(PROFILE('b-sample_02'), LADDER_DOC())?.career?.lines, ['56 kills', '40 deaths', 'Best streak 7', '1 tournament won']));
test('profileView .Sample_02: recent incl. a hostile opponent name, raw', () =>
  eq(profileView(PROFILE('b-sample_02'), LADDER_DOC())?.recent?.map(recentView), [
    { result: 'LOSS', kit: 'Sword', opponent: { name: 'Sample_01', edition: 'java', href: href('sample_01') }, rating: '-11' },
    { result: 'WIN', kit: 'Mace', opponent: { name: HOSTILE, edition: 'java', href: href(HOSTILE_KEY) }, rating: '' },
  ]));

// Sample_10: unplaced everywhere.
test('profileView Sample_10: best null, Java head kept', () => {
  const v = profileView(PROFILE('sample_10'), LADDER_DOC());
  return fields(v, { name: 'Sample_10', edition: 'java', best: null, empty: false }) === true && HEAD('00000000-0000-4000-8000-000000000010').test(v?.headUrl ?? '') ? true : `got ${q(pick(v, { best: 0, headUrl: 0, empty: 0 }))}`;
});
test('profileView Sample_10: unplaced kits only', () =>
  eq(profileView(PROFILE('sample_10'), LADDER_DOC())?.kits?.map(kitView), [
    { key: 'sword', label: 'Sword', placed: false, tier: null, lines: ['Placing 6/10', '3 wins, 3 losses'] },
    { key: 'mace', label: 'Mace', placed: false, tier: null, lines: ['Placing 2/10', '0 wins, 2 losses'] },
  ]));
test('profileView Sample_10: "0 tournaments won" (plural), recent ratings empty', () => {
  const v = profileView(PROFILE('sample_10'), LADDER_DOC());
  return eq([v?.career?.lines, v?.recent?.map((r) => r.rating)], [['14 kills', '9 deaths', 'Best streak 2', '0 tournaments won'], ['', '']]);
});
test('profileView: an unplaced kit never yields a rating, tier, peak or rank, even when the entry carries them', () => {
  const doc = deepFreeze({ ...clone(fixtureJson('players', 'sample_10.json')), kits: [{ key: 'sword', label: 'Sword', placed: false, games: 3, placementMatches: 10, wins: 3, losses: 0, rating: 1600, tier: 'Gold', division: 'I', peak: 1700, rank: 4, streak: 2 }] });
  const k = profileView(doc, LADDER_DOC())?.kits?.[0];
  return eq(kitView(k), { key: 'sword', label: 'Sword', placed: false, tier: null, lines: ['Placing 3/10', '3 wins, 0 losses'] });
});
test('profileView: placed must be exactly true (missing placed -> unplaced lines)', () => {
  const doc = deepFreeze({ name: 'A', edition: 'java', uuid: null, best: null, kits: [{ key: 'mace', label: 'Mace', games: 1, placementMatches: 10, wins: 0, losses: 0, rating: 1500 }], career: { kills: 0, deaths: 0, bestStreak: 0, tournamentWins: 0 }, recent: [] });
  return eq(kitView(profileView(doc, LADDER_DOC())?.kits?.[0]), { key: 'mace', label: 'Mace', placed: false, tier: null, lines: ['Placing 1/10', '0 wins, 0 losses'] });
});

// Sample_11: empty recent, career over 999.
test('profileView Sample_11: empty recent -> empty true, recent []', () => fields(profileView(PROFILE('sample_11'), LADDER_DOC()), { recent: [], empty: true }));
test('profileView Sample_11: career numbers over 999 get a comma', () =>
  eq(profileView(PROFILE('sample_11'), LADDER_DOC())?.career?.lines, ['2,048 kills', '1,999 deaths', 'Best streak 4', '0 tournaments won']));
test('profileView: 1000+ tournament wins -> "1,000 tournaments won"', () => {
  const doc = deepFreeze({ ...clone(fixtureJson('players', 'sample_11.json')), career: { kills: 1000000, deaths: 1000, bestStreak: 1500, tournamentWins: 1000 } });
  return eq(profileView(doc, LADDER_DOC())?.career?.lines, ['1,000,000 kills', '1,000 deaths', 'Best streak 1,500', '1,000 tournaments won']);
});

// Hostile name.
test('profileView: hostile name returned raw', () => fields(profileView(PROFILE(HOSTILE_KEY), LADDER_DOC()), { name: HOSTILE, edition: 'java', best: { label: 'Emerald II', colour: '#50C878', overallRank: 4 } }));

// Ladder edge cases.
test('profileView: missing ladder -> colours null, labels kept', () => {
  const v = profileView(PROFILE('sample_01'), null);
  return eq([v?.best, v?.kits?.map((k) => k.tier)], [{ label: 'Chroma', colour: null, overallRank: 1 }, [{ label: 'Chroma', colour: null }, { label: 'Emerald III', colour: null }]]);
});
test('profileView: undefined ladder -> colours null', () => eq(profileView(PROFILE('b-sample_02'))?.best?.colour, null));
test('profileView: a ladder colour that is not a hex is dropped; names match case-insensitively', () => {
  const ladder = deepFreeze({ tiers: [{ name: 'chroma', min: 1950, colour: '#B24BF3' }, { name: 'Emerald', min: 1700, colour: 'var(--tier-emerald)' }] });
  const v = profileView(PROFILE('sample_01'), ladder);
  return eq(v?.kits?.map((k) => k.tier), [{ label: 'Chroma', colour: '#B24BF3' }, { label: 'Emerald III', colour: null }]);
});

// Shape edge cases.
test('profileView: Java without uuid and unknown edition -> java, no head url', () =>
  fields(profileView(deepFreeze({ ...clone(fixtureJson('players', 'sample_11.json')), uuid: null, edition: 'pc' }), LADDER_DOC()), { edition: 'java', headUrl: null }));
test('profileView: Bedrock never gets a head url, even with a uuid', () =>
  fields(profileView(deepFreeze({ ...clone(fixtureJson('players', 'b-sample_02.json')), uuid: '00000000-0000-0000-0009-01f0aabbccdd' }), LADDER_DOC()), { headUrl: null }));
test('profileView: kits and recent missing -> [] and empty true', () =>
  fields(profileView(deepFreeze({ name: 'A', edition: 'java', uuid: null, best: null, career: { kills: 0, deaths: 0, bestStreak: 0, tournamentWins: 0 } }), LADDER_DOC()), { kits: [], recent: [], empty: true }));
test('profileView: a 16-char Bedrock name keeps its dot', () =>
  fields(profileView(deepFreeze({ ...clone(fixtureJson('players', 'b-sample_02.json')), key: 'b-sample_16_chars', name: '.Sample_16_chars' }), LADDER_DOC()), { name: '.Sample_16_chars', edition: 'bedrock' }));
test('profileView: an opponent with a null name and a null key', () =>
  eq(recentView(profileView(deepFreeze({ name: 'A', edition: 'java', uuid: null, best: null, kits: [{ key: 'sword', label: 'Sword', placed: false, games: 1, placementMatches: 10, wins: 0, losses: 0 }], career: { kills: 0, deaths: 0, bestStreak: 0, tournamentWins: 0 }, recent: [{ at: '2026-11-09T00:00:00Z', kit: 'sword', result: 'draw', ratingChange: null, opponent: { name: null, edition: 'bedrock', key: null } }] }), LADDER_DOC())?.recent?.[0]),
    { result: 'DRAW', kit: 'Sword', opponent: { name: 'Unknown player', edition: 'bedrock', href: null }, rating: '' }));
test('profileView: ratingChange 0 -> "0", null -> "", positive gets "+", negative ASCII "-"', () => {
  const doc = deepFreeze({ ...clone(fixtureJson('players', 'sample_01.json')), recent: [0, null, 1, -1, 250, -250].map((ratingChange) => ({ at: '2026-11-09T00:00:00Z', kit: 'sword', result: 'win', ratingChange, opponent: { name: 'X', edition: 'java', key: 'x' } })) });
  return eq(profileView(doc, LADDER_DOC())?.recent?.map((r) => r.rating), ['0', '', '+1', '-1', '+250', '-250']);
});
test('profileView: does not mutate (deep-frozen input) and is repeatable', () => {
  const a = profileView(PROFILE('sample_01'), LADDER_DOC());
  const b = profileView(PROFILE('sample_01'), LADDER_DOC());
  return (a !== null && same(a, b)) || `two calls differ or null: ${q(a)}`;
});

// ------------------------------------------------------------- U8 (review findings) --

// Defence in depth: a recent row on a kit that is not placed never shows a rating change,
// even when the feed sends one (the placement rating is hidden until the kit is placed).
const recentDoc = (kits, rows) =>
  deepFreeze({
    name: 'A', edition: 'java', uuid: null, best: null, kits,
    career: { kills: 0, deaths: 0, bestStreak: 0, tournamentWins: 0 },
    recent: rows.map(([kit, ratingChange]) => ({ at: '2026-11-09T00:00:00Z', kit, result: 'win', ratingChange, opponent: { name: 'X', edition: 'java', key: 'x' } })),
  });
const KIT = (key, placed, extra = {}) => ({ key, label: key[0].toUpperCase() + key.slice(1), games: 3, placementMatches: 10, wins: 2, losses: 1, ...(placed === undefined ? {} : { placed }), ...extra });
test('U8 profileView: an unplaced kit\'s recent rows have rating "" even when ratingChange is a number', () => {
  const doc = deepFreeze({ ...clone(fixtureJson('players', 'sample_10.json')), recent: fixtureJson('players', 'sample_10.json').recent.map((r, i) => ({ ...r, ratingChange: i ? -9 : 14 })) });
  return eq(profileView(doc, LADDER_DOC())?.recent?.map((r) => r.rating), ['', '']);
});
test('U8 profileView: placed missing, "true" (string) or 1 counts as unplaced for recent ratings', () =>
  eq(profileView(recentDoc([KIT('sword'), KIT('mace', 'true'), KIT('axe', 1)], [['sword', 12], ['mace', -4], ['axe', 7]]), LADDER_DOC())?.recent?.map((r) => r.rating), ['', '', '']));
test('U8 profileView: a recent row whose kit has no entry in kits has rating ""', () =>
  eq(profileView(recentDoc([KIT('sword', true, { rating: 1500, peak: 1500, rank: 9, tier: 'Silver', division: 'III' })], [['chaos', 20], ['sword', 20]]), LADDER_DOC())?.recent?.map((r) => r.rating), ['', '+20']));
test('U8 profileView: mixed kits: only the placed kit\'s rows keep their rating change', () =>
  eq(profileView(deepFreeze({ ...clone(fixtureJson('players', 'b-sample_02.json')), recent: [
    { at: '2026-11-09T00:00:00Z', kit: 'sword', result: 'win', ratingChange: 9, opponent: { name: 'X', edition: 'java', key: 'x' } },
    { at: '2026-11-09T00:00:00Z', kit: 'mace', result: 'loss', ratingChange: -6, opponent: { name: 'Y', edition: 'java', key: 'y' } },
    { at: '2026-11-09T00:00:00Z', kit: 'sword', result: 'draw', ratingChange: 0, opponent: { name: 'Z', edition: 'java', key: 'z' } },
  ] }), LADDER_DOC())?.recent?.map((r) => r.rating), ['+9', '', '0']));

// Singulars (review findings): 1 win, 1 loss, 1 kill, 1 death.
test('U8 profileView: "1 win, 1 loss" on an unplaced kit', () =>
  eq(profileView(recentDoc([KIT('sword', false, { wins: 1, losses: 1, games: 2 })], []), LADDER_DOC())?.kits?.[0]?.lines, ['Placing 2/10', '1 win, 1 loss']));
test('U8 profileView: "1 win, 0 losses" and "0 wins, 1 loss" on placed kits', () => {
  const placed = (wins, losses) => KIT('sword', true, { wins, losses, rating: 1500, peak: 1500, rank: 9, streak: 0, tier: 'Silver', division: 'III' });
  const a = profileView(recentDoc([placed(1, 0)], []), LADDER_DOC())?.kits?.[0]?.lines?.[2];
  const b = profileView(recentDoc([placed(0, 1)], []), LADDER_DOC())?.kits?.[0]?.lines?.[2];
  return eq([a, b], ['1 win, 0 losses', '0 wins, 1 loss']);
});
test('U8 profileView: "1 kill", "1 death" in the career lines', () => {
  const doc = deepFreeze({ ...clone(fixtureJson('players', 'sample_10.json')), career: { kills: 1, deaths: 1, bestStreak: 1, tournamentWins: 1 } });
  return eq(profileView(doc, LADDER_DOC())?.career?.lines, ['1 kill', '1 death', 'Best streak 1', '1 tournament won']);
});
test('U8 profileView: 0 and 2 stay plural ("0 kills", "2 deaths")', () => {
  const doc = deepFreeze({ ...clone(fixtureJson('players', 'sample_10.json')), career: { kills: 0, deaths: 2, bestStreak: 0, tournamentWins: 2 } });
  return eq(profileView(doc, LADDER_DOC())?.career?.lines, ['0 kills', '2 deaths', 'Best streak 0', '2 tournaments won']);
});

console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
process.exitCode = failed ? 1 : 0;
