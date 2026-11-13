#!/usr/bin/env node
// Prism Token image crop browser check (run 20261112-store-modes, unit U2): the
// five Prism Token package images are 2000x2000 transparent canvases with the
// art in the middle; the store crops each image to its art so it fills its frame.
// The crop is a clipped frame, the same in every engine (round 2, review r1
// U2-F2: object-view-box only works in Chromium, so Firefox and Safari/iOS saw no
// change): the <img> sits in <span class="crop-frame" data-crop-frame> (overflow
// hidden, aspect-ratio of the grown art box) and is the whole canvas, sized and
// offset in % so that exactly the grown box shows (src/lib/imageCrop.js cropFrame,
// table src/data/imageCrops.json).
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
// art is, and every other URL a 160x160 opaque PNG (all live SMP images are
// square). The art boxes come from test/fixtures/image-crops/art-boxes.json (the
// alpha >= 250 bounding box of each live file, measured by the test writer),
// NEVER from imageCrops.json: coverage and "nothing cut off" are measured against
// where the art really is, so a table box that cuts art off fails here (review r1
// U2-F1). The cart gets the small stateful Tebex basket of store_mode_check (its
// lines carry the package image, as Tebex's do).
//
// Geometry, from layout boxes only (getBoundingClientRect and computed lengths,
// so it does not depend on how an engine paints): the img's content box is where
// the whole canvas is drawn (object-fit applied); the art lands at ART scaled into
// it. What can be seen of the canvas is that drawn rect clipped by every ancestor
// whose computed overflow is not visible (the frame first). The frame's padding
// box is the visible region the art must fill.
//
// What is checked (one PASS/FAIL line each, then RESULT):
//   AC1 store card (?mode=pvp, 1280): each of the five Prism Token <img.pkg-image>
//       has data-cropped="true", sits directly in span.crop-frame[data-crop-frame]
//       with overflow hidden, is position absolute with an inline %-width/height/
//       left/top, uses no object-view-box (inline or computed); nothing of the
//       canvas shows outside the frame; the art covers >= 70% of the frame in its
//       larger axis; >= 99% of the art is visible (nothing cut off); the frame is
//       96px tall (unless capped by the card's inner width, then shorter, aspect
//       kept); image-rendering is auto.
//   AC2 the img's rendered width/height equals the canvas ratio within 1% (and
//       the x and y scales agree within 1%: no distortion); the frame's
//       width/height equals the grown box's (imageCrops.json box grown by 6% of its
//       larger side, clamped) within 2%, and its inline aspect-ratio matches it.
//   AC3 an SMP package whose URL has no entry (?mode=smp, a fixture-only URL):
//       a bare <img> (no crop-frame parent), no data-cropped, no style attribute,
//       object-view-box none, 96x96 on the card, 110x110 in the pop-up,
//       image-rendering pixelated (today's CSS).
//   AC4 the package pop-up (img.pkg-modal-image) of each Prism Token package and
//       the cart thumbnail (img.cart-item-img) of a Prism Token line: the same
//       AC1/AC2 checks (pop-up frame 110px tall unless capped; cart frame inside
//       the 40px square slot, centred, larger side >= 32px), and the same source
//       region shown as on the card (within 10 source px per edge).
//   AC5 at a true 400px, ?mode=pvp: the five images are cropped (AC1/AC2 hold),
//       document scrollWidth <= 400, each frame inside its .pkg-image-wrap and
//       its .pkg-card, and nothing of the canvas shows outside its card.
//   AC7 every SMP card of the live catalogue (?mode=smp) and every card of the
//       flat fixture: no [data-cropped] and no crop frame anywhere, each .pkg-image
//       a bare 96x96 <img>, no inline style, pixelated.
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
const ART_FIX = join(ROOT, 'test', 'fixtures', 'image-crops', 'art-boxes.json');
const FLAT_FIX = join(ROOT, 'test', 'fixtures', 'card-style', 'tebex-categories.json');
const CROPS_FILE = join(ROOT, 'src', 'data', 'imageCrops.json');
const PRISM_CATEGORY = 3501348;
const PVP_PARENT = 3501345;
const SMP_PARENT = 3501357;
const BASKET_IDENT = 'cropcheck1';
/** A URL no crop table can know: the AC3 fallback package's image. */
const NO_ENTRY_URL = `https://${CDN}/packages/images/0000000000000000000000000000000000000000.png`;
const NO_ENTRY_PKG = 7564223; // VIP
/** Where the art of each live Prism Token image is (alpha >= 250 bounding box, x1/y1 exclusive), by package id. Independent of imageCrops.json. */
const ART = Object.fromEntries(Object.entries(JSON.parse(readFileSync(ART_FIX, 'utf-8')).images).map(([id, v]) => [id, v.art]));
const MIN_COVER = 0.7;
const ASPECT_TOL = 0.02;
const CANVAS_TOL = 0.01;
/** The margin the spec grows the art box by (cropBox default). */
const MARGIN = 0.06;
/** The same crop on every surface: the source region shown may differ by this many source px per edge. */
const SAME_SRC_TOL = 10;

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
/** Where the art really is for this URL: always the independent ART, never the table (round 1 used the table's box here; review r1 U2-F1). */
function artFor(url) {
  const p = PRISM_BY_URL.get(url);
  return p ? ART[p.id] : null;
}
/** The grown box the frame should show, { x, y, w, h } in source px: the table's box grown by MARGIN x its larger side, clamped. Only for the frame's aspect (AC2). */
function grownFor(url) {
  const e = CROPS && Object.prototype.hasOwnProperty.call(CROPS, url) ? CROPS[url] : null;
  if (!e || !Array.isArray(e.box) || e.box.length !== 4) return null;
  const [x0, y0, x1, y1] = e.box;
  const g = MARGIN * Math.max(x1 - x0, y1 - y0);
  const l = Math.max(0, x0 - g);
  const t = Math.max(0, y0 - g);
  return { x: l, y: t, w: Math.min(e.w, x1 + g) - l, h: Math.min(e.h, y1 + g) - t };
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
  /** The padding box (what overflow clips to) or, with pad = true, the content box of an element, as { left, top, right, bottom, width, height }. */
  inner(e, pad) { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); const p = (k) => this.px(cs[k]);
    const l = r.left + p('borderLeftWidth') + (pad ? p('paddingLeft') : 0), t = r.top + p('borderTopWidth') + (pad ? p('paddingTop') : 0);
    const rr = r.right - p('borderRightWidth') - (pad ? p('paddingRight') : 0), b = r.bottom - p('borderBottomWidth') - (pad ? p('paddingBottom') : 0);
    return { left: l, top: t, right: rr, bottom: b, width: rr - l, height: b - t }; },
  cut(a, b) { const l = Math.max(a.left, b.left), t = Math.max(a.top, b.top), r = Math.min(a.right, b.right), bt = Math.min(a.bottom, b.bottom); return { left: l, top: t, right: Math.max(l, r), bottom: Math.max(t, bt), width: Math.max(0, r - l), height: Math.max(0, bt - t) }; },
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
  /**
   * Everything the checks need about an <img>, from layout boxes: where the canvas is drawn (its content box,
   * object-fit applied), what of it can be seen (clipped by every ancestor whose overflow is not visible), its
   * crop frame (the parent [data-crop-frame], or null), and where the art box lands and how much of it shows.
   */
  measure(img, art) {
    const cs = getComputedStyle(img);
    const c = this.inner(img, true); const cx = c.left, cy = c.top, cw = c.width, ch = c.height;
    const nw = img.naturalWidth, nh = img.naturalHeight;
    const ovbRaw = cs.objectViewBox ?? cs.getPropertyValue('object-view-box');
    const ovb = ovbRaw == null || ovbRaw === '' ? 'none' : ovbRaw;
    const ins = this.inset(ovb, nw, nh);
    // If an object-view-box were in use (only Chromium has it), the drawn source is that inset; the checks fail on it anyway.
    const view = ins && ins !== 'unparsed' ? { x: ins[3], y: ins[0], w: nw - ins[1] - ins[3], h: nh - ins[0] - ins[2] } : { x: 0, y: 0, w: nw, h: nh };
    const fit = cs.objectFit; let sx, sy;
    if (fit === 'fill') { sx = cw / view.w; sy = ch / view.h; }
    else if (fit === 'cover') { sx = sy = Math.max(cw / view.w, ch / view.h); }
    else if (fit === 'none') { sx = sy = 1; }
    else if (fit === 'scale-down') { sx = sy = Math.min(1, cw / view.w, ch / view.h); }
    else { sx = sy = Math.min(cw / view.w, ch / view.h); }
    const dw = view.w * sx, dh = view.h * sy;
    const [opx, opy = '50%'] = (cs.objectPosition || '50% 50%').split(/\\s+/);
    const dx = cx + this.pos(opx, cw - dw), dy = cy + this.pos(opy, ch - dh);
    const drawn = { left: dx, top: dy, right: dx + dw, bottom: dy + dh, width: dw, height: dh };
    // What of the canvas can be seen: the drawn rect (within the img's content box) clipped by each overflow ancestor.
    let seen = this.cut(drawn, c);
    for (let e = img.parentElement; e && e !== document.documentElement; e = e.parentElement) {
      const ecs = getComputedStyle(e); const ox = ecs.overflowX !== 'visible', oy = ecs.overflowY !== 'visible';
      if (!ox && !oy) continue;
      const p = this.inner(e, false);
      seen = this.cut(seen, { left: ox ? p.left : -1e9, right: ox ? p.right : 1e9, top: oy ? p.top : -1e9, bottom: oy ? p.bottom : 1e9 });
    }
    const par = img.parentElement;
    const isFrame = !!(par && par.hasAttribute('data-crop-frame'));
    let frame = null;
    if (isFrame) {
      const fcs = getComputedStyle(par);
      frame = { tag: par.tagName, cls: String(par.className || ''), box: this.inner(par, false), rect: this.box(par), overflowX: fcs.overflowX, overflowY: fcs.overflowY, position: fcs.position, display: fcs.display, inlineAspect: par.style.aspectRatio || '' };
    }
    // The region the art must fill: the frame's padding box, or the img's content box when there is no frame.
    const ref = frame ? frame.box : c;
    let a = null;
    if (art) {
      const A = { left: dx + (art[0] - view.x) * sx, top: dy + (art[1] - view.y) * sy, right: dx + (art[2] - view.x) * sx, bottom: dy + (art[3] - view.y) * sy };
      A.width = A.right - A.left; A.height = A.bottom - A.top;
      const v = this.cut(this.cut(A, seen), ref);
      a = { cover: Math.max(v.width / ref.width, v.height / ref.height), shown: (v.width * v.height) / Math.max(1e-9, A.width * A.height) };
    }
    // The source region visible in the reference region (to compare surfaces): screen -> source px.
    const vis = this.cut(seen, ref);
    const src = { x0: view.x + (vis.left - dx) / sx, y0: view.y + (vis.top - dy) / sy, x1: view.x + (vis.right - dx) / sx, y1: view.y + (vis.bottom - dy) / sy };
    // How far the visible canvas reaches past the frame (> 0.5 px means the frame does not clip).
    const outside = frame ? Math.max(frame.box.left - seen.left, frame.box.top - seen.top, seen.right - frame.box.right, seen.bottom - frame.box.bottom) : 0;
    const st = img.style;
    return {
      cropped: img.getAttribute('data-cropped'), style: img.getAttribute('style'), inlineOvb: st.objectViewBox || st.getPropertyValue('object-view-box') || '',
      inline: { width: st.width, height: st.height, left: st.left, top: st.top }, position: cs.position,
      parentTag: par ? par.tagName : null, parentCls: par ? String(par.className || '') : '', isFrame, frame,
      rendering: cs.imageRendering, ovb, unparsed: ins === 'unparsed', fit,
      nw, nh, cw, ch, view, sx, sy, art: a, src, seen, outside, rect: this.box(img), complete: img.complete, currentSrc: img.currentSrc || img.src,
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
  // Scroll the crop frame, not the img inside it: the frame (overflow hidden) is a scroll container, and
  // img.scrollIntoView() would scroll the frame itself and shift the crop (a harness artefact, not a user action).
  await page.ev(`(async () => { for (const i of window.__ic.all(${q(sel)})) { (i.closest('[data-crop-frame]') || i).scrollIntoView({ block: 'center' }); for (let t = 0; t < 50 && !(i.complete && i.naturalWidth > 0); t++) await new Promise((r) => setTimeout(r, 100)); } scrollTo(0, 0); })()`);
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
const PCT = /^-?\d+(?:\.\d+)?%$/;
const clips = (v) => v === 'hidden' || v === 'clip';
const dims = (b) => `${r1(b.width)}x${r1(b.height)}`;
/** No object-view-box, inline or computed (Firefox and Safari/iOS ignore it, so nothing may rely on it). */
function ovbProblems(m) {
  return m.inlineOvb || m.ovb !== 'none' ? [`uses object-view-box (inline ${q(m.inlineOvb)}, computed ${q(m.ovb)}), which only Chromium renders`] : [];
}
/**
 * AC1 problems of a cropped image: marked, in a clipping span.crop-frame, positioned by inline percentages,
 * nothing of the canvas outside the frame, the art (independent ART) fills >= 70% of the frame in its larger
 * axis and >= 99% of it is visible, smooth. height: the frame's height on this surface (96 card, 110 pop-up),
 * unless capped by capWidth (then shorter).
 */
function ac1Problems(m, { height = null, capWidth = null } = {}) {
  if (!m) return ['no image'];
  const out = [];
  if (m.cropped !== 'true') out.push(`data-cropped is ${q(m.cropped)}, want "true"`);
  out.push(...ovbProblems(m));
  const f = m.frame;
  if (!f) out.push(`not in a crop frame (parent <${String(m.parentTag).toLowerCase()} class="${m.parentCls}">, want <span class="crop-frame" data-crop-frame>)`);
  else {
    if (f.tag !== 'SPAN' || !/(^|\s)crop-frame(\s|$)/.test(f.cls)) out.push(`the frame is <${f.tag.toLowerCase()} class="${f.cls}">, want <span class="crop-frame">`);
    if (!clips(f.overflowX) || !clips(f.overflowY)) out.push(`frame overflow ${f.overflowX} / ${f.overflowY}, want hidden (it must clip the canvas)`);
    if (height != null) {
      const capped = capWidth != null && f.box.width >= capWidth - 1;
      if (!(Math.abs(f.box.height - height) <= 0.5 || (capped && f.box.height < height))) out.push(`frame ${dims(f.box)}, want ${height}px tall (shorter only when capped by the ${capWidth == null ? '?' : r1(capWidth)}px inner width)`);
    }
    if (capWidth != null && f.box.width > capWidth + 0.5) out.push(`frame ${r1(f.box.width)}px wide, more than the ${r1(capWidth)}px inner width it sits in`);
  }
  if (m.outside > 0.5) out.push(`the canvas shows ${r1(m.outside)}px outside the frame (not clipped)`);
  if (m.position !== 'absolute') out.push(`img position ${m.position}, want absolute`);
  const badInline = ['width', 'height', 'left', 'top'].filter((k) => !PCT.test(m.inline[k] || ''));
  if (badInline.length) out.push(`img inline ${badInline.map((k) => `${k} ${q(m.inline[k])}`).join(', ')}, want percentages of the frame`);
  if (!m.art) out.push('no measured art for this URL');
  else {
    if (!(m.art.cover >= MIN_COVER)) out.push(`the art covers ${pct(m.art.cover)} of the ${f ? `${dims(f.box)} frame` : `${r1(m.cw)}x${r1(m.ch)} image`} in its larger axis, want >= ${pct(MIN_COVER)}`);
    if (!(m.art.shown >= 0.99)) out.push(`only ${pct(m.art.shown)} of the art is visible (cut off)`);
  }
  if (m.rendering !== 'auto') out.push(`image-rendering ${m.rendering}, want auto (smooth: these are renders)`);
  return out;
}
/** AC2 problems: the img is the canvas undistorted (ratio within 1%), the frame has the grown box's ratio (within 2%) and says so inline. */
function ac2Problems(m, url) {
  if (!m) return ['no image'];
  const out = [];
  const ca = m.nw / m.nh;
  const ia = m.cw / m.ch;
  if (Math.abs(ia / ca - 1) > CANVAS_TOL) out.push(`the img renders ${r1(m.cw)}x${r1(m.ch)} (ratio ${ia.toFixed(4)}), the canvas is ${m.nw}x${m.nh} (${ca.toFixed(4)}): stretched`);
  if (Math.abs(m.sx / m.sy - 1) > CANVAS_TOL) out.push(`drawn with x scale ${m.sx.toFixed(4)} and y scale ${m.sy.toFixed(4)} (distorted)`);
  const g = grownFor(url);
  if (!g) out.push(`no imageCrops.json entry for ${url}`);
  else if (!m.frame) out.push('no crop frame');
  else {
    const ga = g.w / g.h;
    const fa = m.frame.box.width / m.frame.box.height;
    if (Math.abs(fa / ga - 1) > ASPECT_TOL) out.push(`frame ${dims(m.frame.box)} (ratio ${fa.toFixed(4)}), the grown box ${r1(g.w)}x${r1(g.h)} (${ga.toFixed(4)})`);
    const mm = m.frame.inlineAspect.match(/^\s*([\d.]+)\s*\/\s*([\d.]+)\s*$/);
    if (!mm) out.push(`frame inline aspect-ratio ${q(m.frame.inlineAspect)}, want "<w> / <h>"`);
    else if (Math.abs(Number(mm[1]) / Number(mm[2]) / ga - 1) > ASPECT_TOL) out.push(`frame inline aspect-ratio ${m.frame.inlineAspect} is not the grown box ${r1(g.w)} / ${r1(g.h)}`);
  }
  return out;
}
/** The same source region shows as on the card (AC4). */
function sameSrc(m, card, label) {
  if (!m || !card) return [`no ${card ? label : 'card'} image to compare`];
  const d = Math.max(...['x0', 'y0', 'x1', 'y1'].map((k) => Math.abs(m.src[k] - card.src[k])));
  const s = (o) => `[${['x0', 'y0', 'x1', 'y1'].map((k) => Math.round(o.src[k])).join(', ')}]`;
  return d > SAME_SRC_TOL ? [`${label} shows source ${s(m)}, the card ${s(card)} (differs by ${Math.round(d)} px, max ${SAME_SRC_TOL})`] : [];
}
/** Problems of an uncropped image: exactly today's markup and rendering (bare <img> in its wrap). */
function plainProblems(m, size, wrapCls) {
  const out = [];
  if (m.cropped !== null) out.push(`data-cropped=${q(m.cropped)}`);
  if (m.isFrame || /(^|\s)crop-frame(\s|$)/.test(m.parentCls)) out.push('wrapped in a crop frame');
  else if (wrapCls && !new RegExp(`(^|\\s)${wrapCls}(\\s|$)`).test(m.parentCls)) out.push(`parent <${String(m.parentTag).toLowerCase()} class="${m.parentCls}">, want the bare img in .${wrapCls}`);
  if (m.style !== null && m.style.trim() !== '') out.push(`style=${q(m.style)}`);
  out.push(...ovbProblems(m));
  if (Math.abs(m.rect.width - size) > 0.5 || Math.abs(m.rect.height - size) > 0.5) out.push(`${r1(m.rect.width)}x${r1(m.rect.height)}, want ${size}x${size}`);
  if (m.rendering !== 'pixelated') out.push(`image-rendering ${m.rendering}, want pixelated`);
  return out;
}

/** Measures an img (with the independent ART for its URL) plus the content box of its closest `wrapSel`, the rect of its closest `.pkg-card`/`.cart-item`. */
const measureExpr = (imgExpr, url, wrapSel = null) =>
  `(() => { const i = ${imgExpr}; if (!i) return null; const m = window.__ic.measure(i, ${q(artFor(url))}); const w = ${q(wrapSel)} && i.closest(${q(wrapSel ?? '')}); m.wrap = w ? window.__ic.inner(w, true) : null; const c = i.closest('.pkg-card, .cart-item'); m.card = c ? window.__ic.box(c) : null; return m; })()`;
const cardImg = (name) => `(window.__ic.card(${q(name)}) || document.createElement('i')).querySelector('img.pkg-image')`;
const inside = (a, b, tol = 0.5) => !!(a && b) && a.left >= b.left - tol && a.right <= b.right + tol && a.top >= b.top - tol && a.bottom <= b.bottom + tol;

// ------------------------------------------------------------- scenarios --

async function supportsViewBox(b, origin) {
  const page = await openPage(b, origin);
  try {
    await page.goto('/store/?mode=pvp');
    // Not a dependency of the crop: it makes "computed object-view-box is none" meaningful (an engine without it always says none).
    need('(setup) this Chrome supports CSS object-view-box, so the "no object-view-box" checks can see one', (await page.ev(`CSS.supports('object-view-box', 'inset(1px 2px 3px 4px)')`)) ? [] : ['CSS.supports is false']);
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
      const m = await page.ev(measureExpr(cardImg(p.name), p.url, '.pkg-image-wrap'));
      if (!m) {
        check(`AC1 ${p.name}: card image`, ['no img.pkg-image']);
        continue;
      }
      check(`AC1 ${p.name}: the card image is cropped to its art in a clipping frame (art >= 70% of the frame's larger axis, nothing cut off, frame 96px tall, smooth, no object-view-box)`, [
        ...ac1Problems(m, { height: 96, capWidth: m.wrap?.width ?? null }),
        m.frame && !inside(m.frame.box, m.wrap) && `the frame ${dims(m.frame.box)} is not inside the .pkg-image-wrap content box`,
      ]);
      check(`AC2 ${p.name}: the card image is not distorted (img = canvas ratio within 1%) and the frame has the grown box's ratio (within 2%)`, ac2Problems(m, p.url));
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
      const card = await page.ev(measureExpr(cardImg(p.name), p.url, '.pkg-image-wrap'));
      const opened = await page.ev(`(() => { const c = window.__ic.card(${q(p.name)}); if (!c) return false; c.click(); return true; })()`);
      const shown = await page.until(`(() => { const i = window.__ic.all('img.pkg-modal-image')[0]; return !!(i && i.complete && i.naturalWidth > 0); })()`, 5000);
      need(`AC4 (setup) ${p.name}: the pop-up opens with its image`, [!opened && 'no card to click', !shown && 'no loaded img.pkg-modal-image within 5 s']);
      await sleep(300);
      const m = await page.ev(measureExpr(`window.__ic.all('img.pkg-modal-image')[0]`, p.url, '.pkg-modal-image-wrap'));
      check(`AC4 ${p.name}: the pop-up image is cropped the same way as the card (same source region, frame 110px tall, art >= 70%, nothing cut off, not distorted)`, [
        ...ac1Problems(m, { height: 110, capWidth: m?.wrap?.width ?? null }),
        ...ac2Problems(m, p.url),
        m && m.currentSrc !== p.url && `pop-up image ${m.currentSrc}, want ${p.url}`,
        m?.frame && !inside(m.frame.box, m.wrap) && `the frame ${dims(m.frame.box)} is not inside the .pkg-modal-image-wrap content box`,
        ...sameSrc(m, card, 'the pop-up'),
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
    const card = await page.ev(measureExpr(cardImg(p.name), p.url, '.pkg-image-wrap'));
    const clicked = await page.ev(`(() => { const c = window.__ic.card(${q(p.name)}); const b = c && c.querySelector('.pkg-cart-btn'); if (!b) return false; b.click(); return true; })()`);
    const one = await page.until(`${count} === '1'`, 8000);
    need(`AC4 (setup) ${p.name} is added to the cart`, [!clicked && `no ${p.name} card with .pkg-cart-btn`, page.st.hits.adds < 1 && 'the basket stub got no add', !one && `cart badge ${q(await page.ev(count))}, want "1"`]);
    await page.ev(`document.querySelector('.cart-fab')?.click()`);
    const shown = await page.until(`(() => { const i = document.querySelector('.cart-drawer.open .cart-item-img'); return !!(i && i.complete && i.naturalWidth > 0); })()`, 6000);
    need('AC4 (setup) the cart drawer shows the line with its thumbnail', shown ? [] : ['no loaded .cart-drawer.open .cart-item-img within 6 s']);
    await sleep(400);
    const m = await page.ev(measureExpr(`document.querySelector('.cart-drawer.open .cart-item-img')`, p.url));
    // The 40px square thumbnail slot: the nearest ancestor of the frame, below .cart-item, whose box is 40x40.
    const slot = await page.ev(`(() => { const i = document.querySelector('.cart-drawer.open .cart-item-img'); const f = i && i.parentElement; if (!f || !f.hasAttribute('data-crop-frame')) return null;
      for (let e = f.parentElement; e && !e.classList.contains('cart-item'); e = e.parentElement) { const r = e.getBoundingClientRect(); if (Math.abs(r.width - 40) <= 0.5 && Math.abs(r.height - 40) <= 0.5) return window.__ic.box(e); }
      return 'none'; })()`);
    const f = m?.frame;
    const slotProblems = !f
      ? []
      : slot === 'none' || !slot
        ? ['no 40x40 thumbnail slot around the frame (between it and .cart-item)']
        : [
            !inside(f.rect, slot) && `the frame ${dims(f.rect)} does not fit in the 40x40 slot`,
            Math.abs((f.rect.left + f.rect.right) / 2 - (slot.left + slot.right) / 2) > 1 || Math.abs((f.rect.top + f.rect.bottom) / 2 - (slot.top + slot.bottom) / 2) > 1 ? `the frame is not centred in its slot (frame ${q(f.rect)}, slot ${q(slot)})` : null,
            // At least as large as the 32px box round 1 drew the crop into (the slot's content box today).
            !(Math.max(f.box.width, f.box.height) >= 31.5) && `the frame is ${dims(f.box)}, want its larger side >= 32px`,
          ];
    check(`AC4 ${p.name}: the cart thumbnail is cropped the same way as the card (same source region, frame centred in the 40px slot, art >= 70%, nothing cut off, not distorted, inside its row)`, [
      ...ac1Problems(m),
      ...ac2Problems(m, p.url),
      ...slotProblems,
      f && !inside(f.rect, m.card) && 'the frame overflows its .cart-item',
      m && !inside(m.seen, m.card) && 'the visible canvas overflows its .cart-item',
      ...sameSrc(m, card, 'the cart thumbnail'),
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
    const out = [];
    const sw = await page.ev('document.documentElement.scrollWidth');
    if (sw > 400) out.push(`document scrollWidth ${sw} > 400`);
    for (const p of PRISM) {
      const m = await page.ev(measureExpr(cardImg(p.name), p.url, '.pkg-image-wrap'));
      if (!m) {
        out.push(`${p.name}: no image`);
        continue;
      }
      const probs = [
        ...ac1Problems(m, { height: 96, capWidth: m.wrap?.width ?? null }),
        ...ac2Problems(m, p.url),
        m.frame && !inside(m.frame.box, m.wrap) && 'the frame overflows its .pkg-image-wrap',
        m.frame && !inside(m.frame.rect, m.card) && 'the frame overflows its card',
        m.frame && (m.frame.rect.left < -0.5 || m.frame.rect.right > 400.5) && `the frame spans ${Math.round(m.frame.rect.left)}..${Math.round(m.frame.rect.right)}`,
        !inside(m.seen, m.card) && 'the visible canvas overflows its card',
      ].filter(Boolean);
      out.push(...probs.map((x) => `${p.name}: ${x}`));
    }
    check('AC5 400px: the cropped Prism images fit their cards (frames inside wrap and card, cropped as at 1280) and the page has no horizontal scroll', out);
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
    check(`AC3 ${name} (no crop entry): the card image renders as today (bare img in .pkg-image-wrap, no data-cropped, no style, 96x96, pixelated)`, plainProblems(m, 96, 'pkg-image-wrap'));
    await page.ev(`window.__ic.card(${q(name)}).click()`);
    const shown = await page.until(`(() => { const i = window.__ic.all('img.pkg-modal-image')[0]; return !!(i && i.complete && i.naturalWidth > 0); })()`, 5000);
    need(`AC3 (setup) ${name}: the pop-up opens with its image`, shown ? [] : ['no loaded img.pkg-modal-image within 5 s']);
    await sleep(300);
    check(`AC3 ${name} (no crop entry): the pop-up image renders as today (bare img in .pkg-modal-image-wrap, no data-cropped, no style, 110x110, pixelated)`, plainProblems(await page.ev(measureExpr(`window.__ic.all('img.pkg-modal-image')[0]`, NO_ENTRY_URL)), 110, 'pkg-modal-image-wrap'));
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
    const marked = await page.ev(`({ cropped: document.querySelectorAll('[data-cropped]').length, frames: document.querySelectorAll('[data-crop-frame], .crop-frame').length })`);
    check(`AC7 ${label}: no [data-cropped] and no crop frame anywhere on the page`, [marked.cropped && `${marked.cropped} element(s) with data-cropped`, marked.frames && `${marked.frames} crop frame(s)`]);
    check(`AC7 ${label}: every card image renders as today (bare 96x96 img in .pkg-image-wrap, no style, pixelated)`, got.filter((g) => g.m).flatMap((g) => plainProblems(g.m, 96, 'pkg-image-wrap').map((x) => `${g.name}: ${x}`)));
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
  const artUrls = JSON.parse(readFileSync(ART_FIX, 'utf-8')).images;
  check('(setup) art-boxes.json measures the same five URLs (the art is independent of imageCrops.json)', PRISM.every((p) => artUrls[p.id]?.url === p.url) && Object.keys(artUrls).length === 5 ? [] : [q(PRISM.map((p) => [p.id, artUrls[p.id]?.url === p.url]))]);
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
    await run('object-view-box support', async () => {
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
