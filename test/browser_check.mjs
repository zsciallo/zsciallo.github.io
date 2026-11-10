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
//
// U7 (player search and profiles):
//   - also copies test/fixtures/pvp/players.json and players/<key>.json into
//     both fixture folders (so `${BASE}/players.json` and
//     `${BASE}/players/<key>.json` resolve);
//   - on every /pvp/ load: each [data-row] holds an <a> whose href is exactly
//     /pvp/player/?name=<key> (key from players.json; Sample_06's index key is
//     deliberately "sample_06-2" so the index must win over the key rule;
//     Sample_07/08 are not in the index, so theirs is derived) and whose text
//     contains the name; on /pvp/ the [data-player-search] block is visible
//     once players.json loaded, with no results and no "no match" text;
//   - the profile pages load through a small in-process HTTP proxy in front of
//     vite preview. It logs every request path (to prove an invalid ?name=
//     makes no /players/ request) and answers 503 for players/server_error.json
//     (the "unavailable" state). Those pages use an async Chrome run so the
//     proxy can serve while Chrome waits;
//   - /pvp/player/?name=<key> for sample_01, b-sample_02, sample_10, sample_11
//     and the hostile key: h1, edition badge, best summary, kit cards, career,
//     recent table/rows/links, states hidden, head image (see profileProblems);
//     nobody_here -> "Not ranked this season."; no name, empty, upper case,
//     "../players/sample_01" and 41 characters -> not ranked with NO
//     /players/ request;
//     server_error -> "Player data is unavailable right now.".
//   Typing in the search box cannot be driven by --dump-dom: search behaviour
//   is covered by searchPlayers() in test/pvp_lib.test.mjs, typing by hand.
//   Profile texts: each expected string must be the whole textOf() of some
//   element (as the board's "in its own element" rule). The h1 is compared
//   with any [data-edition] badge inside it left out.

import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
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

// U7: written out from test/fixtures/pvp/players.json and players/*.json.
const HOSTILE_KEY = '-img-src-x-onerror-alert-1--';
const profileHref = (key) => `/pvp/player/?name=${key}`;
/** Board name -> profile key. Sample_06 uses the index key; Sample_07/08 are derived (not in the index). */
const ROW_KEYS = {
  Sample_01: 'sample_01',
  '.Sample_02': 'b-sample_02',
  Sample_03: 'sample_03',
  [HOSTILE]: HOSTILE_KEY,
  '.Sample_05': 'b-sample_05',
  Sample_06: 'sample_06-2',
  Sample_07: 'sample_07',
  Sample_08: 'sample_08',
  '.Sample_09': 'b-sample_09',
};
const PROFILE_STATE = { loading: 'Loading player.', notRanked: 'Not ranked this season.', unavailable: 'Player data is unavailable right now.' };
const BACK = ['/pvp/', 'ALL LEADERBOARDS'];
const RECENT_HEADING = 'RECENT RANKED';
const RECENT_COLUMNS = ['RESULT', 'KIT', 'OPPONENT', 'RATING'];
const RECENT_EMPTY = 'No ranked matches yet this season.';
const SEARCH_NO_MATCH = 'No ranked player by that name.';
const TIER_NAMES = Object.keys(COLOURS);
const placed = (key, label, tier, lines) => ({ key, label, tier, lines });
const placing = (key, label, lines) => ({ key, label, tier: null, lines });
/** [result, kit, opponent text, edition, key | null, rating cell] */
const PROFILES = {
  sample_01: {
    name: 'Sample_01', edition: 'java', uuid: '00000000-0000-4000-8000-000000000001',
    best: { label: 'Chroma', rank: 1 },
    kits: [
      placed('sword', 'Sword', 'Chroma', ['Rating 1987', 'Peak 2004', '40 wins, 12 losses', 'Win streak 5', '#3']),
      placed('mace', 'Mace', 'Emerald III', ['Rating 1702', 'Peak 1755', '18 wins, 9 losses', 'Win streak 0', '#2']),
    ],
    career: ['1,234 kills', '987 deaths', 'Best streak 12', '3 tournaments won'],
    recent: [
      ['WIN', 'Sword', '.Sample_02', 'bedrock', 'b-sample_02', '+11'],
      ['LOSS', 'Mace', 'Sample_03', 'java', 'sample_03', '-13'],
      ['DRAW', 'Sword', 'Sample_12', 'java', null, '0'],
      ['WIN', 'Mace', 'Unknown player', 'java', null, ''],
    ],
  },
  'b-sample_02': {
    name: '.Sample_02', edition: 'bedrock', uuid: null,
    best: { label: 'Mithril I', rank: 2 },
    kits: [
      placed('sword', 'Sword', 'Mithril I', ['Rating 1912', 'Peak 1930', '21 wins, 9 losses', 'Win streak 3', '#1']),
      placing('mace', 'Mace', ['Placing 4/10', '2 wins, 2 losses']),
    ],
    career: ['56 kills', '40 deaths', 'Best streak 7', '1 tournament won'],
    recent: [
      ['LOSS', 'Sword', 'Sample_01', 'java', 'sample_01', '-11'],
      ['WIN', 'Mace', HOSTILE, 'java', HOSTILE_KEY, ''],
    ],
  },
  sample_10: {
    name: 'Sample_10', edition: 'java', uuid: '00000000-0000-4000-8000-000000000010',
    best: null,
    kits: [placing('sword', 'Sword', ['Placing 6/10', '3 wins, 3 losses']), placing('mace', 'Mace', ['Placing 2/10', '0 wins, 2 losses'])],
    career: ['14 kills', '9 deaths', 'Best streak 2', '0 tournaments won'],
    recent: [
      ['LOSS', 'Sword', '.Sample_05', 'bedrock', 'b-sample_05', ''],
      ['WIN', 'Mace', 'Sample_07', 'java', 'sample_07', ''],
    ],
  },
  sample_11: {
    name: 'Sample_11', edition: 'java', uuid: '00000000-0000-4000-8000-000000000011',
    best: { label: 'Silver III', rank: 12 },
    kits: [placed('sword', 'Sword', 'Silver III', ['Rating 1520', 'Peak 1588', '12 wins, 10 losses', 'Win streak 2', '#9'])],
    career: ['2,048 kills', '1,999 deaths', 'Best streak 4', '0 tournaments won'],
    recent: [],
  },
  [HOSTILE_KEY]: {
    name: HOSTILE, edition: 'java', uuid: '00000000-0000-4000-8000-000000000004',
    best: { label: 'Emerald II', rank: 4 },
    kits: [placed('sword', 'Sword', 'Emerald II', ['Rating 1745', 'Peak 1790', '20 wins, 20 losses', 'Win streak 0', '#4'])],
    career: ['300 kills', '280 deaths', 'Best streak 3', '2 tournaments won'],
    recent: [['LOSS', 'Sword', '.Sample_02', 'bedrock', 'b-sample_02', '-12']],
  },
};
/** ?name= values that are not valid keys: not ranked, and no /players/ request at all. */
const INVALID_NAMES = [
  ['', 'no ?name='],
  ['?name=', 'empty name'],
  ['?name=Sample_01', 'upper case'],
  // Resolves back into /players/ when fetched unvalidated, so the request log catches it.
  ['?name=..%2Fplayers%2Fsample_01', '"../players/sample_01"'],
  [`?name=${'a'.repeat(41)}`, '41 characters'],
];

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

// ------------------------------------------------------ U7 assertions --

/** Hidden by its own or an ancestor's `hidden` attribute. */
const hiddenUp = (el) => {
  for (let p = el; p; p = p.parent) if (p.attrs && 'hidden' in p.attrs) return true;
  return false;
};
const visible = (list) => list.filter((el) => !hiddenUp(el));
const inside = (el, ancestor) => {
  for (let p = el.parent; p; p = p.parent) if (p === ancestor) return true;
  return false;
};
const isEditionBadge = (el) => 'data-edition' in el.attrs;

/** /pvp/: every [data-row] holds <a href="/pvp/player/?name=<key>"> whose text contains the name. */
function rowLinkProblems(root, want) {
  const problems = [];
  const rows = findAll(root, hasAttr('data-row'));
  want.forEach((w, i) => {
    const row = rows[i];
    if (!row) return; // the row count is rowProblems' job
    const href = profileHref(ROW_KEYS[w.name]);
    const links = findAll(row, (el) => el.tag === 'a');
    const hits = links.filter((a) => a.attrs.href === href);
    if (!hits.length) problems.push(`row ${i + 1} (${w.name}) has no <a href=${q(href)}> (links: ${q(links.map((a) => a.attrs.href ?? null))})`);
    else if (!hits.some((a) => textOf(a).includes(w.name))) problems.push(`row ${i + 1} link text ${q(textOf(hits[0]))} does not contain the name ${q(w.name)}`);
  });
  return problems;
}

/** /pvp/ with players.json loaded: the search block shows, with its input, no results and no "no match" text. */
function searchProblems(root) {
  const blocks = findAll(root, hasAttr('data-player-search'));
  if (blocks.length !== 1) return [`${blocks.length} [data-player-search], want 1`];
  const [block] = blocks;
  const problems = [];
  if (hiddenUp(block)) problems.push('[data-player-search] is still hidden after players.json loaded');
  const inputs = findAll(block, (el) => el.tag === 'input' && el.attrs.type === 'search');
  if (inputs.length !== 1) problems.push(`[data-player-search] has ${inputs.length} <input type="search">, want 1`);
  if (findAll(block, hasAttr('data-search-results')).length !== 1) problems.push('[data-player-search] has no single [data-search-results]');
  const results = visible(findAll(root, hasAttr('data-search-result')));
  if (results.length) problems.push(`${results.length} [data-search-result] shown with an empty query, want 0`);
  if (visible(findAll(root, (el) => textOf(el) === SEARCH_NO_MATCH)).length) problems.push(`${q(SEARCH_NO_MATCH)} shown with an empty query`);
  return problems;
}

/** Some element at or under `node` whose whole text is `want`. */
const hasExact = (node, want) => textOf(node) === want || findAll(node, (el) => textOf(el) === want).length > 0;
const dataBlocks = (root) => ['data-kit', 'data-career', 'data-recent', 'data-recent-row'].flatMap((a) => findAll(root, hasAttr(a)));

/** Problems unless the page shows the profile state `text` (and no other state, and no player data). */
function stateProblems(root, text, { back = false } = {}) {
  const problems = [];
  const h1s = findAll(root, (el) => el.tag === 'h1').length;
  if (h1s !== 1) problems.push(`${h1s} <h1>, want 1`);
  const states = findAll(root, hasAttr('data-profile-state'));
  if (states.length !== 1) problems.push(`${states.length} [data-profile-state], want 1`);
  else if (hiddenUp(states[0])) problems.push('[data-profile-state] is hidden');
  else if (!hasExact(states[0], text)) problems.push(`[data-profile-state] text is ${q(textOf(states[0]))}, want an element with ${q(text)}`);
  for (const other of Object.values(PROFILE_STATE).filter((t) => t !== text))
    if (visible(findAll(root, (el) => textOf(el) === other)).length) problems.push(`also shows ${q(other)}`);
  const shown = visible(dataBlocks(root));
  if (shown.length) problems.push(`${shown.length} player data block(s) visible (first: <${shown[0].tag}> ${q(Object.keys(shown[0].attrs).filter((k) => k.startsWith('data-')))})`);
  if (back && !visible(findAll(root, (el) => el.tag === 'a' && el.attrs.href === BACK[0] && textOf(el) === BACK[1])).length)
    problems.push(`no visible back link <a href=${q(BACK[0])}>${BACK[1]}</a>`);
  return problems;
}

/** A loaded profile page against its fixture. */
function profileProblems(root, want) {
  const problems = [];
  // masthead
  const h1s = findAll(root, (el) => el.tag === 'h1');
  if (h1s.length !== 1) problems.push(`${h1s.length} <h1>, want 1`);
  const h1 = h1s[0];
  if (h1 && textOf(h1, isEditionBadge) !== want.name) problems.push(`<h1> text is ${q(textOf(h1, isEditionBadge))}, want ${q(want.name)}`);
  const states = visible(findAll(root, hasAttr('data-profile-state')));
  if (states.length) problems.push(`[data-profile-state] still visible: ${q(textOf(states[0]))}`);
  const recentBlocks = findAll(root, hasAttr('data-recent'));
  const ownBadges = findAll(root, isEditionBadge).filter((b) => !recentBlocks.some((r) => r === b || inside(b, r)) && !findAll(root, hasAttr('data-recent-row')).some((r) => inside(b, r)));
  if (ownBadges.length !== 1) problems.push(`${ownBadges.length} [data-edition] outside the recent table, want 1 (the player's)`);
  else {
    if (ownBadges[0].attrs['data-edition'] !== want.edition) problems.push(`player data-edition is ${q(ownBadges[0].attrs['data-edition'])}, want ${q(want.edition)}`);
    if (textOf(ownBadges[0]) !== want.edition.toUpperCase()) problems.push(`player edition badge text ${q(textOf(ownBadges[0]))}, want ${q(want.edition.toUpperCase())}`);
  }
  const bests = findAll(root, hasAttr('data-profile-best'));
  if (bests.length !== 1) problems.push(`${bests.length} [data-profile-best], want 1`);
  else if (hiddenUp(bests[0])) problems.push('[data-profile-best] is hidden');
  else {
    const t = textOf(bests[0]);
    if (!want.best) {
      if (t !== 'UNPLACED') problems.push(`[data-profile-best] text ${q(t)}, want "UNPLACED"`);
    } else {
      const hex = COLOURS[want.best.label.split(' ')[0]];
      const tierEls = findAll(bests[0], (el) => textOf(el) === want.best.label);
      if (!tierEls.length) problems.push(`[data-profile-best] ${q(t)} has no element with the tier ${q(want.best.label)}`);
      else if (!tierEls.some((el) => coloured(el, hex, bests[0]))) problems.push(`[data-profile-best] tier ${q(want.best.label)} is not coloured ${hex} (inline style, hex or rgb)`);
      if (!t.includes(`OVERALL #${want.best.rank}`)) problems.push(`[data-profile-best] ${q(t)} lacks ${q(`OVERALL #${want.best.rank}`)}`);
      if (t.includes('UNPLACED')) problems.push(`[data-profile-best] ${q(t)} says UNPLACED`);
    }
  }
  if (!visible(findAll(root, (el) => el.tag === 'a' && el.attrs.href === BACK[0] && textOf(el) === BACK[1])).length)
    problems.push(`no visible back link <a href=${q(BACK[0])}>${BACK[1]}</a>`);
  // head image: in the masthead = the nearest ancestor of the h1 that also holds [data-profile-best]
  let mast = h1?.parent;
  while (mast && bests.length === 1 && !inside(bests[0], mast)) mast = mast.parent;
  if (h1 && mast) {
    const imgs = findAll(mast, (el) => el.tag === 'img');
    const heads = imgs.filter((im) => /^https:\/\/mc-heads\.net\//.test(im.attrs.src ?? ''));
    if (want.edition === 'java') {
      const mine = heads.filter((im) => (im.attrs.src ?? '').startsWith(`https://mc-heads.net/avatar/${want.uuid}/`));
      if (!mine.length) problems.push(`masthead has no head <img> on https://mc-heads.net/avatar/${want.uuid}/ (img srcs ${q(imgs.map((im) => im.attrs.src ?? null))})`);
    } else {
      if (heads.length) problems.push(`Bedrock masthead has an mc-heads <img> ${q(heads[0].attrs.src)}`);
      if (!imgs.length) problems.push('Bedrock masthead has no head <img> (want the default head)');
    }
    if (imgs.some((im) => !im.attrs.src || /null|undefined/.test(im.attrs.src))) problems.push(`masthead <img> src ${q(imgs.map((im) => im.attrs.src ?? ''))} has an empty/null/undefined src`);
  }
  // kit cards
  const cards = visible(findAll(root, hasAttr('data-kit')));
  const keys = cards.map((c) => c.attrs['data-kit']);
  if (q(keys) !== q(want.kits.map((k) => k.key))) problems.push(`visible [data-kit] are ${q(keys)}, want ${q(want.kits.map((k) => k.key))}`);
  want.kits.forEach((k) => {
    const card = cards.find((c) => c.attrs['data-kit'] === k.key);
    if (!card) return;
    const at = `kit ${k.key}`;
    for (const line of [k.label, ...k.lines]) if (!hasExact(card, line)) problems.push(`${at} has no element with ${q(line)} (card text ${q(textOf(card))})`);
    if (k.tier) {
      const hex = COLOURS[k.tier.split(' ')[0]];
      const tierEls = findAll(card, (el) => textOf(el) === k.tier);
      if (!tierEls.length) problems.push(`${at} has no tier ${q(k.tier)}`);
      else if (!tierEls.some((el) => coloured(el, hex, card))) problems.push(`${at} tier ${q(k.tier)} is not coloured ${hex}`);
    } else {
      const t = textOf(card);
      if (/Rating|Peak/.test(t)) problems.push(`${at} (placing) shows rating/peak text: ${q(t)}`);
      if (/#\d/.test(t)) problems.push(`${at} (placing) shows a rank: ${q(t)}`);
      if (/\b\d{4}\b/.test(t)) problems.push(`${at} (placing) shows a 4-digit number: ${q(t)}`);
      const tiers = TIER_NAMES.filter((n) => new RegExp(`\\b${n}\\b`).test(t));
      if (tiers.length) problems.push(`${at} (placing) shows tier text ${q(tiers)}: ${q(t)}`);
    }
  });
  // career
  const careers = visible(findAll(root, hasAttr('data-career')));
  if (careers.length !== 1) problems.push(`${careers.length} visible [data-career], want 1`);
  else for (const line of want.career) if (!hasExact(careers[0], line)) problems.push(`[data-career] has no element with ${q(line)} (text ${q(textOf(careers[0]))})`);
  // recent
  const rows = visible(findAll(root, hasAttr('data-recent-row')));
  if (!want.recent.length) {
    if (rows.length) problems.push(`${rows.length} [data-recent-row] with an empty recent list`);
    const empties = visible(findAll(root, (el) => textOf(el) === RECENT_EMPTY));
    if (!empties.length) problems.push(`no visible ${q(RECENT_EMPTY)}`);
    const tables = visible(findAll(root, (el) => el.tag === 'table' && findAll(el, (th) => th.tag === 'th' && textOf(th) === 'RESULT').length));
    if (tables.length) problems.push('a recent table with a RESULT column is visible with an empty recent list');
  } else {
    const blocks = visible(recentBlocks);
    if (blocks.length !== 1) problems.push(`${blocks.length} visible [data-recent], want 1`);
    else {
      const [rb] = blocks;
      if (!hasExact(rb, RECENT_HEADING) && !(rb.parent && hasExact(rb.parent, RECENT_HEADING))) problems.push(`no ${q(RECENT_HEADING)} heading in or next to [data-recent]`);
      const heads = findAll(rb.tag === 'table' ? rb : findAll(rb, (el) => el.tag === 'table')[0] ?? rb, (el) => el.tag === 'thead');
      const cols = heads.length ? findAll(heads[0], (el) => el.tag === 'th').map((th) => textOf(th)) : [];
      if (q(cols) !== q(RECENT_COLUMNS)) problems.push(`recent columns are ${q(cols)}, want ${q(RECENT_COLUMNS)} (<th> in a <thead>)`);
      if (rows.some((r) => !inside(r, rb))) problems.push('a [data-recent-row] sits outside [data-recent]');
    }
    if (visible(findAll(root, (el) => textOf(el) === RECENT_EMPTY)).length) problems.push(`${q(RECENT_EMPTY)} shown although there are matches`);
    if (rows.length !== want.recent.length) problems.push(`${rows.length} [data-recent-row], want ${want.recent.length}`);
    want.recent.forEach(([result, kit, opp, edition, key, rating], i) => {
      const row = rows[i];
      if (!row) return;
      const at = `recent row ${i + 1}`;
      const cells = row.children.filter((c) => !('text' in c) && (c.tag === 'td' || c.tag === 'th'));
      if (cells.length !== 4) return problems.push(`${at} has ${cells.length} cells, want 4 (RESULT, KIT, OPPONENT, RATING)`);
      if (textOf(cells[0]) !== result) problems.push(`${at} result ${q(textOf(cells[0]))}, want ${q(result)}`);
      if (textOf(cells[1]) !== kit) problems.push(`${at} kit ${q(textOf(cells[1]))}, want ${q(kit)}`);
      if (textOf(cells[2], isEditionBadge) !== opp) problems.push(`${at} opponent ${q(textOf(cells[2], isEditionBadge))}, want ${q(opp)}`);
      const badges = findAll(cells[2], isEditionBadge);
      if (badges.length !== 1 || badges[0].attrs['data-edition'] !== edition) problems.push(`${at} opponent badges ${q(badges.map((b) => b.attrs['data-edition']))}, want [${q(edition)}]`);
      const links = findAll(row, (el) => el.tag === 'a');
      if (key) {
        const href = profileHref(key);
        const hit = links.filter((a) => a.attrs.href === href && inside(a, cells[2]));
        if (!hit.length) problems.push(`${at} has no opponent link <a href=${q(href)}> (links ${q(links.map((a) => a.attrs.href ?? null))})`);
        else if (!textOf(hit[0]).includes(opp)) problems.push(`${at} opponent link text ${q(textOf(hit[0]))} lacks ${q(opp)}`);
      } else if (links.length) problems.push(`${at} opponent has no key, but the row has links ${q(links.map((a) => a.attrs.href ?? null))}`);
      if (textOf(cells[3]) !== rating) problems.push(`${at} rating cell ${q(textOf(cells[3]))}, want ${q(rating)}`);
    });
  }
  return problems;
}

/** Spec note: an unplaced player's page shows no rating number and no "Rating"/"Peak" words (case-sensitive), in its player blocks. */
function unplacedProblems(root) {
  const scope = [...findAll(root, (el) => el.tag === 'h1'), ...findAll(root, hasAttr('data-profile-best')), ...visible(dataBlocks(root))];
  const t = scope.map((el) => textOf(el)).join(' | ');
  const problems = [];
  const num = t.match(/\b\d{4}\b/);
  if (num) problems.push(`shows a 4-digit number ${q(num[0])} in ${q(t)}`);
  for (const word of ['Rating', 'Peak']) if (t.includes(word)) problems.push(`shows ${q(word)} in ${q(t)}`);
  return problems;
}

/** No injected element (an onerror attribute or the planted <img src=x>). */
function injectedProblems(root) {
  const injected = findAll(root, (el) => 'onerror' in el.attrs || (el.tag === 'img' && el.attrs.src === 'x'));
  return injected.length ? [`${injected.length} injected element(s): <${injected[0].tag}> ${q(injected[0].attrs)}`] : [];
}

/** Every mc-heads <img> has referrerpolicy="no-referrer" (vacuous on a page without Java heads). */
function referrerAll(root) {
  const bad = findAll(root, (el) => el.tag === 'img' && /^https:\/\/mc-heads\.net\//.test(el.attrs.src ?? '') && el.attrs.referrerpolicy !== 'no-referrer');
  return bad.length ? [`${bad.length} mc-heads <img> lack referrerpolicy="no-referrer" (first ${q(bad[0].attrs.src)})`] : [];
}

/**
 * A proxy in front of vite preview: logs request paths and answers 503 for
 * players/server_error.json. In-process, so pages behind it must be dumped
 * with dumpAsync (spawnSync would block the event loop the proxy runs on).
 */
function startProxy(targetPort) {
  const log = [];
  const server = createHttpServer((req, res) => {
    log.push(req.url);
    if (/\/players\/server_error\.json(?:[?#]|$)/.test(req.url)) {
      res.writeHead(503, { 'content-type': 'text/plain' });
      res.end('unavailable');
      return;
    }
    const up = httpRequest(
      { host: '127.0.0.1', port: targetPort, method: req.method, path: req.url, headers: { ...req.headers, host: `127.0.0.1:${targetPort}` } },
      (ur) => {
        res.writeHead(ur.statusCode ?? 502, ur.headers);
        ur.pipe(res);
      },
    );
    up.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(up);
  });
  return new Promise((res, rej) => {
    server.once('error', rej);
    server.listen(0, '127.0.0.1', () =>
      res({
        port: server.address().port,
        log,
        close: () => {
          server.closeAllConnections?.();
          server.close();
        },
      }),
    );
  });
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

/** dump() without blocking the event loop (U7: pages served through the in-process proxy). */
function dumpAsync(chrome, url, profileRoot) {
  const profile = mkdtempSync(join(profileRoot, 'p-'));
  return new Promise((res) => {
    const child = spawn(
      chrome,
      ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', `--user-data-dir=${profile}`, `--virtual-time-budget=${BUDGET_MS}`, '--dump-dom', url],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let out = '';
    let errText = '';
    let timedOut = false;
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (errText += d));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, CHROME_TIMEOUT_MS);
    child.on('error', (e) => {
      clearTimeout(timer);
      res({ html: '', err: String(e?.message ?? e), status: null, error: e });
    });
    child.on('close', (status) => {
      clearTimeout(timer);
      const err = timedOut
        ? `Chrome did not finish in ${CHROME_TIMEOUT_MS / 1000} s: a JS dialog (alert/confirm, e.g. from an injected onerror) or a hung page blocks --dump-dom`
        : errText.trim().split(/\r?\n/).slice(-3).join(' | ');
      res({ html: out, err, status, error: null });
    });
  });
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
    // U7: the player index and one profile document per key.
    cpSync(join(FIXTURES, 'players.json'), join(dir, 'players.json'));
    cpSync(join(FIXTURES, 'players'), join(dir, 'players'), { recursive: true });
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
      // U7-C: every row name links to its profile.
      check(`${label}: row names link to /pvp/player/?name=<key>`, rowLinkProblems(root, { overall: OVERALL, sword: SWORD, tournament: TOURNAMENT }[key]));
      // U7-B: the search block shows once players.json has loaded.
      if (label === 'pvp overall') check(`${label}: player search visible, empty`, searchProblems(root));
    }

    // ------------------------------------------------ U7: profile pages --
    const served = await Promise.all(
      ['players.json', 'players/sample_01.json', 'players/nobody_here.json'].map((f) => fetch(`${base}${FIXTURE_BASE}/${f}`).then((r) => r.status, () => 0)),
    );
    check(
      'player-fixtures-served',
      q(served) === q([200, 200, 404]) ? [] : [`players.json, players/sample_01.json, players/nobody_here.json answered ${q(served)}, want [200,200,404]`],
    );
    const proxy = await startProxy(port);
    const pbase = `http://127.0.0.1:${proxy.port}`;
    const playerRequests = () => proxy.log.filter((u) => /\/players\//.test(u));
    const loadProfile = async (search, label) => {
      proxy.log.length = 0;
      const d = await dumpAsync(chrome, `${pbase}/pvp/player/${search}`, profileRoot);
      const loaded = /<html[\s>]/i.test(d.html) && /<div[^>]*id="app"/i.test(d.html);
      check(`${label}: page loaded (/pvp/player/${search})`, loaded ? [] : [`no DOM from Chrome (status ${d.status}${d.error ? `, ${d.error.message}` : ''}): ${q(d.err)}`]);
      return loaded ? parseHtml(d.html) : null;
    };
    try {
      for (const [key, want] of Object.entries(PROFILES)) {
        const label = `profile ${key}`;
        const root = await loadProfile(`?name=${key}`, label);
        if (!root) continue;
        check(`${label}: rendered as the fixture`, profileProblems(root, want));
        check(`${label}: no injected markup`, injectedProblems(root));
        check(`${label}: mc-heads images have referrerpolicy="no-referrer"`, referrerAll(root));
        check(`${label}: no inline px width over 400`, wideInline(root));
        if (!want.best) check(`${label}: no rating number, no "Rating"/"Peak" (unplaced)`, unplacedProblems(root));
      }
      {
        const root = await loadProfile('?name=nobody_here', 'profile nobody_here');
        if (root) {
          check('profile nobody_here: not ranked (404)', stateProblems(root, PROFILE_STATE.notRanked, { back: true }));
          const asked = playerRequests();
          check('profile nobody_here: the profile was requested (proxy log works)', asked.some((u) => /\/players\/nobody_here\.json(?:[?#]|$)/.test(u)) ? [] : [`no request for players/nobody_here.json (log ${q(proxy.log)})`]);
        }
      }
      for (const [search, what] of INVALID_NAMES) {
        const label = `profile invalid name (${what})`;
        const root = await loadProfile(search, label);
        if (!root) continue;
        check(`${label}: not ranked`, stateProblems(root, PROFILE_STATE.notRanked, { back: true }));
        const asked = playerRequests();
        check(`${label}: no /players/ request`, asked.length ? [`requested ${q(asked)}`] : []);
      }
      {
        const root = await loadProfile('?name=server_error', 'profile server_error');
        if (root) check('profile server_error: unavailable (503)', stateProblems(root, PROFILE_STATE.unavailable));
      }
    } finally {
      proxy.close();
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
