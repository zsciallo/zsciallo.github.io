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

console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
process.exitCode = failed ? 1 : 0;
