#!/usr/bin/env node
// Store modes browser check (run 20261112-store-modes, unit U1): the store asks
// "Which mode are you shopping for?" (PVP / SMP) in a pop-up on a first visit,
// then shows only that mode's packages with a PVP | SMP switch at the top.
//
//   npm run build && node test/store_mode_check.mjs [--dist <distDir>]
//   (npm script: "test:store": "node test/store_modes.test.mjs && node test/store_mode_check.mjs")
//
// Serves the production build (dist/) with vite preview on a free port, drives
// headless Chrome over CDP (the helpers of test/visual_check.mjs), and stops both
// at the end. Every page runs in a fresh browser context (its own localStorage),
// under the same deterministic conditions as test/card_style_check.mjs (frozen
// Date, seeded Math.random, reduced motion, UTC, en-US). Viewport: a true
// 1280x900 or 400x900 through Emulation.setDeviceMetricsOverride (headless
// Chrome clamps real windows to 500px, the override does not).
//
// Network (CDP Fetch, every request): the preview origin and Google Fonts pass;
// headless.tebex.io .../categories -> test/fixtures/store-modes/tebex-categories.json
// (the live tree shape of 2026-11-12: PVP > Prism Tokens, SMP > Battle Pass,
// Crate Keys, Premium Ranks, Claim Blocks, Sell Chest, both parents empty) or,
// for the fallback, the flat test/fixtures/card-style/tebex-categories.json;
// two variants are built in memory from the store-modes fixture: `shared` adds a
// top-level "Gift Cards" category with its own package, `third` adds a third
// parent "Creative" (with a sub-category) and an "Events" parent whose only
// sub-category is empty. The cart scenario gets a small stateful Tebex basket
// (GET the saved basket, POST packages adds a line). api.chromabit.us /api/status
// and the visual fixtures as visual_check; every other api.chromabit.us path ->
// 404 (no offers, no player, no free-key sync); PostHog -> {}; anything else 404.
//
// What is checked (one PASS/FAIL line each, then RESULT):
//   AC2 first visit: [data-mode-prompt] role=dialog aria-modal=true, an element
//       reading exactly "WHICH MODE ARE YOU SHOPPING FOR?", one <button>
//       [data-mode-option="<key>"] per mode in Tebex order labelled with the Tebex
//       name, no other copy and no close control; the store dimmed behind it (the
//       viewport centre and corners hit the pop-up or an overlay that holds it,
//       and an element covering the viewport paints a fill); focus inside it,
//       kept there through Tab and Shift+Tab; Escape and a backdrop click leave
//       it open; picking closes it.
//   AC3 [data-mode-switch] role=radiogroup with [data-mode="<key>"] role=radio
//       buttons in Tebex order, aria-checked on the active one only; rendered
//       while the pop-up is open, after the pick and after a reload; above the
//       category tabs and the first card; switching keeps the same document (no
//       load event, a window marker survives).
//   AC4 PVP shows only "3,000 Prism Coins" with no tab row and no RANDOM?; SMP
//       shows the SMP cards only, tabs ALL + its five categories + RANDOM?; a
//       category picked in SMP does not filter PVP, and SMP comes back on ALL.
//   AC5 localStorage chromabit_store_mode and ?mode= follow the pick and the
//       switch through history.replaceState (history.length unchanged); a reload
//       keeps the mode; ?mode=pvp skips the pop-up and beats a remembered smp;
//       ?mode=SMP (case) works; ?mode=junk shows the pop-up and is cleared from
//       the URL while another parameter (ref=discord) survives; a remembered junk
//       value shows the pop-up; ?checkout=complete with a remembered mode is
//       still stripped and opens no pop-up.
//   AC6 a PVP package added to the cart stays after switching to SMP, an SMP
//       package joins it, the drawer lists both.
//   AC7 the flat fixture: no pop-up, no switch, every card, today's tabs, also
//       with ?mode=pvp and a remembered mode; a shared top-level category shows
//       in both modes; a third parent is a third option, an empty one is not.
//   AC8 at a true 400px: document scrollWidth <= 400 with the pop-up open, after
//       the pick and in both modes; the pop-up's options and the switch with its
//       options sit inside 0..400.
//   AC9 card order and every price (Intl en-US currency of total_price, the way
//       PackageCard prints it) match the fixture in each mode.
// Each scenario first proves the harness worked (the store rendered, the Tebex
// categories stub was hit) before it asserts on the feature, so a red run fails
// on the feature, not on the harness.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIX, FREEZE, FROZEN_TIME, HEAD_PNG, ROOT, VITE, fileOr404, findChrome, freePort, json, launchChrome, sleep, waitReady } from './visual_check.mjs';

const HEIGHT = 900;
const MODES_FIX = join(ROOT, 'test', 'fixtures', 'store-modes', 'tebex-categories.json');
const FLAT_FIX = join(ROOT, 'test', 'fixtures', 'card-style', 'tebex-categories.json');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'src', 'config.json'), 'utf-8'));
/** Subscription halves of a pair live behind their partner's pop-up and never get a card. */
const PAIRED = new Set(Object.values(CONFIG.subscriptionPairs ?? {}).map(Number));
export const TITLE = 'WHICH MODE ARE YOU SHOPPING FOR?';
export const MODE_KEY = 'chromabit_store_mode';
const BASKET_IDENT = 'modecheck1';

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
const same = (a, b) => q(a) === q(b);
const want = (label, got, exp) => (same(got, exp) ? null : `${label} ${q(got)}, want ${q(exp)}`);

// -------------------------------------------------------------- fixtures --

const raw = (file) => JSON.parse(readFileSync(file, 'utf-8'));
const pkg = (id, name, price, order = 1) => ({ id, name, type: 'single', base_price: price, sales_tax: 0, total_price: price, currency: 'USD', discount: 0, disable_quantity: false, user_limit: null, image: null, order });
const parentObj = (t) => ({ id: t.id, name: t.name, slug: t.slug, description: '', tiered: false, packages: [], order: t.order, display_type: 'grid', image_url: null, dynamic: false });
const CREATIVE = { id: 3600010, name: 'Creative', slug: 'creative', parent: null, order: 9, packages: [] };
const EVENTS = { id: 3600020, name: 'Events', slug: 'events', parent: null, order: 11, packages: [] };
const VARIANTS = {
  shared: (d) => [...d, { id: 3600001, name: 'Gift Cards', slug: 'gift-cards', parent: null, order: 8, packages: [pkg(7900001, 'Store Gift Card', 5)] }],
  third: (d) => [
    ...d,
    CREATIVE,
    { id: 3600011, name: 'Creative Ranks', slug: 'creative-ranks', parent: parentObj(CREATIVE), order: 10, packages: [pkg(7900010, 'Builder', 3.49)] },
    EVENTS,
    { id: 3600021, name: 'Event Passes', slug: 'event-passes', parent: parentObj(EVENTS), order: 12, packages: [] },
  ],
};
function catalogue(file, variant) {
  const body = raw(file);
  if (variant) body.data = VARIANTS[variant](body.data);
  return body;
}

/** The cards a set of categories shows today: categories by order, packages by order, paired halves dropped. */
function expectedCards(data, pick = () => true) {
  return data
    .filter((c) => c.packages?.length && pick(c))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .flatMap((c) => [...c.packages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
    .filter((p) => !PAIRED.has(p.id))
    .map((p) => [p.name, new Intl.NumberFormat('en-US', { style: 'currency', currency: p.currency || 'USD' }).format(p.total_price)]);
}
const MODES_DATA = raw(MODES_FIX).data;
const FLAT_DATA = raw(FLAT_FIX).data;
const parentId = (c) => (c.parent && typeof c.parent === 'object' ? c.parent.id : null);
const PVP_CARDS = expectedCards(MODES_DATA, (c) => parentId(c) === 3501345);
const SMP_CARDS = expectedCards(MODES_DATA, (c) => parentId(c) === 3501357);
const SMP_TABS = MODES_DATA.filter((c) => parentId(c) === 3501357 && c.packages.length).sort((a, b) => a.order - b.order).map((c) => c.name.toUpperCase());
const KEY_CARDS = expectedCards(MODES_DATA, (c) => c.id === 3385106);
const FLAT_CARDS = expectedCards(FLAT_DATA);
const FLAT_TABS = [...FLAT_DATA].sort((a, b) => a.order - b.order).map((c) => c.name.toUpperCase());
const names = (cards) => cards.map(([n]) => n);

// --------------------------------------------------------------- routing --

function basketDoc(st) {
  const lines = st.basket.lines;
  const total = Math.round(lines.reduce((n, l) => n + l.in_basket.quantity * l.in_basket.price, 0) * 100) / 100;
  return { ident: BASKET_IDENT, complete: false, username: 'Steve', currency: 'USD', base_price: total, total_price: total, sales_tax: 0, packages: lines, coupons: [], giftcards: [], links: { checkout: 'https://example.invalid/checkout' } };
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
    return json({ error: 'not found' }, 404);
  }
  if (host === 'headless.tebex.io') {
    if (/\/categories$/.test(u.pathname)) {
      st.hits.categories++;
      return json(st.body);
    }
    if (st.basket) {
      if (req.method === 'GET' && u.pathname.endsWith(`/baskets/${BASKET_IDENT}`)) return json({ data: basketDoc(st) });
      if (req.method === 'POST' && u.pathname.endsWith(`/baskets/${BASKET_IDENT}/packages`)) {
        let body = {};
        try {
          body = JSON.parse(req.postData ?? '{}');
        } catch {
          /* no body */
        }
        const p = st.body.data.flatMap((c) => c.packages ?? []).find((x) => x.id === Number(body.package_id));
        if (!p) return json({ title: 'not in the fixture catalogue' }, 422);
        st.hits.adds++;
        const line = st.basket.lines.find((l) => l.id === p.id);
        if (line) line.in_basket.quantity += Number(body.quantity) || 1;
        else st.basket.lines.push({ id: p.id, name: p.name, image: null, in_basket: { quantity: Number(body.quantity) || 1, price: p.total_price } });
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

/** In-page helpers, installed on every document as window.__sm. */
const LIB = `window.__sm = {
  vis(e) { if (!e) return false; if (!e.getClientRects().length) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none'; },
  first(sel) { return [...document.querySelectorAll(sel)].find((e) => this.vis(e)) || null; },
  all(sel) { return [...document.querySelectorAll(sel)].filter((e) => this.vis(e)); },
  text(e) { return ((e && (e.innerText ?? e.textContent)) || '').replace(/\\s+/g, ' ').trim(); },
  prompt() { return this.first('[data-mode-prompt]'); },
  sw() { return this.first('[data-mode-switch]'); },
  cards() { return this.all('.pkg-card').map((c) => [(c.querySelector('.pkg-name')?.textContent || '').trim(), (c.querySelector('.pkg-price-now')?.textContent || '').replace(/\\s+/g, ' ').trim()]); },
  names() { return this.cards().map((c) => c[0]); },
  tabs() { return this.all('.store-tabs .store-tab').map((t) => ({ text: this.text(t), random: t.classList.contains('store-tab--random'), pressed: t.getAttribute('aria-pressed') })); },
  rect(e) { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top + scrollY, bottom: r.bottom + scrollY, width: r.width, height: r.height }; },
  radios() { const s = this.sw(); return s ? [...s.querySelectorAll('[data-mode]')].map((b) => ({ key: b.getAttribute('data-mode'), role: b.getAttribute('role'), checked: b.getAttribute('aria-checked'), text: this.text(b) })) : null; },
  mode() { return new URLSearchParams(location.search).get('mode'); },
};`;

async function openPage(b, origin, { width = 1280, fixture = MODES_FIX, variant = null, init = '', basket = false } = {}) {
  const { browserContextId } = await b.send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => b.send(m, p, sessionId);
  const st = { body: catalogue(fixture, variant), basket: basket ? { lines: [] } : null, hits: { categories: 0, adds: 0 } };
  const inflight = new Set();
  let lastNet = Date.now();
  let loads = 0;
  const listener = (d) => {
    if (d.sessionId !== sessionId) return;
    const p = d.params;
    if (d.method === 'Network.requestWillBeSent') {
      inflight.add(p.requestId);
      lastNet = Date.now();
    } else if (d.method === 'Network.loadingFinished' || d.method === 'Network.loadingFailed') {
      inflight.delete(p.requestId);
      lastNet = Date.now();
    } else if (d.method === 'Page.loadEventFired') loads++;
    else if (d.method === 'Fetch.requestPaused') {
      const r = route(p.request, origin, st);
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
    }
  };
  b.listeners.add(listener);
  const ev = async (expression) => {
    const r = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(r.exceptionDetails).slice(0, 400)}`);
    return r.result.value;
  };
  const idle = async (quiet = 400, max = 6_000) => {
    const until = Date.now() + max;
    while (Date.now() < until) {
      if (inflight.size === 0 && Date.now() - lastNet >= quiet) return;
      await sleep(100);
    }
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
  const waitLoad = async (before) => {
    for (let i = 0; i < 300 && loads === before; i++) await sleep(100);
    if (loads === before) throw new Error('no load event in 30 s');
    await idle();
  };
  const goto = async (path) => {
    const before = loads;
    await s('Page.navigate', { url: `${origin}${path}` });
    await waitLoad(before);
  };
  const reload = async () => {
    const before = loads;
    await s('Page.reload', { ignoreCache: true });
    await waitLoad(before);
  };
  const key = async (k, code, vk, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await s('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
  };
  const clickAt = async (x, y) => {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await s('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
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
    if (init) await s('Page.addScriptToEvaluateOnNewDocument', { source: init });
  } catch (e) {
    await close();
    throw e;
  }
  return { s, ev, until, goto, reload, key, clickAt, close, st, loads: () => loads, width };
}

/** Init scripts. They run on every document of the page, so only for single-load scenarios (or to re-seed the same value). */
const remember = (v) => `try { if (!sessionStorage.getItem('__seeded')) { localStorage.setItem(${q(MODE_KEY)}, ${q(v)}); sessionStorage.setItem('__seeded', '1'); } } catch {}`;
const SEED_BASKET = `try { if (!sessionStorage.getItem('__basket')) { localStorage.setItem('chromabit_username', 'Steve'); localStorage.setItem('chromabit_platform', 'java'); localStorage.setItem('chromabit_basket', JSON.stringify({ ident: ${q(BASKET_IDENT)}, username: 'Steve', at: ${FROZEN_TIME} })); sessionStorage.setItem('__basket', '1'); } } catch {}`;

/**
 * Harness proof: the store rendered something from the stub (a card or the
 * pop-up), the categories stub was hit, and there is no load-error banner.
 */
async function storeLoaded(page, label) {
  const r = await page.until(`(window.__sm.first('.pkg-card') || window.__sm.prompt()) ? true : (window.__sm.first('.store-banner.error') ? 'error' : false)`, 10_000);
  need(`${label}: store loaded from the stub`, [
    page.st.hits.categories < 1 && 'the Tebex categories stub was never requested',
    r === 'error' && 'the store shows its load-error banner',
    !r && 'no .pkg-card and no [data-mode-prompt] rendered in 10 s',
  ]);
}
/** Waits up to 5 s for the pop-up; FAIL + stop when it never shows. */
async function needPrompt(page, label) {
  const ok = await page.until(`!!window.__sm.prompt()`, 5000);
  need(`${label}: the pop-up [data-mode-prompt] is shown`, ok ? [] : ['no rendered [data-mode-prompt] within 5 s of the store loading']);
}
/** Waits up to 5 s for the switch; FAIL + stop when it never shows. */
async function needSwitch(page, label) {
  const ok = await page.until(`!!window.__sm.sw()`, 5000);
  need(`${label}: the switch [data-mode-switch] is shown`, ok ? [] : ['no rendered [data-mode-switch] within 5 s']);
}
/** After the store loaded and 1 s settled: no pop-up. */
async function noPrompt(page, name) {
  await sleep(1000);
  check(name, (await page.ev(`!!window.__sm.prompt()`)) ? ['[data-mode-prompt] is shown'] : []);
}
const checkedKeys = (page) => page.ev(`(window.__sm.radios() || []).filter((r) => r.checked === 'true').map((r) => r.key)`);
async function checkActive(page, name, key, allKeys) {
  const radios = await page.ev(`window.__sm.radios()`);
  check(name, !radios ? ['no switch'] : [want('aria-checked="true" on', radios.filter((r) => r.checked === 'true').map((r) => r.key), [key]), want('aria-checked="false" on', radios.filter((r) => r.checked === 'false').map((r) => r.key), allKeys.filter((k) => k !== key))]);
}
async function clickSel(page, sel) {
  return page.ev(`(() => { const e = document.querySelector(${q(sel)}); if (!e) return false; e.click(); return true; })()`);
}
/** Waits up to 5 s for the rendered card names to equal `exp`; returns the cards [name, price] last seen. */
async function cardsBecome(page, exp) {
  await page.until(`${q(q(exp))} === JSON.stringify(window.__sm.names())`, 5000);
  return page.ev(`window.__sm.cards()`);
}
function cardProblems(got, exp) {
  const out = [];
  if (!same(got.map(([n]) => n), names(exp))) out.push(`cards ${q(got.map(([n]) => n))}, want ${q(names(exp))}`);
  else for (let i = 0; i < exp.length; i++) if (got[i][1] !== exp[i][1]) out.push(`${exp[i][0]} price ${q(got[i][1])}, want ${q(exp[i][1])}`);
  return out;
}

// ------------------------------------------------------------- scenarios --

async function firstVisit(b, origin) {
  const L = 'first visit';
  const page = await openPage(b, origin);
  try {
    await page.goto('/store/');
    await storeLoaded(page, L);
    await needPrompt(page, L);
    const dialog = await page.ev(`(() => { const p = window.__sm.prompt(); return { role: p.getAttribute('role'), modal: p.getAttribute('aria-modal') }; })()`);
    check('AC2 the pop-up is a modal dialog (role="dialog", aria-modal="true")', [want('role', dialog.role, 'dialog'), want('aria-modal', dialog.modal, 'true')]);
    const content = await page.ev(`(() => {
      const L = window.__sm; const p = L.prompt();
      const titles = [...p.querySelectorAll('*')].filter((e) => L.vis(e) && L.text(e) === ${q(TITLE)});
      const opts = [...p.querySelectorAll('[data-mode-option]')].map((o) => ({ key: o.getAttribute('data-mode-option'), tag: o.tagName, text: L.text(o), vis: L.vis(o) }));
      let rest = L.text(p);
      for (const s of [${q(TITLE)}, ...opts.map((o) => o.text)]) { const i = rest.indexOf(s); if (i >= 0) rest = rest.slice(0, i) + ' ' + rest.slice(i + s.length); }
      const closers = [...p.querySelectorAll('button, [role=button], a')].filter((e) => !e.hasAttribute('data-mode-option') && !e.closest('[data-mode-option]')).map((e) => e.outerHTML.slice(0, 80));
      return { titles: titles.length, opts, rest: rest.replace(/\\s+/g, ' ').trim(), closers };
    })()`);
    check(`AC2 the pop-up title reads "${TITLE}"`, content.titles ? [] : [`no rendered element in [data-mode-prompt] whose text is exactly ${q(TITLE)}`]);
    check('AC1/AC2 one <button> per Tebex mode, in Tebex order, labelled with the Tebex name', [
      want('[data-mode-option] keys', content.opts.map((o) => o.key), ['pvp', 'smp']),
      want('labels', content.opts.map((o) => o.text), ['PVP', 'SMP']),
      want('tags', content.opts.map((o) => o.tag), ['BUTTON', 'BUTTON']),
      content.opts.some((o) => !o.vis) && 'an option is not rendered',
    ]);
    check('AC2 no extra copy in the pop-up (only the title and the mode names)', content.rest ? [`other text: ${q(content.rest)}`] : []);
    check('AC2 the pop-up has no close control', content.closers.length ? [`controls other than the mode options: ${content.closers.join(' | ')}`] : []);
    const dim = await page.ev(`(() => {
      const p = window.__sm.prompt(); const W = innerWidth, H = innerHeight; const out = [];
      // The site nav (header) is not the store: the existing store modals leave it on top, so the probe starts below it.
      const head = document.querySelector('header'); const T = Math.max(8, (head ? head.getBoundingClientRect().bottom : 0) + 8);
      for (const [x, y] of [[W / 2, H / 2], [8, T], [W - 8, T], [8, H - 8], [W - 8, H - 8]]) {
        const hit = document.elementFromPoint(x, y);
        const ok = hit && (p.contains(hit) || (hit !== document.body && hit !== document.documentElement && hit.contains(p)));
        if (!ok) out.push('the point ' + Math.round(x) + ',' + Math.round(y) + ' hits ' + (hit ? hit.tagName.toLowerCase() + (hit.className && typeof hit.className === 'string' ? '.' + hit.className.trim().split(/\\s+/).join('.') : '') : 'nothing') + ', not the pop-up or its overlay');
      }
      let e = p, painted = false;
      while (e && e !== document.body && e !== document.documentElement) {
        const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
        const m = cs.backgroundColor.match(/rgba?\\(([^)]+)\\)/); const a = m ? (m[1].split(',')[3] === undefined ? 1 : parseFloat(m[1].split(',')[3])) : 0;
        if (r.left <= 1 && r.top <= 1 && r.right >= W - 1 && r.bottom >= H - 1 && (a > 0 || (cs.backdropFilter && cs.backdropFilter !== 'none'))) painted = true;
        e = e.parentElement;
      }
      if (!painted) out.push('no element holding the pop-up covers the viewport with a fill (the store is not dimmed)');
      return out;
    })()`);
    check('AC2 the store is dimmed behind the pop-up', dim);
    check('AC3 the switch is rendered while the pop-up is open (always visible once the store loaded)', (await page.ev(`!!window.__sm.sw()`)) ? [] : ['no rendered [data-mode-switch] behind the pop-up']);

    // Focus is kept inside.
    await sleep(400);
    const inside = `(() => { const p = window.__sm.prompt(); const a = document.activeElement; return !!(p && a && p.contains(a)); })()`;
    const focusProblems = [];
    if (!(await page.ev(inside))) focusProblems.push(`focus starts on ${await page.ev('document.activeElement ? document.activeElement.tagName : null')}, not inside the pop-up`);
    for (let i = 0; i < 5; i++) {
      await page.key('Tab', 'Tab', 9);
      if (!(await page.ev(inside))) {
        focusProblems.push(`Tab #${i + 1} moved focus out of the pop-up`);
        break;
      }
    }
    for (let i = 0; i < 5; i++) {
      await page.key('Tab', 'Tab', 9, 8);
      if (!(await page.ev(inside))) {
        focusProblems.push(`Shift+Tab #${i + 1} moved focus out of the pop-up`);
        break;
      }
    }
    check('AC2 focus is inside the pop-up and stays there (Tab, Shift+Tab)', focusProblems);

    await page.key('Escape', 'Escape', 27);
    await sleep(700);
    check('AC2 Escape does not close the pop-up', (await page.ev(`!!window.__sm.prompt()`)) ? [] : ['the pop-up closed on Escape']);
    const spot = await page.ev(`(() => { const W = innerWidth, H = innerHeight; const head = document.querySelector('header'); const T = Math.max(8, (head ? head.getBoundingClientRect().bottom : 0) + 8); for (const [x, y] of [[8, H - 8], [8, T], [W - 8, T], [W - 8, H - 8]]) { const h = document.elementFromPoint(x, y); if (h && !h.closest('[data-mode-option]')) return [x, y]; } return null; })()`);
    if (spot) await page.clickAt(spot[0], spot[1]);
    await sleep(700);
    check('AC2 a backdrop click does not close the pop-up', !spot ? ['no backdrop point found'] : (await page.ev(`!!window.__sm.prompt()`)) ? [] : [`the pop-up closed on a click at ${spot.join(',')}`]);

    // Pick PVP.
    const hist = await page.ev('history.length');
    await clickSel(page, '[data-mode-option="pvp"]');
    const gone = await page.until(`!window.__sm.prompt()`, 3000);
    need('AC2 picking a mode closes the pop-up', gone ? [] : ['[data-mode-prompt] still shown 3 s after clicking [data-mode-option="pvp"]']);
    const saved = await page.ev(`({ ls: localStorage.getItem(${q(MODE_KEY)}), mode: window.__sm.mode(), hist: history.length })`);
    check('AC5 the pick is saved (localStorage chromabit_store_mode, ?mode=pvp, replaceState)', [want('localStorage', saved.ls, 'pvp'), want('?mode=', saved.mode, 'pvp'), want('history.length', saved.hist, hist)]);
    await needSwitch(page, L);
    const radios = await page.ev(`(() => { const s = window.__sm.sw(); return { role: s.getAttribute('role'), radios: window.__sm.radios() }; })()`);
    check('AC1/AC3 the switch is a radiogroup of role="radio" [data-mode] buttons in Tebex order, labelled with the Tebex names', [
      want('role', radios.role, 'radiogroup'),
      want('[data-mode] keys', radios.radios.map((r) => r.key), ['pvp', 'smp']),
      want('roles', radios.radios.map((r) => r.role), ['radio', 'radio']),
      want('labels', radios.radios.map((r) => r.text), ['PVP', 'SMP']),
    ]);
    await checkActive(page, 'AC3 PVP is marked active (aria-checked)', 'pvp', ['pvp', 'smp']);
    check('AC4/AC9 PVP shows only its packages, in order, at their prices', cardProblems(await cardsBecome(page, names(PVP_CARDS)), PVP_CARDS));
    check('AC4 a one-category mode hides the category tab row', (await page.ev(`!!window.__sm.first('.store-tabs') || window.__sm.all('.store-tab').length > 0`)) ? ['.store-tabs / .store-tab rendered in PVP'] : []);
    check('AC4 no RANDOM? in PVP (no key category)', (await page.ev(`!!window.__sm.first('.store-tab--random')`)) ? ['.store-tab--random rendered in PVP'] : []);
    const above1 = await page.ev(`(() => { const L = window.__sm; const s = L.rect(L.sw()); const c = L.first('.pkg-card'); return c ? [s.bottom, L.rect(c).top] : null; })()`);
    check('AC3 the switch sits above the packages', !above1 ? ['no card'] : above1[0] <= above1[1] + 0.5 ? [] : [`switch bottom ${above1[0]} is below the first card top ${above1[1]}`]);

    // Switch to SMP, no reload.
    await page.ev(`(window.__noReload = 'kept', true)`);
    const loads0 = page.loads();
    await clickSel(page, '[data-mode="smp"]');
    const smpCards = await cardsBecome(page, names(SMP_CARDS));
    check('AC3 switching needs no reload', [page.loads() !== loads0 && 'a load event fired', (await page.ev(`window.__noReload`)) !== 'kept' && 'the window marker was lost (a new document)']);
    await checkActive(page, 'AC3 SMP is marked active after switching', 'smp', ['pvp', 'smp']);
    check('AC4/AC9 SMP shows only its packages, in order, at their prices', cardProblems(smpCards, SMP_CARDS));
    const tabs = await page.ev(`window.__sm.tabs()`);
    check("AC4 SMP's category tabs: ALL (pressed), its five categories, RANDOM?", [
      want('tabs', tabs.filter((t) => !t.random).map((t) => t.text), ['ALL', ...SMP_TABS]),
      want('ALL aria-pressed', tabs[0]?.pressed, 'true'),
    ]);
    check('AC4 RANDOM? is shown in SMP (it has a key category)', tabs.some((t) => t.random) ? [] : ['no rendered .store-tab--random in SMP']);
    const above2 = await page.ev(`(() => { const L = window.__sm; const s = L.rect(L.sw()); const t = L.first('.store-tabs'); return t ? [s.bottom, L.rect(t).top] : null; })()`);
    check('AC3 the switch sits above the category tabs', !above2 ? ['no .store-tabs'] : above2[0] <= above2[1] + 0.5 ? [] : [`switch bottom ${above2[0]} is below the tabs top ${above2[1]}`]);
    const saved2 = await page.ev(`({ ls: localStorage.getItem(${q(MODE_KEY)}), mode: window.__sm.mode(), hist: history.length })`);
    check('AC5 the switch is saved too (localStorage, ?mode=smp, replaceState)', [want('localStorage', saved2.ls, 'smp'), want('?mode=', saved2.mode, 'smp'), want('history.length', saved2.hist, hist)]);

    // The selected category resets on a mode change.
    const picked = await page.ev(`(() => { const t = window.__sm.all('.store-tabs .store-tab').find((e) => window.__sm.text(e) === 'CRATE KEYS'); if (!t) return false; t.click(); return true; })()`);
    const keys = await cardsBecome(page, names(KEY_CARDS));
    need('AC4 (setup) the CRATE KEYS tab filters SMP to its keys', [!picked && 'no CRATE KEYS tab', ...cardProblems(keys, KEY_CARDS)]);
    await clickSel(page, '[data-mode="pvp"]');
    check('AC4 a category picked in SMP does not filter PVP', cardProblems(await cardsBecome(page, names(PVP_CARDS)), PVP_CARDS));
    await clickSel(page, '[data-mode="smp"]');
    const back = await cardsBecome(page, names(SMP_CARDS));
    const backTabs = await page.ev(`window.__sm.tabs()`);
    check('AC4 the selected category resets on a mode change (SMP comes back on ALL)', [...cardProblems(back, SMP_CARDS), want('ALL aria-pressed', backTabs[0]?.text === 'ALL' ? backTabs[0].pressed : null, 'true')]);

    // Reload keeps the mode.
    await page.reload();
    await storeLoaded(page, `${L} (reload)`);
    await noPrompt(page, 'AC5 a reload does not show the pop-up again');
    await needSwitch(page, `${L} (reload)`);
    await checkActive(page, 'AC5 a reload keeps the last mode (SMP)', 'smp', ['pvp', 'smp']);
    check('AC5 after the reload SMP shows its packages and ?mode=smp', [...cardProblems(await cardsBecome(page, names(SMP_CARDS)), SMP_CARDS), want('?mode=', await page.ev('window.__sm.mode()'), 'smp')]);
  } finally {
    await page.close();
  }
}

async function urlWins(b, origin) {
  const L = '?mode=pvp over a remembered smp';
  const page = await openPage(b, origin, { init: remember('smp') });
  try {
    await page.goto('/store/?mode=pvp');
    await storeLoaded(page, L);
    await noPrompt(page, 'AC5 ?mode=pvp skips the pop-up');
    await needSwitch(page, L);
    await checkActive(page, 'AC5 a valid ?mode= wins over the remembered mode', 'pvp', ['pvp', 'smp']);
    check('AC4 ?mode=pvp shows the PVP packages', cardProblems(await cardsBecome(page, names(PVP_CARDS)), PVP_CARDS));
  } finally {
    await page.close();
  }
}

async function urlFresh(b, origin) {
  const L = '?mode=pvp, nothing remembered';
  const page = await openPage(b, origin);
  try {
    await page.goto('/store/?mode=pvp');
    await storeLoaded(page, L);
    await noPrompt(page, 'AC5 ?mode=pvp on a first visit skips the pop-up');
    await needSwitch(page, L);
    await checkActive(page, 'AC5 ?mode=pvp on a first visit opens PVP', 'pvp', ['pvp', 'smp']);
    check('AC5 ?mode=pvp stays in the URL', want('?mode=', await page.ev('window.__sm.mode()'), 'pvp') ?? []);
  } finally {
    await page.close();
  }
}

async function urlCase(b, origin) {
  const L = '?mode=SMP';
  const page = await openPage(b, origin);
  try {
    await page.goto('/store/?mode=SMP');
    await storeLoaded(page, L);
    await noPrompt(page, 'AC5 ?mode=SMP (upper case) skips the pop-up');
    await needSwitch(page, L);
    await checkActive(page, 'AC5 ?mode= matches case-insensitively', 'smp', ['pvp', 'smp']);
  } finally {
    await page.close();
  }
}

async function urlJunk(b, origin) {
  const L = '?ref=discord&mode=junk';
  const page = await openPage(b, origin);
  try {
    await page.goto('/store/?ref=discord&mode=junk');
    await storeLoaded(page, L);
    await needPrompt(page, `AC5 ${L}`);
    const cleared = await page.until(`!new URLSearchParams(location.search).has('mode')`, 3000);
    check('AC5 an unknown ?mode= is cleared from the URL, other parameters stay', [!cleared && `?mode= still in ${q(await page.ev('location.search'))}`, want('?ref=', await page.ev(`new URLSearchParams(location.search).get('ref')`), 'discord')]);
    check('AC5 an unknown ?mode= is not saved', want('localStorage', await page.ev(`localStorage.getItem(${q(MODE_KEY)})`), null) ?? []);
    await clickSel(page, '[data-mode-option="smp"]');
    await page.until(`!window.__sm.prompt()`, 3000);
    await page.until(`window.__sm.mode() === 'smp'`, 3000);
    const sp = await page.ev(`Object.fromEntries(new URLSearchParams(location.search))`);
    check('AC5 the pick is mirrored as ?mode=smp and ?ref= survives', want('query', sp, { ref: 'discord', mode: 'smp' }) ?? []);
  } finally {
    await page.close();
  }
}

async function storedJunk(b, origin) {
  const L = 'remembered junk';
  const page = await openPage(b, origin, { init: remember('junk') });
  try {
    await page.goto('/store/');
    await storeLoaded(page, L);
    const shown = await page.until(`!!window.__sm.prompt()`, 5000);
    check('AC5 an unknown remembered mode is ignored (the pop-up shows)', shown ? [] : ['no [data-mode-prompt]']);
  } finally {
    await page.close();
  }
}

async function checkoutComplete(b, origin) {
  const L = '?checkout=complete with a remembered mode';
  const page = await openPage(b, origin, { init: remember('smp') });
  try {
    await page.goto('/store/?checkout=complete');
    await storeLoaded(page, L);
    const stripped = await page.until(`!new URLSearchParams(location.search).has('checkout')`, 3000);
    check('AC5 ?checkout=complete is still stripped from the URL', stripped ? [] : [`location.search ${q(await page.ev('location.search'))}`]);
    await noPrompt(page, 'AC5 ?checkout=complete with a remembered mode opens no pop-up');
    await needSwitch(page, L);
    await checkActive(page, 'AC5 ?checkout=complete keeps the remembered mode', 'smp', ['pvp', 'smp']);
  } finally {
    await page.close();
  }
}

async function cartShared(b, origin) {
  const L = 'cart';
  const page = await openPage(b, origin, { init: SEED_BASKET, basket: true });
  const count = `(document.querySelector('.cart-fab-badge')?.textContent || '').trim()`;
  try {
    await page.goto('/store/?mode=pvp');
    await storeLoaded(page, L);
    const buy = (name) => `(() => { const c = window.__sm.all('.pkg-card').find((e) => e.querySelector('.pkg-name')?.textContent.trim() === ${q(name)}); const b = c && c.querySelector('.pkg-cart-btn'); if (!b) return false; b.click(); return true; })()`;
    const first = PVP_CARDS[0][0];
    const clicked = await page.ev(buy(first));
    const one = await page.until(`${count} === '1'`, 8000);
    need(`AC6 (setup) ${first} is added to the cart`, [!clicked && `no rendered ${first} card with .pkg-cart-btn`, page.st.hits.adds < 1 && 'the basket stub got no add', !one && `cart badge ${q(await page.ev(count))}, want "1"`]);
    await needSwitch(page, L);
    await clickSel(page, '[data-mode="smp"]');
    await cardsBecome(page, names(SMP_CARDS));
    await sleep(500);
    check('AC6 switching mode keeps the cart', want('cart badge', await page.ev(count), '1') ?? []);
    const clicked2 = await page.ev(buy('Chroma Key'));
    const two = await page.until(`${count} === '2'`, 8000);
    check('AC6 an SMP package joins the PVP one in the same cart', [!clicked2 && 'no rendered Chroma Key card with .pkg-cart-btn', !two && `cart badge ${q(await page.ev(count))}, want "2"`]);
    await clickSel(page, '.cart-fab');
    await page.until(`document.querySelectorAll('.cart-drawer.open .cart-item').length >= 2`, 5000);
    const lines = await page.ev(`[...document.querySelectorAll('.cart-drawer .cart-item-name')].map((e) => e.textContent.trim())`);
    check('AC6 the cart drawer lists the PVP and the SMP package', want('cart lines', [...lines].sort(), [first, 'Chroma Key'].sort()) ?? []);
  } finally {
    await page.close();
  }
}

async function flatFallback(b, origin, label, path, init) {
  const page = await openPage(b, origin, { fixture: FLAT_FIX, init });
  try {
    await page.goto(path);
    await storeLoaded(page, label);
    await sleep(1000);
    const got = await page.ev(`({ prompt: !!document.querySelector('[data-mode-prompt]'), sw: !!document.querySelector('[data-mode-switch]'), cards: window.__sm.cards(), tabs: window.__sm.tabs() })`);
    check(`AC7 ${label}: no pop-up and no switch`, [got.prompt && '[data-mode-prompt] in the DOM', got.sw && '[data-mode-switch] in the DOM']);
    check(`AC7/AC9 ${label}: every package, in order, at its price`, cardProblems(got.cards, FLAT_CARDS));
    check(`AC7 ${label}: today's tabs (ALL, every category, RANDOM?)`, [want('tabs', got.tabs.filter((t) => !t.random).map((t) => t.text), ['ALL', ...FLAT_TABS]), !got.tabs.some((t) => t.random) && 'no RANDOM? tab']);
  } finally {
    await page.close();
  }
}

async function sharedCategory(b, origin) {
  const L = 'shared top-level category';
  const page = await openPage(b, origin, { variant: 'shared' });
  try {
    await page.goto('/store/');
    await storeLoaded(page, L);
    await needPrompt(page, L);
    check('AC1 a top-level category with its own packages is not a mode', want('[data-mode-option] keys', await page.ev(`[...window.__sm.prompt().querySelectorAll('[data-mode-option]')].map((o) => o.getAttribute('data-mode-option'))`), ['pvp', 'smp']) ?? []);
    await clickSel(page, '[data-mode-option="pvp"]');
    await page.until(`!window.__sm.prompt()`, 3000);
    const pv = [...names(PVP_CARDS), 'Store Gift Card'].sort();
    await page.until(`${q(q(pv))} === JSON.stringify(window.__sm.names().sort())`, 5000);
    check('AC7 the shared category shows in PVP', want('cards', (await page.ev('window.__sm.names()')).sort(), pv) ?? []);
    await needSwitch(page, L);
    await clickSel(page, '[data-mode="smp"]');
    const sm = [...names(SMP_CARDS), 'Store Gift Card'].sort();
    await page.until(`${q(q(sm))} === JSON.stringify(window.__sm.names().sort())`, 5000);
    check('AC7 the shared category shows in SMP', want('cards', (await page.ev('window.__sm.names()')).sort(), sm) ?? []);
  } finally {
    await page.close();
  }
}

async function thirdMode(b, origin) {
  const L = 'third parent';
  const page = await openPage(b, origin, { variant: 'third' });
  try {
    await page.goto('/store/');
    await storeLoaded(page, L);
    await needPrompt(page, L);
    const opts = await page.ev(`[...window.__sm.prompt().querySelectorAll('[data-mode-option]')].map((o) => [o.getAttribute('data-mode-option'), window.__sm.text(o)])`);
    check('AC1 a third parent is a third option, in Tebex order; an empty parent is not', want('options', opts, [['pvp', 'PVP'], ['smp', 'SMP'], ['creative', 'Creative']]) ?? []);
    await clickSel(page, '[data-mode-option="creative"]');
    await page.until(`!window.__sm.prompt()`, 3000);
    check('AC1/AC4 the third mode shows its own package only', want('cards', await page.until(`window.__sm.names().join() === 'Builder' && window.__sm.names()`, 5000) || (await page.ev('window.__sm.names()')), ['Builder']) ?? []);
    await needSwitch(page, L);
    check('AC1/AC3 the switch has the three modes', want('[data-mode] keys', (await page.ev('window.__sm.radios()')).map((r) => r.key), ['pvp', 'smp', 'creative']) ?? []);
  } finally {
    await page.close();
  }
}

async function narrow(b, origin) {
  const L = '400px';
  const page = await openPage(b, origin, { width: 400 });
  const fit = `(() => { const W = innerWidth; const out = []; const sw = document.documentElement.scrollWidth; if (sw > W) out.push('document scrollWidth ' + sw + ' > ' + W); return out; })()`;
  const inside = (sel) => `(() => { const out = []; const W = innerWidth; for (const e of window.__sm.all(${q(sel)})) { const r = e.getBoundingClientRect(); if (r.left < -0.5 || r.right > W + 0.5) out.push(${q(sel)} + ' spans ' + Math.round(r.left) + '..' + Math.round(r.right)); } return out; })()`;
  try {
    await page.goto('/store/');
    need('AC8 (setup) the viewport is a true 400px', want('innerWidth', await page.ev('innerWidth'), 400) ?? []);
    await storeLoaded(page, L);
    await needPrompt(page, L);
    check('AC8 400px, pop-up open: no horizontal scroll, the pop-up and its options inside the viewport', [...(await page.ev(fit)), ...(await page.ev(inside('[data-mode-prompt] [data-mode-option]'))), ...(await page.ev(`(() => { const p = window.__sm.prompt(); const r = p.getBoundingClientRect(); return r.width > innerWidth + 0.5 ? ['[data-mode-prompt] is ' + Math.round(r.width) + 'px wide'] : []; })()`))]);
    await clickSel(page, '[data-mode-option="smp"]');
    await page.until(`!window.__sm.prompt()`, 3000);
    await cardsBecome(page, names(SMP_CARDS));
    await needSwitch(page, L);
    check('AC8 400px, SMP: no horizontal scroll, the switch and its options inside the viewport', [...(await page.ev(fit)), ...(await page.ev(inside('[data-mode-switch]'))), ...(await page.ev(inside('[data-mode-switch] [data-mode]')))]);
    await clickSel(page, '[data-mode="pvp"]');
    await cardsBecome(page, names(PVP_CARDS));
    check('AC8 400px, PVP: no horizontal scroll, the switch and its options inside the viewport', [...(await page.ev(fit)), ...(await page.ev(inside('[data-mode-switch]'))), ...(await page.ev(inside('[data-mode-switch] [data-mode]')))]);
  } finally {
    await page.close();
  }
}

// ------------------------------------------------------------------ main --

async function run(name, fn) {
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
  const chrome = findChrome();
  if (!chrome) return check('chrome-found', ['no Chrome: set CHROME to chrome.exe']);
  if (!existsSync(join(dist, 'store', 'index.html'))) return check('dist-built', [`${dist} has no store/index.html: build first (npm run build)`]);
  const port = await freePort();
  const preview = spawn(process.execPath, [VITE, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--outDir', dist], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let log = '';
  preview.stdout.on('data', (d) => (log += d));
  preview.stderr.on('data', (d) => (log += d));
  const origin = `http://127.0.0.1:${port}`;
  const profile = mkdtempSync(join(tmpdir(), 'store-mode-check-'));
  let b = null;
  try {
    if (!(await waitReady(`${origin}/`, 30_000))) return check('preview-server', [`vite preview did not answer on ${origin}: ${JSON.stringify(log.slice(-300))}`]);
    b = await launchChrome(chrome, profile);
    await run('flat', () => flatFallback(b, origin, 'flat fixture', '/store/'));
    await run('flat+mode', () => flatFallback(b, origin, 'flat fixture with ?mode=pvp and a remembered mode', '/store/?mode=pvp', remember('smp')));
    await run('first visit', () => firstVisit(b, origin));
    await run('url wins', () => urlWins(b, origin));
    await run('url fresh', () => urlFresh(b, origin));
    await run('url case', () => urlCase(b, origin));
    await run('url junk', () => urlJunk(b, origin));
    await run('stored junk', () => storedJunk(b, origin));
    await run('checkout', () => checkoutComplete(b, origin));
    await run('cart', () => cartShared(b, origin));
    await run('shared', () => sharedCategory(b, origin));
    await run('third', () => thirdMode(b, origin));
    await run('400px', () => narrow(b, origin));
  } finally {
    if (b) await b.close();
    preview.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main()
  .catch((e) => check('store-mode-check', [String(e?.stack ?? e)]))
  .finally(() => {
    console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
    process.exitCode = failed ? 1 : 0;
  });
