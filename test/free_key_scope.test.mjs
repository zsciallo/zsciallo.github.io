#!/usr/bin/env node
// Unit tests for the free-key scope helpers in src/lib/freeKeys.js
// (run 20261112-freekey-smp, unit U2: the free Chroma Key is an SMP reward, so
// the PVP packages (Prism Tokens) do not count toward it).
//
//   node test/free_key_scope.test.mjs          (no build, no npm, no browser needed)
//   FREE_KEYS_LIB=<path> node test/free_key_scope.test.mjs   (test another copy of the module)
//
// Prints `PASS <name>` / `FAIL <name>: <why>` per case, then `RESULT: PASS n checks`
// or `RESULT: FAIL k of n`, and exits 0 or 1 (same format as test/store_modes.test.mjs).
//
// src/lib/freeKeys.js imports './price' without an extension (Vite resolves it,
// plain Node does not), so this file registers a resolve hook that retries an
// extensionless relative import with '.js'. Nothing in src/ changes for it.
//
// THE INTERFACE (the plan's contract):
//
// applyRules(rules)
//   As today (minimumsUsd, packageId, priceUsd, max), and also stores
//   rules.ineligiblePackageIds (a sorted list of package ids from the backend:
//   the packages that do not count toward free keys) in FREE_KEY.ineligible, a
//   Set of numbers. Absent or not an array -> an empty Set (everything counts),
//   so a later applyRules without the field clears an earlier list.
//   Before any applyRules, FREE_KEY.ineligible is an empty Set.
//
// countsForFreeKey(packageId) -> boolean
//   false for an id in FREE_KEY.ineligible, true otherwise. Accepts a number or
//   a numeric string.
//
// eligibleSpend(basket, rate) -> USD
//   (basket.total_price - sum of in_basket.price x in_basket.quantity over the
//   basket's ineligible lines) / rate, never below 0; 0 for a null basket.
//
// Unchanged: freeKeysFor, nextFreeKey, usdRate, preTaxPrice, isMintedFreeKeyCode.

import { readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The live tree shape (2026-11-12): PVP > Prism Tokens; SMP > Battle Pass, Crate Keys, Premium Ranks, Claim Blocks, Sell Chest. */
const LIVE = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'store-modes', 'tebex-categories.json'), 'utf-8')).data;
const PVP_IDS = LIVE.filter((c) => c.parent && c.parent.id === 3501345).flatMap((c) => c.packages.map((p) => p.id));
const PRISM = PVP_IDS[0]; // 3,000 Prism Coins, 2.99 USD
const SELL_CHEST = 7564237; // SMP, 7.99 USD
const CHROMA_KEY = 7557969; // SMP, the promo's key

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

/** Run one case; a throw (e.g. "eligibleSpend is not a function") is a failure, not a crash. */
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
const near = (got, want, eps = 1e-9) => (typeof got === 'number' && Math.abs(got - want) <= eps ? true : `got ${q(got)}, want ${want}`);
const all = (...results) => results.find((r) => r !== true) ?? true;

function deepFreeze(o) {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

// Today's defaults as the backend reports them (/store/offers freeKeys, no ineligiblePackageIds).
const BASE = { packageId: CHROMA_KEY, priceUsd: 0.99, minimumsUsd: [10.99, 20.99, 30.99], max: 3 };
const WITH_PVP = { ...BASE, ineligiblePackageIds: [...PVP_IDS] };

/** A Tebex basket doc: lines are [id, unit price, quantity]; total defaults to the lines' sum. */
function basket(lines, total) {
  const packages = lines.map(([id, price, quantity]) => ({ id, name: `#${id}`, in_basket: { price, quantity } }));
  const sum = packages.reduce((n, p) => n + p.in_basket.price * p.in_basket.quantity, 0);
  return deepFreeze({ ident: 'unit1', currency: 'USD', total_price: total ?? Math.round(sum * 100) / 100, packages });
}
const ineligibleIds = (FK) => (FK?.ineligible instanceof Set ? [...FK.ineligible].sort((a, b) => a - b) : FK?.ineligible);

// ------------------------------------------------------------------ import --

// Extensionless relative imports ('./price') resolve the way Vite does.
const retryJs = (specifier, context, next) => {
  try {
    return next(specifier, context);
  } catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && /^\.{1,2}\//.test(specifier) && !/\.[cm]?js$/.test(specifier)) return next(`${specifier}.js`, context);
    throw e;
  }
};
if (typeof nodeModule.registerHooks === 'function') nodeModule.registerHooks({ resolve: retryJs });

let lib = {};
try {
  lib = await import(pathToFileURL(process.env.FREE_KEYS_LIB ? resolve(process.env.FREE_KEYS_LIB) : join(ROOT, 'src', 'lib', 'freeKeys.js')).href);
  check('src/lib/freeKeys.js imports in plain Node', true);
} catch (e) {
  check('src/lib/freeKeys.js imports in plain Node', false, `${e?.message ?? e}`);
}
const { FREE_KEY, applyRules, countsForFreeKey, eligibleSpend, freeKeysFor, nextFreeKey, usdRate, preTaxPrice, isMintedFreeKeyCode } = lib;
for (const [name, fn] of Object.entries({ applyRules, countsForFreeKey, eligibleSpend, freeKeysFor, nextFreeKey })) check(`exports ${name}()`, typeof fn === 'function', `typeof ${name} is ${typeof fn}`);

// Fresh module state first: nothing applied yet.
test('before any applyRules: FREE_KEY.ineligible is an empty Set and every package counts', () =>
  all(
    FREE_KEY?.ineligible instanceof Set ? true : `FREE_KEY.ineligible is ${q(FREE_KEY?.ineligible)} (${typeof FREE_KEY?.ineligible}), want a Set`,
    eq(ineligibleIds(FREE_KEY), []),
    eq([PRISM, SELL_CHEST, CHROMA_KEY].map((id) => countsForFreeKey(id)), [true, true, true]),
  ));
test('before any applyRules: eligibleSpend is the basket total over the rate (today)', () =>
  near(eligibleSpend(basket([[PRISM, 2.99, 2], [SELL_CHEST, 7.99, 1]]), 1), 13.97));

// -------------------------------------------------------------- applyRules --

test('fixture: the store-modes catalogue has the PVP package(s) this suite uses', () => (PVP_IDS.length >= 1 && PRISM === 7808723 ? true : `PVP ids ${q(PVP_IDS)}`));

test('applyRules with ineligiblePackageIds stores them as a Set of numbers', () => {
  applyRules(deepFreeze({ ...WITH_PVP, ineligiblePackageIds: [...PVP_IDS] }));
  return all(
    FREE_KEY.ineligible instanceof Set ? true : `FREE_KEY.ineligible is ${q(FREE_KEY.ineligible)}, want a Set`,
    eq(ineligibleIds(FREE_KEY), [...PVP_IDS].sort((a, b) => a - b)),
    [...FREE_KEY.ineligible].every((v) => typeof v === 'number') ? true : `members ${q([...FREE_KEY.ineligible])} are not all numbers`,
  );
});
test('applyRules with ineligiblePackageIds still applies the promo numbers (as today)', () => {
  applyRules(deepFreeze({ packageId: CHROMA_KEY, priceUsd: 0.99, minimumsUsd: [9.99, 19.99], max: 2, ineligiblePackageIds: [PRISM] }));
  const got = { packageId: FREE_KEY.packageId, price: FREE_KEY.price, minimums: FREE_KEY.minimums, max: FREE_KEY.max };
  applyRules(deepFreeze({ ...BASE }));
  return eq(got, { packageId: CHROMA_KEY, price: 0.99, minimums: [9.99, 19.99], max: 2 });
});
test('applyRules with several ids: each is excluded, the rest still count', () => {
  applyRules(deepFreeze({ ...BASE, ineligiblePackageIds: [7808723, 7808724, 7808725] }));
  return eq([7808723, 7808724, 7808725, SELL_CHEST, CHROMA_KEY].map((id) => countsForFreeKey(id)), [false, false, false, true, true]);
});
test('a later applyRules without the field clears the list (everything counts again)', () => {
  applyRules(deepFreeze({ ...WITH_PVP }));
  const before = countsForFreeKey(PRISM);
  applyRules(deepFreeze({ ...BASE }));
  return all(eq(before, false), eq(countsForFreeKey(PRISM), true), eq(ineligibleIds(FREE_KEY), []));
});
for (const [label, value] of [['null', null], ['a string', '7808723'], ['an object', { 7808723: true }], ['a number', 7808723]]) {
  test(`applyRules with ineligiblePackageIds = ${label} -> empty (everything counts)`, () => {
    applyRules(deepFreeze({ ...WITH_PVP }));
    applyRules(deepFreeze({ ...BASE, ineligiblePackageIds: value }));
    return all(eq(ineligibleIds(FREE_KEY), []), eq(countsForFreeKey(PRISM), true));
  });
}
test('applyRules with an empty list (flat catalogue) -> everything counts', () => {
  applyRules(deepFreeze({ ...WITH_PVP }));
  applyRules(deepFreeze({ ...BASE, ineligiblePackageIds: [] }));
  return all(eq(ineligibleIds(FREE_KEY), []), eq(countsForFreeKey(PRISM), true));
});
test('applyRules keeps its own copy: changing the list it was given afterwards changes nothing', () => {
  const ids = [PRISM];
  applyRules({ ...BASE, ineligiblePackageIds: ids });
  ids.length = 0;
  ids.push(SELL_CHEST);
  return eq([countsForFreeKey(PRISM), countsForFreeKey(SELL_CHEST)], [false, true]);
});

// -------------------------------------------------------- countsForFreeKey --

test('countsForFreeKey: an ineligible id, as a number and as a numeric string, does not count', () => {
  applyRules(deepFreeze({ ...WITH_PVP }));
  return eq([countsForFreeKey(PRISM), countsForFreeKey(String(PRISM))], [false, false]);
});
test('countsForFreeKey: SMP packages (and the Chroma Key) count, as numbers and numeric strings', () => {
  applyRules(deepFreeze({ ...WITH_PVP }));
  return eq([SELL_CHEST, CHROMA_KEY, String(SELL_CHEST), String(CHROMA_KEY)].map((id) => countsForFreeKey(id)), [true, true, true, true]);
});
test('countsForFreeKey returns a boolean', () => {
  applyRules(deepFreeze({ ...WITH_PVP }));
  return eq([typeof countsForFreeKey(PRISM), typeof countsForFreeKey(SELL_CHEST)], ['boolean', 'boolean']);
});

// ----------------------------------------------------------- eligibleSpend --

test('eligibleSpend: mixed basket counts the SMP part only (PVP 2 x 2.99 + Sell Chest 7.99 -> 7.99)', () => {
  applyRules(deepFreeze({ ...WITH_PVP }));
  return near(eligibleSpend(basket([[PRISM, 2.99, 2], [SELL_CHEST, 7.99, 1]]), 1), 7.99);
});
test('eligibleSpend: PVP-only basket -> 0, even above the first minimum (4 x 2.99 = 11.96)', () => {
  applyRules(deepFreeze({ ...WITH_PVP }));
  return eq(eligibleSpend(basket([[PRISM, 2.99, 4]]), 1), 0);
});
test('eligibleSpend: SMP-only basket -> the total (as today)', () => {
  applyRules(deepFreeze({ ...WITH_PVP }));
  return near(eligibleSpend(basket([[SELL_CHEST, 7.99, 2], [CHROMA_KEY, 4.99, 1]]), 1), 20.97);
});
test('eligibleSpend: non-USD basket is divided by the rate after the PVP lines come off', () => {
  applyRules(deepFreeze({ ...WITH_PVP }));
  // EUR prices, 0.92 EUR per USD: (12.85 - 2 x 2.75) / 0.92
  return near(eligibleSpend(basket([[PRISM, 2.75, 2], [SELL_CHEST, 7.35, 1]]), 0.92), (12.85 - 5.5) / 0.92, 1e-6);
});
test('eligibleSpend: subtracts the line value from total_price (a coupon on the total stays in)', () => {
  applyRules(deepFreeze({ ...WITH_PVP }));
  // Lines add up to 13.97, a promo took the total to 11.18: 11.18 - 5.98 = 5.20
  return near(eligibleSpend(basket([[PRISM, 2.99, 2], [SELL_CHEST, 7.99, 1]], 11.18), 1), 5.2, 1e-6);
});
test('eligibleSpend: never below 0 (total cut under the PVP lines\' value)', () => {
  applyRules(deepFreeze({ ...WITH_PVP }));
  return eq(eligibleSpend(basket([[PRISM, 2.99, 2], [SELL_CHEST, 7.99, 1]], 3), 1), 0);
});
test('eligibleSpend: null / undefined basket -> 0', () => {
  applyRules(deepFreeze({ ...WITH_PVP }));
  return eq([eligibleSpend(null, 1), eligibleSpend(undefined, 1)], [0, 0]);
});
test('eligibleSpend: a basket without packages -> total over rate', () => {
  applyRules(deepFreeze({ ...WITH_PVP }));
  return near(eligibleSpend(deepFreeze({ ident: 'x', total_price: 0 }), 1), 0);
});
test('eligibleSpend: with no ineligible list every line counts (AC4: total over rate, as today)', () => {
  applyRules(deepFreeze({ ...BASE }));
  return all(
    near(eligibleSpend(basket([[PRISM, 2.99, 2], [SELL_CHEST, 7.99, 1]]), 1), 13.97),
    near(eligibleSpend(basket([[PRISM, 2.75, 2], [SELL_CHEST, 7.35, 1]]), 0.92), 12.85 / 0.92, 1e-6),
  );
});
test('eligibleSpend never mutates the basket (deep-frozen input)', () => {
  applyRules(deepFreeze({ ...WITH_PVP }));
  const b = basket([[PRISM, 2.99, 2], [SELL_CHEST, 7.99, 1]]);
  const before = q(b);
  eligibleSpend(b, 1);
  return eq(q(b), before);
});

// --------------------------------------------------- unchanged behaviour --

test('freeKeysFor unchanged with an ineligible list set', () => {
  applyRules(deepFreeze({ ...WITH_PVP }));
  return eq([0, 10.98, 10.9899995, 10.99, 20.99, 30.99, 100].map((s) => freeKeysFor(s)), [0, 0, 1, 1, 2, 3, 3]);
});
test('nextFreeKey unchanged with an ineligible list set', () => {
  applyRules(deepFreeze({ ...WITH_PVP }));
  const a = nextFreeKey(0, 5);
  const b = nextFreeKey(1, 15.99);
  return all(near(a.left, 5.99, 1e-9), near(a.progress, 5 / 10.99, 1e-9), near(b.left, 5, 1e-9), near(b.progress, 0.5, 1e-9), eq(nextFreeKey(3, 50), { left: null, progress: 1 }), eq(nextFreeKey(0, 10.99).left, 0.01));
});
test('usdRate / preTaxPrice / isMintedFreeKeyCode unchanged', () => {
  applyRules(deepFreeze({ ...WITH_PVP }));
  const eur = { [CHROMA_KEY]: { id: CHROMA_KEY, base_price: 0.92, sales_tax: 0, discount: 0, total_price: 0.92, currency: 'EUR' } };
  const r = usdRate(eur);
  return all(near(r.rate, 0.92 / 0.99, 1e-9), eq(usdRate({}), { rate: 1, shownRate: 1 }), eq(preTaxPrice({ total_price: 5, sales_tax: 1 }), 4), eq([isMintedFreeKeyCode('CBK-1'), isMintedFreeKeyCode('WELCOME20')], [true, false]));
});

console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
process.exitCode = failed ? 1 : 0;
