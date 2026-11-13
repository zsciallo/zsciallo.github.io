#!/usr/bin/env node
// Unit tests for the pure store-mode helpers in src/lib/storeModes.js
// (run 20261112-store-modes, unit U1: "Which mode are you shopping for?").
//
//   node test/store_modes.test.mjs          (no build, no npm, no browser needed)
//
// Prints `PASS <name>` / `FAIL <name>: <why>` per case, then `RESULT: PASS n checks`
// or `RESULT: FAIL k of n`, and exits 0 or 1 (same format as test/pvp_lib.test.mjs).
//
// REQUIREMENT on src/lib/storeModes.js: a pure ES module importable by plain
// Node (no JSX, no DOM, no imports Node cannot resolve, nothing that touches
// window/document/localStorage at import time). Never mutates its input (the
// tests pass deep-frozen data).
//
// THE INTERFACE (the plan's contract; extra fields are allowed on a mode, the
// named ones must be exactly as below):
//
// buildModes(rawCategories) -> { modes: [{ id, key, name, order, categoryIds }], shared: [categoryId, ...] }
//   rawCategories: the raw Tebex Headless list (before any filtering). Each
//   category has id, name, slug, order, packages and `parent`, which is the
//   whole parent category OBJECT (or null / absent), never a bare id.
//   A mode is a top-level category (parent null or absent) that has at least
//   one sub-category with at least one package. modes are sorted by the
//   parent's Tebex `order`. key = the parent's slug lowercased, falling back
//   (slug null / absent / '') to the name lowercased with every run of
//   characters outside [a-z0-9] turned into one '-'. name and order are the
//   Tebex values. categoryIds = ids of that parent's sub-categories that have
//   packages, sorted by their `order`. shared = ids of top-level categories that
//   have packages of their own, only when at least one mode exists. A flat list
//   (no parent/child structure) -> { modes: [], shared: [] }.
//
// resolveMode(modes, urlValue, storedValue) -> a mode key or null
//   A urlValue matching a mode key (case-insensitively) wins, else a matching
//   storedValue, else null. The returned value is the mode's own key. No modes
//   -> null.
//
// categoriesForMode(categories, modesResult, key) -> categories
//   The categories (the SAME objects, in the input's order) that belong to the
//   mode `key` (its categoryIds) plus the shared ones. With no modes, or key
//   null, the input categories are returned unchanged (same objects, same order).

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (...p) => JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', ...p), 'utf-8'));
/** The live tree shape (2026-11-12): PVP > Prism Tokens; SMP > Battle Pass, Crate Keys, Premium Ranks, Claim Blocks, Sell Chest. */
const LIVE = readJson('store-modes', 'tebex-categories.json').data;
/** The old flat layout (3 top-level categories with packages, no `parent` field at all). */
const FLAT = readJson('card-style', 'tebex-categories.json').data;

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

/** Run one case; a throw (e.g. "buildModes is not a function") is a failure, not a crash. */
function test(name, fn) {
  try {
    const r = fn();
    if (r === true) check(name, true);
    else check(name, false, typeof r === 'string' ? r : `returned ${q(r)}`);
  } catch (e) {
    check(name, false, `threw ${e?.message ?? e}`);
  }
}
const eq = (got, want) => (same(got, want) ? true : `got ${q(got)}, want ${q(want)}`);
const all = (...results) => results.find((r) => r !== true) ?? true;

function deepFreeze(o) {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const live = () => deepFreeze(clone(LIVE));
const flat = () => deepFreeze(clone(FLAT));

/** The named mode fields only (extra fields on a mode are allowed). */
const modeFields = (r) => (r && Array.isArray(r.modes) ? r.modes.map((m) => ({ id: m?.id, key: m?.key, name: m?.name, order: m?.order, categoryIds: m?.categoryIds })) : r);
const shape = (r) => (r && typeof r === 'object' ? { modes: modeFields(r), shared: r.shared } : r);

const PVP = { id: 3501345, key: 'pvp', name: 'PVP', order: 5, categoryIds: [3501348] };
const SMP = { id: 3501357, key: 'smp', name: 'SMP', order: 7, categoryIds: [3399286, 3385106, 3389615, 3389625, 3389629] };

// Builders for synthetic trees, shaped like the live API (parent = the whole parent object).
const parentObj = (top) => ({ id: top.id, name: top.name, slug: top.slug, description: '', tiered: false, packages: [], order: top.order, display_type: 'grid', image_url: null, dynamic: false });
const top = (id, name, slug, order, packages = []) => ({ id, name, slug, parent: null, order, packages });
const child = (id, name, parent, order, packages) => ({ id, name, slug: null, parent: parentObj(parent), order, packages });
let nextPkg = 9100000;
const pkgs = (...names) => names.map((name, i) => ({ id: nextPkg++, name, type: 'single', base_price: 1.99, sales_tax: 0, total_price: 1.99, currency: 'USD', discount: 0, disable_quantity: false, user_limit: null, image: null, order: i + 1 }));

const CREATIVE = top(3600010, 'Creative', 'creative', 9);
const CREATIVE_RANKS = child(3600011, 'Creative Ranks', CREATIVE, 10, pkgs('Builder'));
const GIFT = top(3600001, 'Gift Cards', 'gift-cards', 8, pkgs('Store Gift Card'));

/** What useTebexStore hands the page today: non-empty categories, sorted by order. */
const visible = (raw) => raw.filter((c) => c.packages && c.packages.length > 0).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const ids = (list) => (Array.isArray(list) ? list.map((c) => c?.id) : list);
const sameObjects = (got, want) => (Array.isArray(got) && got.length === want.length && got.every((c, i) => c === want[i]) ? true : `got ids ${q(ids(got))} (identity checked), want the same objects ${q(ids(want))}`);

// ------------------------------------------------------------------ import --

let lib = {};
try {
  // STORE_MODES_LIB (a path) swaps in another module; only for validating these tests against a reference.
  lib = await import(pathToFileURL(process.env.STORE_MODES_LIB ? resolve(process.env.STORE_MODES_LIB) : join(ROOT, 'src', 'lib', 'storeModes.js')).href);
  check('src/lib/storeModes.js imports in plain Node', true);
} catch (e) {
  check('src/lib/storeModes.js imports in plain Node', false, `${e?.message ?? e} (a pure ES module: no JSX, no DOM, no imports Node cannot resolve)`);
}
const { buildModes, resolveMode, categoriesForMode } = lib;
for (const [name, fn] of Object.entries({ buildModes, resolveMode, categoriesForMode })) check(`exports ${name}()`, typeof fn === 'function', `typeof ${name} is ${typeof fn}`);

// -------------------------------------------------------------- buildModes --

test('AC1 buildModes: the live tree gives PVP then SMP, with their sub-categories (parent is an object)', () =>
  eq(shape(buildModes(live())), { modes: [PVP, SMP], shared: [] }));

test('AC1 buildModes: the mode name and order are the Tebex values, not hard-coded', () => {
  const raw = clone(LIVE);
  for (const c of raw) {
    if (c.id === 3501345) Object.assign(c, { name: 'Kit PVP', order: 20 });
    if (c.parent?.id === 3501345) Object.assign(c.parent, { name: 'Kit PVP', order: 20 });
  }
  return eq(modeFields(buildModes(deepFreeze(raw))), [SMP, { ...PVP, name: 'Kit PVP', order: 20 }]);
});

test('AC1 buildModes: modes are sorted by Tebex order, not by list position', () => {
  const reversed = deepFreeze(clone(LIVE).reverse());
  return eq(shape(buildModes(reversed)), { modes: [PVP, SMP], shared: [] });
});

test('AC1 buildModes: SMP ordered before PVP when its Tebex order is lower', () => {
  const raw = clone(LIVE);
  for (const c of raw) {
    if (c.id === 3501357) c.order = 1;
    if (c.parent?.id === 3501357) c.parent.order = 1;
  }
  return eq(modeFields(buildModes(deepFreeze(raw))).map((m) => m.key), ['smp', 'pvp']);
});

test('AC1 buildModes: categoryIds follow the sub-categories\' Tebex order, not list position', () => {
  const raw = clone(LIVE);
  raw.find((c) => c.id === 3385106).order = 99; // Crate Keys last
  raw.find((c) => c.id === 3399286).order = 3.5; // Battle Pass between Claim Blocks and Sell Chest
  return eq(modeFields(buildModes(deepFreeze(raw)))[1]?.categoryIds, [3389615, 3389625, 3399286, 3389629, 3385106]);
});

test('AC1 buildModes: a third parent added later is a third mode, in Tebex order', () =>
  eq(shape(buildModes(deepFreeze([...clone(LIVE), clone(CREATIVE), clone(CREATIVE_RANKS)]))), {
    modes: [PVP, SMP, { id: 3600010, key: 'creative', name: 'Creative', order: 9, categoryIds: [3600011] }],
    shared: [],
  }));

test('AC1 buildModes: a parent whose only sub-category is empty is not a mode', () => {
  const events = top(3600020, 'Events', 'events', 11);
  return eq(modeFields(buildModes(deepFreeze([...clone(LIVE), events, child(3600021, 'Event Passes', events, 12, [])]))), [PVP, SMP]);
});

test('AC1 buildModes: a parent with no sub-categories at all is not a mode (and not shared)', () =>
  eq(shape(buildModes(deepFreeze([...clone(LIVE), top(3600030, 'Lonely', 'lonely', 13)]))), { modes: [PVP, SMP], shared: [] }));

test('AC1 buildModes: an empty sub-category is left out of categoryIds, its non-empty siblings stay', () => {
  const raw = clone(LIVE);
  raw.find((c) => c.id === 3389625).packages = []; // Claim Blocks sold out of the catalog
  return eq(modeFields(buildModes(deepFreeze(raw)))[1]?.categoryIds, [3399286, 3385106, 3389615, 3389629]);
});

test('AC1 buildModes: a sub-category with no packages field is treated as empty', () => {
  const raw = clone(LIVE);
  delete raw.find((c) => c.id === 3389629).packages; // Sell Chest
  return eq(modeFields(buildModes(deepFreeze(raw)))[1]?.categoryIds, [3399286, 3385106, 3389615, 3389625]);
});

test('AC1 buildModes: the parent is matched by its id (the embedded parent object is a copy, not the list entry)', () => {
  const raw = clone(LIVE);
  // A trimmed parent object, as a different API shape might send it.
  for (const c of raw) if (c.parent) c.parent = { id: c.parent.id };
  return eq(shape(buildModes(deepFreeze(raw))), { modes: [PVP, SMP], shared: [] });
});

test('AC1 buildModes: the mode id is the parent category id', () =>
  eq(modeFields(buildModes(live())).map((m) => m.id), [3501345, 3501357]));

test('AC7 buildModes: the flat layout (no parent field) has no modes and no shared', () =>
  eq(shape(buildModes(flat())), { modes: [], shared: [] }));

test('AC7 buildModes: a flat layout with parent: null everywhere has no modes and no shared', () =>
  eq(shape(buildModes(deepFreeze(clone(FLAT).map((c) => ({ ...c, parent: null }))))), { modes: [], shared: [] }));

test('AC7 buildModes: an empty list has no modes and no shared', () => eq(shape(buildModes(deepFreeze([]))), { modes: [], shared: [] }));

test('AC7 buildModes: a top-level category with its own packages is shared', () =>
  eq(shape(buildModes(deepFreeze([...clone(LIVE), clone(GIFT)]))), { modes: [PVP, SMP], shared: [3600001] }));

test('AC7 buildModes: a parent with packages of its own and sub-categories is a mode AND shared', () => {
  const raw = clone(LIVE);
  raw.find((c) => c.id === 3501345).packages = pkgs('PVP Starter');
  return eq(shape(buildModes(deepFreeze(raw))), { modes: [PVP, SMP], shared: [3501345] });
});

test('AC7 buildModes: shared lists every top-level category with packages (any order)', () => {
  const extra = top(3600002, 'Bundles', 'bundles', 4, pkgs('Bundle'));
  const shared = buildModes(deepFreeze([...clone(LIVE), clone(GIFT), extra]))?.shared;
  return eq(Array.isArray(shared) ? [...shared].sort((a, b) => a - b) : shared, [3600001, 3600002]);
});

test('buildModes: never mutates its input (deep-frozen) and leaves it as it was', () => {
  const input = live();
  const before = q(input);
  buildModes(input);
  return q(input) === before ? true : 'input changed';
});

// key derivation
const keyOf = (parent) => modeFields(buildModes(deepFreeze([parent, child(3700001, 'Things', parent, 1, pkgs('Thing'))])))?.[0]?.key;
test('AC1 key: the parent slug, lowercased', () => eq(keyOf(top(3700000, 'SMP', 'SMP-Store', 1)), 'smp-store'));
test('AC1 key: no slug (null) -> the name lowercased', () => eq(keyOf(top(3700000, 'PVP', null, 1)), 'pvp'));
test('AC1 key: no slug (absent) -> the name lowercased, spaces to "-"', () => {
  const p = top(3700000, 'Creative Mode', undefined, 1);
  delete p.slug;
  return eq(keyOf(p), 'creative-mode');
});
test('AC1 key: an empty slug falls back to the name', () => eq(keyOf(top(3700000, 'Sky Block 2', '', 1)), 'sky-block-2'));
test('AC1 key: a run of non [a-z0-9] characters in the name becomes one "-"', () => eq(keyOf(top(3700000, 'Mini & Games', null, 1)), 'mini-games'));

// ------------------------------------------------------------- resolveMode --

const MODES = () => buildModes(live())?.modes;
test('AC5 resolveMode: a valid ?mode= wins over the remembered mode', () => eq(resolveMode(MODES(), 'pvp', 'smp'), 'pvp'));
test('AC5 resolveMode: no ?mode= -> the remembered mode', () => eq(resolveMode(MODES(), null, 'smp'), 'smp'));
test('AC5 resolveMode: undefined ?mode= -> the remembered mode', () => eq(resolveMode(MODES(), undefined, 'pvp'), 'pvp'));
test('AC5 resolveMode: an unknown ?mode= is ignored, the remembered mode is used', () => eq(resolveMode(MODES(), 'junk', 'smp'), 'smp'));
test('AC5 resolveMode: an empty ?mode= is ignored', () => eq(resolveMode(MODES(), '', 'pvp'), 'pvp'));
test('AC2 resolveMode: nothing remembered and no ?mode= -> null (the pop-up)', () =>
  all(eq(resolveMode(MODES(), null, null), null), eq(resolveMode(MODES(), undefined, undefined), null), eq(resolveMode(MODES(), '', ''), null)));
test('AC2 resolveMode: an unknown ?mode= and an unknown remembered mode -> null', () => eq(resolveMode(MODES(), 'junk', 'creative'), null));
test('AC5 resolveMode: matching is case-insensitive and returns the mode\'s own key', () =>
  all(eq(resolveMode(MODES(), 'PVP', null), 'pvp'), eq(resolveMode(MODES(), null, 'Smp'), 'smp'), eq(resolveMode(MODES(), 'SmP', 'pvp'), 'smp')));
test('AC5 resolveMode: a mixed-case key from a slug matches its own spelling', () => {
  const modes = [{ id: 1, key: 'smp-store', name: 'SMP Store', order: 1, categoryIds: [2] }];
  return all(eq(resolveMode(modes, 'SMP-Store', null), 'smp-store'), eq(resolveMode(modes, null, 'smp-store'), 'smp-store'));
});
test('AC5 resolveMode: a third mode resolves like the others', () =>
  eq(resolveMode(buildModes(deepFreeze([...clone(LIVE), clone(CREATIVE), clone(CREATIVE_RANKS)]))?.modes, 'creative', 'pvp'), 'creative'));
test('AC7 resolveMode: no modes -> null, whatever the URL or storage say', () =>
  all(eq(resolveMode([], 'pvp', 'smp'), null), eq(resolveMode(buildModes(flat())?.modes, 'pvp', 'smp'), null)));

// ------------------------------------------------------- categoriesForMode --

test('AC4 categoriesForMode: pvp -> only Prism Tokens (the same object)', () => {
  const cats = visible(live());
  return sameObjects(categoriesForMode(cats, buildModes(live()), 'pvp'), cats.filter((c) => c.id === 3501348));
});
test('AC4 categoriesForMode: smp -> the five SMP categories, in the input order (same objects)', () => {
  const cats = visible(live());
  return sameObjects(categoriesForMode(cats, buildModes(live()), 'smp'), cats.filter((c) => c.id !== 3501348));
});
test('AC4 categoriesForMode: keeps the order of the categories it was given, not categoryIds order', () => {
  const cats = [...visible(live())].reverse();
  return sameObjects(categoriesForMode(cats, buildModes(live()), 'smp'), cats.filter((c) => c.id !== 3501348));
});
test('AC7 categoriesForMode: a shared top-level category is in every mode, in input order', () => {
  const raw = deepFreeze([...clone(LIVE), clone(GIFT)]);
  const cats = visible(raw);
  const modes = buildModes(raw);
  return all(
    sameObjects(categoriesForMode(cats, modes, 'pvp'), cats.filter((c) => c.id === 3501348 || c.id === 3600001)),
    sameObjects(categoriesForMode(cats, modes, 'smp'), cats.filter((c) => c.id !== 3501348)),
  );
});
test('AC7 categoriesForMode: key null -> every category unchanged', () => {
  const cats = visible(live());
  return sameObjects(categoriesForMode(cats, buildModes(live()), null), cats);
});
test('AC7 categoriesForMode: no modes (flat layout) -> every category unchanged, whatever the key', () => {
  const cats = visible(flat());
  const modes = buildModes(flat());
  return all(sameObjects(categoriesForMode(cats, modes, 'pvp'), cats), sameObjects(categoriesForMode(cats, modes, null), cats));
});
test('AC1 categoriesForMode: the third mode gets its own category only', () => {
  const raw = deepFreeze([...clone(LIVE), clone(CREATIVE), clone(CREATIVE_RANKS)]);
  const cats = visible(raw);
  return sameObjects(categoriesForMode(cats, buildModes(raw), 'creative'), cats.filter((c) => c.id === 3600011));
});
test('categoriesForMode: never mutates the categories array it was given', () => {
  const cats = Object.freeze(visible(live()));
  const before = ids(cats);
  categoriesForMode(cats, buildModes(live()), 'pvp');
  return eq(ids(cats), before);
});

console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
process.exitCode = failed ? 1 : 0;
