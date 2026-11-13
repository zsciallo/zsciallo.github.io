#!/usr/bin/env node
// Prism Token image crop browser check (run 20261112-store-modes, unit U2): the
// five Prism Token package images are 2000x2000 transparent canvases with the
// art in the middle; the store crops each image to its art (CSS object-view-box
// from the committed table src/data/imageCrops.json) so it fills its frame.
//
//   npm run build && node test/image_crop_check.mjs [--dist <distDir>]
//   (npm script: "test:images": "node test/image_crop.test.mjs && node test/image_crop_check.mjs")
//
// Serves the production build (dist/) with vite preview on a free port and drives
// headless Chrome over CDP (the helpers of test/visual_check.mjs), under the
// deterministic conditions of test/store_mode_check.mjs (fresh browser context
// per page, frozen Date, reduced motion, UTC, en-US, a true 1280x900 or 400x900
// viewport through Emulation.setDeviceMetricsOverride).
//
// Network (CDP Fetch): the preview origin and Google Fonts pass; headless.tebex.io
// .../categories -> test/fixtures/image-crops/tebex-categories.json (the live
// catalogue of 2026-11-12, verbatim: PVP > Prism Coins with the five Prism Token
// packages and their real CDN image URLs; SMP > five categories with their real
// image URLs) or, for AC7, the flat test/fixtures/card-style/tebex-categories.json
// with each package given its live image URL (by package id) in memory. The CDN
// (dunb17ur4ymx4.cloudfront.net) is stubbed: each Prism Token URL gets a generated
// 2000x2000 RGBA PNG, transparent except for an opaque block where that image's
// art is (ART below, measured from the live files: alpha >= 250 bounding box),
// and every other URL a 160x160 opaque PNG (all live SMP images are square). The
// checks are geometric: they read layout boxes, computed styles and the committed
// crop table, never pixels. The cart gets the small stateful Tebex basket of
// store_mode_check (its lines carry the package image, as Tebex's do).
//
// Geometry: for an <img>, the drawn source region is its computed object-view-box
// (inset(t r b l) of the natural size; `none` = the whole canvas), placed in the
// element's content box by its computed object-fit and object-position. The art
// box (from imageCrops.json for that URL, or ART when the table has no entry)
// is mapped through that onto the screen.
//
// What is checked (one PASS/FAIL line each, then RESULT):
//   AC1 store card (?mode=pvp, 1280): each of the five Prism Token <img.pkg-image>
//       has data-cropped="true" and an inline object-view-box; the art's on-screen
//       box covers >= 70% of the image content box in its larger axis; the art is
//       not cut off; the content box is >= 96px tall; image-rendering is auto.
//   AC2 the content box aspect equals the drawn view box's aspect within 2%, the
//       horizontal and vertical scale agree within 2% (no distortion), and the
//       inline aspect-ratio matches the view box.
//   AC3 an SMP package whose URL has no entry (?mode=smp, a fixture-only URL):
//       no data-cropped, no style attribute, object-view-box none, 96x96 on the
//       card, 110x110 in the pop-up, image-rendering pixelated (today's CSS).
//   AC4 the package pop-up (img.pkg-modal-image) of each Prism Token package and
//       the cart thumbnail (img.cart-item-img) of a Prism Token line: cropped,
//       the same object-view-box as the card, coverage >= 70%, no distortion.
//   AC5 at a true 400px, ?mode=pvp: the five images are cropped, document
//       scrollWidth <= 400, each image inside its .pkg-image-wrap and its .pkg-card.
//   AC7 every SMP card of the live catalogue (?mode=smp) and every card of the
//       flat fixture: no [data-cropped] anywhere, each .pkg-image 96x96, no inline
//       style, pixelated.
// Each scenario first proves the harness worked (store rendered, categories stub
// hit, the Prism images requested from the CDN stub and loaded at 2000x2000), so
// a red run fails on the feature, not on the harness.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FIX, FREEZE, FROZEN_TIME, HEAD_PNG, ROOT, VITE, encodePng, fileOr404, findChrome, freePort, json, launchChrome, sleep, waitReady } from './visual_check.mjs';

const HEIGHT = 900;
const CDN = 'dunb17ur4ymx4.cloudfront.net';
const LIVE_FIX = join(ROOT, 'test', 'fixtures', 'image-crops', 'tebex-categories.json');
const FLAT_FIX = join(ROOT, 'test', 'fixtures', 'card-style', 'tebex-categories.json');
const CROPS_FILE = join(ROOT, 'src', 'data', 'imageCrops.json');
const PRISM_CATEGORY = 3501348;
const PVP_PARENT = 3501345;
const SMP_PARENT = 3501357;
const BASKET_IDENT = 'cropcheck1';
/** A URL no crop table can know: the AC3 fallback package's image. */
const NO_ENTRY_URL = `https://${CDN}/packages/images/0000000000000000000000000000000000000000.png`;
const NO_ENTRY_PKG = 7564223; // VIP
/** The art of each live Prism Token image (alpha >= 250 bounding box of the 2026-11-12 files, x1/y1 exclusive). */
const ART = {
  7808723: [748, 719, 1519, 1206], // 3,000: two coin piles (soft shadow to x about 400 not included)
  7808725: [676, 623, 1678, 1315], // 5,500
  7808726: [595, 514, 1846, 1458], // 12,000
  7808728: [883, 426, 1709, 1540], // 26,000
  7808729: [469, 271, 1900, 1712], // 70,000: a chest of coins
};
const MIN_COVER = 0.7;
const ASPECT_TOL = 0.02;

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
function need(name, problems) {
  if (!check(name, problems)) throw new Stop(name);
}
const q = JSON.stringify;

// -------------------------------------------------------------- fixtures --

const raw = (file) => JSON.parse(readFileSync(file, 'utf-8'));
const LIVE = raw(LIVE_FIX).data;
const parentId = (c) => (c.parent && typeof c.parent === 'object' ? c.parent.id : null);
const PRISM = LIVE.find((c) => c.id === PRISM_CATEGORY).packages.map((p) => ({ id: p.id, name: p.name, url: p.image }));
const PRISM_BY_URL = new Map(PRISM.map((p) => [p.url, p]));
const IMAGE_BY_ID = new Map(LIVE.flatMap((c) => c.packages ?? []).map((p) => [p.id, p.image]));
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'src', 'config.json'), 'utf-8'));
const PAIRED = new Set(Object.values(CONFIG.subscriptionPairs ?? {}).map(Number));
const SMP_PKGS = LIVE.filter((c) => parentId(c) === SMP_PARENT).flatMap((c) => c.packages ?? []).filter((p) => !PAIRED.has(p.id));

/** The committed crop table, or null (red: not written yet). */
function loadCrops() {
  try {
    return existsSync(CROPS_FILE) ? JSON.parse(readFileSync(CROPS_FILE, 'utf-8')) : null;
  } catch {
    return null;
  }
}
const CROPS = loadCrops();
/** The art box used for coverage: the committed entry's box, else the measured ART. */
function artFor(url) {
  const e = CROPS && Object.prototype.hasOwnProperty.call(CROPS, url) ? CROPS[url] : null;
  if (e && Array.isArray(e.box) && e.box.length === 4) return { box: e.box, from: 'imageCrops.json' };
  const p = PRISM_BY_URL.get(url);
  return p ? { box: ART[p.id], from: 'measured ART (no imageCrops.json entry)' } : null;
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const VARIANTS = {
  live: () => ({ data: clone(LIVE) }),
  noEntry: () => {
    const body = { data: clone(LIVE) };
    for (const c of body.data) for (const p of c.packages ?? []) if (p.id === NO_ENTRY_PKG) p.image = NO_ENTRY_URL;
    return body;
  },
  flat: () => {
    const body = raw(FLAT_FIX);
    for (const c of body.data) for (const p of c.packages ?? []) p.image = IMAGE_BY_ID.get(p.id) ?? `https://${CDN}/packages/images/flat-${p.id}.png`;
    return body;
  },
};

/** 2000x2000, transparent, opaque gold where the art is. */
function prismPng(box) {
  const W = 2000;
  const H = 2000;
  const rgba = Buffer.alloc(W * H * 4);
  const [x0, y0, x1, y1] = box;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) rgba.set([214, 170, 40, 255], (y * W + x) * 4);
  return encodePng(W, H, rgba);
}
const OTHER_PNG = encodePng(160, 160, Buffer.alloc(160 * 160 * 4, 0xc8));
let PRISM_PNGS = null;

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
  if (host === CDN) {
    st.hits.images[url] = (st.hits.images[url] ?? 0) + 1;
    return { status: 200, type: 'image/png', body: PRISM_PNGS.get(url) ?? OTHER_PNG };
  }
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
        else st.basket.lines.push({ id: p.id, name: p.name, image: p.image, in_basket: { quantity: Number(body.quantity) || 1, price: p.total_price } });
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

/** In-page helpers, installed on every document as window.__ic. */
const LIB = `window.__ic = {
  vis(e) { if (!e) return false; if (!e.getClientRects().length) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none'; },
  all(sel) { return [...document.querySelectorAll(sel)].filter((e) => this.vis(e)); },
  card(name) { return this.all('.pkg-card').find((c) => (c.querySelector('.pkg-name')?.textContent || '').trim() === name) || null; },
  names() { return this.all('.pkg-card').map((c) => (c.querySelector('.pkg-name')?.textContent || '').trim()); },
  box(e) { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; },
  px(v) { return parseFloat(v) || 0; },
  /** Lengths of an inset(...) object-view-box, as [top, right, bottom, left] in source px, or null for none. */
  inset(v, nw, nh) {
    if (!v || v === 'none') return null;
    const m = v.match(/^inset\\(([^)]*)\\)$/); if (!m) return 'unparsed';
    const parts = m[1].trim().split(/\\s+/);
    const len = (s, ref) => (s.endsWith('%') ? parseFloat(s) / 100 * ref : s.endsWith('px') || s === '0' ? parseFloat(s) : NaN);
    const [t, r = t, b = t, l = r] = parts;
    return [len(t, nh), len(r, nw), len(b, nh), len(l, nw)];
  },
  pos(s, free) { return s.endsWith('%') ? parseFloat(s) / 100 * free : s.endsWith('px') ? parseFloat(s) : s === 'left' || s === 'top' ? 0 : s === 'right' || s === 'bottom' ? free : free / 2; },
  /** Everything the checks need about how an <img> draws its source, and where the art box lands. */
  measure(img, art) {
    const cs = getComputedStyle(img); const r = img.getBoundingClientRect(); const p = (k) => this.px(cs[k]);
    const cx = r.left + p('borderLeftWidth') + p('paddingLeft'); const cy = r.top + p('borderTopWidth') + p('paddingTop');
    const cw = r.width - p('borderLeftWidth') - p('paddingLeft') - p('paddingRight') - p('borderRightWidth');
    const ch = r.height - p('borderTopWidth') - p('paddingTop') - p('paddingBottom') - p('borderBottomWidth');
    const nw = img.naturalWidth, nh = img.naturalHeight;
    const ovb = cs.objectViewBox ?? cs.getPropertyValue('object-view-box') ?? 'none';
    const ins = this.inset(ovb, nw, nh);
    const view = ins && ins !== 'unparsed' ? { x: ins[3], y: ins[0], w: nw - ins[1] - ins[3], h: nh - ins[0] - ins[2] } : { x: 0, y: 0, w: nw, h: nh };
    const fit = cs.objectFit; let sx, sy;
    if (fit === 'fill') { sx = cw / view.w; sy = ch / view.h; }
    else if (fit === 'cover') { sx = sy = Math.max(cw / view.w, ch / view.h); }
    else if (fit === 'none') { sx = sy = 1; }
    else if (fit === 'scale-down') { sx = sy = Math.min(1, cw / view.w, ch / view.h); }
    else { sx = sy = Math.min(cw / view.w, ch / view.h); }
    const dw = view.w * sx, dh = view.h * sy;
    const [px, py = '50%'] = (cs.objectPosition || '50% 50%').split(/\\s+/);
    const dx = cx + this.pos(px, cw - dw), dy = cy + this.pos(py, ch - dh);
    let a = null;
    if (art) {
      const ax0 = dx + (art[0] - view.x) * sx, ay0 = dy + (art[1] - view.y) * sy, ax1 = dx + (art[2] - view.x) * sx, ay1 = dy + (art[3] - view.y) * sy;
      // What of the art is visible: inside the view box (that is the drawn rect) and inside the content box.
      const vx0 = Math.max(ax0, dx, cx), vy0 = Math.max(ay0, dy, cy), vx1 = Math.min(ax1, dx + dw, cx + cw), vy1 = Math.min(ay1, dy + dh, cy + ch);
      const vw = Math.max(0, vx1 - vx0), vh = Math.max(0, vy1 - vy0);
      a = { cover: Math.max(vw / cw, vh / ch), shown: (vw * vh) / Math.max(1e-9, (ax1 - ax0) * (ay1 - ay0)) };
    }
    return {
      cropped: img.getAttribute('data-cropped'), style: img.getAttribute('style'), inlineOvb: img.style.objectViewBox || img.style.getPropertyValue('object-view-box') || '',
      inlineAspect: img.style.aspectRatio || '', rendering: cs.imageRendering, ovb, unparsed: ins === 'unparsed', fit,
      nw, nh, cw, ch, view, sx, sy, art: a, rect: this.box(img), complete: img.complete, src: img.currentSrc || img.src,
    };
  },
};`;

async function openPage(b, origin, { width = 1280, variant = 'live', init = '', basket = false } = {}) {
  const { browserContextId } = await b.send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => b.send(m, p, sessionId);
  const st = { body: VARIANTS[variant](), basket: basket ? { lines: [] } : null, hits: { categories: 0, adds: 0, images: {} } };
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
    const end = Date.now() + max;
    while (Date.now() < end) {
      if (inflight.size === 0 && Date.now() - lastNet >= quiet) return;
      await sleep(100);
    }
  };
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
  const goto = async (path) => {
    const before = loads;
    await s('Page.navigate', { url: `${origin}${path}` });
    for (let i = 0; i < 300 && loads === before; i++) await sleep(100);
    if (loads === before) throw new Error('no load event in 30 s');
    await idle();
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
  return { s, ev, until, goto, idle, close, st, width };
}

const SEED_BASKET = `try { if (!sessionStorage.getItem('__basket')) { localStorage.setItem('chromabit_username', 'Steve'); localStorage.setItem('chromabit_platform', 'java'); localStorage.setItem('chromabit_basket', JSON.stringify({ ident: ${q(BASKET_IDENT)}, username: 'Steve', at: ${FROZEN_TIME} })); sessionStorage.setItem('__basket', '1'); } } catch {}`;

async function storeLoaded(page, label) {
  const r = await page.until(`window.__ic.all('.pkg-card').length ? true : (document.querySelector('.store-banner.error') ? 'error' : false)`, 10_000);
  need(`${label}: store loaded from the stub`, [
    page.st.hits.categories < 1 && 'the Tebex categories stub was never requested',
    r === 'error' && 'the store shows its load-error banner',
    !r && 'no .pkg-card rendered in 10 s',
    (await page.ev(`!!document.querySelector('[data-mode-prompt]')`)) && 'the mode pop-up is open (the ?mode= was not taken)',
  ]);
}

/** Scrolls every visible `sel` image into view and waits until each has loaded. */
async function loadImages(page, sel) {
  // loading="lazy": each image only loads once it is near the viewport, so wait for each one in turn before moving on.
  await page.ev(`(async () => { for (const i of window.__ic.all(${q(sel)})) { i.scrollIntoView({ block: 'center' }); for (let t = 0; t < 50 && !(i.complete && i.naturalWidth > 0); t++) await new Promise((r) => setTimeout(r, 100)); } scrollTo(0, 0); })()`);
  await page.until(`window.__ic.all(${q(sel)}).every((i) => i.complete && i.naturalWidth > 0)`, 8000);
  await page.idle();
}

/** Harness proof for a PVP page: the five Prism cards with their images, requested from the CDN stub, loaded at 2000x2000. */
async function prismReady(page, label) {
  await page.until(`${q(q(PRISM.map((p) => p.name)))} === JSON.stringify(window.__ic.names())`, 5000);
  await loadImages(page, '.pkg-card img.pkg-image');
  const got = await page.ev(`${q(PRISM)}.map((p) => { const c = window.__ic.card(p.name); const i = c && c.querySelector('img.pkg-image'); return { name: p.name, card: !!c, img: !!i, src: i ? i.getAttribute('src') : null, nw: i ? i.naturalWidth : 0, nh: i ? i.naturalHeight : 0 }; })`);
  const names = await page.ev('window.__ic.names()');
  need(`${label}: the five Prism Token cards show their CDN images (stubbed, 2000x2000)`, [
    q(names) !== q(PRISM.map((p) => p.name)) && `cards ${q(names)}, want ${q(PRISM.map((p) => p.name))}`,
    ...got.map((g, i) => (!g.card ? `no ${g.name} card` : !g.img ? `${g.name}: no img.pkg-image` : g.src !== PRISM[i].url ? `${g.name}: src ${g.src}, want ${PRISM[i].url}` : !page.st.hits.images[PRISM[i].url] ? `${g.name}: the CDN stub never served ${PRISM[i].url}` : g.nw !== 2000 || g.nh !== 2000 ? `${g.name}: natural size ${g.nw}x${g.nh}, want 2000x2000` : null)),
  ]);
}

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const r1 = (v) => Math.round(v * 10) / 10;
/** Problems of a cropped image: marked, inline crop, coverage, nothing cut off, no distortion, optional element-aspect and min height. */
function cropProblems(m, { minHeight = null, elementAspect = true, rendering = true } = {}) {
  const out = [];
  if (m.cropped !== 'true') out.push(`data-cropped is ${q(m.cropped)}, want "true"`);
  if (!m.inlineOvb) out.push('no inline object-view-box style');
  if (m.unparsed) out.push(`computed object-view-box ${q(m.ovb)} is not an inset()`);
  if (!m.art) out.push('no art box for this URL');
  else {
    if (!(m.art.cover >= MIN_COVER)) out.push(`the art covers ${pct(m.art.cover)} of the ${r1(m.cw)}x${r1(m.ch)} image in its larger axis, want >= ${pct(MIN_COVER)} (object-view-box ${m.ovb})`);
    if (!(m.art.shown >= 0.99)) out.push(`only ${pct(m.art.shown)} of the art is visible (cut off by the crop)`);
  }
  if (minHeight != null && !(m.ch >= minHeight - 0.5)) out.push(`image is ${r1(m.ch)}px tall, want >= ${minHeight}px`);
  if (Math.abs(m.sx / m.sy - 1) > ASPECT_TOL) out.push(`drawn with x scale ${m.sx.toFixed(4)} and y scale ${m.sy.toFixed(4)} (distorted)`);
  if (elementAspect) {
    const ea = m.cw / m.ch;
    const va = m.view.w / m.view.h;
    if (Math.abs(ea / va - 1) > ASPECT_TOL) out.push(`element aspect ${ea.toFixed(4)} (${r1(m.cw)}x${r1(m.ch)}), the grown box aspect ${va.toFixed(4)} (${r1(m.view.w)}x${r1(m.view.h)})`);
    const mm = m.inlineAspect.match(/^\s*([\d.]+)\s*\/\s*([\d.]+)\s*$/);
    if (!mm) out.push(`inline aspect-ratio ${q(m.inlineAspect)}, want "<w> / <h>"`);
    else if (Math.abs(Number(mm[1]) / Number(mm[2]) / va - 1) > ASPECT_TOL) out.push(`inline aspect-ratio ${m.inlineAspect} is not the drawn box ${r1(m.view.w)} / ${r1(m.view.h)}`);
  }
  if (rendering && m.rendering !== 'auto') out.push(`image-rendering ${m.rendering}, want auto (smooth: these are renders)`);
  return out;
}
/** Problems of an uncropped image: exactly today's rendering. */
function plainProblems(m, size) {
  const out = [];
  if (m.cropped !== null) out.push(`data-cropped=${q(m.cropped)}`);
  if (m.style !== null && m.style.trim() !== '') out.push(`style=${q(m.style)}`);
  if (m.ovb !== 'none') out.push(`object-view-box ${m.ovb}`);
  if (Math.abs(m.rect.width - size) > 0.5 || Math.abs(m.rect.height - size) > 0.5) out.push(`${r1(m.rect.width)}x${r1(m.rect.height)}, want ${size}x${size}`);
  if (m.rendering !== 'pixelated') out.push(`image-rendering ${m.rendering}, want pixelated`);
  return out;
}

const measureExpr = (imgExpr, url) => `(() => { const i = ${imgExpr}; return i ? window.__ic.measure(i, ${q(artFor(url)?.box ?? null)}) : null; })()`;
const cardImg = (name) => `(window.__ic.card(${q(name)}) || document.createElement('i')).querySelector('img.pkg-image')`;

// ------------------------------------------------------------- scenarios --

async function supportsViewBox(b, origin) {
  const page = await openPage(b, origin);
  try {
    await page.goto('/store/?mode=pvp');
    need('(setup) this Chrome supports CSS object-view-box', (await page.ev(`CSS.supports('object-view-box', 'inset(1px 2px 3px 4px)')`)) ? [] : ['CSS.supports is false: the geometry below cannot be measured']);
  } finally {
    await page.close();
  }
}

async function pvpCards(b, origin) {
  const L = 'PVP cards, 1280';
  const page = await openPage(b, origin);
  try {
    await page.goto('/store/?mode=pvp');
    await storeLoaded(page, L);
    await prismReady(page, L);
    await page.until(`window.__ic.all('.pkg-card img.pkg-image[data-cropped="true"]').length === ${PRISM.length}`, 3000);
    for (const p of PRISM) {
      const m = await page.ev(measureExpr(cardImg(p.name), p.url));
      if (!m) {
        check(`AC1 ${p.name}: card image`, ['no img.pkg-image']);
        continue;
      }
      const all = cropProblems(m, { minHeight: 96, elementAspect: false });
      check(`AC1 ${p.name}: the card image is cropped to its art (>= 70% of its larger axis, nothing cut off, >= 96px tall, smooth)`, all.length ? [...all, `art box from ${artFor(p.url).from}`] : []);
      check(`AC2 ${p.name}: the card image keeps the grown box's aspect ratio (element and inline aspect-ratio within 2%, no distortion)`, cropProblems(m, { elementAspect: true, rendering: false }).filter((x) => /aspect|distorted/.test(x) || /data-cropped|inline object-view-box/.test(x)));
    }
  } finally {
    await page.close();
  }
}

async function pvpModal(b, origin) {
  const L = 'PVP pop-up';
  const page = await openPage(b, origin);
  try {
    await page.goto('/store/?mode=pvp');
    await storeLoaded(page, L);
    await prismReady(page, L);
    for (const p of PRISM) {
      const card = await page.ev(measureExpr(cardImg(p.name), p.url));
      const opened = await page.ev(`(() => { const c = window.__ic.card(${q(p.name)}); if (!c) return false; c.click(); return true; })()`);
      const shown = await page.until(`(() => { const i = window.__ic.all('img.pkg-modal-image')[0]; return !!(i && i.complete && i.naturalWidth > 0); })()`, 5000);
      need(`AC4 (setup) ${p.name}: the pop-up opens with its image`, [!opened && 'no card to click', !shown && 'no loaded img.pkg-modal-image within 5 s']);
      await sleep(300);
      const m = await page.ev(measureExpr(`window.__ic.all('img.pkg-modal-image')[0]`, p.url));
      check(`AC4 ${p.name}: the pop-up image is cropped the same way as the card (coverage >= 70%, aspect kept)`, [
        ...cropProblems(m),
        m.src !== p.url && `pop-up image ${m.src}, want ${p.url}`,
        card && m.ovb !== card.ovb && `pop-up object-view-box ${m.ovb}, card ${card.ovb}`,
      ]);
      await page.ev(`(() => { const x = document.querySelector('.pkg-modal-close'); if (x) x.click(); })()`);
      await page.until(`!window.__ic.all('img.pkg-modal-image').length`, 3000);
      await sleep(300);
    }
  } finally {
    await page.close();
  }
}

async function pvpCart(b, origin) {
  const L = 'PVP cart';
  const p = PRISM[0];
  const page = await openPage(b, origin, { init: SEED_BASKET, basket: true });
  const count = `(document.querySelector('.cart-fab-badge')?.textContent || '').trim()`;
  try {
    await page.goto('/store/?mode=pvp');
    await storeLoaded(page, L);
    await prismReady(page, L);
    const card = await page.ev(measureExpr(cardImg(p.name), p.url));
    const clicked = await page.ev(`(() => { const c = window.__ic.card(${q(p.name)}); const b = c && c.querySelector('.pkg-cart-btn'); if (!b) return false; b.click(); return true; })()`);
    const one = await page.until(`${count} === '1'`, 8000);
    need(`AC4 (setup) ${p.name} is added to the cart`, [!clicked && `no ${p.name} card with .pkg-cart-btn`, page.st.hits.adds < 1 && 'the basket stub got no add', !one && `cart badge ${q(await page.ev(count))}, want "1"`]);
    await page.ev(`document.querySelector('.cart-fab')?.click()`);
    const shown = await page.until(`(() => { const i = document.querySelector('.cart-drawer.open .cart-item-img'); return !!(i && i.complete && i.naturalWidth > 0); })()`, 6000);
    need('AC4 (setup) the cart drawer shows the line with its thumbnail', shown ? [] : ['no loaded .cart-drawer.open .cart-item-img within 6 s']);
    await sleep(400);
    const m = await page.ev(measureExpr(`document.querySelector('.cart-drawer.open .cart-item-img')`, p.url));
    const row = await page.ev(`(() => { const i = document.querySelector('.cart-drawer.open .cart-item-img'); const r = i.closest('.cart-item').getBoundingClientRect(); const e = i.getBoundingClientRect(); return { inside: e.left >= r.left - 0.5 && e.right <= r.right + 0.5 && e.top >= r.top - 0.5 && e.bottom <= r.bottom + 0.5 }; })()`);
    check(`AC4 ${p.name}: the cart thumbnail is cropped the same way as the card (coverage >= 70%, no distortion, inside its row)`, [
      // The thumbnail is a fixed 40px square (today's CSS); the crop is drawn inside it with object-fit, so only the drawn aspect is checked.
      ...cropProblems(m, { elementAspect: false }),
      card && m.ovb !== card.ovb && `cart object-view-box ${m.ovb}, card ${card.ovb}`,
      !row.inside && 'the thumbnail overflows its .cart-item',
    ]);
  } finally {
    await page.close();
  }
}

async function narrow(b, origin) {
  const L = 'PVP cards, 400px';
  const page = await openPage(b, origin, { width: 400 });
  try {
    await page.goto('/store/?mode=pvp');
    need(`${L}: (setup) the viewport is a true 400px`, (await page.ev('innerWidth')) === 400 ? [] : [`innerWidth ${await page.ev('innerWidth')}`]);
    await storeLoaded(page, L);
    await prismReady(page, L);
    await page.until(`window.__ic.all('.pkg-card img.pkg-image[data-cropped="true"]').length === ${PRISM.length}`, 3000);
    const got = await page.ev(`(() => { const out = []; const W = innerWidth; const sw = document.documentElement.scrollWidth; if (sw > W) out.push('document scrollWidth ' + sw + ' > ' + W);
      for (const p of ${q(PRISM)}) { const c = window.__ic.card(p.name); const i = c && c.querySelector('img.pkg-image'); if (!i) { out.push(p.name + ': no image'); continue; }
        if (i.getAttribute('data-cropped') !== 'true') out.push(p.name + ': not cropped (no data-cropped="true")');
        const e = i.getBoundingClientRect(); const in_ = (r) => e.left >= r.left - 0.5 && e.right <= r.right + 0.5 && e.top >= r.top - 0.5 && e.bottom <= r.bottom + 0.5;
        if (!in_(c.getBoundingClientRect())) out.push(p.name + ': the image overflows its card');
        const w = i.closest('.pkg-image-wrap'); if (!w || !in_(w.getBoundingClientRect())) out.push(p.name + ': the image overflows its .pkg-image-wrap');
        if (e.left < -0.5 || e.right > W + 0.5) out.push(p.name + ': the image spans ' + Math.round(e.left) + '..' + Math.round(e.right)); }
      return out; })()`);
    check('AC5 400px: the cropped Prism images fit their cards and the page has no horizontal scroll', got);
  } finally {
    await page.close();
  }
}

async function noEntry(b, origin) {
  const L = 'SMP, a package with no crop entry';
  const page = await openPage(b, origin, { variant: 'noEntry' });
  try {
    await page.goto('/store/?mode=smp');
    await storeLoaded(page, L);
    await loadImages(page, '.pkg-card img.pkg-image');
    const name = SMP_PKGS.find((p) => p.id === NO_ENTRY_PKG).name;
    const src = await page.ev(`${cardImg(name)}?.getAttribute('src') ?? null`);
    need(`${L}: (setup) the ${name} card shows the fixture-only URL, served by the CDN stub`, [src !== NO_ENTRY_URL && `src ${q(src)}, want ${NO_ENTRY_URL}`, !page.st.hits.images[NO_ENTRY_URL] && 'the CDN stub never served it']);
    const m = await page.ev(measureExpr(cardImg(name), NO_ENTRY_URL));
    check(`AC3 ${name} (no crop entry): the card image renders as today (no data-cropped, no style, 96x96, pixelated)`, plainProblems(m, 96));
    await page.ev(`window.__ic.card(${q(name)}).click()`);
    const shown = await page.until(`(() => { const i = window.__ic.all('img.pkg-modal-image')[0]; return !!(i && i.complete && i.naturalWidth > 0); })()`, 5000);
    need(`AC3 (setup) ${name}: the pop-up opens with its image`, shown ? [] : ['no loaded img.pkg-modal-image within 5 s']);
    await sleep(300);
    check(`AC3 ${name} (no crop entry): the pop-up image renders as today (no data-cropped, no style, 110x110, pixelated)`, plainProblems(await page.ev(measureExpr(`window.__ic.all('img.pkg-modal-image')[0]`, NO_ENTRY_URL)), 110));
  } finally {
    await page.close();
  }
}

async function others(b, origin, label, variant, path, expected) {
  const page = await openPage(b, origin, { variant });
  try {
    await page.goto(path);
    await storeLoaded(page, label);
    await page.until(`window.__ic.all('.pkg-card').length >= ${expected.length}`, 5000);
    await loadImages(page, '.pkg-card img.pkg-image');
    const got = await page.ev(`window.__ic.all('.pkg-card').map((c) => { const i = c.querySelector('img.pkg-image'); return { name: (c.querySelector('.pkg-name')?.textContent || '').trim(), m: i ? window.__ic.measure(i, null) : null }; })`);
    const missing = expected.filter((n) => !got.some((g) => g.name === n && g.m));
    need(`${label}: (setup) every expected card shows a loaded image`, missing.length ? [`no image on ${missing.join(', ')}`] : got.filter((g) => g.m && !(g.m.complete && g.m.nw > 0)).map((g) => `${g.name}: image not loaded`));
    check(`AC7 ${label}: no [data-cropped] anywhere on the page`, (await page.ev(`document.querySelectorAll('[data-cropped]').length`)) ? [`${await page.ev(`document.querySelectorAll('[data-cropped]').length`)} element(s) with data-cropped`] : []);
    check(`AC7 ${label}: every card image renders as today (96x96, no style, pixelated)`, got.filter((g) => g.m).flatMap((g) => plainProblems(g.m, 96).map((x) => `${g.name}: ${x}`)));
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
  check('(setup) the fixture has the five Prism Token packages with CDN image URLs', PRISM.length === 5 && PRISM.every((p) => ART[p.id] && new URL(p.url).hostname === CDN) ? [] : [q(PRISM)]);
  const chrome = findChrome();
  if (!chrome) return check('chrome-found', ['no Chrome: set CHROME to chrome.exe']);
  if (!existsSync(join(dist, 'store', 'index.html'))) return check('dist-built', [`${dist} has no store/index.html: build first (npm run build)`]);
  PRISM_PNGS = new Map(PRISM.map((p) => [p.url, prismPng(ART[p.id])]));
  const port = await freePort();
  const preview = spawn(process.execPath, [VITE, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--outDir', dist], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let log = '';
  preview.stdout.on('data', (d) => (log += d));
  preview.stderr.on('data', (d) => (log += d));
  const origin = `http://127.0.0.1:${port}`;
  const profile = mkdtempSync(join(tmpdir(), 'image-crop-check-'));
  let b = null;
  try {
    if (!(await waitReady(`${origin}/`, 30_000))) return check('preview-server', [`vite preview did not answer on ${origin}: ${JSON.stringify(log.slice(-300))}`]);
    b = await launchChrome(chrome, profile);
    let supported = true;
    await run('object-view-box', async () => {
      try {
        await supportsViewBox(b, origin);
      } catch (e) {
        supported = false;
        throw e;
      }
    });
    if (supported) {
      await run('pvp cards', () => pvpCards(b, origin));
      await run('pvp pop-up', () => pvpModal(b, origin));
      await run('pvp cart', () => pvpCart(b, origin));
      await run('400px', () => narrow(b, origin));
    }
    await run('no entry', () => noEntry(b, origin));
    await run('smp', () => others(b, origin, 'SMP cards of the live catalogue (?mode=smp)', 'live', '/store/?mode=smp', SMP_PKGS.map((p) => p.name)));
    const flat = raw(FLAT_FIX).data.flatMap((c) => c.packages ?? []).filter((p) => !PAIRED.has(p.id)).map((p) => p.name);
    await run('flat', () => others(b, origin, 'flat fixture with live image URLs', 'flat', '/store/', flat));
  } finally {
    if (b) await b.close();
    preview.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main()
  .catch((e) => check('image-crop-check', [String(e?.stack ?? e)]))
  .finally(() => {
    console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
    process.exitCode = failed ? 1 : 0;
  });
