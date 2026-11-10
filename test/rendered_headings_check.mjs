#!/usr/bin/env node
// Rendered heading order (run U8, round 2): what a screen reader's heading list
// shows once the client has rendered, on the production build.
//
//   node test/rendered_headings_check.mjs [--dist <distDir>] [--only <stateId,...>] [--all]
//   node test/rendered_headings_check.mjs --self-test [--dist <distDir>]
//   (npm script for the implementer to add: "test:headings": "node test/rendered_headings_check.mjs")
//
// Why: check_site's a11y-headings reads the prerendered HTML only. Parts of
// some pages exist only after the client renders (the profile page's kit and
// career cards, the store's packages, the market tables), so a heading skip
// there is invisible to it. Measured on dc46510: /pvp/player/?name=sample_01
// renders h1 (the name) -> h3 (kit titles, Career) -> h2 RECENT RANKED.
//
// Page states: GATE below, each the page a visitor lands on at its URL (the
// profile with a fixture player), opened exactly as test/card_style_check.mjs
// opens them (same fixtures, network answers, frozen time, settle), at 400 and
// 1280. --all also runs every other card_style_check state (modals, tabs, item
// views) as a diagnostic; those lines are printed as NOTE and never fail.
//
// Rules per state and width (one PASS/FAIL line):
//   - headings are h1-h6 and [role=heading][aria-level], in document order,
//     counted only when rendered (has a client rect, visibility not hidden) and
//     not inside [aria-hidden="true"], [inert] or [hidden];
//   - exactly one rendered <h1>;
//   - no heading is more than one level deeper than the heading before it
//     (h1 -> h3 and h2 -> h4 fail; going back up any number of levels is fine).
// The heading text and tag of each step are printed on a failure.

import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './visual_check.mjs';
import { STATES, WIDTHS, openState, withBrowser } from './card_style_check.mjs';

/** The states that gate: one per page URL. */
export const GATE = ['home', 'pvp', 'profile', 'profile-noname', 'smp', 'faq-open', 'store', 'auctions', 'privacy'];

let passed = 0;
let failed = 0;
function check(name, problems) {
  const list = [].concat(problems ?? []).filter(Boolean);
  if (list.length) failed++;
  else passed++;
  console.log(list.length ? `FAIL ${name}: ${list.join('; ')}` : `PASS ${name}`);
}

/** In-page: the rendered headings as [{ level, tag, text }]. */
export const HEADINGS = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"][aria-level]')) {
    if (!el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.visibility === 'collapse' || cs.display === 'none') continue;
    if (el.closest('[aria-hidden="true"], [inert], [hidden]')) continue;
    const role = el.getAttribute('role') === 'heading';
    const level = role ? Number(el.getAttribute('aria-level')) : Number(el.tagName[1]);
    out.push({ level, tag: role ? 'role=heading level ' + level : el.tagName.toLowerCase(), text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40) });
  }
  return out;
})()`;

/** Problems for a heading list (pure; the self-test calls it directly too). */
export function headingProblems(hs) {
  const problems = [];
  const h1 = hs.filter((h) => h.level === 1).length;
  if (h1 !== 1) problems.push(`${h1} rendered <h1>, want 1`);
  for (let i = 1; i < hs.length; i++)
    if (hs[i].level > hs[i - 1].level + 1) problems.push(`<${hs[i - 1].tag}> ${JSON.stringify(hs[i - 1].text)} is followed by <${hs[i].tag}> ${JSON.stringify(hs[i].text)} (skips a level)`);
  return [...new Set(problems)];
}

async function run(dist, args) {
  const oi = args.indexOf('--only');
  const only = oi >= 0 ? args[oi + 1].split(',') : null;
  const all = args.includes('--all');
  const states = STATES.filter((s) => (only ? only.includes(s.id) : all || GATE.includes(s.id)));
  if (!only) for (const id of GATE) if (!STATES.some((s) => s.id === id)) check(`state ${id}`, ['not defined in card_style_check STATES']);
  await withBrowser(dist, async (b, origin) => {
    for (const state of states)
      for (const width of WIDTHS.filter((w) => !state.widths || state.widths.includes(w))) {
        const id = `${state.id}@${width}`;
        const gate = GATE.includes(state.id);
        let page;
        try {
          page = await openState(b, origin, state, width);
        } catch (e) {
          if (gate) check(`${id} page`, [String(e?.message ?? e)]);
          else console.log(`NOTE ${id} page: ${e?.message ?? e}`);
          continue;
        }
        try {
          const hs = await page.ev(HEADINGS);
          const p = headingProblems(hs);
          if (gate) check(`${id} headings`, p);
          else console.log(`NOTE ${id} headings: ${p.length ? p.join('; ') : 'in order'}`);
        } finally {
          await page.close();
        }
      }
  });
}

/** Planted pages prove both rules fire, and that hidden headings are ignored. */
async function selfTest(dist) {
  const H = (l, t = 'x') => ({ level: l, tag: `h${l}`, text: t });
  check('self pure: h1 h2 h3 h2 h3 passes', headingProblems([H(1), H(2), H(3), H(2), H(3)]));
  check('self pure: h1 h3 fails', headingProblems([H(1), H(3)]).some((x) => x.includes('<h1> "x" is followed by <h3>')) ? [] : ['not reported']);
  check('self pure: h2 h4 fails', headingProblems([H(1), H(2), H(4)]).some((x) => x.includes('skips a level')) ? [] : ['not reported']);
  check('self pure: back up from h4 to h2 passes', headingProblems([H(1), H(2), H(3), H(4), H(2)]));
  check('self pure: no h1 fails', headingProblems([H(2)]).some((x) => x.startsWith('0 rendered <h1>')) ? [] : ['not reported']);
  check('self pure: two h1 fail', headingProblems([H(1), H(1)]).some((x) => x.startsWith('2 rendered <h1>')) ? [] : ['not reported']);
  await withBrowser(dist, async (b, origin) => {
    const page = await openState(b, origin, STATES.find((s) => s.id === 'privacy'), 1280);
    try {
      const before = headingProblems(await page.ev(HEADINGS));
      // Hidden headings do not count: a planted h5 that is hidden, aria-hidden, inert or display:none changes nothing.
      await page.ev(`(() => { const m = document.querySelector('main'); for (const h of ['<h5 hidden>a</h5>', '<div aria-hidden="true"><h5>b</h5></div>', '<div inert><h5>c</h5></div>', '<h5 style="display:none">d</h5>', '<h5 style="visibility:hidden">e</h5>']) m.insertAdjacentHTML('afterbegin', h); return true; })()`);
      check('self page: hidden headings are ignored', JSON.stringify(headingProblems(await page.ev(HEADINGS))) === JSON.stringify(before) ? [] : ['a hidden heading was counted']);
      await page.ev(`(() => { document.querySelector('h1').insertAdjacentHTML('afterend', '<h4>planted</h4>'); return true; })()`);
      const p = headingProblems(await page.ev(HEADINGS));
      check('self page: a planted h4 right after the h1 fails', p.some((x) => x.includes('<h4> "planted"')) ? [] : [`problems: ${p.join(' | ') || 'none'}`]);
      await page.ev(`(() => { document.querySelector('main').insertAdjacentHTML('beforeend', '<div role="heading" aria-level="1">role h1</div>'); return true; })()`);
      check('self page: a second (role=heading level 1) h1 fails', headingProblems(await page.ev(HEADINGS)).some((x) => x.startsWith('2 rendered <h1>')) ? [] : ['not reported']);
    } finally {
      await page.close();
    }
  });
}

async function main() {
  const args = process.argv.slice(2);
  const di = args.indexOf('--dist');
  const dist = resolve(di >= 0 ? args[di + 1] : join(ROOT, 'dist'));
  if (args.includes('--self-test')) await selfTest(dist);
  else await run(dist, args);
  console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.log(`FAIL rendered-headings: ${e?.stack ?? e}`);
    console.log('RESULT: FAIL 1 of 1');
    process.exitCode = 1;
  });
}
