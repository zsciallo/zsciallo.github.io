#!/usr/bin/env node
// Card surface check (run U9, owner 2026-11-10: "Content cards should have a
// sleeker/minimal design. The current gradient and depth look tacky." Style
// "C · Surface" on every card on the site.)
//
//   node test/card_style_check.mjs [--dist <distDir>] [--only <stateId,...>] [--width 400|1280]
//       serve the production build with vite preview, open every page state
//       below at 400x900 and 1280x900 in headless Chrome, and check:
//   node test/card_style_check.mjs --snapshot-guard [--dist <distDir>]
//       write test/fixtures/card-style-guard.json (the UNCHANGED guard) from
//       the current build. Taken once, before U9, from 979b66a.
//   node test/card_style_check.mjs --snapshot-guard --add [--dist <distDir>]
//       add only the GUARD entries the snapshot lacks (round 3: .type-option,
//       .store-tooltip); every existing entry and probe is kept byte-identical.
//   node test/card_style_check.mjs --self-test
//       plant violations in real pages and prove each rule catches them.
//   node test/card_style_check.mjs --allow-report
//       the normal run, plus every element each ALLOW entry excused.
//   node test/card_style_check.mjs --discover [--only ...]
//       list every element the completeness heuristic flags, ignoring both
//       lists (a maintenance aid; never part of the gate).
//   (npm script for the implementer to add: "test:cards": "node test/card_style_check.mjs")
//
// What is checked, per page state and width (one PASS/FAIL line each):
//   tokens        :root defines --surface #150f27, --surface-inset #0f0a1d,
//                 --surface-hover #21193c, --surface-selected #2c214f,
//                 --radius-card 10px, --radius-inset 6px, --divider #221838
//                 (spec values, compared case-insensitively after trimming;
//                 amendment U9-states: the round-1 hover #1a1330 was 1.044:1
//                 against --surface, imperceptible).
//   tokens-perceptible  (once) WCAG contrast between the :root token colours:
//                 --surface-hover vs --surface >= 1.10, --surface-selected vs
//                 --surface >= 1.22, --surface-selected vs --surface-hover >= 1.08.
//   cards         every rendered element matching a CARDS entry (first matching
//                 entry wins, so inset/state entries sit before general ones):
//                 background-color = the token's rgb (read from :root, so the
//                 test follows the tokens; the spec value when the token is
//                 missing), computed background-image none, all four border
//                 widths 0, box-shadow none, ::before and ::after draw no box
//                 (content none, or no fill/border/shadow, or zero size), all
//                 four corner radii = the radius token.
//                 kind 'card' -> --surface / --radius-card; 'inset' ->
//                 --surface-inset / --radius-inset; 'tile' -> --surface /
//                 --radius-inset (a tile that sits on an inset panel: the
//                 rank kit's reward tiles); fill 'selected' -> --surface-selected
//                 (selected / open / current states).
//   hover         for every CARDS entry with hover: true, the first 2 rendered
//                 matches are put in :hover with CDP CSS.forcePseudoState: the
//                 same rules with background-color = --surface-hover.
//   focus         the same first 2 matches: a Tab key press (keyboard modality),
//                 then the entry's focus target (the card itself, or the
//                 control inside it that takes focus) is focused and must
//                 match :focus-visible; the target must draw an outline
//                 (outline-style not none, width > 0: the existing focus ring)
//                 AND the card's background-color must be --surface-hover
//                 (spec: focus shows the ring and the hover fill).
//   perceptible   per state, from the computed colours: every hovered card's
//                 :hover fill vs its own resting fill >= 1.10; every
//                 selected/open card's fill vs its kind's resting token
//                 (--surface, or --surface-inset for inset tiles) >= 1.22 and
//                 vs --surface-hover >= 1.08 (WCAG contrast ratio).
//   dividers      inside every card, an element that is neither a card nor
//                 in DIVIDER_SKIP (nor inside one) and has a border on 1-3
//                 sides and is at least 24px wide or high (smaller is an icon
//                 glyph, e.g. the listing chevron): each visible side is 1px solid #221838 (join rows, table
//                 rows; spec: dividers stay 1px lines in #221838).
//   completeness  any other rendered element with a gradient background-image,
//                 or a visible border on all four sides with a corner radius
//                 >= 6px, or a ::before/::after strip (position absolute, 0.5-2.5px
//                 high, >= 24px wide, gradient or coloured fill) fails with its
//                 path, unless it matches an ALLOW entry. Text painted with
//                 background-clip: text (gradient headline words) is not a box. This is how "every
//                 card" is enforced: a card the list missed cannot hide.
//   guard         the computed styles in GUARD (things the owner kept: arcade
//                 buttons, chips, rungs, top-3 tints, title glows, logo glow,
//                 claim band) equal test/fixtures/card-style-guard.json.
//   overflow      document scrollWidth <= viewport width.
//   separation    (400 only) for every outer card (kind 'card', not inside
//                 another card), the nearest card starting below it that
//                 overlaps it horizontally by >= 50% of the narrower one starts
//                 at least 10px below its bottom edge (borderless cards must not
//                 merge into one block).
//   contrast      for every card, WCAG contrast of --muted on its background
//                 >= 4.5 and of --text on it >= 7 (a translucent background is
//                 composited over --bg first).
//   coverage      (once, at the end) every CARDS and GUARD entry matched at
//                 least one rendered element on at least one of its pages, so
//                 the lists cannot rot into selectors that match nothing.
//
// Deterministic conditions: as test/visual_check.mjs (fresh browser context,
// reduced motion, frozen Date, seeded Math.random, every animation and
// transition pinned before reading styles). Network: the preview origin and
// Google Fonts pass through; api.chromabit.us/pvp/* -> test/fixtures/pvp
// (the committed PVP fixtures); api.chromabit.us/market/* and the preview
// origin's /market/*.json -> test/fixtures/card-style/market (an anonymised,
// trimmed copy: UUIDs renamed, sellers Seller_NN), /market/icons/* -> a fixed
// PNG; headless.tebex.io .../categories -> test/fixtures/card-style/
// tebex-categories.json (3 categories, 10 packages whose ids have generated
// store content); everything else as visual_check (status, Discord, heads
// fixed; other hosts 404).

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIX, FREEZE, FREEZE_ANIMATIONS, FROZEN_TIME, HEAD_PNG, ROOT, VITE, fileOr404, findChrome, freePort, json, launchChrome, sleep, waitReady } from './visual_check.mjs';

const PVP_FIX = join(ROOT, 'test', 'fixtures', 'pvp');
const CS_FIX = join(ROOT, 'test', 'fixtures', 'card-style');
export const GUARD_FILE = join(ROOT, 'test', 'fixtures', 'card-style-guard.json');

export const WIDTHS = [400, 1280];
export const HEIGHT = 900;

/**
 * The spec (plan Amendment 4, amended by U9-states: --surface-hover #1a1330 ->
 * #21193c, new --surface-selected, --divider pinned too).
 */
export const SPEC_TOKENS = {
  '--surface': '#150f27',
  '--surface-inset': '#0f0a1d',
  '--surface-hover': '#21193c',
  '--surface-selected': '#2c214f',
  '--radius-card': '10px',
  '--radius-inset': '6px',
  '--divider': '#221838',
};
/** Perceptibility floors (amendment U9-states), WCAG contrast ratios between fills. */
export const PERCEPT = { hoverVsRest: 1.1, selectedVsRest: 1.22, selectedVsHover: 1.08 };
export const MIN_GAP = 10;
export const MUTED_MIN = 4.5;
export const TEXT_MIN = 7;

// ---------------------------------------------------------------- states --
// setup: an expression evaluated after the page settles (clicks, typing); it
// must resolve to true, or the state fails (the fixture did not render what
// the state needs).
const click = (sel, nth = 0) => `(() => { const el = document.querySelectorAll(${JSON.stringify(sel)})[${nth}]; if (!el) return false; el.click(); return true; })()`;
const clickText = (sel, text) => `(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.includes(${JSON.stringify(text)})); if (!el) return false; el.click(); return true; })()`;
const type = (sel, text) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.focus(); el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`;
/** Waits (up to 5 s) for a selector to render, then true; false if it never does. */
const waitFor = (sel) => `(async () => { for (let i = 0; i < 50; i++) { const el = document.querySelector(${JSON.stringify(sel)}); if (el && el.getClientRects().length) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()`;
/** Clicks the BUY (or cart) button of the package card whose name is exactly `name`. */
const buyPackage = (name) => `(() => { const c = [...document.querySelectorAll('.pkg-card')].find((e) => e.querySelector('.pkg-name')?.textContent.trim() === ${JSON.stringify(name)}); if (!c) return false; c.scrollIntoView(); const b = c.querySelector('.pkg-buy, .pkg-cart-btn'); if (!b) return false; b.click(); return true; })()`;

/**
 * Round 3 (reviewer F5): a signed-in buyer with a saved Tebex basket (the
 * ident the basket fixture answers for), written before the page runs.
 */
export const BASKET_IDENT = 'cardcheck1';
const SEED_BASKET = `localStorage.setItem('chromabit_username', 'Steve'); localStorage.setItem('chromabit_platform', 'java'); localStorage.setItem('chromabit_basket', JSON.stringify({ ident: ${JSON.stringify(BASKET_IDENT)}, username: 'Steve', at: ${FROZEN_TIME} }));`;
/** Before launch day (config.launchDate 2026-06-19): the join box and the FAQ show the LAUNCHING IN countdown. */
export const PRE_LAUNCH_TIME = Date.UTC(2026, 5, 1, 12, 0, 0);
/** An item with enchant chips, contents chips and lore (patched onto the totem fixture). */
const CHIP_ITEM = {
  enchants: [{ id: 'sharpness', level: 5 }, { id: 'unbreaking', level: 3 }, { id: 'mending', level: 1 }],
  contents: [{ id: 'minecraft:diamond', count: 4, name: 'Diamond' }, { id: 'minecraft:golden_apple', count: 2, name: 'Golden Apple' }],
  lore: ['A fixture lore line.'],
};

export const STATES = [
  { id: 'home', path: '/', ready: '.mode-card' },
  // The PVP feed down: the PVP mode card shows its idle tier strip.
  { id: 'home-idle', path: '/', ready: '.mode-live--idle', block: ['/pvp/'] },
  { id: 'pvp', path: '/pvp/', ready: '.pvp-table' },
  { id: 'pvp-tournament', path: '/pvp/?board=tournament', ready: '.pvp-table--count' },
  { id: 'pvp-search', path: '/pvp/', ready: '.pvp-search-input', setup: [type('.pvp-search-input', 'sample'), waitFor('.pvp-search-hit')] },
  { id: 'pvp-search-none', path: '/pvp/', ready: '.pvp-search-input', setup: [type('.pvp-search-input', 'zzzz_nobody'), waitFor('.pvp-search-none')] },
  { id: 'profile', path: '/pvp/player/?name=sample_01', ready: '.pvp-kit' },
  { id: 'profile-missing', path: '/pvp/player/?name=nobody_here', ready: '.pvp-profile-state' },
  { id: 'profile-noname', path: '/pvp/player/', ready: '.pvp-profile-state' },
  { id: 'smp', path: '/smp/', ready: '.fact' },
  { id: 'faq-open', path: '/faq/', ready: '.faq-item', setup: [click('.faq-question'), waitFor('.faq-item[data-open]')] },
  { id: 'store', path: '/store/', ready: '.pkg-card' },
  { id: 'store-crate', path: '/store/', ready: '.pkg-card', setup: [clickText('.pkg-card', 'Chroma Key'), waitFor('.pkg-modal')] },
  { id: 'store-crate-open', path: '/store/', ready: '.pkg-card', setup: [clickText('.pkg-card', 'Chroma Key'), waitFor('.store-item--button'), click('.store-item--button'), waitFor('.store-item.is-open')] },
  { id: 'store-rank', path: '/store/', ready: '.pkg-card', setup: [clickText('.pkg-card', 'MVP+'), waitFor('.pkg-modal')] },
  { id: 'store-table', path: '/store/', ready: '.pkg-card', setup: [clickText('.pkg-card', 'Sell Chest'), waitFor('.pkg-modal')] },
  { id: 'auctions', path: '/auctions/', ready: '.market-row' },
  { id: 'auctions-listings', path: '/auctions/?tab=listings', ready: '.listing-card' },
  { id: 'auctions-listing-open', path: '/auctions/?tab=listings', ready: '.listing-card--compact', widths: [400], setup: [click('.listing-card--compact .listing-head'), waitFor('.listing-card.open')] },
  { id: 'auctions-markets', path: '/auctions/?tab=markets', ready: '.pool-card' },
  { id: 'auctions-pool', path: '/auctions/?tab=markets&pool=elytra', ready: '.chart-card' },
  { id: 'auctions-futures', path: '/auctions/?tab=futures', ready: '.futures-markets' },
  // The desk not open yet: the intro panel instead of the open book.
  { id: 'auctions-futures-soon', path: '/auctions/?tab=futures', ready: '.futures-intro', patch: { 'futures.json': { live: false } } },
  { id: 'auctions-item', path: '/auctions/?item=minecraft:totem_of_undying', ready: '.stat-row' },
  { id: 'privacy', path: '/privacy/', ready: 'main' },
  // Round 3 (reviewer F5): states no earlier round reached. Each must render
  // what it is for, or it fails.
  // Server down after launch day: the join box says UNDER MAINTENANCE; the FAQ shows the status card.
  { id: 'home-offline', path: '/', ready: '.join-label--down', status: 'offline' },
  { id: 'faq-offline', path: '/faq/', ready: '.card.info-card', status: 'offline' },
  // Server down before launch day: the LAUNCHING IN countdowns.
  { id: 'home-launching', path: '/', ready: '.join-label--down .join-count', status: 'offline', time: PRE_LAUNCH_TIME },
  { id: 'faq-launching', path: '/faq/', ready: '.card.info-card .countdown-timer', status: 'offline', time: PRE_LAUNCH_TIME },
  // The store's login modal, the key roll cabinet, the cart drawer with lines, the purchase-type modal.
  { id: 'store-login', path: '/store/', ready: '.pkg-card', setup: [click('.store-login'), waitFor('.modal-card')] },
  { id: 'store-roll', path: '/store/', ready: '.pkg-card', setup: [click('.store-tab--random'), waitFor('.slot-cabinet')] },
  { id: 'store-cart', path: '/store/', ready: '.pkg-card', basket: true, init: SEED_BASKET, setup: [waitFor('.cart-fab-badge'), click('.cart-fab'), waitFor('.cart-drawer.open .cart-item')] },
  // Chroma Pass offered as both one-time and subscription ("type": "both"): BUY opens the purchase-type modal.
  { id: 'store-type', path: '/store/', ready: '.pkg-card', basket: true, both: 'Chroma Pass', init: SEED_BASKET, setup: [buyPackage('Chroma Pass'), waitFor('.type-modal .type-option')] },
  // An auction item with enchant and contents chips and lore.
  { id: 'auctions-item-chips', path: '/auctions/?item=minecraft:totem_of_undying', ready: '.detail-ench li', patch: { 'items/minecraft_totem_of_undying.json': CHIP_ITEM } },
  // The phone nav sheet.
  { id: 'nav-sheet', path: '/', ready: '.nav-toggle', widths: [400], setup: [click('.nav-toggle'), waitFor('.site-nav-links.open')] },
];

// ----------------------------------------------------------------- lists --
// Read off src/index.css, src/pvp.css, src/market.css and the components at
// 979b66a, and confirmed by --discover on every state above.
//
// CARDS: what "every card on the site" means. The first entry an element
// matches decides its rules, so state entries (open/selected) and inset entries
// sit before the general ones. `states` are where the entry must match at least
// one element (the coverage check); the rules apply wherever it matches.
//   kind 'card'  -> fill --surface,       radius --radius-card
//   kind 'inset' -> fill --surface-inset, radius --radius-inset (boxes inside a card or a modal)
//   kind 'tile'  -> fill --surface,       radius --radius-inset (a tile on an inset panel)
//   fill 'selected' -> fill --surface-selected (selected / open / current states)
//   hover: true  -> also checked in :hover, wanting --surface-hover (and the
//                   perceptible line: hover vs rest >= 1.10)
//   focus: sel   -> keyboard focus target (':scope' = the card itself); checked
//                   with the hover matches: outline on the target AND the card on --surface-hover
/**
 * Modal frames that also carry the shared .card class (package modal, login /
 * purchase modal, purchase-type modal, key-roll cabinet). They are chrome, not
 * content cards: the catch-all excludes each by name and ALLOW excuses them.
 */
export const MODAL_CHROME_CARD = ['.pkg-modal', '.modal-card', '.type-modal', '.slot-cabinet'];
export const CARDS = [
  // / (home)
  { sel: '.card.join-box', kind: 'card', states: ['home'], note: 'join box in the hero (IP, Discord, editions)' },
  { sel: '.card.mode-card.mode-card--pvp', kind: 'card', states: ['home', 'home-idle'], note: 'the pink PVP mode card variant' },
  { sel: '.card.mode-card', kind: 'card', states: ['home', 'home-idle'], note: 'the mode cards' },
  { sel: '.mode-live.mode-live--idle', kind: 'inset', states: ['home-idle'], note: 'the idle tier strip in the PVP card (feed down)' },
  { sel: '.mode-live', kind: 'inset', states: ['home'], note: 'live block inside a mode card (top of the ladder, top movers)' },
  // /faq/
  { sel: '.card.ip-block', kind: 'card', states: ['faq-open'], note: 'IP block in the FAQ hero' },
  { sel: '.faq-item[data-open]', kind: 'card', fill: 'selected', states: ['faq-open'], note: 'an open FAQ item: the selected fill, not a pink border' },
  { sel: '.faq-item', kind: 'card', hover: true, focus: '.faq-question', states: ['faq-open'], note: 'FAQ accordion items (focus lands on the question button)' },
  // Server offline (round 3): the status / countdown card on the FAQ.
  { sel: '.card.info-card', kind: 'card', states: ['faq-offline', 'faq-launching'], note: 'the server-offline / LAUNCHING IN status card' },
  // /smp/
  { sel: '.card.fact:not(.pvp-fact)', kind: 'card', states: ['smp'], note: 'SMP fact tiles' },
  { sel: '.tape', kind: 'card', states: ['smp'], note: 'the market ticker tape' },
  // /pvp/
  { sel: '.card.pvp-fact', kind: 'card', states: ['pvp'], note: 'PVP fact tiles' },
  { sel: '.card.pvp-mode', kind: 'card', states: ['pvp'], note: 'the six PVP mode cards' },
  { sel: '.card.pvp-board-card', kind: 'card', states: ['pvp', 'pvp-tournament', 'profile'], note: 'leaderboard card; on the profile, the recent-ranked table container' },
  { sel: '.pvp-search-results', kind: 'card', states: ['pvp-search'], note: 'player search results panel' },
  // /pvp/player/
  { sel: '.card.pvp-kit', kind: 'card', states: ['profile'], note: 'profile kit cards and the career card (.pvp-career)' },
  // /store/
  { sel: '.pkg-card', kind: 'card', hover: true, focus: ':scope', states: ['store'], note: 'package cards (role=button, tabindex 0)' },
  // Owner ruling (round 2): rarity colour is information. An opened reward tile keeps its rarity-coloured
  // border (guarded per rarity: rarity-borders line); fill, gradient, shadow, pseudo boxes and radius are still judged.
  // Round 3 (amendment U9-states): an opened tile is an "open" state, so its fill is --surface-selected.
  { sel: '.store-item.is-open', kind: 'inset', fill: 'selected', borderGuarded: true, states: ['store-crate-open'], note: 'an opened reward tile in the package modal (border = rarity colour, guarded)' },
  // Round 3 (reviewer F6): the rank kit's reward tiles sit on the inset kit panel, so they take --surface to stay visible.
  { sel: '.store-kit .store-item', kind: 'tile', states: ['store-rank'], note: 'reward tiles inside the rank modal\'s kit panel (surface on inset)' },
  { sel: '.store-item.store-item--button', kind: 'inset', hover: true, focus: ':scope', states: ['store-crate'], note: 'clickable reward tiles in the package modal' },
  { sel: '.store-item', kind: 'inset', states: ['store-crate'], note: 'reward tiles in the package modal (a modal\'s inner card surfaces)' },
  { sel: '.store-kit', kind: 'inset', states: ['store-rank'], note: 'kit panels in the rank modal' },
  { sel: '.store-table-wrap', kind: 'inset', states: ['store-table'], note: 'table panel in the package modal' },
  // Round 3: the free-key progress panel inside the cart drawer (a drawer's inner card surface, as in the package modals).
  { sel: '.cart-keys', kind: 'inset', states: ['store-cart'], note: 'the free Chroma Key progress panel in the cart drawer' },
  // /auctions/
  { sel: '.market-table', kind: 'card', states: ['auctions'], note: 'the item table' },
  { sel: '.stat-row', kind: 'card', states: ['auctions-item', 'auctions-pool', 'auctions-markets', 'auctions-futures'], note: 'stat tile rows' },
  { sel: '.chart-card', kind: 'card', states: ['auctions-item', 'auctions-pool', 'auctions-futures'], note: 'chart panels' },
  { sel: '.mini-table', kind: 'card', states: ['auctions-item', 'auctions-pool', 'auctions-futures'], note: 'small tables (listings, sales, positions, markets)' },
  { sel: '.explainer', kind: 'card', states: ['auctions-markets'], note: 'the "how the markets work" panel' },
  { sel: '.futures-intro', kind: 'card', states: ['auctions-futures-soon'], note: 'futures desk intro (desk not open)' },
  { sel: '.pool-card.selected', kind: 'card', fill: 'selected', states: ['auctions-pool'], note: 'the selected pool card' },
  { sel: '.pool-card', kind: 'card', hover: true, focus: ':scope', states: ['auctions-markets'], note: 'pool cards (<button>)' },
  { sel: '.listing-card.open', kind: 'card', fill: 'selected', states: ['auctions-listing-open'], note: 'an expanded listing card (phone)' },
  { sel: '.listing-card', kind: 'card', hover: true, focus: '.listing-head', states: ['auctions-listings'], note: 'listing cards (focus lands on the head button)' },
  // anything else carrying the shared card class. Modal frames carry .card too
  // but are modal chrome (ALLOW): every modal-chrome class is excluded by name.
  // Catch-all (states empty: exempt from coverage, since every card above has its own entry).
  { sel: MODAL_CHROME_CARD.reduce((s, c) => `${s}:not(${c})`, '.card'), kind: 'card', states: [], note: 'any other .card, e.g. a new one added later (modal frames excluded by class)' },
];

/**
 * Card classes the CSS still styles but no page renders (no JSX uses them at
 * 979b66a): only test/check_site.mjs card-no-frost reads this, so their dead
 * frost and hairline rules have to go with the rest.
 */
export const DEAD_CARD_CLASSES = ['feature-card', 'event-card'];

/**
 * ALLOW: elements the completeness heuristic flags that are not cards. Matched
 * with Element.matches after CARDS (so a card that is also a <button>, like
 * .pool-card, is still checked as a card). Besides these, text painted with
 * background-clip: text (gradient headline words) is never a box and is
 * skipped by the heuristic itself.
 */
export const ALLOW = [
  // Round 3 (reviewer F5): controls are named by the site's button classes, not by the <button> tag, so a
  // card built as a <button> (.pool-card, a reward tile, or a new one) is still judged.
  {
    sel: [
      '.btn', '[data-arcade]', // arcade buttons (owner kept them): store tabs, BUY, copy IP, spin, checkout
      '.sound-toggle', '.nav-toggle', '.cart-fab', '.cart-close', '.cart-item-remove', '.cart-coupon-apply', '.cart-coupon-hint', // icon and small buttons
      '.pkg-modal-close', '.modal-close', '.lightbox-close', '.pkg-cart-btn', '.qty-btn', '.copy-btn', '.purchase-ip', '.platform-opt', '.store-user-change',
      '.faq-question', '.detail-back', '.market-toggle', '.market-tab', '.market-more', '.range-tab', '.indicator-tab', // toggles, tabs, back buttons
      '.listing-head', '.listing-seller', '.listing-view', '.carousel-slide-btn',
    ].join(', '),
    note: 'controls, by class: arcade buttons (owner kept them), icon buttons (sound, menu, cart, close, copy), steppers, platform choice, market toggles, tabs and back buttons, listing heads, carousel slides',
  },
  { sel: 'input, select, textarea, .qty-field', note: 'form fields and the quantity stepper readout' },
  { sel: '.type-option', note: 'purchase-type choices in the buy flow (ONE-TIME / SUBSCRIBE): controls, not cards (amendment U9-states); guarded unchanged' },
  { sel: '.store-tooltip', note: 'the Minecraft-style item tooltip replica keeps its border (amendment U9-states); guarded unchanged' },
  { sel: '.detail-ench li, .detail-contents li', note: 'enchant and contents chips on an auction item (owner: chips, not cards)' },
  { sel: '.slot-window', note: 'the reel windows of the key-roll slot machine (machine art inside the cabinet chrome)' },
  { sel: '.cart-keys-bar, .cart-keys-bar *', note: 'the free-key progress bar and its fill (a meter, not a box)' },
  { sel: '.beta-tag, .tier-chip, .pvp-ed, .pvp-tier, .status-badge, .store-rarity-count, .store-promo-tag, .store-cmd, .store-kit-command, .rank-step, .rank-tag, .market-tag, .futures-badge, .pkg-freekey-chip, .cart-fab-badge, .deal-badge', note: 'badges and chips (owner: chips, not cards)' },
  { sel: '.pvp-rung', note: 'tier rungs (owner kept)' },
  { sel: 'tr[data-top]', note: 'top-3 leaderboard row tints (owner kept)' },
  { sel: '.claim-band', note: 'the claim band wash and rules (owner kept)' },
  { sel: '.mode-banner, .pvp-art, .pvp-art *, .carousel-caption, .listing-thumb', note: 'banners and art: card banner art, the crossed swords, carousel captions over screenshots, item icon frames' },
  { sel: '.store-promo, .store-banner, .store-block-note--strong', note: 'store banners: the free-key and welcome offers, error/success banners, the amber "read this" note (callouts, not content cards)' },
  { sel: '.site-nav, .site-nav *, .nav-bar', note: 'the nav and its active-link bar' },
  { sel: [...MODAL_CHROME_CARD, '.modal', '.modal-overlay', '.lightbox', '.lightbox-caption', '.cart-drawer'].join(', '), note: 'modal, lightbox, drawer and key-roll chrome (they keep their own; their inner card surfaces are in CARDS)' },
  { sel: '.rule', note: 'the hero divider rule (a 2px line, not a box)' },
  { sel: '.pkg-modal--rank .store-perk', note: "rank perk rows keep their per-rank tint: information-carrying colour, owner's store (owner ruling, U9 round 2); guarded per rank by the rank-tints line" },
];

/** Computed properties the GUARD compares. */
const GUARD_PROPS = [
  'background-color', 'background-image', 'box-shadow', 'border-top-width', 'border-top-style', 'border-top-color',
  'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-left-radius', 'color', 'text-shadow', 'filter', 'opacity',
];
/**
 * GUARD: what the owner kept. The first rendered match per state and width is
 * snapshotted before U9 (test/fixtures/card-style-guard.json) and must not change.
 */
export const GUARD = [
  { sel: '.mode-actions .btn.btn-primary', states: ['home'], note: 'primary arcade button' },
  { sel: '.btn.btn-secondary', states: ['store'], note: 'secondary arcade button (store LOG IN)' },
  { sel: '.btn.btn-sm.pvp-tab', states: ['pvp'], note: 'board tab (small arcade button)' },
  { sel: '.join-row .btn.copy-ip', states: ['home'], note: 'copy-IP button inside the join box' },
  { sel: '.beta-tag', states: ['home', 'pvp'], note: 'BETA badge' },
  { sel: '.tier-chip', states: ['home-idle'], note: 'tier chip in the idle strip' },
  { sel: '.pvp-rung', states: ['pvp'], note: 'tier rung' },
  { sel: '.pvp-ed', states: ['pvp', 'profile'], note: 'edition badge' },
  { sel: 'tr[data-top="1"]', states: ['pvp'], note: 'top-3 row tint, 1st' },
  { sel: 'tr[data-top="2"]', states: ['pvp'], note: 'top-3 row tint, 2nd' },
  { sel: 'tr[data-top="3"]', states: ['pvp'], note: 'top-3 row tint, 3rd' },
  { sel: '.hero-title', states: ['home', 'pvp'], note: 'hero title glow' },
  { sel: '.section-title', states: ['pvp'], note: 'section title glow' },
  { sel: '.claim-title', states: ['home'], note: 'claim headline glow' },
  { sel: '.logo', states: ['home'], note: 'logo glow' },
  { sel: '.claim-band', states: ['home', 'pvp'], note: 'claim band wash' },
  { sel: '.mode-banner--pvp', states: ['home'], note: 'PVP card banner art' },
  { sel: '.status-badge', states: ['faq-open'], note: 'status badge chip' },
  { sel: '.store-promo', states: ['store'], note: 'store offer banner' },
  { sel: 'body', states: ['home', 'auctions'], note: 'page background' },
  { sel: '.dither-bg', states: ['home'], note: 'dither canvas' },
  // Round 3 (amendment U9-states): allowlisted, and kept as they are. Added to the snapshot with
  // --snapshot-guard --add (existing entries untouched).
  { sel: '.type-option', states: ['store-type'], note: 'purchase-type choice (a control: keeps its border, edge and fill)' },
  { sel: '.store-tooltip', states: ['store-crate-open'], note: 'Minecraft-style item tooltip (keeps its border)' },
].map((g) => ({ ...g, props: GUARD_PROPS }));

/**
 * Colour cues the owner kept in the store (round 2 ruling: "information, not
 * decoration"), guarded per rarity and per rank in card-style-guard.json
 * (probes):
 *   rarity-borders  (state store-crate-open) every rarity group's first reward
 *                   tile is opened in turn; the opened tile's four border sides
 *                   (width, style, colour, border-image) equal the snapshot.
 *   rank-tints      (state store) each rank's modal is opened in turn; every
 *                   perk row's background, border and radius equal the snapshot.
 */
export const RARITY_PROBE_STATE = 'store-crate-open';
export const RANK_PROBE_STATE = 'store';
export const RANKS = ['VIP', 'VIP+', 'MVP', 'MVP+'];
const BORDER_PROPS = ['top', 'right', 'bottom', 'left'].flatMap((x) => [`border-${x}-width`, `border-${x}-style`, `border-${x}-color`]).concat('border-image-source');
const RANK_PROPS = ['background-color', 'background-image', 'border-top-width', 'border-top-style', 'border-top-color', 'border-top-left-radius'];

/** Dividers inside a card (join rows, table rows): every visible side of a 1-3-sided border is a 1px solid line in this colour. */
export const DIVIDER = { width: '1px', style: 'solid', color: '#221838' };
/**
 * Not dividers, even inside a card: arcade buttons, fields and the ALLOW chips,
 * rungs, row tints and art. Plain <button>s are NOT skipped here (unlike ALLOW):
 * clickable table rows (.market-row is a <button role=row>) draw row dividers.
 */
export const DIVIDER_SKIP = ['.btn, [data-arcade], input, select, textarea, .qty-field', ...ALLOW.slice(2).map((a) => a.sel)];

// --------------------------------------------------------------- routing --

function route(url, origin, state = {}) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return json({}, 404);
  }
  const marketFile = (p) => {
    const r = fileOr404(join(CS_FIX, 'market', ...p.split('/')));
    const patch = state.patch?.[p];
    return patch && r.status === 200 ? json({ ...JSON.parse(r.body), ...patch }) : r;
  };
  if (url.startsWith(origin)) {
    if (u.pathname.startsWith('/market/icons/')) return { status: 200, type: 'image/png', body: HEAD_PNG };
    if (u.pathname.startsWith('/market/') && u.pathname.endsWith('.json')) return marketFile(u.pathname.slice('/market/'.length));
    return 'pass';
  }
  if (url.startsWith('data:') || url.startsWith('blob:')) return 'pass';
  const host = u.hostname;
  if (host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com') return 'pass';
  if (host === 'api.chromabit.us') {
    if ((state.block ?? []).some((b) => u.pathname.startsWith(b))) return json({ error: 'down' }, 503);
    if (u.pathname === '/api/status') return fileOr404(state.status === 'offline' ? join(CS_FIX, 'status-offline.json') : join(FIX, 'status.json'));
    if (u.pathname.startsWith('/pvp/')) return fileOr404(join(PVP_FIX, ...u.pathname.slice('/pvp/'.length).split('/')));
    if (u.pathname.startsWith('/market/')) return marketFile(u.pathname.slice('/market/'.length));
    return json({ error: 'not found' }, 404);
  }
  if (host === 'headless.tebex.io') {
    if (/\/categories$/.test(u.pathname)) {
      if (!state.both) return fileOr404(join(CS_FIX, 'tebex-categories.json'));
      const body = JSON.parse(readFileSync(join(CS_FIX, 'tebex-categories.json'), 'utf-8'));
      for (const c of body.data) for (const p of c.packages) if (p.name === state.both) p.type = 'both';
      return json(body);
    }
    if (state.basket && u.pathname.endsWith(`/baskets/${BASKET_IDENT}`)) return fileOr404(join(CS_FIX, 'tebex-basket.json'));
    return json({ data: [] });
  }
  if (host === 'api.mcsrvstat.us') return fileOr404(join(FIX, 'mcsrvstat.json'));
  if (host === 'discord.com' && u.pathname.startsWith('/api/')) return fileOr404(join(FIX, 'discord-invite.json'));
  if (host === 'mc-heads.net') return { status: 200, type: 'image/png', body: HEAD_PNG };
  if (host.endsWith('posthog.com')) return { status: 200, type: 'application/json', body: u.pathname.endsWith('.js') ? '' : '{}' };
  return json({}, 404);
}

// -------------------------------------------------------- in-page library --
// Installed once per page as window.__cards. Pure DOM + getComputedStyle.
const LIB = String.raw`(() => {
  const rgba = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const hex = (h) => {
    const m = String(h).trim().match(/^#([0-9a-f]{6})$/i);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  };
  const rgbText = (c) => (c ? 'rgb(' + c.slice(0, 3).join(', ') + ')' + (c[3] !== 1 ? ' alpha ' + c[3] : '') : String(c));
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const contrast = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (top, under) => { const a = top[3]; return [0, 1, 2].map((i) => Math.round(top[i] * a + under[i] * (1 - a))).concat(1); };
  const rootVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const SIDES = ['Top', 'Right', 'Bottom', 'Left'];
  const CORNERS = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'];
  const rendered = (el) => {
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.visibility !== 'collapse';
  };
  const NOISE = new Set(['reveal', 'is-visible', 'accent']);
  const label = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = [...el.classList].filter((c) => !NOISE.has(c)).slice(0, 4);
    if (cls.length) s += '.' + cls.join('.');
    for (const a of ['data-top', 'data-open', 'role']) if (el.hasAttribute(a)) s += '[' + a + (el.getAttribute(a) ? '=' + el.getAttribute(a) : '') + ']';
    return s;
  };
  const path = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 4; e = e.parentElement) parts.unshift(label(e));
    return parts.join(' > ');
  };
  const pseudoBox = (el, p) => {
    const ps = getComputedStyle(el, p);
    if (!ps.content || ps.content === 'none' || ps.content === 'normal' || ps.display === 'none') return null;
    const fill = ps.backgroundImage !== 'none' || (rgba(ps.backgroundColor) || [0, 0, 0, 0])[3] > 0;
    const border = SIDES.some((s) => parseFloat(ps['border' + s + 'Width']) > 0);
    const shadow = ps.boxShadow !== 'none';
    if (!fill && !border && !shadow) return null;
    const w = parseFloat(ps.width);
    const h = parseFloat(ps.height);
    if (w === 0 || h === 0) return null;
    return { position: ps.position, width: ps.width, height: ps.height, w, h, gradient: ps.backgroundImage.includes('gradient'), fill, border, shadow, bg: ps.backgroundImage !== 'none' ? ps.backgroundImage.slice(0, 50) : ps.backgroundColor };
  };
  /** The resting fill of a kind: [rgb, token name]. 'inset' -> --surface-inset; 'card' and 'tile' -> --surface. */
  const baseOf = (kind, tokens) => (kind === 'inset' ? [tokens.inset, '--surface-inset'] : [tokens.surface, '--surface']);
  /**
   * Rule failures for a card element: kind 'card' | 'inset' | 'tile', fill
   * 'surface' (the kind's resting fill) | 'hover' | 'selected'. borderGuarded:
   * the border is not judged here (an opened reward tile keeps its rarity
   * border; the rarity-borders line compares it with the snapshot).
   */
  const cardProblems = (el, kind, fill, tokens, borderGuarded = false) => {
    const cs = getComputedStyle(el);
    const out = [];
    const wants = fill === 'hover' ? [[tokens.hover, '--surface-hover']] : fill === 'selected' ? [[tokens.selected, '--surface-selected']] : [baseOf(kind, tokens)];
    const radius = kind === 'card' ? tokens.radiusCard : tokens.radiusInset;
    const bg = rgba(cs.backgroundColor);
    if (!bg || bg[3] !== 1 || !wants.some(([w]) => w && bg.slice(0, 3).join() === w.slice(0, 3).join())) out.push('background-color ' + rgbText(bg) + ', want ' + wants.map(([w, n]) => rgbText(w) + ' (' + n + ')').join(' or '));
    if (cs.backgroundImage !== 'none') out.push('background-image ' + cs.backgroundImage.slice(0, 70));
    const bw = borderGuarded ? [] : SIDES.filter((s) => parseFloat(cs['border' + s + 'Width']) > 0);
    if (bw.length) out.push('border ' + bw.map((s) => s.toLowerCase() + ' ' + cs['border' + s + 'Width']).join(' '));
    if (cs.boxShadow !== 'none') out.push('box-shadow ' + cs.boxShadow.slice(0, 70));
    for (const p of ['::before', '::after']) {
      const b = pseudoBox(el, p);
      if (b) out.push(p + ' draws a box ' + b.width + ' x ' + b.height + ' (' + b.bg + ')');
    }
    const r = CORNERS.map((c) => cs['border' + c + 'Radius']);
    if (r.some((v) => v !== radius)) out.push('radius ' + [...new Set(r)].join('/') + ', want ' + radius);
    return out;
  };
  const tokens = () => {
    const t = {};
    for (const n of ['--surface', '--surface-inset', '--surface-hover', '--surface-selected', '--radius-card', '--radius-inset', '--divider', '--muted', '--text', '--bg']) t[n] = rootVar(n);
    return t;
  };
  const resolved = (spec) => {
    const t = tokens();
    const pick = (n) => hex(t[n]) || hex(spec[n]);
    return {
      raw: t,
      surface: pick('--surface'), inset: pick('--surface-inset'), hover: pick('--surface-hover'), selected: pick('--surface-selected'),
      radiusCard: t['--radius-card'] || spec['--radius-card'], radiusInset: t['--radius-inset'] || spec['--radius-inset'],
      muted: hex(t['--muted']), text: hex(t['--text']), bg: hex(t['--bg']),
    };
  };
  /** The CARDS entry that decides an element (first match), or null. */
  const entryOf = (el, cards) => cards.find((c) => el.matches(c.sel)) || null;
  const heuristic = (el) => {
    const cs = getComputedStyle(el);
    const why = [];
    const textClip = cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text';
    if (cs.backgroundImage.includes('gradient(') && !textClip) why.push('gradient background');
    const sides = SIDES.filter((s) => parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none' && (rgba(cs['border' + s + 'Color']) || [0, 0, 0, 0])[3] > 0);
    const maxR = Math.max(...CORNERS.map((c) => parseFloat(cs['border' + c + 'Radius']) || 0));
    if (sides.length === 4 && maxR >= 6) why.push('4-side border, radius ' + maxR + 'px');
    for (const p of ['::before', '::after']) {
      const b = pseudoBox(el, p);
      if (b && b.position === 'absolute' && b.h >= 0.5 && b.h <= 2.5 && !(b.w < 24) && b.fill) why.push(p + ' ' + b.height + ' strip');
    }
    return why;
  };
  return { rgba, hex, rgbText, contrast, over, rendered, label, path, baseOf, cardProblems, tokens, resolved, entryOf, heuristic, SIDES, CORNERS };
})()`;

/** The page-side inspection; returns plain data. */
const INSPECT = (cfg) => `(() => {
  const L = window.__cards;
  const cfg = ${JSON.stringify(cfg)};
  const T = L.resolved(cfg.spec);
  const all = [...document.querySelectorAll('body *')].filter(L.rendered);
  const out = { tokens: T.raw, cards: [], selected: [], complete: [], excused: [], dividers: [], guard: {}, gaps: [], contrast: [], scrollWidth: document.documentElement.scrollWidth, innerWidth: innerWidth, matched: {} };
  const cardEls = [];
  for (const el of all) {
    const e = L.entryOf(el, cfg.cards);
    if (e) {
      cardEls.push([el, e]);
      out.matched[e.sel] = (out.matched[e.sel] || 0) + 1;
      const p = L.cardProblems(el, e.kind, e.fill || 'surface', T, !!e.borderGuarded);
      if (p.length) out.cards.push({ sel: e.sel, path: L.path(el), problems: p });
      if (e.fill === 'selected') {
        // perceptible: the computed selected fill vs the kind's resting token and vs the hover token
        let bg = L.rgba(getComputedStyle(el).backgroundColor) || [0, 0, 0, 0];
        if (bg[3] < 1) bg = L.over(bg, T.bg || [0, 0, 0, 1]);
        const [rest, restName] = L.baseOf(e.kind, T);
        out.selected.push({ sel: e.sel, path: L.path(el), bg: L.rgbText(bg), restName, vsRest: +L.contrast(bg, rest).toFixed(3), vsHover: +L.contrast(bg, T.hover).toFixed(3) });
      }
      continue;
    }
    const al = cfg.allow.find((a) => el.matches(a.sel));
    if (al) {
      if (cfg.report && L.heuristic(el).length) out.excused.push({ allow: al.sel, label: L.label(el) });
      continue;
    }
    const why = L.heuristic(el);
    if (why.length) out.complete.push({ path: L.path(el), label: L.label(el), why });
  }
  // dividers: 1-3-sided borders on non-card, non-allowed elements inside a card
  const isCard = (el) => cfg.cards.some((c) => el.matches(c.sel));
  const allowed = (el, card) => { for (let e = el; e && e !== card; e = e.parentElement) if (cfg.dividerSkip.some((sel) => e.matches(sel))) return true; return false; };
  const dseen = new Set();
  for (const [card] of cardEls) {
    for (const d of card.querySelectorAll('*')) {
      if (dseen.has(d) || !L.rendered(d) || isCard(d) || allowed(d, card)) continue;
      dseen.add(d);
      // Icon glyphs drawn with borders (the listing chevron) are not dividers: a divider spans a row.
      const box = d.getBoundingClientRect();
      if (box.width < 24 && box.height < 24) continue;
      const cs = getComputedStyle(d);
      const sides = L.SIDES.filter((sd) => parseFloat(cs['border' + sd + 'Width']) > 0 && cs['border' + sd + 'Style'] !== 'none' && (L.rgba(cs['border' + sd + 'Color']) || [0, 0, 0, 0])[3] > 0);
      if (!sides.length || sides.length === 4) continue;
      const want = L.hex(cfg.divider.color);
      const bad = sides.filter((sd) => cs['border' + sd + 'Width'] !== cfg.divider.width || cs['border' + sd + 'Style'] !== cfg.divider.style || (L.rgba(cs['border' + sd + 'Color']) || []).join() !== want.join());
      if (bad.length) out.dividers.push({ path: L.path(d), detail: bad.map((sd) => sd.toLowerCase() + ' ' + cs['border' + sd + 'Width'] + ' ' + cs['border' + sd + 'Style'] + ' ' + L.rgbText(L.rgba(cs['border' + sd + 'Color']))).join(', ') });
    }
  }
  for (const g of cfg.guard) {
    const el = [...document.querySelectorAll(g.sel)].find(L.rendered);
    if (!el) { out.guard[g.sel] = null; continue; }
    out.matched['guard ' + g.sel] = 1;
    const cs = getComputedStyle(el);
    const v = {};
    for (const p of g.props) v[p] = cs.getPropertyValue(p);
    out.guard[g.sel] = v;
  }
  // contrast
  for (const [el, e] of cardEls) {
    let bg = L.rgba(getComputedStyle(el).backgroundColor);
    if (!bg || !T.muted || !T.text) continue;
    if (bg[3] < 1) bg = L.over(bg, T.bg || [0, 0, 0, 1]);
    const m = L.contrast(T.muted, bg);
    const t = L.contrast(T.text, bg);
    if (m < cfg.mutedMin || t < cfg.textMin) out.contrast.push({ sel: e.sel, path: L.path(el), muted: +m.toFixed(2), text: +t.toFixed(2), bg: L.rgbText(bg) });
  }
  // separation: outer cards only
  if (cfg.gaps) {
    const outer = cardEls.filter(([el, e]) => e.kind === 'card' && !cardEls.some(([o]) => o !== el && o.contains(el))).map(([el, e]) => {
      const r = el.getBoundingClientRect();
      return { el, e, top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, right: r.right };
    });
    for (const a of outer) {
      let best = null;
      for (const b of outer) {
        if (b === a || b.top <= a.top || a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const ov = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        if (ov < 0.5 * Math.min(a.right - a.left, b.right - b.left)) continue;
        if (!best || b.top < best.top) best = b;
      }
      if (best && best.top - a.bottom < cfg.minGap) out.gaps.push({ a: L.path(a.el), b: L.label(best.el), gap: +(best.top - a.bottom).toFixed(1) });
    }
  }
  return out;
})()`;

const waitGone = (sel) => `(async () => { for (let i = 0; i < 50; i++) { if (!document.querySelector(${JSON.stringify(sel)})) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()`;

/** Opens the first reward tile of every rarity group in the open package modal; { 'rarity label': border props | null }. */
async function rarityProbe(page) {
  return page.ev(`(async () => {
    const out = {};
    for (const g of document.querySelectorAll('.pkg-modal .store-rarity')) {
      const btn = g.querySelector('.store-item--button');
      if (!btn) continue;
      const key = ([...g.classList].find((c) => c.startsWith('store-rarity--')) || 'store-rarity--?').slice(14) + ' ' + ((g.querySelector('.store-rarity-label') || {}).textContent || '').trim();
      if (!btn.classList.contains('is-open')) btn.click();
      let open = null;
      for (let i = 0; i < 40 && !(open = g.querySelector('.store-item.is-open')); i++) await new Promise((r) => setTimeout(r, 50));
      if (!open) { out[key] = null; continue; }
      ${FREEZE_ANIMATIONS};
      const cs = getComputedStyle(open);
      const v = {};
      for (const p of ${JSON.stringify(BORDER_PROPS)}) v[p] = cs.getPropertyValue(p);
      out[key] = v;
    }
    return out;
  })()`);
}

/** Opens each rank's package modal in turn; { rank: [perk row props] | null }. */
async function rankProbe(page) {
  const out = {};
  for (const name of RANKS) {
    const ok = await page.ev(`(() => { const c = [...document.querySelectorAll('.pkg-card')].find((x) => (x.querySelector('.pkg-name') || {}).textContent?.trim() === ${JSON.stringify(name)}); if (!c) return false; c.click(); return true; })()`);
    if (!ok || !(await page.ev(waitFor('.pkg-modal--rank .store-perk')))) {
      out[name] = null;
      continue;
    }
    await page.ev(FREEZE_ANIMATIONS);
    out[name] = await page.ev(`[...document.querySelectorAll('.pkg-modal--rank .store-perk')].map((el) => { const cs = getComputedStyle(el); const v = {}; for (const p of ${JSON.stringify(RANK_PROPS)}) v[p] = cs.getPropertyValue(p); return v; })`);
    await page.ev("(() => { const b = document.querySelector('.pkg-modal-close'); if (b) b.click(); return true; })()");
    await page.ev(waitGone('.pkg-modal'));
  }
  return out;
}

/** Probe readings of a state, keyed like the guard file ('<state>@<w> rarity <group>' / '<state>@<w> rank <name>'); {} for other states. */
async function probes(page, state, width) {
  const out = {};
  if (state.id === RARITY_PROBE_STATE) for (const [k, v] of Object.entries(await rarityProbe(page))) out[`${state.id}@${width} rarity ${k}`] = v;
  if (state.id === RANK_PROBE_STATE) for (const [k, v] of Object.entries(await rankProbe(page))) out[`${state.id}@${width} rank ${k}`] = v;
  return out;
}

/** Problems comparing probe readings with the snapshot for keys starting with prefix. */
export function probeProblems(got, base, prefix) {
  const out = [];
  const keys = new Set([...Object.keys(got), ...Object.keys(base ?? {})].filter((k) => k.startsWith(prefix)));
  if (!keys.size) out.push(`nothing probed for ${prefix.trim()}`);
  for (const k of [...keys].sort()) {
    const name = k.slice(prefix.length);
    if (!base || !(k in base)) out.push(`${name}: not in the snapshot`);
    else if (!(k in got) || got[k] == null) out.push(`${name}: could not be opened`);
    else if (JSON.stringify(got[k]) !== JSON.stringify(base[k])) {
      const a = [].concat(got[k]);
      const b = [].concat(base[k]);
      const diffs = [];
      if (a.length !== b.length) diffs.push(`${a.length} rows, was ${b.length}`);
      for (let i = 0; i < Math.min(a.length, b.length); i++) for (const p of Object.keys(b[i])) if (a[i][p] !== b[i][p]) diffs.push(`${p} ${JSON.stringify(a[i][p])}, was ${JSON.stringify(b[i][p])}`);
      out.push(`${name}: ${[...new Set(diffs)].join(', ')}`);
    }
  }
  return out;
}

const HOVER_FN = `function (kind, spec) { const L = window.__cards; return L.cardProblems(this, kind, 'hover', L.resolved(spec)); }`;
const PATH_FN = 'function () { return window.__cards.path(this); }';

// ------------------------------------------------------------------ run --

let passed = 0;
let failed = 0;
function check(name, problems) {
  const list = [].concat(problems ?? []).filter(Boolean);
  if (list.length) failed++;
  else passed++;
  console.log(list.length ? `FAIL ${name}: ${list.join('; ')}` : `PASS ${name}`);
}

/** Groups [{key, detail}] as "key xN: detail" lines, most frequent first. */
function grouped(items) {
  const m = new Map();
  for (const { key, detail } of items) {
    const k = `${key} :: ${detail}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => {
    const [key, detail] = k.split(' :: ');
    return `${key} x${n}: ${detail}`;
  });
}

async function openState(b, origin, state, width) {
  const { browserContextId } = await b.send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => b.send(m, p, sessionId);
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
      const r = route(p.request.url, origin, state);
      (r === 'pass'
        ? s('Fetch.continueRequest', { requestId: p.requestId })
        : s('Fetch.fulfillRequest', {
            requestId: p.requestId,
            responseCode: r.status,
            responseHeaders: [{ name: 'Content-Type', value: r.type }, { name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Cache-Control', value: 'no-store' }],
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
  const idle = async (quiet = 400, max = 15_000) => {
    const until = Date.now() + max;
    while (Date.now() < until) {
      if (inflight.size === 0 && Date.now() - lastNet >= quiet) return;
      await sleep(100);
    }
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
    await s('Page.addScriptToEvaluateOnNewDocument', { source: FREEZE(state.time ?? FROZEN_TIME) });
    if (state.init) await s('Page.addScriptToEvaluateOnNewDocument', { source: state.init });
    await s('Page.navigate', { url: `${origin}${state.path}` });
    for (let i = 0; i < 300 && loads === 0; i++) await sleep(100);
    if (!loads) throw new Error(`no load event in 30 s`);
    await idle();
    await ev('document.fonts.ready.then(() => true)');
    await ev(`(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) { scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 80)); } scrollTo({ top: 0, behavior: 'instant' }); return true; })()`);
    await idle();
    if (state.ready && !(await ev(waitFor(state.ready)))) throw new Error(`fixture did not render ${state.ready}`);
    for (const step of state.setup ?? []) {
      if (!(await ev(step))) throw new Error(`setup step failed: ${step.slice(0, 120)}`);
      await idle();
    }
    await ev(`(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) { scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 60)); } return true; })()`);
    await idle();
    await ev(FREEZE_ANIMATIONS);
    await sleep(150);
    await ev(FREEZE_ANIMATIONS);
    await ev(`(window.__cards = ${LIB}, true)`);
    return { s, ev, close };
  } catch (e) {
    await close();
    throw e;
  }
}

/** The computed background of the element, composited over --bg when translucent: 'r,g,b' text and the rgba array. */
const BG_FN = 'function () { const L = window.__cards; const T = L.resolved(' + JSON.stringify(SPEC_TOKENS) + '); let c = L.rgba(getComputedStyle(this).backgroundColor) || [0, 0, 0, 0]; if (c[3] < 1) c = L.over(c, T.bg || [0, 0, 0, 1]); return c; }';
/** Contrast between two rgba arrays (page-independent copy of the in-page formula). */
export function contrastOf(a, b) {
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const hexRgb = (h) => {
  const m = String(h ?? '').trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
};
/** Token-level perceptibility (amendment U9-states) for a { '--surface': '#..', ... } map. */
export function tokenPerceptProblems(tok) {
  const s = hexRgb(tok['--surface']);
  const h = hexRgb(tok['--surface-hover']);
  const sel = hexRgb(tok['--surface-selected']);
  const out = [];
  for (const [n, c] of [['--surface', s], ['--surface-hover', h], ['--surface-selected', sel]]) if (!c) out.push(`${n} is ${JSON.stringify(tok[n] ?? '')}, not a #rrggbb colour`);
  if (out.length) return out;
  const r = (a, b) => contrastOf(a, b).toFixed(3);
  if (contrastOf(h, s) < PERCEPT.hoverVsRest) out.push(`--surface-hover vs --surface ${r(h, s)}:1, want >= ${PERCEPT.hoverVsRest}`);
  if (contrastOf(sel, s) < PERCEPT.selectedVsRest) out.push(`--surface-selected vs --surface ${r(sel, s)}:1, want >= ${PERCEPT.selectedVsRest}`);
  if (contrastOf(sel, h) < PERCEPT.selectedVsHover) out.push(`--surface-selected vs --surface-hover ${r(sel, h)}:1, want >= ${PERCEPT.selectedVsHover}`);
  return out;
}

/** Puts the page in keyboard modality (a real Tab key press), so a scripted focus() matches :focus-visible. */
async function keyboardModality(page) {
  for (const type of ['keyDown', 'keyUp']) await page.s('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
}
const FOCUS_FN = `function (focusSel) {
  const target = focusSel === ':scope' ? this : this.querySelector(focusSel);
  if (!target) return { problems: ['focus target ' + focusSel + ' not found inside the card'] };
  target.focus({ preventScroll: true });
  return { pending: true };
}`;
const FOCUS_READ_FN = `function (focusSel, spec) {
  const L = window.__cards;
  const T = L.resolved(spec);
  const target = focusSel === ':scope' ? this : this.querySelector(focusSel);
  const out = [];
  if (document.activeElement !== target) out.push('focus did not land on ' + L.label(target));
  else if (!target.matches(':focus-visible')) out.push(L.label(target) + ' is focused but not :focus-visible');
  const ts = getComputedStyle(target);
  if (ts.outlineStyle === 'none' || !(parseFloat(ts.outlineWidth) > 0)) out.push('no focus ring: ' + L.label(target) + ' outline ' + ts.outlineStyle + ' ' + ts.outlineWidth);
  const bg = L.rgba(getComputedStyle(this).backgroundColor);
  if (!bg || bg[3] !== 1 || bg.slice(0, 3).join() !== T.hover.slice(0, 3).join()) out.push('background-color ' + L.rgbText(bg) + ' while focused, want ' + L.rgbText(T.hover) + ' (--surface-hover)');
  target.blur();
  return { problems: out };
}`;

/**
 * hover: CARDS entries with hover: true, first 2 rendered matches decided by
 * that entry, forced into :hover. Returns { hover, focus, percept } items
 * ({ key, detail }).
 */
async function hoverProblems(page, width) {
  const out = { hover: [], focus: [], percept: [] };
  const { root } = await page.s('DOM.getDocument', { depth: 0 });
  await page.s('CSS.enable');
  let modal = false;
  for (const c of CARDS.filter((x) => x.hover)) {
    const { nodeIds } = await page.s('DOM.querySelectorAll', { nodeId: root.nodeId, selector: c.sel });
    let n = 0;
    for (const nodeId of nodeIds) {
      if (n >= 2) break;
      const { object } = await page.s('DOM.resolveNode', { nodeId });
      const call = async (functionDeclaration, args = []) => (await page.s('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration, arguments: args.map((value) => ({ value })), returnByValue: true, awaitPromise: true })).result.value;
      const vis = await call('function () { return window.__cards.rendered(this) && window.__cards.entryOf(this, ' + JSON.stringify(CARDS) + ')?.sel === ' + JSON.stringify(c.sel) + '; }');
      if (!vis) continue;
      n++;
      const rest = await call(BG_FN);
      await page.s('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
      await page.ev(FREEZE_ANIMATIONS);
      await sleep(30);
      await page.ev(FREEZE_ANIMATIONS);
      const probs = await call(HOVER_FN, [c.kind, SPEC_TOKENS]);
      const hov = await call(BG_FN);
      await page.s('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
      await page.ev(FREEZE_ANIMATIONS);
      for (const prob of probs ?? []) out.hover.push({ key: `${c.sel}:hover`, detail: prob });
      const ratio = contrastOf(hov, rest);
      if (ratio < PERCEPT.hoverVsRest) out.percept.push({ key: `${c.sel}:hover`, detail: `hover fill rgb(${hov.slice(0, 3).join(', ')}) vs resting rgb(${rest.slice(0, 3).join(', ')}) ${ratio.toFixed(3)}:1, want >= ${PERCEPT.hoverVsRest}` });
      if (c.focus) {
        if (!modal) {
          await keyboardModality(page);
          modal = true;
        }
        const f = await call(FOCUS_FN, [c.focus]);
        if (f?.pending) {
          await page.ev(FREEZE_ANIMATIONS);
          await sleep(30);
          await page.ev(FREEZE_ANIMATIONS);
          const r = await call(FOCUS_READ_FN, [c.focus, SPEC_TOKENS]);
          for (const prob of r?.problems ?? []) out.focus.push({ key: `${c.sel} focus ${c.focus}`, detail: prob });
        } else for (const prob of f?.problems ?? []) out.focus.push({ key: `${c.sel} focus ${c.focus}`, detail: prob });
      }
    }
  }
  return out;
}

/** perceptible items for the selected/open cards INSPECT measured. */
function selectedPercept(r) {
  const out = [];
  for (const s of r.selected) {
    if (s.vsRest < PERCEPT.selectedVsRest) out.push({ key: s.sel, detail: `selected fill ${s.bg} vs ${s.restName} ${s.vsRest}:1, want >= ${PERCEPT.selectedVsRest}` });
    if (s.vsHover < PERCEPT.selectedVsHover) out.push({ key: s.sel, detail: `selected fill ${s.bg} vs --surface-hover ${s.vsHover}:1, want >= ${PERCEPT.selectedVsHover}` });
  }
  return out;
}

async function withBrowser(dist, fn) {
  const chrome = findChrome();
  if (!chrome) return check('chrome-found', ['no Chrome: set CHROME to chrome.exe']);
  if (!existsSync(join(dist, 'index.html'))) return check('dist-built', [`${dist} has no index.html: build first (npm run build)`]);
  const port = await freePort();
  const preview = spawn(process.execPath, [VITE, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--outDir', dist], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let log = '';
  preview.stdout.on('data', (d) => (log += d));
  preview.stderr.on('data', (d) => (log += d));
  const origin = `http://127.0.0.1:${port}`;
  const profile = mkdtempSync(join(tmpdir(), 'card-check-'));
  let b = null;
  try {
    if (!(await waitReady(`${origin}/`, 30_000))) return check('preview-server', [`vite preview did not answer on ${origin}: ${JSON.stringify(log.slice(-300))}`]);
    b = await launchChrome(chrome, profile);
    await fn(b, origin);
  } finally {
    if (b) await b.close();
    preview.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

const cfgFor = (width, report = false) => ({ report, spec: SPEC_TOKENS, cards: CARDS.map(({ sel, kind, fill, borderGuarded }) => ({ sel, kind, fill, borderGuarded })), allow: ALLOW.map(({ sel }) => ({ sel })), guard: GUARD.map(({ sel, props }) => ({ sel, props })), gaps: width === 400, minGap: MIN_GAP, divider: DIVIDER, dividerSkip: DIVIDER_SKIP, mutedMin: MUTED_MIN, textMin: TEXT_MIN });

function selectedStates(args) {
  const i = args.indexOf('--only');
  const only = i >= 0 ? args[i + 1].split(',') : null;
  return STATES.filter((s) => !only || only.includes(s.id));
}
function selectedWidths(args) {
  const i = args.indexOf('--width');
  return i >= 0 ? [Number(args[i + 1])] : WIDTHS;
}

async function runChecks(dist, args) {
  const guardBase = existsSync(GUARD_FILE) ? JSON.parse(readFileSync(GUARD_FILE, 'utf-8')) : null;
  const matched = new Map(); // sel -> Set(stateId)
  const tokenProblems = new Set();
  let lastTokens = null;
  const report = args.includes('--allow-report');
  const excused = new Map(); // 'allow <- element label' -> Set(state@width)
  const states = selectedStates(args);
  await withBrowser(dist, async (b, origin) => {
    for (const state of states)
      for (const width of selectedWidths(args).filter((w) => !state.widths || state.widths.includes(w))) {
        const id = `${state.id}@${width}`;
        let page;
        try {
          page = await openState(b, origin, state, width);
        } catch (e) {
          check(`${id} page`, [String(e?.message ?? e)]);
          continue;
        }
        try {
          const r = await page.ev(INSPECT(cfgFor(width, report)));
          for (const e of r.excused) {
            const k = `${e.allow}  <-  ${e.label}`;
            if (!excused.has(k)) excused.set(k, new Set());
            excused.get(k).add(id);
          }
          for (const [n, want] of Object.entries(SPEC_TOKENS)) {
            const got = (r.tokens[n] ?? '').trim();
            if (got.toLowerCase() !== want) tokenProblems.add(`${n} is ${got ? JSON.stringify(got) : 'not defined'}, want ${want}`);
          }
          for (const sel of Object.keys(r.matched)) {
            if (!matched.has(sel)) matched.set(sel, new Set());
            matched.get(sel).add(state.id);
          }
          check(`${id} cards`, grouped(r.cards.flatMap((c) => c.problems.map((p) => ({ key: c.sel, detail: p })))));
          const hov = await hoverProblems(page, width);
          check(`${id} hover`, grouped(hov.hover));
          check(`${id} focus`, grouped(hov.focus));
          check(`${id} perceptible`, grouped([...hov.percept, ...selectedPercept(r)]));
          lastTokens = r.tokens;
          check(`${id} dividers`, grouped(r.dividers.map((d) => ({ key: d.path.split(' > ').slice(-2).join(' > '), detail: `${d.detail}, want ${DIVIDER.width} ${DIVIDER.style} ${DIVIDER.color}` }))));
          check(`${id} completeness`, grouped(r.complete.map((c) => ({ key: c.path, detail: c.why.join(', ') }))).map((l) => `${l} (not in CARDS or ALLOW)`));
          const gp = [];
          for (const g of GUARD) {
            const key = `${state.id}@${width} ${g.sel}`;
            if (!(g.states ?? []).includes(state.id)) continue;
            const got = r.guard[g.sel];
            if (!guardBase) gp.push(`no ${GUARD_FILE}: run --snapshot-guard on the pre-U9 build`);
            else if (!(key in guardBase.entries)) gp.push(`${key} not in the guard snapshot`);
            else if (got == null) gp.push(`${g.sel} not rendered (snapshot has it)`);
            else
              for (const [p, v] of Object.entries(guardBase.entries[key]))
                if (got[p] !== v) gp.push(`${g.sel} ${p} is ${JSON.stringify(got[p])}, was ${JSON.stringify(v)}`);
          }
          check(`${id} guard`, [...new Set(gp)]);
          check(`${id} overflow`, r.scrollWidth > r.innerWidth ? [`scrollWidth ${r.scrollWidth} > ${r.innerWidth}`] : []);
          if (width === 400) check(`${id} separation`, r.gaps.map((g) => `${g.a} then ${g.b}: gap ${g.gap}px, want >= ${MIN_GAP}`));
          check(`${id} contrast`, grouped(r.contrast.map((c) => ({ key: c.sel, detail: `muted ${c.muted}:1 (>= ${MUTED_MIN}), text ${c.text}:1 (>= ${TEXT_MIN}) on ${c.bg}` }))));
          if (state.id === RARITY_PROBE_STATE || state.id === RANK_PROBE_STATE) {
            const kind = state.id === RARITY_PROBE_STATE ? 'rarity' : 'rank';
            const got = await probes(page, state, width);
            check(`${id} ${kind === 'rarity' ? 'rarity-borders' : 'rank-tints'}`, guardBase?.probes ? probeProblems(got, guardBase.probes, `${id} ${kind} `) : ['no probes in the guard snapshot: run --snapshot-guard on the pre-U9 build']);
          }
        } catch (e) {
          check(`${id} inspect`, [String(e?.message ?? e)]);
        } finally {
          await page.close();
        }
      }
  });
  check('tokens', [...tokenProblems]);
  check('tokens-perceptible', lastTokens ? tokenPerceptProblems(lastTokens) : ['no page state was read']);
  if (states.length === STATES.length) {
    const cov = [];
    for (const c of CARDS) if (c.states.length && !c.states.some((st) => matched.get(c.sel)?.has(st))) cov.push(`CARDS ${c.sel} matched nothing on ${c.states.join(', ')}`);
    for (const g of GUARD) if (!g.states.some((st) => matched.get(`guard ${g.sel}`)?.has(st))) cov.push(`GUARD ${g.sel} matched nothing on ${g.states.join(', ')}`);
    check('coverage', cov);
  }
  if (report) {
    console.log('ALLOW report: every element the heuristic flagged that an ALLOW entry excused');
    for (const [k, ids] of [...excused].sort()) console.log(`  ${k}  (${ids.size} page states: ${[...ids].slice(0, 6).join(' ')}${ids.size > 6 ? ' ...' : ''})`);
  }
}

/**
 * --snapshot-guard --add: adds the GUARD entries the snapshot does not have
 * yet and leaves every existing entry and probe exactly as it is (the file is
 * re-serialised with the same JSON.stringify(_, null, 2), so untouched entries
 * stay byte-identical). The added keys are listed under "added".
 */
async function snapshotGuardAdd(dist) {
  const base = JSON.parse(readFileSync(GUARD_FILE, 'utf-8'));
  const missing = GUARD.flatMap((g) => g.states.flatMap((st) => WIDTHS.filter((w) => !STATES.find((x) => x.id === st).widths || STATES.find((x) => x.id === st).widths.includes(w)).map((w) => ({ g, st, w, key: `${st}@${w} ${g.sel}` })))).filter((m) => !(m.key in base.entries));
  const got = {};
  await withBrowser(dist, async (b, origin) => {
    for (const st of [...new Set(missing.map((m) => m.st))]) {
      const state = STATES.find((x) => x.id === st);
      for (const w of [...new Set(missing.filter((m) => m.st === st).map((m) => m.w))]) {
        const page = await openState(b, origin, state, w);
        try {
          const r = await page.ev(INSPECT(cfgFor(w)));
          for (const m of missing.filter((x) => x.st === st && x.w === w)) {
            const v = r.guard[m.g.sel];
            check(`snapshot add ${m.key}`, v ? [] : ['not rendered']);
            if (v) got[m.key] = v;
          }
        } finally {
          await page.close();
        }
      }
    }
  });
  if (failed) return console.log('not written: an added entry did not render');
  const rev = (await import('node:child_process')).spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf-8' }).stdout.trim();
  const out = { ...base, entries: { ...base.entries, ...got }, added: [...(base.added ?? []), { capturedFrom: rev, keys: Object.keys(got) }] };
  writeFileSync(GUARD_FILE, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`added ${Object.keys(got).length} entries to ${GUARD_FILE}`);
}

async function snapshotGuard(dist, args) {
  if (args.includes('--add')) return snapshotGuardAdd(dist);
  const entries = {};
  const probeEntries = {};
  await withBrowser(dist, async (b, origin) => {
    const ids = new Set([...GUARD.flatMap((g) => g.states), RARITY_PROBE_STATE, RANK_PROBE_STATE]);
    for (const state of STATES.filter((s) => ids.has(s.id)))
      for (const width of WIDTHS.filter((w) => !state.widths || state.widths.includes(w))) {
        const page = await openState(b, origin, state, width);
        try {
          const r = await page.ev(INSPECT(cfgFor(width)));
          for (const g of GUARD) {
            if (!g.states.includes(state.id)) continue;
            const v = r.guard[g.sel];
            check(`snapshot ${state.id}@${width} ${g.sel}`, v ? [] : ['not rendered']);
            if (v) entries[`${state.id}@${width} ${g.sel}`] = v;
          }
          for (const [k, v] of Object.entries(await probes(page, state, width))) {
            check(`snapshot ${k}`, v ? [] : ['could not be opened']);
            if (v) probeEntries[k] = v;
          }
        } finally {
          await page.close();
        }
      }
  });
  const rev = (await import('node:child_process')).spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf-8' }).stdout.trim();
  writeFileSync(GUARD_FILE, `${JSON.stringify({ capturedFrom: rev, note: 'Computed styles the U9 card restyle must not change (owner kept these). Regenerate only with orchestrator sign-off. probes: the store colour cues the owner kept (U9 round 2), per rarity and per rank.', entries, probes: probeEntries }, null, 2)}\n`);
  console.log(`wrote ${GUARD_FILE} (${Object.keys(entries).length} entries)`);
}

async function discover(dist, args) {
  await withBrowser(dist, async (b, origin) => {
    for (const state of selectedStates(args))
      for (const width of selectedWidths(args).filter((w) => !state.widths || state.widths.includes(w))) {
        let page;
        try {
          page = await openState(b, origin, state, width);
        } catch (e) {
          console.log(`== ${state.id}@${width} FAILED ${e.message}`);
          continue;
        }
        const r = await page.ev(`(() => { const L = window.__cards; const m = new Map(); for (const el of document.querySelectorAll('body *')) { if (!L.rendered(el)) continue; const w = L.heuristic(el); if (!w.length) continue; const k = L.path(el).split(' > ').slice(-2).join(' > ') + '  [' + w.join(', ') + ']'; m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()]; })()`);
        console.log(`== ${state.id}@${width}`);
        for (const [k, n] of r) console.log(`  ${n}x ${k}`);
        await page.close();
      }
  });
}

/**
 * --self-test: plants elements in a real page over CDP and checks each rule
 * catches them (and that the allowlist excuses only what it says). Proves the
 * check is not green by construction.
 */
async function selfTest(dist) {
  const PLANT = String.raw`(() => {
    const main = document.querySelector('main');
    const add = (html, parent = main) => { const t = document.createElement('template'); t.innerHTML = html.trim(); const el = t.content.firstElementChild; parent.appendChild(el); return el; };
    const st = document.createElement('style');
    st.textContent = '.planted-strip{position:relative;padding:20px}.planted-strip::before,div.card.planted-bad::before{content:"";display:block;position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,#c77dff,transparent)}div.card.planted-good::before,div.card.planted-good::after,div.card.planted-lowc::before{content:none}';
    document.head.appendChild(st);
    add('<div class="planted-box" style="border:1px solid #2a1e44;border-radius:12px;background:linear-gradient(#1d1636,#16102a);padding:20px">box</div>');
    add('<div class="planted-strip">strip</div>');
    add('<div class="planted-border" style="border:1px solid #2a1e44;border-radius:8px;padding:20px">border only</div>');
    add('<div class="planted-sharp" style="border:1px solid #2a1e44;border-radius:4px;padding:20px">radius 4</div>');
    add('<div class="planted-in-band" style="border:1px solid #2a1e44;border-radius:12px;background:linear-gradient(#1d1636,#16102a)">in band</div>', document.querySelector('.claim-band'));
    add('<div class="planted-in-banner" style="border:1px solid #2a1e44;border-radius:12px">in banner</div>', document.querySelector('.mode-banner'));
    // Round 3: controls are allowed by class; a bare <button> shaped like a card is judged.
    add('<button class="pkg-modal-close planted-control" style="border:1px solid #2a1e44;border-radius:12px;background:linear-gradient(#1d1636,#16102a)">control</button>');
    add('<button class="planted-button" style="border:1px solid #2a1e44;border-radius:12px;background:linear-gradient(#1d1636,#16102a)">button</button>');
    add('<button class="planted-card-button" style="border:0;border-radius:10px;background:linear-gradient(#1d1636,#16102a);padding:20px">card-shaped button</button>');
    // Modal frames carry .card but are chrome: neither judged as cards nor flagged.
    for (const c of ['modal-card', 'type-modal', 'slot-cabinet', 'pkg-modal']) add('<div class="' + c + ' card planted-frame-' + c + '" style="display:block;position:relative;inset:auto;transform:none;opacity:1;visibility:visible;width:200px;height:60px;background:linear-gradient(#1d1636,#16102a);border:1px solid #2a1e44;border-radius:12px">frame</div>');
    add('<div class="card planted-good" style="background:#150f27;border:0;border-radius:10px;box-shadow:none;margin:20px 0;color:#f3ecff">good card<div class="planted-div-ok" style="border-bottom:1px solid #221838">row</div><div class="planted-div-bad" style="border-bottom:1px solid #2a1e44">row</div></div>');
    add('<div class="card planted-bad" style="background:linear-gradient(#1d1636,#16102a);border:1px solid #2a1e44;border-radius:12px;box-shadow:0 0 8px #000;margin:0;position:relative">bad card</div>');
    add('<div class="card planted-lowc" style="background:#9a93a8;border:0;border-radius:10px;margin:0">low contrast</div>');
    add('<div class="planted-wide" style="width:640px;height:4px"></div>');
    return true;
  })()`;
  await withBrowser(dist, async (b, origin) => {
    for (const width of [400, 1280]) {
      const page = await openState(b, origin, STATES.find((s) => s.id === 'home'), width);
      try {
        await page.ev(PLANT);
        await page.ev(FREEZE_ANIMATIONS);
        const r = await page.ev(INSPECT(cfgFor(width, true)));
        const flagged = (cls) => r.complete.some((c) => c.label.includes(cls));
        const cardProb = (cls) => r.cards.filter((c) => c.path.endsWith(cls) || c.path.includes(cls + ' ') || c.path.split(' > ').pop().includes(cls)).flatMap((c) => c.problems);
        const w = `@${width}`;
        check(`self ${w} completeness flags a bordered gradient box`, flagged('planted-box') ? [] : ['not flagged']);
        check(`self ${w} completeness flags a ::before hairline strip`, r.complete.some((c) => c.label.includes('planted-strip') && c.why.some((x) => x.startsWith('::before'))) ? [] : ['not flagged']);
        check(`self ${w} completeness flags a 4-side border with radius 8px`, flagged('planted-border') ? [] : ['not flagged']);
        check(`self ${w} completeness ignores radius 4px (documented threshold)`, flagged('planted-sharp') ? ['flagged'] : []);
        check(`self ${w} the claim-band allowance does not cover a box inside it`, flagged('planted-in-band') ? [] : ['swallowed by ALLOW']);
        check(`self ${w} the banner allowance does not cover a box inside it`, flagged('planted-in-banner') ? [] : ['swallowed by ALLOW']);
        // Round 3 (reviewer F5): the blanket `button` allowance is gone. Was: "a control styled like a card is
        // excused (ALLOW button)" with a bare <button>; now only the site's control classes are excused.
        check(`self ${w} a control (site button class) styled like a card is excused`, !flagged('planted-control') && r.excused.some((e) => e.label.includes('planted-control')) ? [] : ['not excused as a control']);
        check(`self ${w} a bare <button> with a border and gradient is flagged (no blanket button allowance)`, flagged('planted-button') ? [] : ['not flagged']);
        check(`self ${w} a card-shaped <button> with a gradient is flagged`, r.complete.some((c) => c.label.includes('planted-card-button') && c.why.includes('gradient background')) ? [] : ['not flagged']);
        for (const c of ['modal-card', 'type-modal', 'slot-cabinet', 'pkg-modal']) {
          const cls = 'planted-frame-' + c;
          check(`self ${w} a .${c}.card modal frame is chrome: not judged as a card, excused`, [
            r.cards.some((x) => x.path.split(' > ').pop().includes(cls)) ? 'judged as a card' : null,
            flagged(cls) ? 'flagged by completeness' : null,
            r.excused.some((e) => e.label.includes(cls)) ? null : 'not in the allow report (not rendered?)',
          ]);
        }
        check(`self ${w} a compliant .card has no card problems`, cardProb('planted-good').length ? cardProb('planted-good') : []);
        const bad = cardProb('planted-bad').join(' | ');
        check(`self ${w} a frosted .card fails every rule`, ['background-color', 'background-image', 'border top 1px', 'box-shadow', '::before draws a box', 'radius 12px'].filter((n) => !bad.includes(n)).map((n) => `missing "${n}" in ${bad}`));
        check(`self ${w} dividers: #221838 passes, #2a1e44 fails`, [r.dividers.some((d) => d.path.includes('planted-div-bad')) ? null : 'bad divider not reported', r.dividers.some((d) => d.path.includes('planted-div-ok')) ? 'good divider reported' : null]);
        check(`self ${w} contrast fails on a light card`, r.contrast.some((c) => c.path.includes('planted-lowc')) ? [] : ['not reported']);
        check(`self ${w} overflow is reported`, r.scrollWidth > r.innerWidth || width > 640 ? [] : [`scrollWidth ${r.scrollWidth}`]);
        if (width === 400) check(`self ${w} separation: cards stacked with no gap are reported`, r.gaps.some((g) => g.a.includes('planted-bad') || g.a.includes('planted-good')) ? [] : [`gaps: ${JSON.stringify(r.gaps).slice(0, 300)}`]);
      } finally {
        await page.close();
      }
    }
    // Round 2: the store colour cues. Readings before a plant are the baseline,
    // so these hold on any build.
    const st = (id) => STATES.find((x) => x.id === id);
    const addStyle = (css) => `(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); return true; })()`;
    {
      const page = await openState(b, origin, st(RARITY_PROBE_STATE), 1280);
      try {
        const before = await probes(page, st(RARITY_PROBE_STATE), 1280);
        check('self rarity probe opens a tile in several rarity groups', Object.values(before).filter(Boolean).length >= 3 ? [] : [`got ${JSON.stringify(Object.keys(before))}`]);
        await page.ev(addStyle('.store-item--button.is-open{border-color:#2a1e44 !important}'));
        const after = await probes(page, st(RARITY_PROBE_STATE), 1280);
        const p = probeProblems(after, before, `${RARITY_PROBE_STATE}@1280 rarity `);
        check('self a non-rarity border on an opened reward tile fails rarity-borders', p.length && p.every((x) => x.includes('border-top-color')) ? [] : [`problems: ${p.join(' | ') || 'none'}`]);
        await page.ev(addStyle('.store-item--button.is-open{background-image:linear-gradient(#1d1636,#16102a) !important;box-shadow:0 0 6px #000 !important}.store-item:not(.is-open){border:1px solid #ff0000 !important}'));
        await page.ev(FREEZE_ANIMATIONS);
        const r = await page.ev(INSPECT(cfgFor(1280)));
        const open = r.cards.filter((c) => c.sel === '.store-item.is-open').flatMap((c) => c.problems).join(' | ');
        const shut = r.cards.filter((c) => c.sel === '.store-item' || c.sel === '.store-item.store-item--button').flatMap((c) => c.problems).join(' | ');
        check('self an opened reward tile still fails gradient and shadow (border not judged there)', open.includes('background-image') && open.includes('box-shadow') && !open.includes('border ') ? [] : [`opened tile problems: ${open}`]);
        check('self a closed reward tile with a border still fails cards', shut.includes('border top 1px') ? [] : [`closed tile problems: ${shut}`]);
      } finally {
        await page.close();
      }
    }
    {
      const page = await openState(b, origin, st(RANK_PROBE_STATE), 1280);
      try {
        const before = await probes(page, st(RANK_PROBE_STATE), 1280);
        check('self rank probe opens every rank modal', RANKS.every((n) => before[`${RANK_PROBE_STATE}@1280 rank ${n}`]) ? [] : [`got ${JSON.stringify(Object.keys(before))}`]);
        await page.ev(addStyle('.pkg-modal--rank .store-perk{background:#150f27 !important}'));
        const after = await probes(page, st(RANK_PROBE_STATE), 1280);
        const p = probeProblems(after, before, `${RANK_PROBE_STATE}@1280 rank `);
        check('self flattening the rank perk tint fails rank-tints', p.length === RANKS.length && p.every((x) => x.includes('background-image')) ? [] : [`problems: ${p.join(' | ') || 'none'}`]);
      } finally {
        await page.close();
      }
    }
    // Round 3 (amendment U9-states): perceptibility and focus. Each block first
    // plants a compliant version (so it holds on any build), then breaks one thing.
    const items = (list, key) => list.filter((x) => x.key.startsWith(key)).map((x) => x.detail);
    {
      const page = await openState(b, origin, st('store'), 1280);
      try {
        await page.ev(addStyle(':root{--surface:#150f27!important;--surface-hover:#21193c!important;--surface-selected:#2c214f!important}.pkg-card{background:#150f27!important;transition:none!important}.pkg-card:hover,.pkg-card:focus-visible{background:#21193c!important}.pkg-card:focus-visible{outline:2px solid #c77dff!important}'));
        let h = await hoverProblems(page, 1280);
        check('self store: a compliant hover and focus on .pkg-card pass', [...items(h.hover, '.pkg-card'), ...items(h.percept, '.pkg-card'), ...items(h.focus, '.pkg-card')]);
        // hover too faint: the token itself is the round-1 value, so the fill rule (which follows :root) is satisfied
        await page.ev(addStyle(':root{--surface-hover:#1a1330!important}.pkg-card:hover,.pkg-card:focus-visible{background:#1a1330!important}'));
        h = await hoverProblems(page, 1280);
        const faint = items(h.percept, '.pkg-card');
        check('self store: a hover fill too faint (1.044:1) fails perceptible, not the fill rule', faint.length && faint.every((x) => x.includes('want >= 1.1')) && !items(h.hover, '.pkg-card').length ? [] : [`percept: ${faint.join(' | ') || 'none'}; hover: ${items(h.hover, '.pkg-card').join(' | ')}`]);
        await page.ev(addStyle(':root{--surface-hover:#21193c!important}.pkg-card:hover,.pkg-card:focus-visible{background:#21193c!important}.pkg-card:focus-visible{outline:none!important}'));
        h = await hoverProblems(page, 1280);
        check('self store: focus without a ring fails focus', items(h.focus, '.pkg-card').some((x) => x.startsWith('no focus ring')) ? [] : [`focus: ${items(h.focus, '.pkg-card').join(' | ') || 'none'}`]);
        await page.ev(addStyle('.pkg-card:focus-visible{outline:2px solid #c77dff!important;background:#150f27!important}'));
        h = await hoverProblems(page, 1280);
        const nofill = items(h.focus, '.pkg-card');
        check('self store: focus with the ring but no hover fill fails focus', nofill.length && nofill.every((x) => x.startsWith('background-color')) ? [] : [`focus: ${nofill.join(' | ') || 'none'}`]);
      } finally {
        await page.close();
      }
    }
    {
      // A card whose focus lands on a control inside it (the FAQ question) can satisfy the rule.
      const page = await openState(b, origin, st('faq-open'), 1280);
      try {
        await page.ev(addStyle(':root{--surface-hover:#21193c!important}.faq-item{background:#150f27!important;transition:none!important}.faq-item:hover,.faq-item:has(.faq-question:focus-visible){background:#21193c!important}.faq-question:focus-visible{outline:2px solid #c77dff!important}'));
        let h = await hoverProblems(page, 1280);
        check('self faq: focus on the question with a ring and the item on the hover fill passes', items(h.focus, '.faq-item'));
        await page.ev(addStyle('.faq-item:has(.faq-question:focus-visible){background:#150f27!important}'));
        h = await hoverProblems(page, 1280);
        check('self faq: the item without the hover fill while its question is focused fails focus', items(h.focus, '.faq-item').some((x) => x.startsWith('background-color')) ? [] : [`focus: ${items(h.focus, '.faq-item').join(' | ') || 'none'}`]);
      } finally {
        await page.close();
      }
    }
    {
      const page = await openState(b, origin, st('auctions-pool'), 1280);
      try {
        await page.ev(addStyle(':root{--surface:#150f27!important;--surface-hover:#21193c!important;--surface-selected:#2c214f!important}.pool-card.selected{background:var(--surface-selected)!important}'));
        let r = await page.ev(INSPECT(cfgFor(1280)));
        check('self pool: a compliant selected card passes perceptible', [r.selected.some((x) => x.sel === '.pool-card.selected') ? null : 'selected card not measured', ...items(selectedPercept(r), '.pool-card.selected')]);
        await page.ev(addStyle(':root{--surface-selected:#21193c!important}'));
        r = await page.ev(INSPECT(cfgFor(1280)));
        const same = items(selectedPercept(r), '.pool-card.selected');
        check('self pool: selected equal to hover fails perceptible (vs --surface-hover)', same.some((x) => x.includes('vs --surface-hover 1:1')) && !r.cards.some((c) => c.sel === '.pool-card.selected') ? [] : [`percept: ${same.join(' | ') || 'none'}; cards: ${JSON.stringify(r.cards.filter((c) => c.sel === '.pool-card.selected'))}`]);
      } finally {
        await page.close();
      }
    }
  });
  // Pure: the token-level floors.
  check('self tokens-perceptible: the spec tokens pass', tokenPerceptProblems(SPEC_TOKENS));
  const tp = (o) => tokenPerceptProblems({ ...SPEC_TOKENS, ...o });
  check('self tokens-perceptible: the round-1 hover #1a1330 fails', tp({ '--surface-hover': '#1a1330' }).some((x) => x.startsWith('--surface-hover vs --surface 1.044')) ? [] : [JSON.stringify(tp({ '--surface-hover': '#1a1330' }))]);
  check('self tokens-perceptible: selected equal to hover fails', tp({ '--surface-selected': '#21193c' }).some((x) => x.startsWith('--surface-selected vs --surface-hover 1.000')) ? [] : [JSON.stringify(tp({ '--surface-selected': '#21193c' }))]);
  check('self tokens-perceptible: a missing token fails', tp({ '--surface-selected': '' }).length ? [] : ['passed']);
}

async function main() {
  const args = process.argv.slice(2);
  const di = args.indexOf('--dist');
  const dist = resolve(di >= 0 ? args[di + 1] : join(ROOT, 'dist'));
  if (args.includes('--discover')) return discover(dist, args);
  if (args.includes('--self-test')) await selfTest(dist);
  else if (args.includes('--snapshot-guard')) await snapshotGuard(dist, args);
  else await runChecks(dist, args);
  console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.log(`FAIL card-style-check: ${e?.stack ?? e}`);
    console.log('RESULT: FAIL 1 of 1');
    process.exitCode = 1;
  });
}
