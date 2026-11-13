#!/usr/bin/env node
// Free-key scope browser check (run 20261112-freekey-smp, unit U2): the "free
// Chroma Key as you spend" promo is an SMP reward, so PVP packages (Prism
// Tokens) never move the cart's free-key progress, never trigger the FREE KEY!
// prediction on a stepper, and the FREE KEYS banner is hidden in PVP mode.
//
//   npm run build && node test/free_key_scope_check.mjs [--dist <distDir>]
//   (npm script: "test:freekey": "node test/free_key_scope.test.mjs && node test/free_key_scope_check.mjs")
//
// Same harness as test/store_mode_check.mjs: vite preview of dist/ on a free
// port, headless Chrome over CDP, a fresh browser context per page, frozen Date,
// seeded Math.random, reduced motion, UTC, en-US, a true 1280x900 or 400x900
// through Emulation.setDeviceMetricsOverride. Both processes stop at the end.
//
// Network (CDP Fetch, every request; nothing reaches the real api.chromabit.us
// or Tebex):
//   headless.tebex.io .../categories -> test/fixtures/store-modes/tebex-categories.json
//     (PVP > Prism Tokens: "3,000 Prism Coins" 2.99; SMP > ... "Sell Chest" 7.99)
//     or the flat test/fixtures/card-style/tebex-categories.json;
//   a stateful Tebex basket: GET the saved basket, POST .../packages adds a line,
//     PUT .../packages/<id> sets a quantity, POST .../accounts/<t>/baskets creates;
//   api.chromabit.us /store/offers -> { sales: {}, packages: {}, freeKeys: RULES }
//     where RULES = { packageId: 7557969, priceUsd: 0.99, minimumsUsd: [9.99,
//     19.99, 29.99], max: 3 } plus ineligiblePackageIds = the fixture's PVP ids
//     (the first minimum is 9.99, not the built-in 10.99, so "US$9.99" in the
//     banner or "$9.99 MORE" in the cart proves the stub's rules were applied);
//   api.chromabit.us POST /store/basket/<ident>/freekeys -> the new bot's answer:
//     { keys, max, spendUsd, next, rules, basket } with spendUsd = the basket
//     total minus the PVP lines (in_basket.price x quantity); or, per scenario,
//     the old bot's answer (spendUsd = the whole total, rules without the
//     field), a 500, or a 404; optionally the first answer held back for
//     6 s (under the site's 8 s fetch timeout in lib/storeApi.js; those
//     scenarios navigate without the network-idle wait).
//     The stub never mints key lines (no scenario asserts after reaching a key).
//   /api/status as visual_check; any other api.chromabit.us path -> 404;
//   PostHog -> {}; anything else 404.
//
// What the page shows, read through stable hooks that exist today:
//   progress  .cart-drawer .cart-keys-bar[role=progressbar] aria-valuenow (0..100)
//             and .cart-keys-text ("$X MORE FOR A FREE KEY")
//   FREE KEY! the stepper's shout, a .qty-levelup with class .qty-levelup--key
//             (LEVEL UP! etc. are .qty-levelup without it), recorded by a
//             MutationObserver installed before the app runs (each lives 1.2 s);
//             and the card / modal chip .pkg-freekey-chip ("+1 FREE KEY")
//   banner    .store-promo.store-promo--key
//
// Scenarios (one PASS/FAIL line each, then RESULT). Each proves its harness
// first (store rendered from the stub, offers stub hit, the basket stub got the
// add or the quantity, the cart is open, the stepper took the new value) and
// stops there if it did not, so a red run fails on the feature only.
//   pvp-only   ?mode=smp: banner shown with US$9.99 (AC3); switch to PVP:
//              banner hidden (AC3); the Prism Coins card stepper typed to 5 (14.95)
//              shouts no FREE KEY! and shows no chip (AC1); added to the cart:
//              no free-key box (posthoc AC2, was: progress 0 and "$9.99 MORE");
//              the cart line typed to 10 shouts no FREE KEY! (AC1) and there is
//              still no box (posthoc AC2, was: the progress stays 0); the package
//              modal's stepper typed to 5 shouts no FREE KEY!, no chip (AC1).
//   smp-only   (today's behaviour, green on the base by design) the Sell Chest card
//              typed to 2 (15.98) shouts FREE KEY! with "+1 FREE KEY"; added x1:
//              progress 80 and "$2.00 MORE"; the cart line + shouts FREE KEY!.
//   mixed      saved basket PVP x2 + Sell Chest x1 (13.97 total, 7.99 SMP), the
//              first sync held 6 s: before it answers the progress is 80 and
//              "$2.00 MORE" (AC2 pre-round-trip); after it, the same (AC2
//              settled); one more PVP from its card: still 80; the PVP line +
//              (3 -> 4, would reach 10.98 counted whole) shouts no FREE KEY!
//              (AC1); the Sell Chest line + shouts FREE KEY! (AC1 SMP as today).
//   pvp-restore saved basket PVP x3 only, the sync held 6 s: no free-key box
//              before it answers (posthoc AC2, was: progress 0).
//   sync-fail  saved mixed basket, the sync answers 500: progress 80, "$2.00
//              MORE" (AC2 fallback); one more PVP added (sync 500 again): still 80.
//   banner     ?mode=pvp hidden, SMP shown (US$9.99), PVP hidden again (AC3).
//   flat       the flat fixture with the same rules: banner shown (AC3).
//   no-field   (AC4, green on the base by design) offers and sync without
//              ineligiblePackageIds, sync spend = the whole total: banner shown in
//              PVP; the Prism Coins card typed to 5 shouts FREE KEY! with the chip;
//              x3 in the cart: progress 90, "$1.02 MORE"; the line + shouts FREE KEY!.
//   api-down   (AC4, green on the base by design) offers and sync 404: banner
//              shown in PVP with the built-in US$10.99; one Prism Coins in the
//              cart: progress 27, "$8.00 MORE" (the whole total, as today).
//   400px      (AC5, a regression guard: green on the base) saved mixed basket,
//              cart open at a true 400px: document scrollWidth <= 400, the
//              drawer and its progress inside 0..400.
//
// Post-hoc review fixes (run 20261112-store-modes, unit posthoc; review
// reports/posthoc-reviewer.md B-O1..B-O3, owner 2026-11-13):
//   sync-rules (2 scenarios: /store/offers 404, and offers without
//              ineligiblePackageIds) the list reaches the site only through the
//              sync response (useTebexBasket settle -> applyRules). Before any
//              sync the banner shows in PVP (harness: proves offers brought no
//              list). After one Prism Coins is added and synced: banner hidden
//              (posthoc AC1), the Prism Coins card typed to 5 shows no chip and
//              shouts no FREE KEY! (AC1), the PVP-only cart has no free-key box
//              (AC2), the cart line typed to 5 shouts no FREE KEY! (AC1).
//   pvp+key    (AC2 guard, green on the base) saved basket Prism Coins x1 +
//              Chroma Key x1: the box is shown (the Chroma Key itself counts).
//   promo memory (AC3, B-O2 banner flicker). localStorage
//              chromabit_store_keypromo = JSON { "<modeKey>": true|false }.
//              "Visible" (window.__fk.shown): the element has a non-empty
//              border box (getBoundingClientRect width and height > 0) and its
//              computed visibility is not hidden. Opacity is not looked at. A
//              requestAnimationFrame sampler installed before the document
//              parses checks every .store-promo--key in every frame, so the
//              prerendered HTML's first paint counts.
//     (a) remembered pvp + {"pvp":false}, categories held 3 s: no frame, before
//         or after the load, shows a visible banner; the same with ?mode=pvp
//         and no remembered mode.
//     (b) (guard, green on the base) nothing in the key, ?mode=smp and, in a
//         second run, a remembered smp, categories held: the banner is visible
//         while the store is still loading and after. A third run: remembered
//         pvp with {"pvp":true} (offers and sync without the list, so PVP keeps
//         the banner after load): visible while loading and after.
//     (c) ?mode=pvp with the ineligible rules: after load the key holds
//         pvp:false; switched to SMP: smp:true (pvp still false) and the banner
//         is visible. A wrong seeded {"smp":false} with ?mode=smp: after load
//         the banner is visible and the key holds smp:true.
//     (d) (guard, green on the base) the key holds "not json{", ?mode=smp,
//         categories held: visible while loading, the store loads, visible after.
//
// The FREE KEY! recorder counts any .qty-levelup with .qty-levelup--key (or the
// text FREE KEY) at the stepper's place; where a "no FREE KEY!" check passes, the
// harness line before it has proved the stepper took the new value and, in the
// cart, that the basket stub got the quantity and the sync ran.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FIX, FREEZE, FROZEN_TIME, HEAD_PNG, ROOT, VITE, fileOr404, findChrome, freePort, json, launchChrome, sleep, waitReady } from './visual_check.mjs';

const HEIGHT = 900;
const MODES_FIX = join(ROOT, 'test', 'fixtures', 'store-modes', 'tebex-categories.json');
const FLAT_FIX = join(ROOT, 'test', 'fixtures', 'card-style', 'tebex-categories.json');
const MODE_KEY = 'chromabit_store_mode';
const PROMO_KEY = 'chromabit_store_keypromo';
const BASKET_IDENT = 'freekeyscope1';

const raw = (file) => JSON.parse(readFileSync(file, 'utf-8'));
const MODES_DATA = raw(MODES_FIX).data;
const parentId = (c) => (c.parent && typeof c.parent === 'object' ? c.parent.id : null);
const PVP_PKGS = MODES_DATA.filter((c) => parentId(c) === 3501345).flatMap((c) => c.packages);
const PVP_IDS = PVP_PKGS.map((p) => p.id).sort((a, b) => a - b);
const ALL_PKGS = MODES_DATA.flatMap((c) => c.packages ?? []);
const byName = (n) => ALL_PKGS.find((p) => p.name === n);
const PRISM = byName('3,000 Prism Coins'); // PVP, 2.99
const CHEST = byName('Sell Chest'); // SMP, 7.99
const KEY = byName('Chroma Key'); // SMP, 4.99, the free-key package itself

const BASE_RULES = { packageId: 7557969, priceUsd: 0.99, minimumsUsd: [9.99, 19.99, 29.99], max: 3 };
const NEW_RULES = { ...BASE_RULES, ineligiblePackageIds: PVP_IDS };

let passed = 0;
let failed = 0;
function check(name, problems) {
  const list = [].concat(problems ?? []).filter(Boolean);
  if (list.length) failed++;
  else passed++;
  console.log(list.length ? `FAIL ${name}: ${list.join('; ')}` : `PASS ${name}`);
  return !list.length;
}
class Stop extends Error {}
/** A precondition for the rest of the scenario: FAIL and stop the scenario when it does not hold. */
function need(name, problems) {
  if (!check(name, problems)) throw new Stop(name);
}
const q = JSON.stringify;
const want = (label, got, exp) => (q(got) === q(exp) ? null : `${label} ${q(got)}, want ${q(exp)}`);
const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

// --------------------------------------------------------------- routing --

function basketDoc(st) {
  const lines = st.basket.lines;
  const total = Math.round(lines.reduce((n, l) => n + l.in_basket.quantity * l.in_basket.price, 0) * 100) / 100;
  return { ident: BASKET_IDENT, complete: false, username: 'Steve', currency: 'USD', base_price: total, total_price: total, sales_tax: 0, packages: lines.map((l) => ({ ...l, in_basket: { ...l.in_basket } })), coupons: [], giftcards: [], links: { checkout: 'https://example.invalid/checkout' } };
}
const lineOf = (p, quantity) => ({ id: p.id, name: p.name, image: null, in_basket: { quantity, price: p.total_price } });

/** What the store backend's sync answers: the new bot (eligible spend) or the old one (whole total). */
function syncDoc(st) {
  const doc = basketDoc(st);
  const ineligible = new Set(st.sync === 'old' ? [] : PVP_IDS);
  const out = doc.packages.filter((l) => ineligible.has(l.id)).reduce((n, l) => n + l.in_basket.price * l.in_basket.quantity, 0);
  const spendUsd = Math.max(0, Math.round((doc.total_price - out) * 100) / 100);
  const keys = Math.min(BASE_RULES.max, BASE_RULES.minimumsUsd.filter((m) => spendUsd + 1e-6 >= m).length);
  const to = BASE_RULES.minimumsUsd[keys];
  const from = keys ? BASE_RULES.minimumsUsd[keys - 1] : 0;
  return {
    keys,
    max: BASE_RULES.max,
    spendUsd,
    next: to == null ? null : { leftUsd: Math.round((to - spendUsd) * 100) / 100, progress: (spendUsd - from) / (to - from) },
    rules: st.sync === 'old' ? BASE_RULES : NEW_RULES,
    basket: doc,
  };
}

function body(req) {
  try {
    return JSON.parse(req.postData ?? '{}');
  } catch {
    return {};
  }
}

function route(req, origin, st) {
  const url = req.url;
  let u;
  try {
    u = new URL(url);
  } catch {
    return url.startsWith('data:') || url.startsWith('blob:') ? 'pass' : json({}, 404);
  }
  if (url.startsWith(origin)) {
    if (u.pathname.startsWith('/market/icons/')) return { status: 200, type: 'image/png', body: HEAD_PNG };
    if (u.pathname.startsWith('/market/') && u.pathname.endsWith('.json')) return json({ error: 'not found' }, 404);
    return 'pass';
  }
  if (url.startsWith('data:') || url.startsWith('blob:')) return 'pass';
  const host = u.hostname;
  if (host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com') return 'pass';
  if (req.method === 'OPTIONS') return { status: 204, type: 'text/plain', body: '' };
  if (host === 'api.chromabit.us') {
    if (u.pathname === '/api/status') return fileOr404(join(FIX, 'status.json'));
    if (u.pathname === '/store/offers' && req.method === 'GET') {
      st.hits.offers++;
      if (!st.offers) return json({ error: 'not found' }, 404);
      return json({ fetchedAt: Math.floor(FROZEN_TIME / 1000), sales: {}, packages: {}, freeKeys: st.offers });
    }
    if (req.method === 'POST' && u.pathname === `/store/basket/${BASKET_IDENT}/freekeys`) {
      st.hits.sync++;
      const n = st.hits.sync;
      const answer = () => {
        st.hits.syncAnswered++;
        if (st.sync === 'fail') return json({ error: 'boom' }, 500);
        if (st.sync === 'down') return json({ error: 'not found' }, 404);
        return json(syncDoc(st));
      };
      // Held back: the answer is built when it is sent, so it reflects the basket then.
      if (n === 1 && st.holdFirstSync) return { later: st.holdFirstSync, make: answer };
      return answer();
    }
    return json({ error: 'not found' }, 404);
  }
  if (host === 'headless.tebex.io') {
    if (/\/categories$/.test(u.pathname)) {
      st.hits.categories++;
      const answer = () => {
        st.hits.categoriesAnswered++;
        return json(st.body);
      };
      // Held back (the AC3 load-time checks): every request until `holdCategories` ms after the first
      // (the restored basket re-prices with a second request that replaces the first), built when sent.
      if (st.holdCategories) {
        st.catHoldUntil ??= Date.now() + st.holdCategories;
        const wait = st.catHoldUntil - Date.now();
        if (wait > 0) return { later: wait, make: answer };
      }
      return answer();
    }
    if (st.basket) {
      if (req.method === 'GET' && u.pathname.endsWith(`/baskets/${BASKET_IDENT}`)) return json({ data: basketDoc(st) });
      if (req.method === 'POST' && u.pathname.endsWith(`/baskets/${BASKET_IDENT}/packages`)) {
        const b = body(req);
        const p = st.body.data.flatMap((c) => c.packages ?? []).find((x) => x.id === Number(b.package_id));
        if (!p) return json({ title: 'not in the fixture catalogue' }, 422);
        st.hits.adds++;
        const qty = Number(b.quantity) || 1;
        const line = st.basket.lines.find((l) => l.id === p.id);
        if (line) line.in_basket.quantity += qty;
        else st.basket.lines.push(lineOf(p, qty));
        return json({ data: basketDoc(st) });
      }
      const put = u.pathname.match(new RegExp(`/baskets/${BASKET_IDENT}/packages/(\\d+)$`));
      if (req.method === 'PUT' && put) {
        const line = st.basket.lines.find((l) => l.id === Number(put[1]));
        if (!line) return json({ title: 'not in the basket' }, 422);
        st.hits.puts.push([line.id, Number(body(req).quantity)]);
        line.in_basket.quantity = Number(body(req).quantity) || line.in_basket.quantity;
        return json({ data: basketDoc(st) });
      }
      if (req.method === 'POST' && /\/accounts\/[^/]+\/baskets$/.test(u.pathname)) return json({ data: basketDoc(st) });
    }
    return json({ data: [] });
  }
  if (host === 'api.mcsrvstat.us') return fileOr404(join(FIX, 'mcsrvstat.json'));
  if (host === 'discord.com' && u.pathname.startsWith('/api/')) return fileOr404(join(FIX, 'discord-invite.json'));
  if (host === 'mc-heads.net') return { status: 200, type: 'image/png', body: HEAD_PNG };
  if (host.endsWith('posthog.com')) return { status: 200, type: 'application/json', body: u.pathname.endsWith('.js') ? '' : '{}' };
  return json({}, 404);
}

// ------------------------------------------------------------------ page --

/** In-page helpers, installed on every document as window.__fk; the shout recorder starts before the app runs. */
const LIB = `(() => {
  const L = (window.__fk = {
    shouts: [],
    vis(e) { if (!e) return false; if (!e.getClientRects().length) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none'; },
    first(sel) { return [...document.querySelectorAll(sel)].find((e) => this.vis(e)) || null; },
    text(e) { return ((e && (e.innerText ?? e.textContent)) || '').replace(/\\s+/g, ' ').trim(); },
    card(name) { return [...document.querySelectorAll('.pkg-card')].find((c) => this.vis(c) && (c.querySelector('.pkg-name')?.textContent || '').trim() === name) || null; },
    line(name) { return [...document.querySelectorAll('.cart-drawer .cart-item')].find((c) => (c.querySelector('.cart-item-name')?.textContent || '').trim() === name) || null; },
    modal() { return this.first('.modal-overlay'); },
    where(e) {
      const line = e.closest('.cart-item'); if (line) return 'cart:' + (line.querySelector('.cart-item-name')?.textContent || '').trim();
      const card = e.closest('.pkg-card'); if (card) return 'card:' + (card.querySelector('.pkg-name')?.textContent || '').trim();
      return e.closest('.modal-overlay') ? 'modal' : 'other';
    },
    /** Types a value into the stepper inside scope (the way a buyer does: input, then blur). */
    type(scope, value) {
      const i = scope && scope.querySelector('input.qty-input'); if (!i) return false;
      i.value = String(value); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); return true;
    },
    plus(scope) { const b = scope && scope.querySelector('.qty-btn--up'); if (!b || b.disabled) return false; b.click(); return true; },
    stepValue(scope) { const n = scope && scope.querySelector('.qty-num'); return n ? n.textContent.trim() : null; },
    chip(scope) { const c = scope && scope.querySelector('.pkg-freekey-chip'); return c && this.vis(c) ? this.text(c) : null; },
    progress() { const b = document.querySelector('.cart-drawer .cart-keys-bar'); const t = document.querySelector('.cart-drawer .cart-keys-text'); return b ? { now: b.getAttribute('aria-valuenow'), text: this.text(t) } : null; },
    banner() { const b = this.first('.store-promo--key'); return b ? this.text(b) : null; },
    /** Visible (posthoc AC3): a non-empty border box and computed visibility not hidden (display: none has no box). */
    shown(e) { if (!e || !e.isConnected) return false; const r = e.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return false; return getComputedStyle(e).visibility !== 'hidden'; },
    promoShown() { return [...document.querySelectorAll('.store-promo--key')].some((e) => this.shown(e)); },
    promoMemory() { const v = localStorage.getItem(${JSON.stringify(PROMO_KEY)}); if (v == null) return { raw: null }; try { return { raw: v, value: JSON.parse(v) }; } catch { return { raw: v, bad: true }; } },
    cartKeys() { return !!document.querySelector('.cart-drawer .cart-keys'); },
    badge() { return (document.querySelector('.cart-fab-badge')?.textContent || '').trim(); },
  });
  new MutationObserver((ms) => {
    for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      for (const e of [n, ...n.querySelectorAll('.qty-levelup')]) {
        if (!e.classList.contains('qty-levelup')) continue;
        L.shouts.push({ text: (e.textContent || '').trim(), key: e.classList.contains('qty-levelup--key'), where: L.where(e) });
      }
    }
  }).observe(document, { childList: true, subtree: true });
})();`;

async function openPage(b, origin, { width = 1280, fixture = MODES_FIX, init = '', lines = [], offers = NEW_RULES, sync = 'new', holdFirstSync = 0, holdCategories = 0 } = {}) {
  const { browserContextId } = await b.send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => b.send(m, p, sessionId);
  const st = { body: raw(fixture), basket: { lines: lines.map(([p, n]) => lineOf(p, n)) }, offers, sync, holdFirstSync, holdCategories, hits: { categories: 0, categoriesAnswered: 0, offers: 0, adds: 0, puts: [], sync: 0, syncAnswered: 0, syncAborted: 0 } };
  const inflight = new Set();
  const syncIds = new Set();
  let lastNet = Date.now();
  let loads = 0;
  const fulfill = (p, r) =>
    (r === 'pass'
      ? s('Fetch.continueRequest', { requestId: p.requestId })
      : s('Fetch.fulfillRequest', {
          requestId: p.requestId,
          responseCode: r.status,
          responseHeaders: [
            { name: 'Content-Type', value: r.type },
            { name: 'Access-Control-Allow-Origin', value: '*' },
            { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
            { name: 'Access-Control-Allow-Headers', value: 'Content-Type' },
            { name: 'Cache-Control', value: 'no-store' },
          ],
          body: Buffer.from(r.body).toString('base64'),
        })
    ).catch(() => {});
  const listener = (d) => {
    if (d.sessionId !== sessionId) return;
    const p = d.params;
    if (d.method === 'Network.requestWillBeSent') {
      // A held-back sync is not page-load traffic; goto() must not wait it out.
      if (/\/freekeys$/.test(p.request?.url ?? '')) return void syncIds.add(p.requestId);
      inflight.add(p.requestId);
      lastNet = Date.now();
    } else if (d.method === 'Network.loadingFinished' || d.method === 'Network.loadingFailed') {
      if (d.method === 'Network.loadingFailed' && syncIds.has(p.requestId)) st.hits.syncAborted++;
      inflight.delete(p.requestId);
      lastNet = Date.now();
    } else if (d.method === 'Page.loadEventFired') loads++;
    else if (d.method === 'Fetch.requestPaused') {
      const r = route(p.request, origin, st);
      if (r && r.later) setTimeout(() => fulfill(p, r.make()), r.later);
      else fulfill(p, r);
    }
  };
  b.listeners.add(listener);
  const ev = async (expression) => {
    const r = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(r.exceptionDetails).slice(0, 400)}`);
    return r.result.value;
  };
  /** Polls an expression until it is truthy (or `ms` pass); returns its last value. */
  const until = async (expression, ms = 5000) => {
    const end = Date.now() + ms;
    let v;
    do {
      v = await ev(expression);
      if (v) return v;
      await sleep(100);
    } while (Date.now() < end);
    return v;
  };
  /** Polls a node-side condition (the stub's state). */
  const untilNode = async (fn, ms = 5000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (fn()) return true;
      await sleep(100);
    }
    return !!fn();
  };
  /** Navigates and waits for the load event, then (unless `idle` is false) for 400 ms of network quiet, at most 6 s. */
  const goto = async (path, { idle = true } = {}) => {
    const before = loads;
    await s('Page.navigate', { url: `${origin}${path}` });
    for (let i = 0; i < 300 && loads === before; i++) await sleep(100);
    if (loads === before) throw new Error('no load event in 30 s');
    if (!idle) return;
    const end = Date.now() + 6000;
    while (Date.now() < end && !(inflight.size === 0 && Date.now() - lastNet >= 400)) await sleep(100);
  };
  const close = async () => {
    b.listeners.delete(listener);
    await b.send('Target.closeTarget', { targetId }).catch(() => {});
    await b.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
  };
  try {
    await s('Page.enable');
    await s('Runtime.enable');
    await s('Network.enable');
    await s('Network.setCacheDisabled', { cacheDisabled: true });
    await s('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    await s('Emulation.setDeviceMetricsOverride', { width, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
    await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await s('Emulation.setTimezoneOverride', { timezoneId: 'UTC' });
    await s('Emulation.setLocaleOverride', { locale: 'en-US' });
    await s('Page.addScriptToEvaluateOnNewDocument', { source: FREEZE(FROZEN_TIME) });
    await s('Page.addScriptToEvaluateOnNewDocument', { source: LIB });
    await s('Page.addScriptToEvaluateOnNewDocument', { source: SEED_BASKET });
    if (init) await s('Page.addScriptToEvaluateOnNewDocument', { source: init });
  } catch (e) {
    await close();
    throw e;
  }
  return { s, ev, until, untilNode, goto, close, st, width };
}

/** A saved basket for Steve (Java), so the store restores it from the stub. */
const SEED_BASKET = `try { if (!sessionStorage.getItem('__basket')) { localStorage.setItem('chromabit_username', 'Steve'); localStorage.setItem('chromabit_platform', 'java'); localStorage.setItem('chromabit_basket', JSON.stringify({ ident: ${q(BASKET_IDENT)}, username: 'Steve', at: ${FROZEN_TIME} })); sessionStorage.setItem('__basket', '1'); } } catch {}`;
const remember = (v) => `try { if (!sessionStorage.getItem('__seeded')) { localStorage.setItem(${q(MODE_KEY)}, ${q(v)}); sessionStorage.setItem('__seeded', '1'); } } catch {}`;
/** Seeds chromabit_store_keypromo with a raw string (once per context, before the app runs). */
const rememberPromo = (rawValue) => `try { if (!sessionStorage.getItem('__seededPromo')) { localStorage.setItem(${q(PROMO_KEY)}, ${q(rawValue)}); sessionStorage.setItem('__seededPromo', '1'); } } catch {}`;
/**
 * posthoc AC3: a requestAnimationFrame loop installed before the document parses
 * (rAF runs before every paint, so each painted frame is sampled, the
 * prerendered HTML's first one included). Records the frames that show a
 * visible .store-promo--key, and how many frames were sampled while the store
 * was still loading (a visible .store-status-msg, no .pkg-card) and after the
 * first card.
 */
const PROMO_SAMPLER = `(() => {
  const f = (window.__promo = { frames: 0, loading: 0, afterCards: 0, seen: [] });
  const tick = () => {
    f.frames++;
    const L = window.__fk;
    if (L) {
      const cards = !!document.querySelector('.pkg-card');
      if (cards) f.afterCards++;
      else if (L.vis(document.querySelector('.store-status-msg'))) f.loading++;
      if (L.promoShown() && f.seen.length < 10) f.seen.push({ frame: f.frames, cards, loading: !cards });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

// --------------------------------------------------------------- helpers --

/** Harness: the store rendered a card from the stub, the categories and offers stubs were hit. */
async function storeLoaded(page, label, { offers = true } = {}) {
  const r = await page.until(`window.__fk.first('.pkg-card') ? true : (window.__fk.first('.store-banner.error') ? 'error' : false)`, 10_000);
  await page.untilNode(() => page.st.hits.offers > 0, 3000);
  need(`${label}: (harness) store loaded from the stubs`, [
    page.st.hits.categories < 1 && 'the Tebex categories stub was never requested',
    offers && page.st.hits.offers < 1 && 'the /store/offers stub was never requested',
    r === 'error' && 'the store shows its load-error banner',
    !r && 'no .pkg-card rendered in 10 s',
  ]);
}
const clickSel = (page, sel) => page.ev(`(() => { const e = document.querySelector(${q(sel)}); if (!e) return false; e.click(); return true; })()`);
async function switchMode(page, label, key) {
  const ok = await clickSel(page, `[data-mode="${key}"]`);
  const on = await page.until(`document.querySelector('[data-mode="${key}"]')?.getAttribute('aria-checked') === 'true'`, 3000);
  need(`${label}: (harness) switched to ${key.toUpperCase()}`, [!ok && `no [data-mode="${key}"] in the switch`, !on && `[data-mode="${key}"] is not aria-checked after the click`]);
  await sleep(300);
}
/** Shouts recorded since the last clear, at one place ('card:<name>', 'cart:<name>', 'modal'). */
const clearShouts = (page) => page.ev(`(window.__fk.shouts = [], true)`);
const shoutsAt = (page, where) => page.ev(`window.__fk.shouts.filter((x) => x.where === ${q(where)})`);
const keyShouts = (list) => list.filter((x) => x.key || /FREE KEY/i.test(x.text));

/** Types `value` into a card's stepper; proves the stepper took it; returns { shouts, chip }. */
async function typeOnCard(page, label, name, value) {
  await clearShouts(page);
  const ok = await page.ev(`window.__fk.type(window.__fk.card(${q(name)}), ${value})`);
  const took = await page.until(`window.__fk.stepValue(window.__fk.card(${q(name)})) === ${q(String(value))}`, 3000);
  need(`${label}: (harness) the ${name} card stepper took ${value}`, [!ok && `no rendered ${name} card with input.qty-input`, !took && `the card stepper shows ${q(await page.ev(`window.__fk.stepValue(window.__fk.card(${q(name)}))`))}`]);
  await sleep(500);
  return { shouts: await shoutsAt(page, `card:${name}`), chip: await page.ev(`window.__fk.chip(window.__fk.card(${q(name)}))`) };
}
/** Clicks a card's add-to-cart button and waits for the basket stub and the sync. */
async function addFromCard(page, label, name, badge) {
  const adds = page.st.hits.adds;
  const syncs = page.st.hits.syncAnswered;
  const ok = await page.ev(`(() => { const c = window.__fk.card(${q(name)}); const b = c && c.querySelector('.pkg-cart-btn'); if (!b || b.disabled) return false; b.click(); return true; })()`);
  await page.untilNode(() => page.st.hits.adds > adds && page.st.hits.syncAnswered > syncs, 8000);
  const shown = await page.until(`window.__fk.badge() === ${q(String(badge))}`, 8000);
  need(`${label}: (harness) ${name} added through the basket stub and synced`, [
    !ok && `no enabled .pkg-cart-btn on the ${name} card`,
    page.st.hits.adds <= adds && 'the basket stub got no add',
    page.st.hits.syncAnswered <= syncs && 'the free-key sync stub was not called after the add',
    !shown && `cart badge ${q(await page.ev('window.__fk.badge()'))}, want ${q(String(badge))}`,
  ]);
}
/**
 * Opens the cart and waits for its lines and (unless `progress` is false) the
 * free-key progress. `progress: false` is for a PVP-only cart, where posthoc AC2
 * removes the box: the scenario then fails on the AC2 check, not here.
 */
async function openCart(page, label, lines, { progress = true } = {}) {
  await clickSel(page, '.cart-fab');
  const ok = await page.until(`document.querySelectorAll('.cart-drawer.open .cart-item').length >= ${lines}${progress ? ' && !!window.__fk.progress()' : ''}`, 5000);
  need(`${label}: (harness) the cart is open with ${lines} line(s)${progress ? ' and the free-key progress' : ''}`, ok ? [] : [`open drawer lines ${await page.ev(`document.querySelectorAll('.cart-drawer.open .cart-item').length`)}, progress ${q(await page.ev('window.__fk.progress()'))}`]);
}
/** posthoc AC2: waits up to `ms` for the drawer to have no .cart-keys; returns the problems. */
async function noKeyBox(page, ms = 4000) {
  const gone = await page.until('!window.__fk.cartKeys()', ms);
  return gone ? [] : [`.cart-drawer .cart-keys is rendered (progress ${q(await page.ev('window.__fk.progress()'))})`];
}
/** Waits up to `ms` for the progress to read `exp` ({ now, text }); returns the last reading. */
async function progressBecomes(page, exp, ms = 4000) {
  await page.until(`(() => { const p = window.__fk.progress(); return !!p && p.now === ${q(exp.now)} && p.text === ${q(exp.text)}; })()`, ms);
  return page.ev('window.__fk.progress()');
}
const progressProblems = (got, exp) => (!got ? ['no .cart-keys-bar in the drawer'] : [want('aria-valuenow', got.now, exp.now), want('text', got.text, exp.text)]);
const more = (left) => ({ text: `${money(left)} MORE FOR A FREE KEY` });

/** Clicks + on a cart line; proves the stepper and the basket stub took it; returns the shouts on that line. */
async function plusOnLine(page, label, name, to) {
  await page.until(`!!window.__fk.line(${q(name)}) && !window.__fk.line(${q(name)}).querySelector('.qty-btn--up').disabled`, 5000);
  await clearShouts(page);
  const puts = page.st.hits.puts.length;
  const syncs = page.st.hits.syncAnswered;
  const ok = await page.ev(`window.__fk.plus(window.__fk.line(${q(name)}))`);
  const shown = await page.until(`window.__fk.stepValue(window.__fk.line(${q(name)})) === ${q(String(to))}`, 3000);
  const shouts = await shoutsAt(page, `cart:${name}`);
  const sent = await page.untilNode(() => page.st.hits.puts.slice(puts).some(([id, n]) => id === byName(name).id && n === to) && page.st.hits.syncAnswered > syncs, 6000);
  need(`${label}: (harness) + on the ${name} line stepped it to ${to} and the basket stub got it`, [!ok && `no enabled .qty-btn--up on the ${name} line`, !shown && `the line stepper shows ${q(await page.ev(`window.__fk.stepValue(window.__fk.line(${q(name)}))`))}`, !sent && `no PUT quantity ${to} for ${name} followed by a sync (puts ${q(page.st.hits.puts.slice(puts))})`]);
  return [...shouts, ...(await shoutsAt(page, `cart:${name}`)).slice(shouts.length)];
}
/** Types `value` into a cart line's stepper; proves the stepper and the basket stub took it; returns the shouts. */
async function typeOnLine(page, label, name, value) {
  await page.until(`!!window.__fk.line(${q(name)}) && !window.__fk.line(${q(name)}).querySelector('input.qty-input').disabled`, 5000);
  await clearShouts(page);
  const puts = page.st.hits.puts.length;
  const syncs = page.st.hits.syncAnswered;
  const ok = await page.ev(`window.__fk.type(window.__fk.line(${q(name)}), ${value})`);
  const shown = await page.until(`window.__fk.stepValue(window.__fk.line(${q(name)})) === ${q(String(value))}`, 3000);
  const shouts = await shoutsAt(page, `cart:${name}`);
  const sent = await page.untilNode(() => page.st.hits.puts.slice(puts).some(([id, n]) => id === byName(name).id && n === value) && page.st.hits.syncAnswered > syncs, 6000);
  need(`${label}: (harness) the ${name} line stepper took ${value} and the basket stub got it`, [!ok && `no input.qty-input on the ${name} line`, !shown && `the line stepper shows ${q(await page.ev(`window.__fk.stepValue(window.__fk.line(${q(name)}))`))}`, !sent && `no PUT quantity ${value} for ${name} followed by a sync (puts ${q(page.st.hits.puts.slice(puts))})`]);
  return shouts;
}

// ------------------------------------------------------------- scenarios --

async function pvpOnly(b, origin) {
  const L = 'pvp-only';
  const page = await openPage(b, origin);
  try {
    await page.goto('/store/?mode=smp');
    await storeLoaded(page, L);
    const smpBanner = await page.until(`window.__fk.banner()`, 3000);
    // Not a stop: a banner wrongly hidden in SMP is a feature failure, and the cart's "$9.99 MORE" below proves the rules too.
    check('AC3 the FREE KEYS banner is shown in SMP mode, with the offers rules applied (US$9.99, the first minimum of the stub)', smpBanner && smpBanner.includes('US$9.99') ? [] : [`banner ${q(smpBanner)}`]);
    await switchMode(page, L, 'pvp');
    check('AC3 the FREE KEYS banner is hidden in PVP mode', (await page.ev('window.__fk.banner()')) ? [`rendered .store-promo--key in PVP: ${q(await page.ev('window.__fk.banner()'))}`] : []);

    const card = await typeOnCard(page, L, PRISM.name, 5);
    check(`AC1 the ${PRISM.name} card stepper typed to 5 (${money(5 * PRISM.total_price)}) shouts no FREE KEY!`, keyShouts(card.shouts).length ? [`shouts ${q(card.shouts)}`] : []);
    check(`AC1 the ${PRISM.name} card shows no free-key chip at 5`, card.chip ? [`.pkg-freekey-chip ${q(card.chip)}`] : []);

    await addFromCard(page, L, PRISM.name, 5);
    await openCart(page, L, 1, { progress: false });
    // posthoc AC2 (owner 2026-11-13): was "leaves the progress at 0, $9.99 MORE"; the box is now hidden when no line counts.
    check(`posthoc AC2 a PVP-only basket (5 x ${money(PRISM.total_price)} = ${money(5 * PRISM.total_price)}) shows no free-key box (.cart-drawer .cart-keys)`, await noKeyBox(page));

    const line = await typeOnLine(page, L, PRISM.name, 10);
    check(`AC1 the ${PRISM.name} cart line typed 5 -> 10 (${money(10 * PRISM.total_price)}) shouts no FREE KEY!`, keyShouts(line).length ? [`shouts ${q(line)}`] : []);
    check('posthoc AC2 after the PVP line went to 10 there is still no free-key box', await noKeyBox(page));

    // The package modal's stepper.
    await clickSel(page, '.cart-close');
    await page.until(`!document.querySelector('.cart-drawer.open')`, 3000);
    await page.ev(`(() => { const c = window.__fk.card(${q(PRISM.name)}); const n = c && c.querySelector('.pkg-name'); if (n) n.click(); return !!n; })()`);
    const modal = await page.until(`!!(window.__fk.modal() && window.__fk.modal().querySelector('input.qty-input'))`, 3000);
    need(`${L}: (harness) the ${PRISM.name} package modal is open with a stepper`, modal ? [] : ['no rendered .modal-overlay with input.qty-input']);
    await clearShouts(page);
    await page.ev(`window.__fk.type(window.__fk.modal(), 5)`);
    const took = await page.until(`window.__fk.stepValue(window.__fk.modal()) === '5'`, 3000);
    need(`${L}: (harness) the modal stepper took 5`, took ? [] : [`the modal stepper shows ${q(await page.ev('window.__fk.stepValue(window.__fk.modal())'))}`]);
    await sleep(500);
    const ms = await shoutsAt(page, 'modal');
    check(`AC1 the ${PRISM.name} modal stepper typed to 5 shouts no FREE KEY!`, keyShouts(ms).length ? [`shouts ${q(ms)}`] : []);
    check(`AC1 the ${PRISM.name} modal shows no free-key chip at 5`, (await page.ev('window.__fk.chip(window.__fk.modal())')) ? [`.pkg-freekey-chip ${q(await page.ev('window.__fk.chip(window.__fk.modal())'))}`] : []);
  } finally {
    await page.close();
  }
}

async function smpOnly(b, origin) {
  const L = 'smp-only';
  const page = await openPage(b, origin);
  try {
    await page.goto('/store/?mode=smp');
    await storeLoaded(page, L);
    const banner = await page.until(`window.__fk.banner()`, 3000);
    check('AC3/AC4 (as today) SMP mode shows the FREE KEYS banner with the offers rules applied (US$9.99)', banner && banner.includes('US$9.99') ? [] : [`banner ${q(banner)}`]);
    const card = await typeOnCard(page, L, CHEST.name, 2);
    check(`AC1 (as today) the ${CHEST.name} card stepper typed to 2 (${money(2 * CHEST.total_price)}) shouts FREE KEY!`, keyShouts(card.shouts).length ? [] : [`shouts ${q(card.shouts)}`]);
    check(`AC1 (as today) the ${CHEST.name} card shows "+1 FREE KEY" at 2`, want('.pkg-freekey-chip', card.chip, '+1 FREE KEY') ?? []);
    await typeOnCard(page, L, CHEST.name, 1);
    await addFromCard(page, L, CHEST.name, 1);
    await openCart(page, L, 1);
    const exp = { now: '80', ...more(2) };
    check(`AC2 (as today) an SMP-only basket (${money(CHEST.total_price)}) moves the progress: 80, "$2.00 MORE"`, progressProblems(await progressBecomes(page, exp), exp));
    const line = await plusOnLine(page, L, CHEST.name, 2);
    check(`AC1 (as today) + on the ${CHEST.name} line (1 -> 2, ${money(2 * CHEST.total_price)}) shouts FREE KEY!`, keyShouts(line).length ? [] : [`shouts ${q(line)}`]);
  } finally {
    await page.close();
  }
}

async function mixed(b, origin) {
  const L = 'mixed';
  const page = await openPage(b, origin, { lines: [[PRISM, 2], [CHEST, 1]], holdFirstSync: 6000 });
  const exp = { now: '80', ...more(2) };
  try {
    await page.goto('/store/?mode=pvp', { idle: false });
    await storeLoaded(page, L);
    await page.untilNode(() => page.st.hits.sync > 0, 6000);
    const restored = await page.until(`document.querySelectorAll('.cart-drawer .cart-item').length === 2 && !!window.__fk.progress()`, 4000);
    await clickSel(page, '.cart-fab');
    await page.until(`!!document.querySelector('.cart-drawer.open')`, 2000);
    await sleep(300);
    const early = await page.ev('window.__fk.progress()');
    need(`${L}: (harness) the saved basket (PVP x2 + ${CHEST.name} x1) is in the open cart while the first sync is still unanswered`, [
      page.st.hits.sync < 1 && 'the free-key sync stub was never called',
      page.st.hits.syncAnswered > 0 && 'the sync was already answered (the sample is not before the round trip)',
      !restored && `cart lines ${await page.ev(`document.querySelectorAll('.cart-drawer .cart-item').length`)}, want 2`,
    ]);
    check(`AC2 before the sync answers, a mixed basket (${money(13.97)}, ${money(CHEST.total_price)} SMP) counts only the SMP part: 80, "$2.00 MORE"`, progressProblems(early, exp));
    await page.untilNode(() => page.st.hits.syncAnswered > 0, 10000);
    await sleep(300);
    need(`${L}: (harness) the held sync was answered and reached the page (not aborted by its 8 s timeout)`, [page.st.hits.syncAnswered < 1 && 'the sync stub never answered', page.st.hits.syncAborted > 0 && 'the page gave up on the sync request (Network.loadingFailed)']);
    check('AC2 after the sync answers (spendUsd 7.99), the progress is 80, "$2.00 MORE"', progressProblems(await progressBecomes(page, exp), exp));
    await clickSel(page, '.cart-close');
    await page.until(`!document.querySelector('.cart-drawer.open')`, 3000);

    await addFromCard(page, L, PRISM.name, 4);
    await openCart(page, L, 2);
    check(`AC1 adding one more ${PRISM.name} does not move the progress (80, "$2.00 MORE")`, progressProblems(await progressBecomes(page, exp), exp));
    const pvp = await plusOnLine(page, L, PRISM.name, 4);
    check(`AC1 + on the ${PRISM.name} line (3 -> 4; ${money(CHEST.total_price)} + ${money(PRISM.total_price)} would cross US$9.99) shouts no FREE KEY!`, keyShouts(pvp).length ? [`shouts ${q(pvp)}`] : []);
    check('AC1 after the PVP line went to 4 the progress is still 80', progressProblems(await progressBecomes(page, exp), exp));
    const smp = await plusOnLine(page, L, CHEST.name, 2);
    check(`AC1 (as today) + on the ${CHEST.name} line in the same cart (1 -> 2) shouts FREE KEY!`, keyShouts(smp).length ? [] : [`shouts ${q(smp)}`]);
  } finally {
    await page.close();
  }
}

async function pvpRestore(b, origin) {
  const L = 'pvp-restore';
  const page = await openPage(b, origin, { lines: [[PRISM, 3]], holdFirstSync: 6000 });
  try {
    await page.goto('/store/?mode=pvp', { idle: false });
    await storeLoaded(page, L);
    await page.untilNode(() => page.st.hits.sync > 0, 6000);
    await clickSel(page, '.cart-fab');
    // No wait for the progress: posthoc AC2 removes the box from a PVP-only cart.
    const ok = await page.until(`document.querySelectorAll('.cart-drawer.open .cart-item').length === 1`, 3000);
    await sleep(300);
    const box = await page.ev('window.__fk.cartKeys()');
    const early = await page.ev('window.__fk.progress()');
    need(`${L}: (harness) the saved PVP x3 basket is in the open cart while the sync is unanswered`, [!ok && 'no open cart with one line', page.st.hits.syncAnswered > 0 && 'the sync was already answered']);
    // posthoc AC2 (owner 2026-11-13): was "leaves the progress at 0, $9.99 MORE"; the box is now hidden when no line counts.
    check(`posthoc AC2 before the sync answers, a PVP-only basket (${money(3 * PRISM.total_price)}) shows no free-key box (.cart-drawer .cart-keys)`, box ? [`.cart-drawer .cart-keys is rendered (progress ${q(early)})`] : []);
  } finally {
    await page.close();
  }
}

async function syncFail(b, origin) {
  const L = 'sync-fail';
  const page = await openPage(b, origin, { lines: [[PRISM, 2], [CHEST, 1]], sync: 'fail' });
  const exp = { now: '80', ...more(2) };
  try {
    await page.goto('/store/?mode=pvp');
    await storeLoaded(page, L);
    await page.untilNode(() => page.st.hits.syncAnswered > 0, 6000);
    await openCart(page, L, 2);
    need(`${L}: (harness) the free-key sync stub answered 500`, page.st.hits.syncAnswered > 0 ? [] : ['the sync stub was never answered']);
    check('AC2 with the sync failing, a mixed basket counts only the SMP part: 80, "$2.00 MORE"', progressProblems(await progressBecomes(page, exp), exp));
    await clickSel(page, '.cart-close');
    await page.until(`!document.querySelector('.cart-drawer.open')`, 3000);
    await addFromCard(page, L, PRISM.name, 4);
    await openCart(page, L, 2);
    check(`AC1/AC2 with the sync failing, one more ${PRISM.name} does not move the progress (80)`, progressProblems(await progressBecomes(page, exp), exp));
  } finally {
    await page.close();
  }
}

async function banner(b, origin) {
  const L = 'banner';
  const page = await openPage(b, origin);
  try {
    await page.goto('/store/?mode=pvp');
    await storeLoaded(page, L);
    await sleep(500);
    check('AC3 ?mode=pvp: no FREE KEYS banner', (await page.ev('window.__fk.banner()')) ? [`rendered .store-promo--key: ${q(await page.ev('window.__fk.banner()'))}`] : []);
    await switchMode(page, L, 'smp');
    const s = await page.until('window.__fk.banner()', 3000);
    check('AC3 switched to SMP: the FREE KEYS banner is shown (US$9.99)', s && s.includes('US$9.99') ? [] : [`banner ${q(s)}`]);
    await switchMode(page, L, 'pvp');
    check('AC3 switched back to PVP: the banner is hidden again', (await page.ev('window.__fk.banner()')) ? [`rendered .store-promo--key: ${q(await page.ev('window.__fk.banner()'))}`] : []);
  } finally {
    await page.close();
  }
}

async function flat(b, origin) {
  const L = 'flat';
  const page = await openPage(b, origin, { fixture: FLAT_FIX, init: remember('pvp') });
  try {
    await page.goto('/store/?mode=pvp');
    await storeLoaded(page, L);
    const s = await page.until('window.__fk.banner()', 3000);
    check('AC3 flat catalogue (no modes, rules with the PVP ids): the FREE KEYS banner is shown (US$9.99)', s && s.includes('US$9.99') ? [] : [`banner ${q(s)}`]);
  } finally {
    await page.close();
  }
}

async function noField(b, origin) {
  const L = 'no-field';
  const page = await openPage(b, origin, { offers: BASE_RULES, sync: 'old' });
  try {
    await page.goto('/store/?mode=pvp');
    await storeLoaded(page, L);
    const s = await page.until('window.__fk.banner()', 3000);
    check('AC4 without ineligiblePackageIds the FREE KEYS banner is shown in PVP mode (US$9.99)', s && s.includes('US$9.99') ? [] : [`banner ${q(s)}`]);
    const card = await typeOnCard(page, L, PRISM.name, 5);
    check(`AC4 without the field the ${PRISM.name} card typed to 5 shouts FREE KEY! (as today)`, keyShouts(card.shouts).length ? [] : [`shouts ${q(card.shouts)}`]);
    check(`AC4 without the field the ${PRISM.name} card shows "+1 FREE KEY" at 5 (as today)`, want('.pkg-freekey-chip', card.chip, '+1 FREE KEY') ?? []);
    await typeOnCard(page, L, PRISM.name, 3);
    await addFromCard(page, L, PRISM.name, 3);
    await openCart(page, L, 1);
    const exp = { now: '90', ...more(9.99 - 3 * PRISM.total_price) };
    check(`AC4 without the field a PVP line moves the progress (${money(3 * PRISM.total_price)}: 90, "${exp.text}")`, progressProblems(await progressBecomes(page, exp), exp));
    const line = await plusOnLine(page, L, PRISM.name, 4);
    check(`AC4 without the field + on the ${PRISM.name} line (3 -> 4, ${money(4 * PRISM.total_price)}) shouts FREE KEY! (as today)`, keyShouts(line).length ? [] : [`shouts ${q(line)}`]);
  } finally {
    await page.close();
  }
}

async function apiDown(b, origin) {
  const L = 'api-down';
  const page = await openPage(b, origin, { offers: null, sync: 'down' });
  try {
    await page.goto('/store/?mode=pvp');
    await storeLoaded(page, L);
    const s = await page.until('window.__fk.banner()', 3000);
    check('AC4 with /store/offers down the FREE KEYS banner is shown in PVP mode (built-in US$10.99)', s && s.includes('US$10.99') ? [] : [`banner ${q(s)}`]);
    await addFromCard(page, L, PRISM.name, 1);
    await openCart(page, L, 1);
    const exp = { now: '27', ...more(10.99 - PRISM.total_price) };
    check(`AC4 with the API down a PVP line moves the progress as today (${money(PRISM.total_price)}: 27, "${exp.text}")`, progressProblems(await progressBecomes(page, exp), exp));
  } finally {
    await page.close();
  }
}

async function narrow(b, origin) {
  const L = '400px';
  const page = await openPage(b, origin, { width: 400, lines: [[PRISM, 2], [CHEST, 1]] });
  try {
    await page.goto('/store/?mode=pvp');
    need(`${L}: (harness) the viewport is a true 400px`, want('innerWidth', await page.ev('innerWidth'), 400) ?? []);
    await storeLoaded(page, L);
    await page.untilNode(() => page.st.hits.syncAnswered > 0, 6000);
    await openCart(page, L, 2);
    await sleep(800);
    const got = await page.ev(`(() => {
      const W = innerWidth; const out = []; const sw = document.documentElement.scrollWidth;
      if (sw > W) out.push('document scrollWidth ' + sw + ' > ' + W);
      for (const sel of ['.cart-drawer.open', '.cart-drawer.open .cart-keys', '.cart-drawer.open .cart-keys-bar', '.cart-drawer.open .cart-item']) {
        for (const e of document.querySelectorAll(sel)) { const r = e.getBoundingClientRect(); if (r.left < -0.5 || r.right > W + 0.5) out.push(sel + ' spans ' + Math.round(r.left) + '..' + Math.round(r.right)); }
      }
      return out;
    })()`);
    check('AC5 400px, cart open on a mixed basket: no horizontal scroll, the drawer and its progress inside 0..400', got);
  } finally {
    await page.close();
  }
}

// ------------------------------------------------- posthoc (review fixes) --

/**
 * posthoc AC1 (review B-O1): the ineligible list arrives only with the sync
 * response, so FREE_KEY.ineligible is filled by useTebexBasket settle ->
 * applyRules(synced.rules). Green on the base by design; red when that call is removed.
 */
async function syncRules(b, origin, offers) {
  const L = offers ? 'sync-rules, offers without the field' : 'sync-rules, offers down';
  const page = await openPage(b, origin, { offers, sync: 'new' });
  try {
    await page.goto('/store/?mode=pvp');
    await storeLoaded(page, L);
    // Before any sync the page has no ineligible list (offers brought none), so the banner shows in PVP as today.
    if (page.st.hits.sync === 0) {
      const before = await page.until('window.__fk.promoShown()', 3000);
      need(`${L}: (harness) before any sync the page has no ineligible list (the FREE KEYS banner shows in PVP)`, before || page.st.hits.sync > 0 ? [] : ['no visible .store-promo--key before the first sync']);
    }
    await addFromCard(page, L, PRISM.name, 1);
    const hidden = await page.until('!window.__fk.promoShown()', 3000);
    check(`posthoc AC1 ${L}: once the sync brings ineligiblePackageIds the FREE KEYS banner is hidden in PVP`, hidden ? [] : [`visible .store-promo--key: ${q(await page.ev('window.__fk.banner()'))}`]);
    const card = await typeOnCard(page, L, PRISM.name, 5);
    check(`posthoc AC1 ${L}: the ${PRISM.name} card typed to 5 (${money(5 * PRISM.total_price)}) shows no free-key chip`, card.chip ? [`.pkg-freekey-chip ${q(card.chip)}`] : []);
    check(`posthoc AC1 ${L}: the ${PRISM.name} card typed to 5 shouts no FREE KEY!`, keyShouts(card.shouts).length ? [`shouts ${q(card.shouts)}`] : []);
    await openCart(page, L, 1, { progress: false });
    check(`posthoc AC2 ${L}: the PVP-only cart shows no free-key box`, await noKeyBox(page));
    const line = await typeOnLine(page, L, PRISM.name, 5);
    check(`posthoc AC1 ${L}: the ${PRISM.name} cart line typed 1 -> 5 (${money(5 * PRISM.total_price)}) shouts no FREE KEY!`, keyShouts(line).length ? [`shouts ${q(line)}`] : []);
  } finally {
    await page.close();
  }
}

/** posthoc AC2 guard (green on the base): the Chroma Key itself counts, so a PVP + Chroma Key cart keeps the box. */
async function pvpPlusKey(b, origin) {
  const L = 'pvp+key';
  const page = await openPage(b, origin, { lines: [[PRISM, 1], [KEY, 1]] });
  try {
    await page.goto('/store/?mode=pvp');
    await storeLoaded(page, L);
    await page.untilNode(() => page.st.hits.syncAnswered > 0, 6000);
    await openCart(page, L, 2, { progress: false });
    const shown = await page.until('window.__fk.cartKeys() && !!window.__fk.progress()', 4000);
    check(`posthoc AC2 a cart with ${PRISM.name} x1 and ${KEY.name} x1 (the key counts) shows the free-key box with its progress`, shown ? [] : [`.cart-keys ${await page.ev('window.__fk.cartKeys()')}, progress ${q(await page.ev('window.__fk.progress()'))}`]);
  } finally {
    await page.close();
  }
}

const HOLD = 3000;
/** Proves the categories response is still held and the store shows its loading state. */
async function stillLoading(page, label) {
  const loading = await page.until(`window.__fk.vis(document.querySelector('.store-status-msg')) && !document.querySelector('.pkg-card')`, 2000);
  need(`${label}: (harness) the store is still loading (categories requested, not answered; loading message, no card)`, [
    page.st.hits.categories < 1 && 'the categories stub was never requested',
    page.st.hits.categoriesAnswered > 0 && 'the categories were already answered',
    !loading && 'no visible .store-status-msg without cards',
  ]);
}

/** posthoc AC3 (a): a remembered "pvp": false paints no frame with a visible banner, before or after the load. */
async function promoNoFlash(b, origin, { path, init, label }) {
  const L = `promo memory (a) ${label}`;
  const page = await openPage(b, origin, { init: `${init}\n${PROMO_SAMPLER}`, holdCategories: HOLD });
  try {
    await page.goto(path, { idle: false });
    await stillLoading(page, L);
    await storeLoaded(page, L);
    const on = await page.until(`document.querySelector('[data-mode="pvp"]')?.getAttribute('aria-checked') === 'true'`, 3000);
    await sleep(800);
    const f = await page.ev('window.__promo');
    need(`${L}: (harness) PVP is the active mode and the frame sampler ran while loading and after the cards`, [
      !on && '[data-mode="pvp"] is not aria-checked',
      !f && 'no window.__promo',
      f && f.loading < 3 && `only ${f.loading} frame(s) sampled while loading`,
      f && f.afterCards < 5 && `only ${f.afterCards} frame(s) sampled after the first card`,
    ]);
    check(`posthoc AC3 (a) ${label}, {"pvp":false} remembered: no painted frame (prerender, loading, loaded) shows a visible FREE KEYS banner`, f.seen.length ? [`frames with a visible .store-promo--key: ${q(f.seen)}`] : []);
  } finally {
    await page.close();
  }
}

/** posthoc AC3 (b) and (d), guards: the banner is visible while the store loads and after. */
async function promoShownWhileLoading(b, origin, { path, init, label, tag, mode = 'smp', opts = {} }) {
  const L = `promo memory (${tag}) ${label}`;
  const page = await openPage(b, origin, { ...opts, init, holdCategories: HOLD });
  try {
    await page.goto(path, { idle: false });
    await stillLoading(page, L);
    const during = await page.ev('window.__fk.promoShown()');
    check(`posthoc AC3 (${tag}) ${label}: the FREE KEYS banner is visible while the store is loading`, during ? [] : ['no visible .store-promo--key during the load']);
    await storeLoaded(page, L);
    const on = await page.until(`document.querySelector('[data-mode="${mode}"]')?.getAttribute('aria-checked') === 'true'`, 3000);
    need(`${L}: (harness) ${mode.toUpperCase()} is the active mode after the load`, on ? [] : [`[data-mode="${mode}"] is not aria-checked`]);
    const after = await page.until('window.__fk.promoShown()', 3000);
    check(`posthoc AC3 (${tag}) ${label}: the FREE KEYS banner is visible after the load`, after ? [] : ['no visible .store-promo--key after the load']);
  } finally {
    await page.close();
  }
}

/** posthoc AC3 (c): the key is written per mode once the catalogue has loaded, and a wrong value is corrected. */
async function promoWrites(b, origin) {
  const L = 'promo memory (c)';
  const page = await openPage(b, origin);
  const memo = () => page.ev('window.__fk.promoMemory()');
  const isMap = (m) => !!m && !m.bad && m.value && typeof m.value === 'object' && !Array.isArray(m.value);
  try {
    await page.goto('/store/?mode=pvp');
    await storeLoaded(page, L);
    await page.until(`(() => { const m = window.__fk.promoMemory(); return !!m.value && m.value.pvp === false; })()`, 4000);
    const m1 = await memo();
    check(`posthoc AC3 (c) after a load in PVP with the ineligible rules, ${PROMO_KEY} holds "pvp": false`, isMap(m1) ? want('pvp', m1.value.pvp, false) ?? [] : [`${PROMO_KEY} = ${q(m1.raw)}, want a JSON object`]);
    await switchMode(page, L, 'smp');
    await page.until(`(() => { const m = window.__fk.promoMemory(); return !!m.value && m.value.smp === true; })()`, 4000);
    const m2 = await memo();
    check(`posthoc AC3 (c) after switching to SMP, ${PROMO_KEY} holds "smp": true and still "pvp": false`, isMap(m2) ? [want('smp', m2.value.smp, true), want('pvp', m2.value.pvp, false)] : [`${PROMO_KEY} = ${q(m2.raw)}, want a JSON object`]);
    check('posthoc AC3 (c) after switching to SMP the FREE KEYS banner is visible', (await page.until('window.__fk.promoShown()', 3000)) ? [] : ['no visible .store-promo--key']);
  } finally {
    await page.close();
  }

  const L2 = 'promo memory (c) wrong {"smp":false}';
  const page2 = await openPage(b, origin, { init: rememberPromo(JSON.stringify({ smp: false })) });
  try {
    await page2.goto('/store/?mode=smp');
    need(`${L2}: (harness) the seeded value is in localStorage`, (await page2.ev('window.__fk.promoMemory().raw')) ? [] : [`${PROMO_KEY} is empty`]);
    await storeLoaded(page2, L2);
    const shown = await page2.until('window.__fk.promoShown()', 3000);
    check('posthoc AC3 (c) a wrong remembered {"smp":false}: after the load in SMP the FREE KEYS banner is visible', shown ? [] : ['no visible .store-promo--key after the load']);
    await page2.until(`(() => { const m = window.__fk.promoMemory(); return !!m.value && m.value.smp === true; })()`, 4000);
    const m = await page2.ev('window.__fk.promoMemory()');
    check(`posthoc AC3 (c) a wrong remembered {"smp":false} is corrected: ${PROMO_KEY} holds "smp": true after the load`, isMap(m) ? want('smp', m.value.smp, true) ?? [] : [`${PROMO_KEY} = ${q(m.raw)}, want a JSON object`]);
  } finally {
    await page2.close();
  }
}

// ------------------------------------------------------------------ main --

/** `--only <text>`: run just the scenarios whose name contains it (a debugging aid; the npm script runs all). */
let ONLY = null;
async function run(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  try {
    await fn();
  } catch (e) {
    if (e instanceof Stop) console.log(`  (scenario "${name}" stopped at: ${e.message})`);
    else check(`${name}: harness`, [String(e?.stack ?? e).slice(0, 500)]);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--dist');
  const dist = resolve(i >= 0 ? args[i + 1] : join(ROOT, 'dist'));
  const o = args.indexOf('--only');
  if (o >= 0) ONLY = args[o + 1];
  if (!PRISM || !CHEST || !PVP_IDS.includes(PRISM.id)) return check('fixture', ['the store-modes fixture has no "3,000 Prism Coins" under PVP or no "Sell Chest"']);
  if (!KEY || KEY.id !== BASE_RULES.packageId || PVP_IDS.includes(KEY.id)) return check('fixture', ['the store-modes fixture has no SMP "Chroma Key" with the rules\' packageId']);
  const chrome = findChrome();
  if (!chrome) return check('chrome-found', ['no Chrome: set CHROME to chrome.exe']);
  if (!existsSync(join(dist, 'store', 'index.html'))) return check('dist-built', [`${dist} has no store/index.html: build first (npm run build)`]);
  const port = await freePort();
  const preview = spawn(process.execPath, [VITE, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--outDir', dist], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let log = '';
  preview.stdout.on('data', (d) => (log += d));
  preview.stderr.on('data', (d) => (log += d));
  const origin = `http://127.0.0.1:${port}`;
  const profile = mkdtempSync(join(tmpdir(), 'free-key-scope-check-'));
  let b = null;
  try {
    if (!(await waitReady(`${origin}/`, 30_000))) return check('preview-server', [`vite preview did not answer on ${origin}: ${JSON.stringify(log.slice(-300))}`]);
    b = await launchChrome(chrome, profile);
    await run('pvp-only', () => pvpOnly(b, origin));
    await run('smp-only', () => smpOnly(b, origin));
    await run('mixed', () => mixed(b, origin));
    await run('pvp-restore', () => pvpRestore(b, origin));
    await run('sync-fail', () => syncFail(b, origin));
    await run('banner', () => banner(b, origin));
    await run('flat', () => flat(b, origin));
    await run('no-field', () => noField(b, origin));
    await run('api-down', () => apiDown(b, origin));
    await run('400px', () => narrow(b, origin));
    // posthoc (review fixes, owner 2026-11-13)
    await run('sync-rules, offers down', () => syncRules(b, origin, null));
    await run('sync-rules, offers without the field', () => syncRules(b, origin, BASE_RULES));
    await run('pvp+key', () => pvpPlusKey(b, origin));
    await run('promo memory (a) remembered pvp', () => promoNoFlash(b, origin, { label: 'remembered pvp, /store/', path: '/store/', init: `${remember('pvp')}\n${rememberPromo('{"pvp":false}')}` }));
    await run('promo memory (a) ?mode=pvp', () => promoNoFlash(b, origin, { label: '?mode=pvp, no remembered mode', path: '/store/?mode=pvp', init: rememberPromo('{"pvp":false}') }));
    await run('promo memory (b) ?mode=smp', () => promoShownWhileLoading(b, origin, { tag: 'b', label: 'nothing remembered, ?mode=smp', path: '/store/?mode=smp', init: '' }));
    await run('promo memory (b) remembered smp', () => promoShownWhileLoading(b, origin, { tag: 'b', label: 'nothing remembered for the banner, remembered smp', path: '/store/', init: remember('smp') }));
    await run('promo memory (b) remembered pvp true', () => promoShownWhileLoading(b, origin, { tag: 'b', label: 'remembered pvp with {"pvp":true}, offers and sync without the field', path: '/store/', init: `${remember('pvp')}
${rememberPromo('{"pvp":true}')}`, mode: 'pvp', opts: { offers: BASE_RULES, sync: 'old' } }));
    await run('promo memory (c)', () => promoWrites(b, origin));
    await run('promo memory (d)', () => promoShownWhileLoading(b, origin, { tag: 'd', label: `${PROMO_KEY} = "not json{", ?mode=smp`, path: '/store/?mode=smp', init: rememberPromo('not json{') }));
  } finally {
    if (b) await b.close();
    preview.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main()
  .catch((e) => check('free-key-scope-check', [String(e?.stack ?? e)]))
  .finally(() => {
    console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
    process.exitCode = failed ? 1 : 0;
  });
