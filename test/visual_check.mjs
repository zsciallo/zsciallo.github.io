#!/usr/bin/env node
// Pixel identity check (run U8): "no change a visitor can see".
//
//   node test/visual_check.mjs --capture <dir> [--dist <distDir>]
//       serve <distDir> (default dist/) with vite preview, screenshot every page
//       at 400x900 and 1280x900, write <dir>/<page>@<width>.png and
//       <dir>/manifest.json (commit, dist file hashes, market data hash, image
//       sizes and hashes, Chrome version, the frozen time, masks).
//   node test/visual_check.mjs --compare <baseDir> <newDir>
//       compare two captures image by image; writes <newDir>/diff-summary.json
//       and <newDir>/<image>.diff.png for every image that fails.
//   node test/visual_check.mjs --against <baseDir> [--out <dir>] [--dist <distDir>]
//       capture the current build into <dir> (default: a new temp dir) and
//       compare it with <baseDir>: what the gate runs after U8.
//   (npm script for the implementer to add: "test:visual": "node test/visual_check.mjs")
//
// Output: one `PASS <name>` / `FAIL <name>: <why>` line per capture or image,
// then `RESULT: PASS n checks` or `RESULT: FAIL k of n`; exit 0 or 1.
//
// Deterministic conditions (each screenshot):
//   - headless Chrome (env CHROME, else the usual install paths), one fresh
//     browser context per screenshot (no shared storage or cache), cache off,
//     --force-color-profile=srgb --disable-lcd-text --hide-scrollbars;
//   - Emulation: device metrics <width>x900, deviceScaleFactor 1, mobile false;
//     prefers-reduced-motion: reduce; timezone UTC; locale en-US;
//   - an injected script freezes Date at FROZEN_TIME (Date.now() and new Date()
//     return it; Date(...) with arguments is untouched) and replaces
//     Math.random with a seeded generator;
//   - every request goes through CDP Fetch: the preview origin and Google Fonts
//     (fonts.googleapis.com, fonts.gstatic.com) pass through; everything else
//     gets a fixed answer (ROUTES below): api.chromabit.us/api/status ->
//     test/fixtures/visual/status.json; api.chromabit.us/pvp/<path> ->
//     test/fixtures/visual/pvp/<path> (404 when absent); api.chromabit.us/market/
//     <path> and the preview origin's /market/*.json -> test/fixtures/card-style/
//     market/<path> (round 2; was <distDir>/market, the untracked copy), and
//     /market/icons/* -> the fixed PNG (the dist market hash is still in the
//     manifest and both captures must match); other api.chromabit.us paths ->
//     404 (e.g. /store/offers: no offer banners); api.mcsrvstat.us ->
//     mcsrvstat.json; the Discord invite API -> discord-invite.json;
//     mc-heads.net -> a fixed 8x8 PNG; PostHog -> 200 {}; headless.tebex.io
//     .../categories -> test/fixtures/card-style/tebex-categories.json (round 2:
//     /store/ renders 10 package cards), other Tebex -> {"data":[]}; any other
//     host -> 404, listed in the manifest as unexpected;
//   - PAGES carry a ready selector (the shot FAILS when the fixture content did
//     not render) and optional setup steps (faq-open clicks the first question);
//   - after the load event: network idle (no request in flight for 500 ms),
//     document.fonts.ready, a scroll from top to bottom in viewport steps (lazy
//     images and scroll reveals fire), every <img> complete, network idle
//     again, back to the top, every Web Animation / CSS animation / transition
//     pinned (finite ones finished, infinite ones paused at t = 0: the hero logo
//     float + glow pulse and the status-dot blink ignore reduced motion), 1.5 s
//     settle, pin again; then a full-page PNG (Page.captureScreenshot,
//     captureBeyondViewport, clip 0,0,width,scrollHeight).
//   Masks: MASKS (selector list) are hidden with visibility:hidden (layout
//   kept) just before the shot. None are needed: with the animation pinning the
//   determinism proof (two captures of 762b268, compared) is in the U8 report;
//   round 2 repeated it on dc46510 with the extended pages (U8-test-writer-r2).
//
// Comparison: PNGs are decoded with node:zlib (8-bit, non-interlaced, colour
// type 2 or 6, as Chrome writes them). Same width and height are required; a
// pixel differs when any RGBA channel differs; an image passes with at most
// TOLERANCE (0.05%) of its pixels differing (anti-aliasing noise). The count,
// the percentage and the bounding box of the differences are printed and
// written to diff-summary.json.

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const VITE = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
export const FIX = join(ROOT, 'test', 'fixtures', 'visual');

/** Waits (up to 10 s) for a rendered match of a selector; resolves to true, or false if it never renders. */
const waitFor = (sel) => `(async () => { for (let i = 0; i < 100; i++) { const el = document.querySelector(${JSON.stringify(sel)}); if (el && el.getClientRects().length) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()`;
const click = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`;

/**
 * [id, path, opts]. opts.ready: a selector that must render before the shot
 * (the fixture produced the content the image is for; a capture without it
 * FAILS instead of photographing an empty page). opts.setup: expressions run
 * in order after the page settled; each must resolve to true.
 * Round 2 (U8 r2, on dc46510): every content page has a ready selector; /store/
 * renders the 10 fixture packages (Tebex fixture below) instead of the empty
 * catalogue; 'faq-open' is the FAQ with its first item open.
 */
export const PAGES = [
  ['home', '/', { ready: '.mode-card' }],
  ['pvp', '/pvp/', { ready: '.pvp-table [data-row]' }],
  ['pvp-player', '/pvp/player/', { ready: '.pvp-profile-state' }],
  ['pvp-player-sample_01', '/pvp/player/?name=sample_01', { ready: '.pvp-kit' }],
  ['smp', '/smp/', { ready: '.fact' }],
  ['faq', '/faq/', { ready: '.faq-item' }],
  ['faq-open', '/faq/', { ready: '.faq-item', setup: [click('.faq-question'), waitFor('.faq-item[data-open]')] }],
  ['store', '/store/', { ready: '.pkg-card' }],
  ['auctions', '/auctions/', { ready: '.market-row' }],
  ['privacy', '/privacy/', { ready: '.legal' }],
];
export const WIDTHS = [400, 1280];
export const HEIGHT = 900;
export const TOLERANCE = 0.0005;
export const FROZEN_TIME = Date.UTC(2026, 10, 10, 12, 0, 0); // 2026-11-10T12:00:00Z
/** Selectors hidden before every shot (layout kept). Empty: nothing still moves under the conditions above. */
export const MASKS = [];

let passed = 0;
let failed = 0;
function check(name, problems) {
  const list = [].concat(problems ?? []).filter(Boolean);
  if (list.length) failed++;
  else passed++;
  console.log(list.length ? `FAIL ${name}: ${list.join('; ')}` : `PASS ${name}`);
}
const note = (name, detail) => {
  passed++;
  console.log(`PASS ${name}${detail ? ` ${detail}` : ''}`);
};
function finish() {
  console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
  process.exitCode = failed ? 1 : 0;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// ------------------------------------------------------------------ PNG --

/** Decode an 8-bit non-interlaced RGB/RGBA PNG to { width, height, rgba }. */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8;
  let width = 0;
  let height = 0;
  let type = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const kind = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8];
      type = data[9];
      if (depth !== 8 || (type !== 2 && type !== 6) || data[12] !== 0) throw new Error(`unsupported PNG (depth ${depth}, colour type ${type}, interlace ${data[12]})`);
    } else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    off += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      out[(y * width + x) * 4] = line[x * bpp];
      out[(y * width + x) * 4 + 1] = line[x * bpp + 1];
      out[(y * width + x) * 4 + 2] = line[x * bpp + 2];
      out[(y * width + x) * 4 + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { width, height, rgba: out };
}

/** Encode RGBA pixels as a PNG (filter 0, zlib). */
export function encodePng(width, height, rgba) {
  const chunk = (kind, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(kind, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Differing pixels between two decoded images of the same size, with their bounding box and a diff image. */
export function diffImages(a, b) {
  let count = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  const out = Buffer.alloc(a.rgba.length);
  for (let i = 0, p = 0; i < a.rgba.length; i += 4, p++) {
    const same = a.rgba[i] === b.rgba[i] && a.rgba[i + 1] === b.rgba[i + 1] && a.rgba[i + 2] === b.rgba[i + 2] && a.rgba[i + 3] === b.rgba[i + 3];
    if (same) {
      out[i] = a.rgba[i] >> 2;
      out[i + 1] = a.rgba[i + 1] >> 2;
      out[i + 2] = a.rgba[i + 2] >> 2;
      out[i + 3] = 255;
    } else {
      count++;
      const x = p % a.width;
      const y = (p / a.width) | 0;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      out[i] = 255;
      out[i + 1] = 0;
      out[i + 2] = 64;
      out[i + 3] = 255;
    }
  }
  return { count, bbox: count ? { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 } : null, image: out };
}

/** A fixed 8x8 opaque PNG for mc-heads.net avatars. */
export const HEAD_PNG = encodePng(8, 8, Buffer.from(Array.from({ length: 64 }, (_, i) => [96 + (i % 8) * 8, 72, 120 + ((i >> 3) % 8) * 8, 255]).flat()));

// ---------------------------------------------------------------- routes --

export const json = (body, status = 200) => ({ status, type: 'application/json', body: typeof body === 'string' ? body : JSON.stringify(body) });
export const fileOr404 = (file, type = 'application/json') => (existsSync(file) && statSync(file).isFile() ? { status: 200, type, body: readFileSync(file) } : json({ error: 'not found' }, 404));

/**
 * Round 2 (U8 r2): the committed fixtures test/card_style_check.mjs uses. The
 * Tebex categories (3 categories, 10 packages, no package images) make
 * /store/ render package cards; the market documents (anonymised, trimmed)
 * replace the untracked public/market copy, so /auctions/ no longer depends on
 * whatever market data the worktree happens to have.
 */
export const CS_FIX = join(ROOT, 'test', 'fixtures', 'card-style');

/** The fixed answer for a request URL, or 'pass' for the preview origin and Google Fonts. */
export function route(url, origin, dist, unexpected) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return url.startsWith('data:') || url.startsWith('blob:') ? 'pass' : json({}, 404);
  }
  const market = (p) => fileOr404(join(CS_FIX, 'market', ...p.split('/')));
  if (url.startsWith(origin)) {
    // The build's static market copy (dist/market, from the untracked public/market): fixtures instead.
    if (u.pathname.startsWith('/market/icons/')) return { status: 200, type: 'image/png', body: HEAD_PNG };
    if (u.pathname.startsWith('/market/') && u.pathname.endsWith('.json')) return market(u.pathname.slice('/market/'.length));
    return 'pass';
  }
  if (url.startsWith('data:') || url.startsWith('blob:')) return 'pass';
  const host = u.hostname;
  if (host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com') return 'pass';
  if (host === 'api.chromabit.us') {
    if (u.pathname === '/api/status') return fileOr404(join(FIX, 'status.json'));
    if (u.pathname.startsWith('/pvp/')) return fileOr404(join(FIX, 'pvp', ...u.pathname.slice('/pvp/'.length).split('/')));
    if (u.pathname.startsWith('/market/')) return market(u.pathname.slice('/market/'.length));
    return json({ error: 'not found' }, 404);
  }
  if (host === 'api.mcsrvstat.us') return fileOr404(join(FIX, 'mcsrvstat.json'));
  if (host === 'discord.com' && u.pathname.startsWith('/api/')) return fileOr404(join(FIX, 'discord-invite.json'));
  if (host === 'mc-heads.net') return { status: 200, type: 'image/png', body: HEAD_PNG };
  if (host.endsWith('posthog.com')) return { status: 200, type: u.pathname.endsWith('.js') ? 'application/javascript' : 'application/json', body: u.pathname.endsWith('.js') ? '' : '{}' };
  if (host === 'headless.tebex.io' && /\/categories$/.test(u.pathname)) return fileOr404(join(CS_FIX, 'tebex-categories.json'));
  if (host.endsWith('tebex.io')) return json({ data: [] });
  unexpected.add(`${u.origin}${u.pathname}`);
  return json({}, 404);
}

// --------------------------------------------------------------- browser --

export function findChrome() {
  const local = process.env.LOCALAPPDATA ?? '';
  return [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    local && join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
    .filter(Boolean)
    .find((c) => existsSync(c)) ?? null;
}

export function freePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.once('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

export async function waitReady(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  return false;
}

export async function launchChrome(chrome, profile) {
  const proc = spawn(
    chrome,
    [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--mute-audio',
      '--force-color-profile=srgb', '--disable-lcd-text', '--disable-extensions', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--remote-debugging-port=0',
      `--user-data-dir=${profile}`, 'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true },
  );
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200 && !existsSync(portFile); i++) await sleep(100);
  if (!existsSync(portFile)) {
    proc.kill();
    throw new Error('Chrome did not open a DevTools port in 20 s');
  }
  await sleep(200);
  const [port, path] = readFileSync(portFile, 'utf-8').split(/\r?\n/);
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      const p = pending.get(d.id);
      pending.delete(d.id);
      if (d.error) p.j(new Error(`${p.method}: ${JSON.stringify(d.error)}`));
      else p.r(d.result);
    } else for (const l of listeners) l(d);
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((r, j) => {
      const i = ++id;
      pending.set(i, { r, j, method });
      ws.send(JSON.stringify({ id: i, method, params, sessionId }));
    });
  const close = async () => {
    try {
      await Promise.race([send('Browser.close'), sleep(3000)]);
    } catch {
      /* already gone */
    }
    try {
      ws.close();
    } catch {
      /* closed */
    }
    proc.kill();
  };
  return { proc, send, listeners, close };
}

export const FREEZE = (t) => `(() => {
  const T = ${t};
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(T); else super(...a); }
    static now() { return T; }
  }
  FrozenDate.UTC = RealDate.UTC;
  FrozenDate.parse = RealDate.parse;
  globalThis.Date = FrozenDate;
  let s = 0x2f6b1c3d;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
})();`;

/** Pin every running animation and transition to a fixed frame: finite ones are
 *  finished (their end state is what a visitor sees once the page settles),
 *  infinite ones (logo float/pulse, status-dot blink, shine loops) are paused at
 *  t = 0. Repeated after the settle wait to catch any started late. */
export const FREEZE_ANIMATIONS = `(() => {
  let n = 0;
  for (const a of document.getAnimations()) {
    const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
    try {
      if (t && Number.isFinite(t.endTime)) a.finish();
      else { a.pause(); a.currentTime = 0; }
      n++;
    } catch { a.pause(); a.currentTime = 0; n++; }
  }
  return n;
})()`;

/** One full-page screenshot under the deterministic conditions; returns { png, width, height, unexpected }. */
async function shoot(b, origin, dist, path, width, opts = {}) {
  const { browserContextId } = await b.send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => b.send(m, p, sessionId);
  const unexpected = new Set();
  const inflight = new Set();
  let lastNet = Date.now();
  let loads = 0;
  const errors = [];
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
      const r = route(p.request.url, origin, dist, unexpected);
      const reply =
        r === 'pass'
          ? s('Fetch.continueRequest', { requestId: p.requestId })
          : s('Fetch.fulfillRequest', {
              requestId: p.requestId,
              responseCode: r.status,
              responseHeaders: [{ name: 'Content-Type', value: r.type }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Cache-Control', value: 'no-store' }],
              body: Buffer.from(r.body).toString('base64'),
            });
      reply.catch((e) => errors.push(String(e.message)));
    }
  };
  b.listeners.add(listener);
  const ev = async (expression) => {
    const r = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(r.exceptionDetails).slice(0, 300)}`);
    return r.result.value;
  };
  const idle = async (quiet = 500, max = 20_000) => {
    const until = Date.now() + max;
    while (Date.now() < until) {
      if (inflight.size === 0 && Date.now() - lastNet >= quiet) return true;
      await sleep(100);
    }
    return false;
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
    await s('Page.navigate', { url: `${origin}${path}` });
    for (let i = 0; i < 300 && loads === 0; i++) await sleep(100);
    if (!loads) throw new Error(`no load event for ${path} in 30 s`);
    await idle();
    await ev('document.fonts.ready.then(() => true)');
    await ev(`(async () => {
      const step = innerHeight;
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 150)); }
      scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 300));
      return true;
    })()`);
    await idle();
    await ev(`Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); setTimeout(r, 5000); }))).then(() => true)`);
    await idle();
    if (opts.ready && !(await ev(waitFor(opts.ready)))) throw new Error(`the fixture did not render ${opts.ready} on ${path}`);
    for (const step of opts.setup ?? []) {
      if (!(await ev(step))) throw new Error(`setup step failed on ${path}: ${step.slice(0, 120)}`);
      await idle();
    }
    await ev(`(() => { scrollTo({ top: 0, behavior: 'instant' }); return true; })()`);
    await ev(FREEZE_ANIMATIONS);
    if (MASKS.length) await ev(`(() => { const st = document.createElement('style'); st.textContent = ${JSON.stringify(`${MASKS.join(',')}{visibility:hidden!important}`)}; document.head.appendChild(st); return true; })()`);
    await ev('document.fonts.ready.then(() => true)');
    await sleep(1500);
    await idle();
    await ev(FREEZE_ANIMATIONS);
    await sleep(100);
    const height = await ev('Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)');
    const shot = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
    if (errors.length) throw new Error(`CDP errors: ${errors.slice(0, 3).join(' | ')}`);
    return { png: Buffer.from(shot.data, 'base64'), width, height, unexpected: [...unexpected].sort() };
  } finally {
    b.listeners.delete(listener);
    await b.send('Target.closeTarget', { targetId }).catch(() => {});
    await b.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
  }
}

// -------------------------------------------------------------- manifest --

function walk(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).sort()) {
    const full = join(dir, f);
    if (statSync(full).isDirectory()) walk(full, base, out);
    else out.push(relative(base, full).split('\\').join('/'));
  }
  return out;
}

function distHashes(dist) {
  const files = {};
  const market = createHash('sha256');
  let marketFiles = 0;
  for (const rel of walk(dist)) {
    const buf = readFileSync(join(dist, rel));
    if (rel.startsWith('market/')) {
      market.update(rel).update('\0').update(buf);
      marketFiles++;
    } else files[rel] = sha(buf);
  }
  const all = createHash('sha256');
  for (const [k, v] of Object.entries(files)) all.update(`${k} ${v}\n`);
  return { files, distHash: all.digest('hex'), marketHash: market.digest('hex'), marketFiles };
}

function gitInfo() {
  const rev = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf-8' });
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ROOT, encoding: 'utf-8' });
  return { commit: (rev.stdout ?? '').trim() || null, modifiedTrackedFiles: (status.stdout ?? '').split(/\r?\n/).filter(Boolean) };
}

// ------------------------------------------------------------------ modes --

async function capture(outDir, dist) {
  mkdirSync(outDir, { recursive: true });
  const chrome = findChrome();
  if (!chrome) return check('chrome-found', ['no Chrome: set CHROME to chrome.exe']);
  if (!existsSync(join(dist, 'index.html'))) return check('dist-built', [`${dist} has no index.html: build first (npm run build)`]);
  const port = await freePort();
  const preview = spawn(process.execPath, [VITE, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--outDir', dist], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let log = '';
  preview.stdout.on('data', (d) => (log += d));
  preview.stderr.on('data', (d) => (log += d));
  const origin = `http://127.0.0.1:${port}`;
  const profile = mkdtempSync(join(tmpdir(), 'visual-check-'));
  let b = null;
  try {
    const up = await waitReady(`${origin}/`, 30_000);
    check('preview-server', up ? [] : [`vite preview did not answer on ${origin} in 30 s: ${JSON.stringify(log.slice(-300))}`]);
    if (!up) return;
    b = await launchChrome(chrome, profile);
    const version = await b.send('Browser.getVersion');
    const manifest = {
      ...gitInfo(),
      distDir: dist,
      ...distHashes(dist),
      chrome: version.product,
      frozenTime: new Date(FROZEN_TIME).toISOString(),
      viewportHeight: HEIGHT,
      reducedMotion: true,
      masks: MASKS,
      tolerance: TOLERANCE,
      images: {},
    };
    for (const [name, path, opts] of PAGES)
      for (const width of WIDTHS) {
        const id = `${name}@${width}`;
        try {
          const r = await shoot(b, origin, dist, path, width, opts);
          const file = `${id}.png`;
          writeFileSync(join(outDir, file), r.png);
          const img = decodePng(r.png);
          manifest.images[id] = { path, setup: opts?.setup?.length ? opts.setup : undefined, file, width: img.width, height: img.height, sha256: sha(r.png), unexpectedRequests: r.unexpected };
          note(`capture ${id}`, `${img.width}x${img.height}${r.unexpected.length ? ` (${r.unexpected.length} unexpected request(s) answered 404, listed in the manifest)` : ''}`);
        } catch (e) {
          check(`capture ${id}`, [String(e?.message ?? e)]);
        }
      }
    writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    if (b) await b.close();
    preview.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

function compare(baseDir, newDir) {
  const bm = JSON.parse(readFileSync(join(baseDir, 'manifest.json'), 'utf-8'));
  const nm = JSON.parse(readFileSync(join(newDir, 'manifest.json'), 'utf-8'));
  check('market-data-same', bm.marketHash === nm.marketHash ? [] : [`the static market copy differs between the captures (${bm.marketFiles} vs ${nm.marketFiles} files): capture both builds from the same public/market`]);
  const summary = { base: { dir: baseDir, commit: bm.commit }, new: { dir: newDir, commit: nm.commit }, tolerance: TOLERANCE, masks: MASKS, images: {} };
  for (const [id, bi] of Object.entries(bm.images)) {
    const ni = nm.images[id];
    if (!ni) {
      summary.images[id] = { missing: true };
      check(`image ${id}`, ['missing from the new capture']);
      continue;
    }
    const a = decodePng(readFileSync(join(baseDir, bi.file)));
    const c = decodePng(readFileSync(join(newDir, ni.file)));
    const entry = { base: `${a.width}x${a.height}`, new: `${c.width}x${c.height}` };
    summary.images[id] = entry;
    if (a.width !== c.width || a.height !== c.height) {
      entry.sizeDiffers = true;
      check(`image ${id}`, [`size ${c.width}x${c.height}, base ${a.width}x${a.height} (height ${c.height - a.height >= 0 ? '+' : ''}${c.height - a.height} px)`]);
      continue;
    }
    const d = diffImages(a, c);
    const pct = d.count / (a.width * a.height);
    Object.assign(entry, { differingPixels: d.count, percent: Number((pct * 100).toFixed(4)), bbox: d.bbox });
    const detail = `${d.count} px differ (${(pct * 100).toFixed(4)}%) ${a.width}x${a.height}${d.bbox ? ` in ${d.bbox.width}x${d.bbox.height} at ${d.bbox.x},${d.bbox.y}` : ''}`;
    if (pct > TOLERANCE) {
      writeFileSync(join(newDir, `${id}.diff.png`), encodePng(a.width, a.height, d.image));
      entry.diff = `${id}.diff.png`;
      check(`image ${id}`, [`${detail}, over ${(TOLERANCE * 100).toFixed(2)}% (see ${id}.diff.png)`]);
    } else note(`image ${id}`, detail);
  }
  for (const id of Object.keys(nm.images)) if (!bm.images[id]) check(`image ${id}`, ['not in the base capture']);
  writeFileSync(join(newDir, 'diff-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const dist = resolve(opt('--dist') ?? join(ROOT, 'dist'));
  if (args[0] === '--capture' && args[1]) await capture(resolve(args[1]), dist);
  else if (args[0] === '--compare' && args[1] && args[2]) compare(resolve(args[1]), resolve(args[2]));
  else if (args[0] === '--against' && args[1]) {
    const out = resolve(opt('--out') ?? mkdtempSync(join(tmpdir(), 'visual-new-')));
    await capture(out, dist);
    if (existsSync(join(out, 'manifest.json'))) compare(resolve(args[1]), out);
    console.log(`(new capture in ${out})`);
  } else {
    console.log('usage: node test/visual_check.mjs --capture <dir> [--dist <distDir>] | --compare <baseDir> <newDir> | --against <baseDir> [--out <dir>] [--dist <distDir>]');
    check('usage', ['no mode given']);
  }
  finish();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    check('visual-check', [String(e?.stack ?? e)]);
    finish();
  });
}
