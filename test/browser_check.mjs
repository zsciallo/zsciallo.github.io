#!/usr/bin/env node
// Browser check for the live PVP data (run U4): /pvp/ and the landing ladder,
// rendered by headless Chrome from a FIXTURE build of the site.
//
//   # 1. a fixture build (Git Bash: the two MSYS variables stop it rewriting
//   #    /pvp-fixture into a Windows path):
//   MSYS_NO_PATHCONV=1 MSYS2_ENV_CONV_EXCL='*' VITE_PVP_BASE=/pvp-fixture npm run build
//   # 2. this check (no npm needed: `node test/browser_check.mjs [distDir]`):
//   node test/browser_check.mjs
//   # 3. rebuild for production afterwards (check_site's pvp-board fails on a
//   #    fixture build on purpose, so it can never ship):
//   npm run build
//
// What it does:
//   - fails at once unless a built JS file in dist/assets contains the base
//     "/pvp-fixture" (the build was not made with VITE_PVP_BASE=/pvp-fixture);
//   - copies test/fixtures/pvp/{season,boards}.json into dist/pvp-fixture/ AND
//     dist/pvp-fixture/pvp/ (src/lib/pvp.js fetches `${BASE}/boards.json`; the
//     second copy covers a base that leaves the /pvp segment to the path), and
//     removes dist/pvp-fixture/ again at the end;
//   - starts Vite's preview server (node_modules/vite/bin/vite.js preview, run
//     with this Node, which is what `npx vite preview` runs) on a free port and
//     stops only that process;
//   - runs headless Chrome (env CHROME, else the usual install paths; missing ->
//     FAIL) with --headless=new --dump-dom --virtual-time-budget=6000 on
//     /, /pvp/, /pvp/?board=sword, /pvp/?board=tournament, /pvp/?board=axe and
//     /pvp/?board=nope, and asserts on the dumped DOM.
//
// Text is compared like test/check_site.mjs (its parser and textOf/blockText:
// entities decoded, whitespace collapsed, case-sensitive). Output: one
// `PASS <name>` / `FAIL <name>: <why>` per check, then `RESULT: PASS n checks` or
// `RESULT: FAIL k of n`; exit 0 or 1.
//
// Not covered here (needs real interaction or layout): clicking a tab updates
// ?board= without a reload, and the 400px layout. The per-page "no inline px
// width over 400" assertion below is only a cheap guard; the real 400px check
// is the implementer's/reviewer's screenshot plus a scrollWidth measurement at
// a true 400px viewport.

import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findAll, parseHtml, textOf } from './check_site.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(process.argv[2] ?? join(ROOT, 'dist'));
const FIXTURES = join(ROOT, 'test', 'fixtures', 'pvp');
const FIXTURE_BASE = '/pvp-fixture';
const VITE = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const BUDGET_MS = 6000;
const CHROME_TIMEOUT_MS = 60_000;

let passed = 0;
let failed = 0;
function check(name, problems) {
  const list = [].concat(problems ?? []).filter(Boolean);
  if (list.length) failed++;
  else passed++;
  console.log(list.length ? `FAIL ${name}: ${list.join('; ')}` : `PASS ${name}`);
}
let finished = false;
function finish() {
  finished = true;
  console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
  process.exitCode = failed ? 1 : 0;
}
const q = JSON.stringify;

// ---------------------------------------------------------------- expected --
// Written out from test/fixtures/pvp/boards.json (not computed by the code under test).

const BOARD_KEYS = ['overall', 'sword', 'mace', 'axe', 'chaos', 'tournament'];
const TAB_LABELS = { overall: 'OVERALL', sword: 'SWORD', mace: 'MACE', axe: 'AXE · SOON', chaos: 'CHAOS · SOON', tournament: 'TOURNAMENT WINS' };
const SOON = new Set(['axe', 'chaos']);
const RATING_COLUMNS = ['#', 'PLAYER', 'TIER', 'RATING', 'W - L', 'WIN %'];
const COUNT_COLUMNS = ['#', 'PLAYER', 'TOURNAMENTS WON'];
const HOSTILE = '<img src=x onerror=alert(1)>';
const uuid = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const COLOURS = { Chroma: '#B24BF3', Mithril: '#FF77E9', Emerald: '#50C878', Gold: '#FFD700', Silver: '#C0C0C0', Bronze: '#CD7F32', Tin: '#8A8F98' };

const rating = (rank, name, edition, id, tier, value, record, pct) => ({ rank, name, edition, uuid: id, tier, rating: String(value), record, pct });
const OVERALL = [
  rating(1, 'Sample_01', 'java', uuid(1), 'Chroma', 1987, '40 - 12', '77%'),
  rating(2, '.Sample_02', 'bedrock', null, 'Mithril I', 1912, '33 - 15', '69%'),
  rating(3, 'Sample_03', 'java', uuid(3), 'Mithril II', 1861, '29 - 18', '62%'),
  rating(4, HOSTILE, 'java', uuid(4), 'Emerald II', 1745, '20 - 20', '50%'),
  rating(5, '.Sample_05', 'bedrock', null, 'Gold II', 1640, '41 - 16', '72%'),
  rating(6, 'Sample_06', 'java', uuid(6), 'Gold II', 1640, '10 - 30', '25%'),
  rating(7, 'Sample_07', 'java', uuid(7), 'Silver III', 1520, '1 - 7', '13%'),
  rating(8, 'Sample_08', 'java', uuid(8), 'Bronze II', 1400, '0 - 0', '0%'),
  rating(9, '.Sample_09', 'bedrock', null, 'Tin I', 1200, '5 - 9', '36%'),
];
const SWORD = [
  rating(1, '.Sample_02', 'bedrock', null, 'Mithril I', 1912, '21 - 9', '70%'),
  rating(2, 'Sample_06', 'java', uuid(6), 'Gold II', 1640, '10 - 30', '25%'),
];
const TOURNAMENT = [
  { rank: 1, name: 'Sample_01', edition: 'java', uuid: uuid(1), value: '3' },
  { rank: 2, name: '.Sample_09', edition: 'bedrock', uuid: null, value: '1' },
];
const SEASON_NAME = 'Season 1';
const RANKED_PLAYERS = '777';

// ----------------------------------------------------------------- helpers --

const hasAttr = (name, value) => (el) => name in el.attrs && (value === undefined || el.attrs[name] === value);
const isHidden = (el) => 'hidden' in el.attrs;
/** Some element under (or equal to) `node` whose text is exactly `want`. */
const hasText = (node, want) => textOf(node) === want || findAll(node, (el) => textOf(el) === want).length > 0;
const rgb = (hex) => {
  const h = hex.slice(1);
  const n = (i) => parseInt(h.slice(i, i + 2), 16);
  return `rgb(${n(0)}, ${n(2)}, ${n(4)})`;
};
/** True when `el`'s inline style (or an ancestor's up to `stop`, or a descendant's) names the colour as hex or rgb(). */
function coloured(el, hex, stop) {
  const hit = (e) => {
    const s = (e.attrs?.style ?? '').toLowerCase();
    return s.includes(hex.toLowerCase()) || s.includes(rgb(hex));
  };
  for (let p = el; p && p !== stop.parent; p = p.parent) if (hit(p)) return true;
  return findAll(el, hit).length > 0;
}

/** Inline style widths in px over 400 anywhere in the dumped DOM (cheap guard; the real check is the 400px screenshot). */
function wideInline(root) {
  const out = [];
  for (const el of findAll(root, (e) => typeof e.attrs.style === 'string')) {
    for (const m of el.attrs.style.matchAll(/(?:^|;)\s*((?:min-|max-)?width)\s*:\s*([\d.]+)px/gi)) {
      if (m[1].toLowerCase() !== 'max-width' && parseFloat(m[2]) > 400) out.push(`<${el.tag}> style ${m[1]}: ${m[2]}px`);
    }
  }
  return out;
}

// ------------------------------------------------------------- assertions --

/** The tab bar on a loaded /pvp/: feed order, labels, soon disabled, exactly `pressed` pressed. */
function tabProblems(root, pressed) {
  const problems = [];
  const boards = findAll(root, hasAttr('data-board'));
  if (boards.length !== 1) return [`${boards.length} [data-board], want 1`];
  const tabs = findAll(boards[0], hasAttr('data-board-tab'));
  const keys = tabs.map((t) => t.attrs['data-board-tab']);
  if (q(keys) !== q(BOARD_KEYS)) problems.push(`tabs are ${q(keys)}, want ${q(BOARD_KEYS)}`);
  for (const t of tabs) {
    const k = t.attrs['data-board-tab'];
    if (TAB_LABELS[k] && textOf(t) !== TAB_LABELS[k]) problems.push(`tab ${k} label ${q(textOf(t))}, want ${q(TAB_LABELS[k])}`);
    if (SOON.has(k) !== 'disabled' in t.attrs) problems.push(`tab ${k} disabled=${'disabled' in t.attrs}, want ${SOON.has(k)}`);
  }
  const on = tabs.filter((t) => t.attrs['aria-pressed'] === 'true').map((t) => t.attrs['data-board-tab']);
  if (q(on) !== q([pressed])) problems.push(`aria-pressed="true" tabs are ${q(on)}, want ${q([pressed])}`);
  return problems;
}

/** Column headers: the <th> in the <thead> of [data-board-table]. */
function columnProblems(root, want) {
  const tables = findAll(root, hasAttr('data-board-table'));
  if (tables.length !== 1) return [`${tables.length} [data-board-table], want 1`];
  const heads = findAll(tables[0], (el) => el.tag === 'thead');
  if (heads.length !== 1) return [`[data-board-table] has ${heads.length} <thead>, want 1`];
  const got = findAll(heads[0], (el) => el.tag === 'th').map((th) => textOf(th));
  return q(got) === q(want) ? [] : [`columns are ${q(got)}, want ${q(want)}`];
}

/** Every [data-row] against `want`, in order. */
function rowProblems(root, want, kind) {
  const problems = [];
  const rows = findAll(root, hasAttr('data-row'));
  const names = rows.map((r) => textOf(r));
  if (rows.length !== want.length) problems.push(`${rows.length} [data-row], want ${want.length} (row texts ${q(names)})`);
  want.forEach((w, i) => {
    const row = rows[i];
    if (!row) return;
    const at = `row ${i + 1} (${w.name})`;
    const text = textOf(row);
    if (!text.includes(w.name)) problems.push(`${at} text ${q(text)} does not contain the name ${q(w.name)}`);
    if (!hasText(row, String(w.rank)) && !hasText(row, `#${w.rank}`)) problems.push(`${at} does not show rank ${w.rank}`);
    const top = row.attrs['data-top'];
    const wantTop = w.rank <= 3 ? String(w.rank) : undefined;
    if (top !== wantTop) problems.push(`${at} data-top is ${q(top ?? null)}, want ${q(wantTop ?? null)}`);
    const badges = findAll(row, hasAttr('data-edition'));
    if (badges.length !== 1) problems.push(`${at} has ${badges.length} [data-edition], want 1`);
    else {
      if (badges[0].attrs['data-edition'] !== w.edition) problems.push(`${at} data-edition is ${q(badges[0].attrs['data-edition'])}, want ${q(w.edition)}`);
      const label = w.edition.toUpperCase();
      if (textOf(badges[0]) !== label) problems.push(`${at} edition badge text ${q(textOf(badges[0]))}, want ${q(label)}`);
    }
    const imgs = findAll(row, (el) => el.tag === 'img');
    const heads = imgs.filter((im) => 'width' in im.attrs && 'height' in im.attrs && im.attrs.alt === '' && im.attrs.loading === 'lazy');
    if (!heads.length) problems.push(`${at} has no head <img> with width, height, alt="" and loading="lazy"`);
    else if (w.uuid) {
      const src = `https://mc-heads.net/avatar/${w.uuid}/32`;
      if (!heads.some((im) => im.attrs.src === src)) problems.push(`${at} head src is ${q(heads.map((im) => im.attrs.src))}, want ${q(src)}`);
    } else if (heads.some((im) => !im.attrs.src || /null|undefined/.test(im.attrs.src))) {
      problems.push(`${at} (Bedrock) head src is ${q(heads.map((im) => im.attrs.src ?? ''))}, want a default head`);
    }
    if (kind === 'rating') {
      const tierEls = findAll(row, (el) => textOf(el) === w.tier);
      const hex = COLOURS[w.tier.split(' ')[0]];
      if (!tierEls.length) problems.push(`${at} has no tier badge ${q(w.tier)}`);
      else if (!tierEls.some((el) => coloured(el, hex, row))) problems.push(`${at} tier badge ${q(w.tier)} is not coloured ${hex} (inline style, hex or rgb)`);
      for (const [what, value] of [['rating', w.rating], ['record', w.record], ['win %', w.pct]])
        if (!hasText(row, value)) problems.push(`${at} does not show ${what} ${q(value)} in its own element`);
    } else if (!hasText(row, w.value)) problems.push(`${at} does not show ${q(w.value)} in its own element`);
  });
  return problems;
}

/** With rows on screen, every [data-board-empty] is gone or hidden. */
function emptyHidden(root) {
  const shown = findAll(root, hasAttr('data-board-empty')).filter((el) => !isHidden(el));
  return shown.length ? [`[data-board-empty] is visible (${q(textOf(shown[0]))}) while rows exist`] : [];
}

function seasonProblems(root) {
  const strips = findAll(root, hasAttr('data-season'));
  if (strips.length !== 1) return [`${strips.length} [data-season], want 1`];
  const [s] = strips;
  const problems = [];
  if (isHidden(s)) problems.push('[data-season] is still hidden after the season loaded');
  const t = textOf(s);
  if (!t.includes(SEASON_NAME)) problems.push(`season strip ${q(t)} has no ${q(SEASON_NAME)}`);
  if (!/ENDS IN\s*\d+d \d{1,2}h\b/.test(t)) problems.push(`season strip ${q(t)} has no "ENDS IN <d>d <h>h" countdown`);
  if (!new RegExp(`\\b${RANKED_PLAYERS}\\b`).test(t)) problems.push(`season strip ${q(t)} does not show the ranked player count ${RANKED_PLAYERS}`);
  return problems;
}

/** The hostile name is text: no element carries an onerror attribute or the planted img src. */
function xssProblems(root) {
  const problems = [];
  const injected = findAll(root, (el) => 'onerror' in el.attrs || (el.tag === 'img' && el.attrs.src === 'x'));
  if (injected.length) problems.push(`${injected.length} injected element(s): <${injected[0].tag}> ${q(injected[0].attrs)}`);
  const rows = findAll(root, hasAttr('data-row'));
  if (!rows.some((r) => textOf(r).includes(HOSTILE))) problems.push(`no row shows the name ${q(HOSTILE)} as text`);
  return problems;
}

/**
 * U4 review F3: every Java head (an <img> whose src is on mc-heads.net) has
 * referrerpolicy="no-referrer", so the page origin is not sent to mc-heads.
 * Vacuous pass is not allowed: the fixture rows always include Java heads.
 */
function referrerProblems(root) {
  const heads = findAll(root, (el) => el.tag === 'img' && /^https:\/\/mc-heads\.net\//.test(el.attrs.src ?? ''));
  if (!heads.length) return ['no Java head <img> (src on https://mc-heads.net/) in the DOM'];
  const bad = heads.filter((im) => im.attrs.referrerpolicy !== 'no-referrer');
  return bad.length
    ? [`${bad.length} of ${heads.length} Java head <img> lack referrerpolicy="no-referrer" (first: src ${q(bad[0].attrs.src)}, referrerpolicy ${q(bad[0].attrs.referrerpolicy ?? null)})`]
    : [];
}

// -------------------------------------------------------------------- run --

function findChrome() {
  const local = process.env.LOCALAPPDATA ?? '';
  const candidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    local && join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find((c) => existsSync(c)) ?? null;
}

function freePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.once('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

async function waitReady(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function dump(chrome, url, profileRoot) {
  const profile = mkdtempSync(join(profileRoot, 'p-'));
  const r = spawnSync(
    chrome,
    ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', `--user-data-dir=${profile}`, `--virtual-time-budget=${BUDGET_MS}`, '--dump-dom', url],
    { encoding: 'utf-8', timeout: CHROME_TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024 },
  );
  const timedOut = r.error?.code === 'ETIMEDOUT';
  const err = timedOut
    ? `Chrome did not finish in ${CHROME_TIMEOUT_MS / 1000} s: a JS dialog (alert/confirm, e.g. from an injected onerror) or a hung page blocks --dump-dom`
    : (r.stderr ?? '').trim().split(/\r?\n/).slice(-3).join(' | ');
  return { html: r.stdout ?? '', err, status: r.status, error: timedOut ? null : r.error };
}

async function main() {
  // 1. a fixture build
  const assets = join(DIST, 'assets');
  const js = existsSync(assets) ? readdirSync(assets).filter((f) => f.endsWith('.js')) : [];
  const fixtureBuild = js.some((f) => readFileSync(join(assets, f), 'utf-8').includes(FIXTURE_BASE));
  if (!fixtureBuild) {
    check('fixture-build', [
      `${existsSync(DIST) ? `no JS in ${assets} contains ${q(FIXTURE_BASE)}` : `${DIST} does not exist`}: build with ` +
        `MSYS_NO_PATHCONV=1 MSYS2_ENV_CONV_EXCL='*' VITE_PVP_BASE=${FIXTURE_BASE} npm run build`,
    ]);
    return finish();
  }
  check('fixture-build', []);

  // 2. Chrome
  const chrome = findChrome();
  if (!chrome) {
    check('chrome-found', ['no Chrome: set CHROME to chrome.exe (looked in the usual install paths)']);
    return finish();
  }
  check('chrome-found', []);

  // 3. fixtures into dist
  const fixtureDir = join(DIST, FIXTURE_BASE.slice(1));
  for (const dir of [fixtureDir, join(fixtureDir, 'pvp')]) {
    mkdirSync(dir, { recursive: true });
    for (const f of ['season.json', 'boards.json']) cpSync(join(FIXTURES, f), join(dir, f));
  }

  // 4. preview server (only this process is stopped)
  const port = await freePort();
  const preview = spawn(process.execPath, [VITE, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--outDir', DIST], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let previewLog = '';
  preview.stdout.on('data', (d) => (previewLog += d));
  preview.stderr.on('data', (d) => (previewLog += d));
  const base = `http://127.0.0.1:${port}`;
  const profileRoot = mkdtempSync(join(tmpdir(), 'browser-check-'));
  try {
    const up = await waitReady(`${base}/`, 30_000);
    check('preview-server', up ? [] : [`vite preview did not answer on ${base} in 30 s: ${q(previewLog.slice(-400))}`]);
    if (!up) return;
    const fx = await fetch(`${base}${FIXTURE_BASE}/boards.json`).then((r) => r.ok, () => false);
    check('fixture-served', fx ? [] : [`${base}${FIXTURE_BASE}/boards.json is not served`]);

    const pages = [
      ['/', 'landing'],
      ['/pvp/', 'pvp overall'],
      ['/pvp/?board=sword', 'pvp sword'],
      ['/pvp/?board=tournament', 'pvp tournament'],
      ['/pvp/?board=axe', 'pvp soon->overall'],
      ['/pvp/?board=nope', 'pvp unknown->overall'],
    ];
    for (const [path, label] of pages) {
      const d = dump(chrome, `${base}${path}`, profileRoot);
      const loaded = /<html[\s>]/i.test(d.html) && /<div[^>]*id="app"/i.test(d.html);
      check(`${label}: page loaded (${path})`, loaded ? [] : [`no DOM from Chrome (status ${d.status}${d.error ? `, ${d.error.message}` : ''}): ${q(d.err)}`]);
      if (!loaded) continue;
      const root = parseHtml(d.html);
      check(`${label}: no inline px width over 400`, wideInline(root));

      if (path === '/') {
        const live = findAll(root, hasAttr('data-live', 'ladder'));
        const problems = [];
        if (live.length !== 1) problems.push(`${live.length} [data-live="ladder"], want 1`);
        else {
          const t = textOf(live[0]);
          if (isHidden(live[0])) problems.push('[data-live="ladder"] is still hidden');
          const idx = OVERALL.slice(0, 3).map((r) => t.indexOf(r.name));
          if (idx.some((i) => i < 0) || !(idx[0] < idx[1] && idx[1] < idx[2]))
            problems.push(`ladder text ${q(t)} does not list ${q(OVERALL.slice(0, 3).map((r) => r.name))} in order`);
          if (t.includes(OVERALL[4].name)) problems.push(`ladder shows more than the top 3 (${q(OVERALL[4].name)})`);
        }
        check('landing: ladder block shows the fixture top 3', problems);
        continue;
      }

      const key = { 'pvp sword': 'sword', 'pvp tournament': 'tournament' }[label] ?? 'overall';
      check(`${label}: tabs (pressed ${key})`, tabProblems(root, key));
      const kind = key === 'tournament' ? 'count' : 'rating';
      check(`${label}: columns`, columnProblems(root, kind === 'count' ? COUNT_COLUMNS : RATING_COLUMNS));
      check(`${label}: rows`, rowProblems(root, { overall: OVERALL, sword: SWORD, tournament: TOURNAMENT }[key], kind));
      check(`${label}: empty state hidden`, emptyHidden(root));
      check(`${label}: season strip`, seasonProblems(root));
      if (key === 'overall') check(`${label}: hostile name rendered as text`, xssProblems(root));
      check(`${label}: Java heads have referrerpolicy="no-referrer"`, referrerProblems(root));
    }
  } finally {
    preview.kill();
    rmSync(profileRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (e) {
  check('browser-check', [`threw ${e?.stack?.split('\n')[0] ?? e}`]);
}
if (!finished) finish();
