#!/usr/bin/env node
// Self-test for the post-build checker: proves every check can pass and that
// each one fails on the defect it exists for. Builds a fake dist/ in a temp
// directory (no site build needed) and runs the checker on it as a child
// process, exactly as `node tools/check_site.mjs <dist>` would be run.
//
//   node test/check_site.test.mjs
//
// The checker is looked up at tools/check_site.mjs first, then test/check_site.mjs.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = [join(ROOT, 'tools', 'check_site.mjs'), join(ROOT, 'test', 'check_site.mjs')].find(existsSync);

const NET = 'Chromabit Network';
const HOME_TITLE = 'Chromabit Network | Ranked PVP and Economy SMP for Java + Bedrock';
const HOME_DESC =
  'Chromabit is a Minecraft network for Java and Bedrock: ranked kit PVP on one shared ladder, and a survival server with a player-run economy. Join at play.chromabit.us.';
const SOCIAL_DESC = 'Ranked kit PVP and a player-run economy SMP for Java and Bedrock. Join at play.chromabit.us';
const OG = 'https://chromabit.us/og-preview.png';
const DISCORD = JSON.parse(readFileSync(join(ROOT, 'src', 'config.json'), 'utf-8')).discord;

// U3: the landing page and /smp/ as the spec describes them, using the data-*
// hooks the checker asserts. Each fragment is a named constant so the cases
// below can plant one defect by replacing an exact string.
// U4: the nav on every page is HOME PVP STORE AUCTIONS FAQ with a [data-beta]
// marker in the PVP link, and every footer links /pvp/ (the U3 navs had
// HOME STORE AUCTIONS and HOME STORE; the U3 cases still find their strings).
const NAV = '<header class="site-nav"><a href="/" class="site-nav-brand"><img alt="Chromabit" src="/logo.png"><span>CHROMABIT</span></a><ul><li><a href="/">HOME</a></li><li><a href="/pvp/">PVP <span class="nav-beta" data-beta>BETA</span></a></li><li><a href="/store/">STORE</a></li><li><a href="/auctions/">AUCTIONS</a></li><li><a href="/faq/">FAQ</a></li></ul></header>';
const NAV_PLAIN = '<header class="site-nav"><a href="/" class="site-nav-brand">CHROMABIT</a><a href="/">HOME</a><a href="/pvp/">PVP<span data-beta>BETA</span></a><a href="/store/">STORE</a><a href="/auctions/">AUCTIONS</a><a href="/faq/">FAQ</a></header>';
const HERO_HEAD =
  '<div class="logo-wrap"><a href="/" aria-label="Back to Chromabit home"><img class="logo" src="/server-icon.png" alt="Chromabit logo"></a></div>' +
  '<p class="section-eyebrow">MINECRAFT NETWORK &middot; JAVA + BEDROCK</p>' +
  '<h1 class="hero-title">CHROMABIT <span class="accent">NETWORK</span></h1>' +
  '<p class="hero-tagline">Grind the market. <span class="accent">Climb the ladder.</span></p>';
const JOIN_BOX =
  '<div class="join-box" data-join-box>' +
  '<div class="join-row"><span class="join-ip">play.<span class="accent">chromabit</span>.us</span><button type="button" class="join-copy" data-copy-ip><svg><path d="M0 0"></path></svg>COPY IP</button></div>' +
  `<div class="join-row"><span class="join-label">Discord</span><a data-discord-join href="${DISCORD}" target="_blank" rel="noopener">JOIN</a></div>` +
  '<p class="join-editions">Java: any version up to 26.3 &middot; Bedrock: same address, port 19132</p>' +
  '</div>';
const CLAIM = '<section class="claim" data-claim><h2 class="claim-title">THE ONLY RANKED COMPETITIVE PVP FOR JAVA AND BEDROCK</h2></section>';
const PVP_CARD =
  '<article class="mode-card" data-mode-card="pvp">' +
  '<div class="mode-banner" data-banner="pvp"></div>' +
  '<h2 class="mode-title">CHROMAPVP <span class="beta-tag">BETA</span></h2>' +
  '<p class="mode-desc">Ranked kit PVP. Duels, the FFA pit, the Prismatic Arena and tournaments.</p>' +
  '<div class="mode-live" data-live="ladder"><h3>TOP OF THE LADDER</h3></div>' +
  '<a class="mode-enter" href="/pvp/">ENTER PVP</a><button type="button" class="pvp-copy" data-copy-ip>COPY IP</button>' +
  '</article>';
const SMP_CARD =
  '<article class="mode-card" data-mode-card="smp">' +
  '<figure class="mode-banner" data-banner="smp"><img src="/assets/build.png" alt="Smuk_&#39;s Baddies"><figcaption>Smuk_\'s Baddies</figcaption></figure>' +
  '<h2 class="mode-title">ECONOMY SMP</h2>' +
  '<p class="mode-desc">Survival with a player-run market. Claims, custom spawners, King of the Hill.</p>' +
  '<div class="mode-live" data-live="movers"></div>' +
  '<a class="mode-enter" href="/smp/">EXPLORE THE SMP</a><button type="button" class="smp-copy" data-copy-ip>COPY IP</button>' +
  '</article>';
const FOOTER = '<footer><nav class="footer-nav"><a href="/">HOME</a><a href="/pvp/">PVP</a><a href="/smp/">ECONOMY SMP</a><a href="/store/">STORE</a></nav>Welcome &copy; 2026 Chromabit LLC</footer>';
const HOME_BODY = `${NAV}<main><section class="page-hero container">${HERO_HEAD}${JOIN_BOX}</section>${CLAIM}<section class="modes">${PVP_CARD}${SMP_CARD}</section></main>${FOOTER}`;

const SMP_BODY =
  `${NAV_PLAIN}<main>` +
  '<section class="page-hero"><h1 class="hero-title">MINE IT. PRICE IT. <span class="accent">TRADE IT.</span></h1><p class="hero-sub">Chromabit SMP is allowed here</p>' +
  '<button type="button" class="smp-copy" data-copy-ip>COPY IP</button></section>' +
  '<section class="tape" aria-label="Today&#39;s biggest market moves"><h2 class="tape-title">TODAY’S TOP MOVERS</h2></section>' +
  '<section class="dungeon" data-section="dungeon"><h2>SEASON 4: <span>HEARTWOOD</span></h2><ul>' +
  '<li data-fact>Four zones under one tree</li><li data-fact>Bosses with phases</li><li data-fact>Zone armour sets</li></ul></section>' +
  '<a class="auctions-link" href="/auctions/">OPEN THE AUCTION HOUSE</a>' +
  `</main>${FOOTER}`;
// U4-copy: the privacy page's "Other services" section names mc-heads.net.
const PRIVACY_OTHER = '<section class="other-services"><h2>Other services</h2><p>Player head images on the PVP pages load from mc-heads.net.</p></section>';
const LD_FAQ = '{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[]}';

// U4: /pvp/ as the spec describes it (prerendered: empty board, hidden season strip).
const PVP_TITLE = 'Ranked PVP Leaderboards | Chromabit';
const PVP_DESC = 'ChromaPVP ranked leaderboards for Java and Bedrock. Seven tiers from Tin to Chroma, Sword and Mace ladders, tournaments.';
const PVP_CANON = '<link rel="canonical" href="https://chromabit.us/pvp/">';
const PVP_NAV = NAV.replace('<a href="/pvp/">', '<a href="/pvp/" aria-current="page" class="active">');
const PVP_MAST =
  '<section class="page-hero"><p class="section-eyebrow">CHROMAPVP &middot; RANKED KIT PVP <span class="beta-tag">BETA</span></p>' +
  '<h1 class="hero-title">RANKED. <span class="accent">ON BOTH EDITIONS.</span></h1>' +
  '<p class="hero-sub">The only ranked competitive PVP for Java and Bedrock.</p>' +
  '<div class="season-strip" data-season hidden><span class="season-name"></span></div></section>';
const PVP_TABS =
  '<div class="board-tabs" role="group" aria-label="Leaderboard">' +
  '<button type="button" data-board-tab="overall" aria-pressed="true">OVERALL</button>' +
  '<button type="button" data-board-tab="sword" aria-pressed="false">SWORD</button>' +
  '<button type="button" data-board-tab="mace" aria-pressed="false">MACE</button>' +
  '<button type="button" data-board-tab="axe" aria-pressed="false" disabled>AXE &middot; SOON</button>' +
  '<button type="button" data-board-tab="chaos" aria-pressed="false" disabled>CHAOS <span class="soon">&middot; SOON</span></button>' +
  '<button type="button" data-board-tab="tournament" aria-pressed="false">TOURNAMENT WINS</button></div>';
const PVP_EMPTY = '<p class="board-empty" data-board-empty>No ranked players yet. Play 10 placement matches to appear here.</p>';
const PVP_NOTE = '<p class="board-note">Updates every minute. Players appear after 10 placement matches.</p>';
const PVP_BOARD = `<section class="board" data-board>${PVP_TABS}${PVP_EMPTY}${PVP_NOTE}</section>`;
const TIER_ROWS = [['Tin', 'START'], ['Bronze', '1350'], ['Silver', '1500'], ['Gold', '1600'], ['Emerald', '1700'], ['Mithril', '1800'], ['Chroma', '1950']];
const PVP_TIERS =
  '<section class="tiers" data-tiers><h2>SEVEN TIERS</h2><ol>' +
  TIER_ROWS.map(([n, m]) => `<li data-tier="${n}"><span class="tier-name">${n}</span><span class="tier-min">${m}</span></li>`).join('') +
  '</ol></section>';
const FACT_ROWS = [
  ['10', 'placement matches before you get a rank'],
  ['BO3', 'every ranked duel is best of three'],
  ['III &middot; II &middot; I', 'three divisions in every tier below Chroma'],
  ['LVL 2', 'ranked opens at level 2'],
];
const PVP_FACTS = `<ul class="facts" data-facts>${FACT_ROWS.map(([v, l]) => `<li data-fact><strong>${v}</strong><span>${l}</span></li>`).join('')}</ul>`;
const MODE_ROWS = [
  ['Duels', 'Ranked or unranked 1v1 on the Mythic and Magic arenas. Build your own kit layout.'],
  ['FFA Pit', 'Nine zones under the spawn. Your gear drops where you die. Stash it or extract with it.'],
  // Spec amendment U4-copy (2026-11-10): no fixed round count; 2v2v2 takes teams of two.
  ['Prismatic Arena', 'A shrinking ring, a new augment each round, and a gold shop between fights. Last team standing wins.'],
  ['Tournaments', 'Double elimination. 1000, 500 and 250 Tokens for the top three, and the Champion title.'],
  ['Parties', 'Bring up to three friends. Queue Arena 2v2v2 as a pair.'],
  ['Cosmetics', 'Earn Tokens by playing and spend them on trails, hats and titles.'],
];
const PVP_MODES =
  '<section class="modes" data-modes><h2>WHAT YOU CAN PLAY</h2>' +
  MODE_ROWS.map(([t, d]) => `<article class="mode" data-mode><h3>${t}</h3><p>${d}</p></article>`).join('') +
  '</section>';
const PVP_JOIN =
  '<section class="pvp-join"><p>Connect to <span class="accent">play.chromabit.us</span> and pick Kit PVP in the hub.</p>' +
  '<button type="button" class="pvp-copy" data-copy-ip>COPY IP</button></section>';
const PVP_BODY = `${PVP_NAV}<main>${PVP_MAST}${PVP_BOARD}${PVP_TIERS}${PVP_FACTS}${PVP_MODES}${PVP_JOIN}</main>${FOOTER}`;
const SITEMAP =
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  '  <url><loc>https://chromabit.us/</loc></url>\n  <url><loc>https://chromabit.us/pvp/</loc></url>\n</urlset>\n';

/** U4: give a page the site nav and footer (around #app, so the U2 cases keep their exact #app strings). */
function framed(html, nav = NAV) {
  return html.replace('<body>\n', `<body>\n${nav}\n`).replace('\n</body>', `\n${FOOTER}\n</body>`);
}

const LD_HOME = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': 'https://chromabit.us/#website', name: NET, alternateName: 'Chromabit' },
    { '@type': 'Organization', '@id': 'https://chromabit.us/#organization', name: NET, alternateName: 'Chromabit' },
  ],
});

function headFor(title, extra = '') {
  return `<title>${title}</title>
  <meta name="author" content="${NET}">
  <meta property="og:site_name" content="${NET}">
  <meta property="og:title" content="${title}">
  <meta property="og:image" content="${OG}">
  ${extra}`;
}

function htmlPage(head, body) {
  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  ${head}\n</head>\n<body>\n<div id="app">${body}</div>\n</body>\n</html>\n`;
}

/** A dist/ that should pass every check. */
function goodSite() {
  return {
    'index.html': htmlPage(
      headFor(
        HOME_TITLE,
        `<meta name="description"\n    content="${HOME_DESC}">
  <meta property="og:description" content="${SOCIAL_DESC}">
  <meta name="twitter:title" content="${HOME_TITLE}">
  <meta name="twitter:description" content="${SOCIAL_DESC}">
  <script type="application/ld+json">${LD_HOME}</script>`,
      ),
      HOME_BODY,
    ),
    'smp/index.html': htmlPage(headFor('Economy SMP | Chromabit'), SMP_BODY),
    'faq/index.html': framed(htmlPage(
      headFor('FAQ | Chromabit', `<script type="application/ld+json">${LD_FAQ}</script>`),
      '<main>Everything you need to know about Chromabit.</main>',
    )),
    'store/index.html': framed(htmlPage(headFor('Store | Chromabit'), '<main>Every purchase directly supports Chromabit.</main>')),
    'auctions/index.html': framed(htmlPage(headFor('Auction House | Chromabit SMP'), '<main>Chromabit SMP market</main>')),
    'privacy/index.html': framed(htmlPage(headFor('Privacy Policy | Chromabit'), `<main>Privacy</main>${PRIVACY_OTHER}`)),
    'pvp/index.html': htmlPage(
      headFor(PVP_TITLE, `<meta name="description" content="${PVP_DESC}">\n  <meta name="twitter:title" content="${PVP_TITLE}">\n  ${PVP_CANON}`),
      PVP_BODY,
    ),
    'sitemap.xml': SITEMAP,
    'og-preview.png': png(1200, 630),
  };
}

function png(width, height) {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'latin1');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  buf[24] = 8; // bit depth
  buf[25] = 6; // RGBA
  return buf;
}

const tmpRoot = mkdtempSync(join(tmpdir(), 'check-site-'));
let n = 0;

function runOn(files) {
  const dist = join(tmpRoot, `dist${n++}`);
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const file = join(dist, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  mkdirSync(dist, { recursive: true });
  const r = spawnSync(process.execPath, [CHECKER, dist], { encoding: 'utf-8' });
  return { code: r.status, out: r.stdout + r.stderr, lines: r.stdout.trim().split(/\r?\n/) };
}

function mutate(rel, from, to) {
  const site = goodSite();
  if (!site[rel].includes(from)) throw new Error(`fixture: ${rel} has no ${JSON.stringify(from)}`);
  site[rel] = site[rel].split(from).join(to);
  return site;
}

/** Like mutate, but on a site already mutated, so two edits can be chained. */
function edit(site, rel, from, to) {
  if (!site[rel].includes(from)) throw new Error(`fixture: ${rel} has no ${JSON.stringify(from)}`);
  site[rel] = site[rel].split(from).join(to);
  return site;
}

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${detail}`}`);
}

/** The run fails, exactly `only` fails, and its FAIL line mentions `needle`. */
function expectFail(name, site, only, needle) {
  const r = runOn(site);
  const fails = r.lines.filter((l) => l.startsWith('FAIL '));
  const line = fails.find((l) => l.startsWith(`FAIL ${only}:`));
  const ok =
    r.code === 1 &&
    fails.length === 1 &&
    !!line &&
    line.includes(needle) &&
    r.lines.at(-1) === `RESULT: FAIL 1 of ${r.lines.length - 1}`;
  check(name, ok, `want only ${only} failing with ${JSON.stringify(needle)}, got exit ${r.code}:\n${r.out}`);
}

/** U4: the run fails, exactly the checks in `want` ({check: needle}) fail, each FAIL line mentioning its needle. */
function expectFails(name, site, want) {
  const r = runOn(site);
  const fails = r.lines.filter((l) => l.startsWith('FAIL '));
  const entries = Object.entries(want);
  const ok =
    r.code === 1 &&
    fails.length === entries.length &&
    entries.every(([only, needle]) => fails.some((l) => l.startsWith(`FAIL ${only}:`) && l.includes(needle))) &&
    r.lines.at(-1) === `RESULT: FAIL ${entries.length} of ${r.lines.length - 1}`;
  check(name, ok, `want exactly ${JSON.stringify(want)} failing, got exit ${r.code}:\n${r.out}`);
}

try {
  check('checker found', !!CHECKER, 'neither tools/check_site.mjs nor test/check_site.mjs exists');

  {
    const r = runOn(goodSite());
    const allPass = r.lines.slice(0, -1).every((l) => l.startsWith('PASS '));
    check(
      'good site passes every check',
      r.code === 0 && allPass && /^RESULT: PASS \d+ checks$/.test(r.lines.at(-1)) && r.lines.length >= 8,
      `exit ${r.code}:\n${r.out}`,
    );
    const names = r.lines.slice(0, -1).map((l) => l.split(/[ :]/)[1]);
    for (const want of [
      'pages-prerendered',
      'home-head',
      'site-name-author',
      'subpage-titles',
      'smp-name-allowlist',
      'og-preview-image',
      'home-no-store-credit',
      'home-hero',
      'home-join-box',
      'home-claim',
      'home-mode-cards',
      'home-copy-buttons',
      'home-removed',
      'smp-page',
      'ld-json-parses',
      // U4
      'pvp-page',
      'pvp-masthead',
      'pvp-board',
      'pvp-tiers',
      'pvp-facts',
      'pvp-modes',
      'pvp-join',
      'nav-links',
      'sitemap-pvp',
      'internal-links',
      'home-join-rel',
      // U4-copy
      'privacy-mc-heads',
    ])
      check(`check ${want} is listed`, names.includes(want), `names: ${names.join(', ')}`);
  }

  {
    const r = runOn({});
    check(
      'empty dist fails with RESULT: FAIL k of n',
      r.code === 1 && /^RESULT: FAIL \d+ of \d+$/.test(r.lines.at(-1)),
      `exit ${r.code}:\n${r.out}`,
    );
  }

  // AC1
  {
    // A missing page is reported by every check that reads it, so only require pages-prerendered to say so.
    const r = runOn({ ...goodSite(), 'privacy/index.html': null });
    const line = r.lines.find((l) => l.startsWith('FAIL pages-prerendered:'));
    check('AC1 missing page', r.code === 1 && !!line && line.includes('/privacy/ missing'), `exit ${r.code}:
${r.out}`);
  }
  expectFail(
    'AC1 empty app div',
    mutate('faq/index.html', '<div id="app"><main>Everything you need to know about Chromabit.</main></div>', '<div id="app"></div><main>Everything you need to know about Chromabit.</main>'),
    'pages-prerendered',
    '/faq/ <div id="app"> is empty',
  );

  // AC2
  expectFail(
    'AC2 old home title',
    mutate('index.html', `<title>${HOME_TITLE}</title>`, '<title>Chromabit | Minecraft Economy Server</title>'),
    'home-head',
    '/ title is',
  );
  expectFail('AC2 description off by one char', mutate('index.html', 'player-run economy. Join', 'player-run economy! Join'), 'home-head', '/ description is');
  expectFail(
    'AC2 og:title',
    mutate('index.html', `<meta property="og:title" content="${HOME_TITLE}">`, '<meta property="og:title" content="Chromabit">'),
    'home-head',
    '/ og:title is',
  );
  expectFail(
    'AC2 twitter:title missing',
    mutate('index.html', `<meta name="twitter:title" content="${HOME_TITLE}">`, ''),
    'home-head',
    '/ has no twitter:title',
  );
  expectFail(
    'AC2 og:description',
    mutate('index.html', `<meta property="og:description" content="${SOCIAL_DESC}">`, `<meta property="og:description" content="${SOCIAL_DESC}.">`),
    'home-head',
    '/ og:description is',
  );
  expectFail(
    'AC2 twitter:description',
    mutate('index.html', `<meta name="twitter:description" content="${SOCIAL_DESC}">`, '<meta name="twitter:description" content="x">'),
    'home-head',
    '/ twitter:description is',
  );
  expectFail(
    'AC2 JSON-LD WebSite name',
    mutate('index.html', LD_HOME, LD_HOME.replace(`"WebSite","@id":"https://chromabit.us/#website","name":"${NET}"`, '"WebSite","@id":"https://chromabit.us/#website","name":"Chromabit"')),
    'home-head',
    '/ JSON-LD WebSite name is "Chromabit"',
  );
  expectFail(
    'AC2 JSON-LD Organization alternateName',
    mutate('index.html', LD_HOME, LD_HOME.replace(`"name":"${NET}","alternateName":"Chromabit"}]`, `"name":"${NET}"}]`)),
    'home-head',
    '/ JSON-LD Organization alternateName is undefined',
  );
  expectFail(
    'AC2 JSON-LD missing',
    mutate('index.html', `<script type="application/ld+json">${LD_HOME}</script>`, ''),
    'home-head',
    '/ has 0 JSON-LD WebSite nodes',
  );

  // AC3
  expectFail(
    'AC3 author on /privacy/',
    mutate('privacy/index.html', `<meta name="author" content="${NET}">`, '<meta name="author" content="Chromabit">'),
    'site-name-author',
    '/privacy/ author is "Chromabit"',
  );
  expectFail(
    'AC3 og:site_name on /auctions/',
    mutate('auctions/index.html', `<meta property="og:site_name" content="${NET}">`, ''),
    'site-name-author',
    '/auctions/ has no og:site_name',
  );

  // AC4
  expectFail(
    'AC4 /smp/ title',
    mutate('smp/index.html', '<title>Economy SMP | Chromabit</title>', '<title>Economy SMP Minecraft Server | Chromabit SMP</title>'),
    'subpage-titles',
    '/smp/ title is',
  );
  expectFail(
    'AC4 /auctions/ title must keep SMP',
    mutate('auctions/index.html', '<title>Auction House | Chromabit SMP</title>', '<title>Auction House | Chromabit</title>'),
    'subpage-titles',
    '/auctions/ title is',
  );

  // AC5
  expectFail(
    'AC5 alt text on /',
    mutate('index.html', 'alt="Chromabit"', 'alt="Chromabit SMP"'),
    'smp-name-allowlist',
    'index.html contains "Chromabit SMP" 1x: ',
  );
  expectFail(
    'AC5 body text on /store/ across a line break',
    mutate('store/index.html', 'supports Chromabit.', 'supports Chromabit\n   SMP.'),
    'smp-name-allowlist',
    'store/index.html contains "Chromabit SMP"',
  );
  expectFail(
    'AC5 entity-encoded space on /faq/',
    mutate('faq/index.html', 'about Chromabit.', 'about Chromabit&nbsp;SMP.'),
    'smp-name-allowlist',
    'faq/index.html contains "Chromabit SMP"',
  );
  expectFail(
    'AC5 JSON-LD on /privacy/',
    mutate('privacy/index.html', '<main>Privacy</main>', '<main>Privacy</main><script type="application/ld+json">{"name":"Chromabit SMP"}</script>'),
    'smp-name-allowlist',
    'privacy/index.html contains "Chromabit SMP"',
  );
  {
    const r = runOn(mutate('index.html', 'Welcome', 'chromabit smp Chromabit Smp'));
    check('AC5 is case-sensitive', r.code === 0, `exit ${r.code}:\n${r.out}`);
  }

  // AC6
  expectFail('AC6 png missing', { ...goodSite(), 'og-preview.png': null }, 'og-preview-image', 'dist/og-preview.png missing');
  expectFail('AC6 png wrong size', { ...goodSite(), 'og-preview.png': png(1200, 628) }, 'og-preview-image', '1200x628, want 1200x630');
  expectFail('AC6 not a png', { ...goodSite(), 'og-preview.png': Buffer.from('GIF89a........................') }, 'og-preview-image', 'not a PNG');
  expectFail(
    'AC6 og:image missing on /privacy/',
    mutate('privacy/index.html', `<meta property="og:image" content="${OG}">`, ''),
    'og-preview-image',
    '/privacy/ has no og:image',
  );
  expectFail(
    'AC6 og:image wrong url on /store/',
    mutate('store/index.html', `content="${OG}"`, 'content="/og-preview.png"'),
    'og-preview-image',
    '/store/ og:image is "/og-preview.png"',
  );

  // AC7
  {
    const site = goodSite();
    site['index.html'] = site['index.html'].replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n  <meta name="keywords" content="Store Credit prizes">');
    expectFail('AC7 store credit in home head (any case)', site, 'home-no-store-credit', 'store credit');
  }
  {
    // U2 intent kept: home-no-store-credit reads only the head. Since U3 the body
    // is home-removed's job, so that check (and only that one) now fails here.
    const site = mutate('index.html', 'Welcome', 'Earn store credit');
    const r = runOn(site);
    check('AC7 only the head is checked', r.lines.includes('PASS home-no-store-credit'), `exit ${r.code}:\n${r.out}`);
    expectFail('U3-AC6 store credit in the home body', site, 'home-removed', '/ body mentions "store credit"');
  }

  // ------------------------------------------------------------------ U3 --
  const H = 'index.html';
  const S = 'smp/index.html';
  const DISCORD_ROW = `<div class="join-row"><span class="join-label">Discord</span><a data-discord-join href="${DISCORD}" target="_blank" rel="noopener">JOIN</a></div>`;
  const EDITIONS = '<p class="join-editions">Java: any version up to 26.3 &middot; Bedrock: same address, port 19132</p>';

  // U3-AC1 home-hero
  expectFail('U3-AC1 old h1', mutate(H, 'CHROMABIT <span class="accent">NETWORK</span>', 'CHROMABIT <span class="accent">SMP</span>'), 'home-hero', '/ <h1> text is "CHROMABIT SMP"');
  expectFail('U3-AC1 h1 words run together', mutate(H, 'CHROMABIT <span class="accent">NETWORK</span>', 'CHROMABIT<span class="accent">NETWORK</span>'), 'home-hero', '/ <h1> text is "CHROMABITNETWORK"');
  expectFail(
    'U3-AC1 second h1',
    mutate(H, '<h2 class="claim-title">THE ONLY RANKED COMPETITIVE PVP FOR JAVA AND BEDROCK</h2>', '<h1 class="claim-title">THE ONLY RANKED COMPETITIVE PVP FOR JAVA AND BEDROCK</h1>'),
    'home-hero',
    '/ has 2 <h1>, want 1',
  );
  expectFail(
    'U3-AC1 h1 is in the nav',
    edit(mutate(H, '<h1 class="hero-title">CHROMABIT <span class="accent">NETWORK</span></h1>', '<p class="hero-title">CHROMABIT NETWORK</p>'), H, '<span>CHROMABIT</span>', '<h1>CHROMABIT NETWORK</h1>'),
    'home-hero',
    '/ <h1> is not between the nav and the footer',
  );
  expectFail('U3-AC1 old eyebrow', mutate(H, 'MINECRAFT NETWORK &middot; JAVA + BEDROCK', 'MINECRAFT ECONOMY SERVER'), 'home-hero', '"MINECRAFT ECONOMY SERVER CHROMABIT NETWORK');
  expectFail(
    'U3-AC1 old tagline',
    mutate(H, 'Grind the market. <span class="accent">Climb the ladder.</span>', 'Mine it. Price it. <span class="accent">Trade it.</span>'),
    'home-hero',
    'Mine it. Price it. Trade it.',
  );
  expectFail('U3-AC1 logo missing', mutate(H, '<img class="logo" src="/server-icon.png" alt="Chromabit logo">', ''), 'home-hero', '/ hero has no logo');
  expectFail(
    'U3-AC1 logo after the h1',
    edit(mutate(H, '<img class="logo" src="/server-icon.png" alt="Chromabit logo">', ''), H, '</h1>', '</h1><img class="logo" src="/l.png" alt="">'),
    'home-hero',
    '/ hero logo comes after the <h1>',
  );
  expectFail('U3-AC1 extra section between nav and footer', mutate(H, '</main>', '<section class="features-section"><h2>HOW IT WORKS</h2></section></main>'), 'home-hero', 'HOW IT WORKS');
  expectFail(
    'U3-AC1 old status block in the hero',
    mutate(H, '</section><section class="claim"', '<div class="card ip-block"><div class="ip-label">SERVER IP</div></div></section><section class="claim"'),
    'home-hero',
    'SERVER IP',
  );
  expectFail('U3-AC1 claim band above the hero', edit(mutate(H, CLAIM, ''), H, '<section class="page-hero', `${CLAIM}<section class="page-hero`), 'home-hero', '/ [data-claim] comes before [data-join-box]');
  expectFail('U3-AC1 claim band below the cards', edit(mutate(H, CLAIM, ''), H, '</main>', `${CLAIM}</main>`), 'home-hero', '/ first [data-mode-card] comes before [data-claim]');
  {
    const r = runOn(mutate(H, '<p class="section-eyebrow">MINECRAFT NETWORK &middot; JAVA + BEDROCK</p>', '<p class="section-eyebrow">MINECRAFT NETWORK<br>\n  · JAVA&nbsp;+&nbsp;BEDROCK</p>'));
    check('U3-AC1 whitespace and entities are normalised', r.code === 0, `exit ${r.code}:\n${r.out}`);
  }

  // U3-AC2 home-join-box
  {
    // An unhooked join box leaves its text loose in the hero, so the hero's
    // "nothing else between nav and footer" rule fails with it; both, and only
    // both, must fail.
    const r = runOn(mutate(H, ' data-join-box', ''));
    const fails = r.lines.filter((l) => l.startsWith('FAIL '));
    check(
      'U3-AC2 no join box',
      r.code === 1 && fails.length === 2 && fails.some((l) => l.startsWith('FAIL home-join-box: / has 0 [data-join-box], want 1')) && fails.some((l) => l.startsWith('FAIL home-hero:')),
      `exit ${r.code}:
${r.out}`,
    );
  }
  expectFail('U3-AC2 address missing', mutate(H, 'play.<span class="accent">chromabit</span>.us', 'mc.chromabit.net'), 'home-join-box', 'does not show "play.chromabit.us"');
  expectFail('U3-AC2 copy label', mutate(H, '</svg>COPY IP</button>', '</svg>COPY</button>'), 'home-join-box', '/ join box [data-copy-ip] label is "COPY", want "COPY IP"');
  expectFail(
    'U3-AC2 copy is not a button',
    mutate(H, '<button type="button" class="join-copy" data-copy-ip><svg><path d="M0 0"></path></svg>COPY IP</button>', '<span class="join-copy" data-copy-ip>COPY IP</span>'),
    'home-join-box',
    'is a <span>, want <button>',
  );
  expectFail('U3-AC2 discord href', mutate(H, `href="${DISCORD}"`, 'href="https://discord.gg/old"'), 'home-join-box', 'Discord link href is "https://discord.gg/old"');
  expectFail('U3-AC2 discord label', mutate(H, 'rel="noopener">JOIN</a>', 'rel="noopener">JOIN 60+ PLAYERS ON DISCORD</a>'), 'home-join-box', 'Discord link label is "JOIN 60+ PLAYERS ON DISCORD"');
  expectFail('U3-AC2 discord link not hooked', mutate(H, '<a data-discord-join ', '<a '), 'home-join-box', '/ join box has 0 a[data-discord-join] links');
  expectFail('U3-AC2 discord row unnamed', mutate(H, '<span class="join-label">Discord</span>', ''), 'home-join-box', 'Discord row does not say "Discord"');
  expectFail(
    'U3-AC2 discord row above the address row',
    edit(mutate(H, DISCORD_ROW, ''), H, '<div class="join-row"><span class="join-ip">', `${DISCORD_ROW}<div class="join-row"><span class="join-ip">`),
    'home-join-box',
    'address comes after the Discord row',
  );
  expectFail('U3-AC2 bedrock port', mutate(H, 'port 19132', 'port 19133'), 'home-join-box', 'has no single line with');
  expectFail(
    'U3-AC2 edition texts split across rows',
    edit(mutate(H, EDITIONS, '<p class="join-editions">Java: any version up to 26.3</p>'), H, 'rel="noopener">JOIN</a></div>', 'rel="noopener">JOIN</a><span>Bedrock: same address, port 19132</span></div>'),
    'home-join-box',
    'has no single line with',
  );
  expectFail('U3-AC2 visit store button in the hero', mutate(H, EDITIONS, `<a class="arcade-btn" href="/store/">VISIT STORE</a>${EDITIONS}`), 'home-join-box', '/ hero has a <a> "VISIT STORE" -> /store/');
  expectFail('U3-AC2 ladder button in the hero', mutate(H, EDITIONS, `<button type="button">SEE THE LADDER</button>${EDITIONS}`), 'home-join-box', '/ hero has a <button> "SEE THE LADDER"');
  expectFail('U3-AC2 pvp link in the hero', mutate(H, EDITIONS, `<a href="/pvp/">GO</a>${EDITIONS}`), 'home-join-box', '"GO" -> /pvp/');

  // U3-AC3 home-claim
  expectFail(
    'U3-AC3 headline text',
    mutate(H, 'THE ONLY RANKED COMPETITIVE PVP FOR JAVA AND BEDROCK', 'THE ONLY RANKED PVP FOR JAVA AND BEDROCK'),
    'home-claim',
    '/ claim band text is "THE ONLY RANKED PVP FOR JAVA AND BEDROCK"',
  );
  expectFail('U3-AC3 second sentence in the band', mutate(H, 'BEDROCK</h2></section>', 'BEDROCK</h2><p>Same address, both editions.</p></section>'), 'home-claim', 'want exactly');
  expectFail('U3-AC3 forbidden sentence anywhere (any case)', mutate(H, 'Welcome', 'Welcome. ONE LADDER FOR BOTH EDITIONS'), 'home-claim', '/ mentions "One ladder for both editions"');
  expectFail(
    'U3-AC3 forbidden sentence in an attribute',
    mutate(H, '<section class="modes">', '<section class="modes" aria-label="One ladder for both editions">'),
    'home-claim',
    '/ mentions "One ladder for both editions"',
  );
  expectFail('U3-AC3 no claim band', mutate(H, CLAIM, ''), 'home-claim', '/ has 0 [data-claim], want 1');

  // U3-AC4 home-mode-cards
  expectFail('U3-AC4 smp card before pvp card', mutate(H, `${PVP_CARD}${SMP_CARD}`, `${SMP_CARD}${PVP_CARD}`), 'home-mode-cards', '/ [data-mode-card] values in document order are ["smp","pvp"]');
  expectFail(
    'U3-AC4 BETA on the smp card',
    mutate(H, '<h2 class="mode-title">ECONOMY SMP</h2>', '<h2 class="mode-title">ECONOMY SMP <span class="beta-tag">BETA</span></h2>'),
    'home-mode-cards',
    '/ smp card has a .beta-tag',
  );
  expectFail('U3-AC4 BETA outside the cards', mutate(H, '</section></main>', '</section><span class="beta-tag"></span></main>'), 'home-mode-cards', '.beta-tag outside the mode cards');
  expectFail('U3-AC4 no BETA on pvp', mutate(H, ' <span class="beta-tag">BETA</span>', ''), 'home-mode-cards', '/ pvp card has 0 .beta-tag, want 1');
  expectFail('U3-AC4 BETA tag text', mutate(H, '<span class="beta-tag">BETA</span>', '<span class="beta-tag">NEW</span>'), 'home-mode-cards', '.beta-tag text is "NEW"');
  expectFail('U3-AC4 pvp title', mutate(H, 'CHROMAPVP <span', 'CHROMA PVP <span'), 'home-mode-cards', '/ pvp card has no heading "CHROMAPVP"');
  expectFail('U3-AC4 title is not a heading', mutate(H, '<h2 class="mode-title">ECONOMY SMP</h2>', '<div class="mode-title">ECONOMY SMP</div>'), 'home-mode-cards', '/ smp card has no heading "ECONOMY SMP"');
  expectFail('U3-AC4 pvp description', mutate(H, 'Prismatic Arena and tournaments.', 'Prismatic Arena and more.'), 'home-mode-cards', '/ pvp card has no description');
  expectFail('U3-AC4 smp description', mutate(H, 'King of the Hill.', 'KOTH.'), 'home-mode-cards', '/ smp card has no description');
  expectFail('U3-AC4 pvp banner', mutate(H, 'data-banner="pvp"', 'data-banner="arena"'), 'home-mode-cards', '/ pvp card has 0 [data-banner="pvp"], want 1');
  expectFail('U3-AC4 smp banner without screenshot', mutate(H, '<img src="/assets/build.png" alt="Smuk_&#39;s Baddies">', ''), 'home-mode-cards', '/ smp card banner has no screenshot <img src>');
  expectFail('U3-AC4 smp banner without caption', mutate(H, "<figcaption>Smuk_'s Baddies</figcaption>", ''), 'home-mode-cards', '/ smp card banner has no caption text');
  expectFail('U3-AC4 ladder container missing', mutate(H, 'data-live="ladder"', 'data-live="top"'), 'home-mode-cards', '/ pvp card has 0 [data-live="ladder"], want 1');
  expectFail(
    'U3-AC4 movers container in the wrong card',
    edit(mutate(H, '<div class="mode-live" data-live="movers"></div>', ''), H, '<div class="mode-live" data-live="ladder">', '<div class="mode-live" data-live="movers"></div><div class="mode-live" data-live="ladder">'),
    'home-mode-cards',
    '/ smp card has 0 [data-live="movers"], want 1',
  );
  expectFail('U3-AC4 ladder heading wrong', mutate(H, '<h3>TOP OF THE LADDER</h3>', '<h3>LEADERBOARD</h3>'), 'home-mode-cards', 'want heading "TOP OF THE LADDER"');
  {
    const r = runOn(
      mutate(H, '<div class="mode-live" data-live="movers"></div>', '<div class="mode-live" data-live="movers"><h3>TODAY&rsquo;S TOP MOVERS</h3><a href="/auctions/?item=x">Diamond $10</a></div>'),
    );
    check('U3-AC4 a filled movers block with a curly apostrophe passes', r.code === 0, `exit ${r.code}:\n${r.out}`);
  }
  expectFail('U3-AC4 pvp link href', mutate(H, 'href="/pvp/">ENTER PVP', 'href="/pvp">ENTER PVP'), 'home-mode-cards', '/ pvp card has 0 <a href="/pvp/"> "ENTER PVP"');
  expectFail('U3-AC4 smp link label', mutate(H, '>EXPLORE THE SMP<', '>EXPLORE SMP<'), 'home-mode-cards', '/ smp card has 0 <a href="/smp/"> "EXPLORE THE SMP"');
  expectFail('U3-AC4 pvp copy label', mutate(H, 'class="pvp-copy" data-copy-ip>COPY IP', 'class="pvp-copy" data-copy-ip>COPY'), 'home-mode-cards', '/ pvp card [data-copy-ip] label is "COPY"');
  expectFail(
    'U3-AC4 section heading text in a card',
    mutate(H, '<div class="mode-banner" data-banner="pvp"></div>', '<div class="mode-banner" data-banner="pvp"><span>TWO WAYS TO PLAY</span></div>'),
    'home-mode-cards',
    '/ mentions "TWO WAYS TO PLAY"',
  );
  expectFail('U3-AC4 section label as an attribute', mutate(H, '<section class="modes">', '<section class="modes" aria-label="Pick a mode. ONE ADDRESS.">'), 'home-mode-cards', '/ mentions "ONE ADDRESS"');
  {
    const r = runOn(
      mutate(H, '<img src="/assets/build.png" alt="Smuk_&#39;s Baddies">', '<div class="carousel"><img src="/assets/build.png" alt="Smuk_&#39;s Baddies"></div>'),
    );
    check('U3-AC4 a carousel inside the smp banner is allowed', r.code === 0, `exit ${r.code}:\n${r.out}`);
  }

  // U3-AC5 home-copy-buttons
  expectFail(
    'U3-AC5 fourth copy button',
    mutate(H, '<nav class="footer-nav">', '<button type="button" data-copy-ip>COPY IP</button><nav class="footer-nav">'),
    'home-copy-buttons',
    '/ has 4 [data-copy-ip], want 3',
  );

  // U3-AC6 home-removed
  for (const gone of ['Player Economy', 'Store Credit Prizes', 'Grief Prevention', 'Custom Spawners', 'REAL PRIZES', 'Server Events', 'PLAYER-DRIVEN']) {
    expectFail(`U3-AC6 ${gone} is gone`, mutate(H, 'Welcome', `<div class="feature-title">${gone}</div>`), 'home-removed', `/ still has "${gone}"`);
  }
  expectFail('U3-AC6 heading split by a tag', mutate(H, 'Welcome', '<h2>REAL <b>PRIZES</b>.<br>EVERY EVENT.</h2>'), 'home-removed', '/ still has "REAL PRIZES"');
  expectFail(
    'U3-AC6 store credit in an attribute',
    mutate(H, '<a href="/store/">STORE</a></nav>', '<a href="/store/" aria-label="Server events and Store Credit prizes">STORE</a></nav>'),
    'home-removed',
    '/ body mentions "store credit"',
  );
  expectFail('U3-AC6 store credit across a line break', mutate(H, 'Welcome', 'Win 100 store\n   credit'), 'home-removed', '/ body mentions "store credit"');
  expectFail('U3-AC6 store credit across tags', mutate(H, 'Welcome', 'Win 100 store <strong>credit</strong>'), 'home-removed', '/ body mentions "store credit"');
  expectFail(
    'U3-AC6 standalone carousel',
    mutate(H, '<nav class="footer-nav">', '<div class="carousel reveal"><img src="/a.png" alt=""></div><nav class="footer-nav">'),
    'home-removed',
    '/ has 1 .carousel outside the smp card',
  );
  {
    const r = runOn(mutate(H, 'Welcome', 'player economy, grief prevention'));
    check('U3-AC6 removed titles are case-sensitive', r.code === 0, `exit ${r.code}:\n${r.out}`);
  }

  // U3-AC7 smp-page
  expectFail('U3-AC7 old h1', mutate(S, 'MINE IT. PRICE IT. <span class="accent">TRADE IT.</span>', 'ECONOMY<span class="accent">SMP</span>'), 'smp-page', '/smp/ <h1> text is "ECONOMYSMP"');
  expectFail('U3-AC7 second h1', mutate(S, '<h2 class="tape-title">TODAY’S TOP MOVERS</h2>', '<h1 class="tape-title">TODAY’S TOP MOVERS</h1>'), 'smp-page', '/smp/ has 2 <h1>, want 1');
  expectFail('U3-AC7 no dungeon block', mutate(S, ' data-section="dungeon"', ''), 'smp-page', '/smp/ has 0 [data-section="dungeon"], want 1');
  expectFail('U3-AC7 dungeon heading without HEARTWOOD', mutate(S, '<span>HEARTWOOD</span>', '<span>THE TREE</span>'), 'smp-page', 'want it to contain "HEARTWOOD"');
  expectFail('U3-AC7 dungeon has no heading', mutate(S, '<h2>SEASON 4: <span>HEARTWOOD</span></h2>', '<p>SEASON 4: HEARTWOOD</p>'), 'smp-page', '/smp/ dungeon block has no heading');
  expectFail('U3-AC7 two facts', mutate(S, '<li data-fact>Zone armour sets</li>', '<li>Zone armour sets</li>'), 'smp-page', '/smp/ dungeon block has 2 [data-fact], want at least 3');
  expectFail(
    'U3-AC7 a fact outside the dungeon block',
    mutate(S, '<li data-fact>Zone armour sets</li></ul></section>', '</ul></section><ul><li data-fact>Zone armour sets</li></ul>'),
    'smp-page',
    '/smp/ dungeon block has 2 [data-fact]',
  );
  expectFail('U3-AC7 empty fact', mutate(S, '<li data-fact>Zone armour sets</li>', '<li data-fact> &nbsp; </li>'), 'smp-page', '/smp/ dungeon block has 1 empty [data-fact]');
  expectFail('U3-AC7 ticker missing', mutate(S, 'class="tape"', 'class="market-strip"'), 'smp-page', '/smp/ has no market ticker (.tape)');
  expectFail('U3-AC7 auction link label', mutate(S, '>OPEN THE AUCTION HOUSE<', '>AUCTIONS<'), 'smp-page', '/smp/ has no <a href="/auctions/"> "OPEN THE AUCTION HOUSE"');
  expectFail('U3-AC7 auction link href', mutate(S, 'href="/auctions/">OPEN', 'href="/auctions/?tab=markets">OPEN'), 'smp-page', '/smp/ has no <a href="/auctions/">');
  expectFail('U3-AC7 two copy buttons', mutate(S, '</main>', '<button type="button" data-copy-ip>COPY IP</button></main>'), 'smp-page', '/smp/ has 2 [data-copy-ip] buttons, want 1');
  expectFail('U3-AC7 no copy button', mutate(S, ' data-copy-ip', ''), 'smp-page', '/smp/ has 0 [data-copy-ip] buttons, want 1');
  expectFail(
    'U3-AC7 beta tag',
    mutate(S, '<span class="accent">TRADE IT.</span></h1>', '<span class="accent">TRADE IT.</span></h1><span class="beta-tag">BETA</span>'),
    'smp-page',
    '/smp/ has 1 .beta-tag, want 0',
  );
  expectFail(
    'U3-AC7 store credit in the body',
    mutate(S, 'Chromabit SMP is allowed here', 'Chromabit SMP is allowed here. Events pay out Store&nbsp;Credit'),
    'smp-page',
    '/smp/ mentions "store credit"',
  );
  expectFail(
    'U3-AC7 store credit in the head',
    mutate(S, '<title>Economy SMP | Chromabit</title>', '<title>Economy SMP | Chromabit</title><meta name="keywords" content="store credit">'),
    'smp-page',
    '/smp/ mentions "store credit"',
  );
  for (const gone of ['Player Economy', 'Store Credit Prizes', 'Grief Prevention', 'Community Events']) {
    expectFail(
      `U3-AC7 ${gone} is gone from /smp/`,
      mutate(S, 'Chromabit SMP is allowed here', `Chromabit SMP is allowed here<span class="feature-title">${gone}</span>`),
      'smp-page',
      `/smp/ still has "${gone}"`,
    );
  }
  // Since U4 an extra nav link also breaks the exact nav list, so nav-links fails with smp-page here (both, and only both).
  expectFails(
    'U3-AC7 /smp/ in the home nav',
    mutate(H, '<li><a href="/auctions/">AUCTIONS</a></li>', '<li><a href="/smp/">SMP</a></li><li><a href="/auctions/">AUCTIONS</a></li>'),
    { 'smp-page': '/ nav links to /smp/', 'nav-links': '/ nav links are' },
  );
  expectFails('U3-AC7 /smp/ in the smp nav', mutate(S, '<a href="/faq/">FAQ</a></header>', '<a href="/faq/">FAQ</a><a href="/smp/">SMP</a></header>'), {
    'smp-page': '/smp/ nav links to /smp/',
    'nav-links': '/smp/ nav links are',
  });
  expectFail(
    'U3-AC7 home footer lost the /smp/ link',
    mutate(H, '<a href="/smp/">ECONOMY SMP</a><a href="/store/">STORE</a></nav>', '<a href="/store/">STORE</a></nav>'),
    'smp-page',
    '/ footer has no link to /smp/',
  );

  // U3-AC8 ld-json-parses
  expectFail(
    'U3-AC8 broken JSON-LD on /faq/',
    mutate('faq/index.html', LD_FAQ, LD_FAQ.replace('"mainEntity":[]}', '"mainEntity":[],}')),
    'ld-json-parses',
    '/faq/ JSON-LD block 1 does not parse',
  );
  expectFail('U3-AC8 broken block on /smp/', mutate(S, '</main>', '</main><script type="application/ld+json">{"@type": "WebPage"</script>'), 'ld-json-parses', '/smp/ JSON-LD block 1 does not parse');
  expectFail(
    'U3-AC8 broken block in a /privacy/ body',
    mutate('privacy/index.html', '<main>Privacy</main>', `<main>Privacy</main><script type='application/ld+json'>{name: "x"}</script>`),
    'ld-json-parses',
    '/privacy/ JSON-LD block 1 does not parse',
  );

  // ------------------------------------------------------------------ U4 --
  const P = 'pvp/index.html';

  // U4-AC1 pvp-page
  {
    // A missing /pvp/ is reported by every check that reads it; require pvp-page to say so.
    const r = runOn({ ...goodSite(), [P]: null });
    const line = r.lines.find((l) => l.startsWith('FAIL pvp-page:'));
    check('U4-AC1 /pvp/ missing', r.code === 1 && !!line && line.includes('/pvp/ missing (pvp/index.html)'), `exit ${r.code}:\n${r.out}`);
  }
  expectFail('U4-AC1 empty app div', mutate(P, '<div id="app">', '<div id="app"></div><div>'), 'pvp-page', '/pvp/ <div id="app"> is empty');
  expectFail('U4-AC1 title', mutate(P, `<title>${PVP_TITLE}</title>`, '<title>Leaderboards | Chromabit</title>'), 'pvp-page', '/pvp/ title is "Leaderboards | Chromabit"');
  expectFail('U4-AC1 description off by one char', mutate(P, 'Mace ladders, tournaments.', 'Mace ladders, tournaments!'), 'pvp-page', '/pvp/ description is');
  expectFail('U4-AC1 description missing', mutate(P, `<meta name="description" content="${PVP_DESC}">`, ''), 'pvp-page', '/pvp/ has no description');
  expectFail('U4-AC1 og:title', mutate(P, `<meta property="og:title" content="${PVP_TITLE}">`, '<meta property="og:title" content="PVP">'), 'pvp-page', '/pvp/ og:title is "PVP"');
  expectFail('U4-AC1 twitter:title missing', mutate(P, `<meta name="twitter:title" content="${PVP_TITLE}">`, ''), 'pvp-page', '/pvp/ has no twitter:title');
  expectFail('U4-AC1 og:site_name', mutate(P, `<meta property="og:site_name" content="${NET}">`, '<meta property="og:site_name" content="Chromabit">'), 'pvp-page', '/pvp/ og:site_name is "Chromabit"');
  expectFail('U4-AC1 author', mutate(P, `<meta name="author" content="${NET}">`, ''), 'pvp-page', '/pvp/ has no author');
  expectFail('U4-AC1 og:image', mutate(P, `<meta property="og:image" content="${OG}">`, '<meta property="og:image" content="/og.png">'), 'pvp-page', '/pvp/ og:image is "/og.png"');
  expectFail('U4-AC1 canonical missing', mutate(P, PVP_CANON, ''), 'pvp-page', '/pvp/ has 0 <link rel="canonical">');
  expectFail('U4-AC1 canonical wrong', mutate(P, PVP_CANON, '<link rel="canonical" href="https://chromabit.us/pvp">'), 'pvp-page', '/pvp/ canonical is "https://chromabit.us/pvp"');
  expectFail('U4-AC1 two canonicals', mutate(P, PVP_CANON, `${PVP_CANON}<link href="https://chromabit.us/" rel="canonical">`), 'pvp-page', '/pvp/ has 2 <link rel="canonical">');
  expectFail(
    'U4-AC1 second h1',
    mutate(P, '<p class="hero-sub">The only ranked competitive PVP for Java and Bedrock.</p>', '<h1 class="hero-sub">The only ranked competitive PVP for Java and Bedrock.</h1>'),
    'pvp-page',
    '/pvp/ has 2 <h1>, want 1',
  );
  expectFail('U4-AC1 broken JSON-LD', mutate(P, '</main>', '</main><script type="application/ld+json">{"@type":}</script>'), 'pvp-page', '/pvp/ JSON-LD block 1 does not parse');

  // U4-AC2 pvp-masthead
  expectFail('U4-AC2 h1 text', mutate(P, 'RANKED. <span class="accent">ON BOTH EDITIONS.</span>', 'RANKED.<span class="accent">ON BOTH EDITIONS.</span>'), 'pvp-masthead', '/pvp/ <h1> text is "RANKED.ON BOTH EDITIONS."');
  expectFail('U4-AC2 eyebrow text', mutate(P, 'CHROMAPVP &middot; RANKED KIT PVP', 'CHROMAPVP - RANKED KIT PVP'), 'pvp-masthead', '/pvp/ has no eyebrow "CHROMAPVP · RANKED KIT PVP"');
  expectFail('U4-AC2 no BETA in the eyebrow', mutate(P, ' <span class="beta-tag">BETA</span></p>', '</p>'), 'pvp-masthead', 'has no .beta-tag inside it');
  expectFail(
    'U4-AC2 BETA beside the eyebrow, not in it',
    mutate(P, ' <span class="beta-tag">BETA</span></p>', '</p><span class="beta-tag">BETA</span>'),
    'pvp-masthead',
    'has no .beta-tag inside it',
  );
  expectFail('U4-AC2 BETA text', mutate(P, '<span class="beta-tag">BETA</span>', '<span class="beta-tag">NEW</span>'), 'pvp-masthead', '/pvp/ eyebrow .beta-tag text is "NEW"');
  expectFail(
    'U4-AC2 eyebrow after the h1',
    edit(mutate(P, '<p class="section-eyebrow">CHROMAPVP &middot; RANKED KIT PVP <span class="beta-tag">BETA</span></p>', ''), P, '</h1>', '</h1><p class="section-eyebrow">CHROMAPVP &middot; RANKED KIT PVP <span class="beta-tag">BETA</span></p>'),
    'pvp-masthead',
    '/pvp/ eyebrow comes after the <h1>',
  );
  expectFail('U4-AC2 sub line text', mutate(P, 'competitive PVP for Java and Bedrock.', 'competitive PVP.'), 'pvp-masthead', '/pvp/ has 0 sub lines');
  expectFail('U4-AC2 sub line twice', mutate(P, '</section><section class="board"', '<p>The only ranked competitive PVP for Java and Bedrock.</p></section><section class="board"'), 'pvp-masthead', '/pvp/ has 2 sub lines');
  expectFail('U4-AC2 season strip missing', mutate(P, ' data-season hidden', ''), 'pvp-masthead', '/pvp/ has 0 [data-season], want 1');
  expectFail('U4-AC2 season strip visible in the prerender', mutate(P, ' data-season hidden', ' data-season'), 'pvp-masthead', '/pvp/ [data-season] is not hidden');

  // U4-AC3 pvp-board
  expectFail('U4-AC3 board missing', mutate(P, ' data-board>', '>'), 'pvp-board', '/pvp/ has 0 [data-board], want 1');
  expectFail(
    'U4-AC3 tab order',
    mutate(P, '<button type="button" data-board-tab="sword" aria-pressed="false">SWORD</button><button type="button" data-board-tab="mace" aria-pressed="false">MACE</button>', '<button type="button" data-board-tab="mace" aria-pressed="false">MACE</button><button type="button" data-board-tab="sword" aria-pressed="false">SWORD</button>'),
    'pvp-board',
    '/pvp/ board tabs are ["overall","mace","sword"',
  );
  expectFail('U4-AC3 a tab missing', mutate(P, '<button type="button" data-board-tab="chaos" aria-pressed="false" disabled>CHAOS <span class="soon">&middot; SOON</span></button>', ''), 'pvp-board', '/pvp/ board tabs are');
  expectFail('U4-AC3 tab label', mutate(P, '>TOURNAMENT WINS<', '>TOURNAMENTS<'), 'pvp-board', '/pvp/ tab tournament label is "TOURNAMENTS", want "TOURNAMENT WINS"');
  expectFail('U4-AC3 soon label', mutate(P, 'AXE &middot; SOON', 'AXE (SOON)'), 'pvp-board', '/pvp/ tab axe label is "AXE (SOON)"');
  expectFail('U4-AC3 soon tab enabled', mutate(P, 'data-board-tab="axe" aria-pressed="false" disabled', 'data-board-tab="axe" aria-pressed="false"'), 'pvp-board', '/pvp/ tab axe is not disabled');
  expectFail('U4-AC3 live tab disabled', mutate(P, 'data-board-tab="mace" aria-pressed="false"', 'data-board-tab="mace" aria-pressed="false" disabled'), 'pvp-board', '/pvp/ tab mace is disabled');
  expectFail('U4-AC3 tab is a link', mutate(P, '<button type="button" data-board-tab="sword" aria-pressed="false">SWORD</button>', '<a href="?board=sword" data-board-tab="sword" aria-pressed="false">SWORD</a>'), 'pvp-board', '/pvp/ tab sword is a <a>');
  expectFail('U4-AC3 two pressed', mutate(P, 'data-board-tab="sword" aria-pressed="false"', 'data-board-tab="sword" aria-pressed="true"'), 'pvp-board', '/pvp/ has 2 tabs with aria-pressed="true"');
  expectFail('U4-AC3 none pressed', mutate(P, 'data-board-tab="overall" aria-pressed="true"', 'data-board-tab="overall" aria-pressed="false"'), 'pvp-board', '/pvp/ has 0 tabs with aria-pressed="true"');
  expectFail(
    'U4-AC3 wrong default',
    edit(mutate(P, 'data-board-tab="overall" aria-pressed="true"', 'data-board-tab="overall" aria-pressed="false"'), P, 'data-board-tab="sword" aria-pressed="false"', 'data-board-tab="sword" aria-pressed="true"'),
    'pvp-board',
    '/pvp/ pressed tab is "sword", want "overall"',
  );
  expectFail('U4-AC3 empty state text', mutate(P, 'Play 10 placement matches to appear here.', 'Check back later.'), 'pvp-board', '/pvp/ [data-board-empty] text is');
  expectFail('U4-AC3 empty state missing', mutate(P, ' data-board-empty', ''), 'pvp-board', '/pvp/ board has 0 [data-board-empty], want 1');
  expectFail('U4-AC3 empty state hidden in the prerender', mutate(P, ' data-board-empty', ' data-board-empty hidden'), 'pvp-board', '/pvp/ [data-board-empty] is hidden');
  expectFail(
    'U4-AC3 a prerendered row',
    mutate(P, PVP_EMPTY, `${PVP_EMPTY}<table data-board-table><tbody><tr data-row data-top="1"><td>1</td><td>Someone</td></tr></tbody></table>`),
    'pvp-board',
    '/pvp/ prerendered HTML has 1 [data-row], want 0',
  );
  expectFail('U4-AC3 sample data in the prerender', mutate(P, PVP_EMPTY, `${PVP_EMPTY}<span hidden>Sample_01</span>`), 'pvp-board', '/pvp/ contains sample data ("Sample_")');
  expectFail('U4-AC3 note line', mutate(P, 'Updates every minute.', 'Updates hourly.'), 'pvp-board', '/pvp/ has no note');
  expectFail('U4-AC3 fixture build shipped', { ...goodSite(), 'assets/index-abc.js': 'const B="/pvp-fixture"||"https://api.chromabit.us/pvp";' }, 'pvp-board', 'dist/assets/index-abc.js contains "/pvp-fixture"');
  {
    const r = runOn({ ...goodSite(), 'assets/index-abc.js': 'const B=void 0||"https://api.chromabit.us/pvp";' });
    check('U4-AC3 a production bundle passes', r.code === 0, `exit ${r.code}:\n${r.out}`);
  }

  // U4-AC4 pvp-tiers
  expectFail('U4-AC4 block missing', mutate(P, ' data-tiers>', '>'), 'pvp-tiers', '/pvp/ has 0 [data-tiers], want 1');
  expectFail('U4-AC4 heading', mutate(P, '<h2>SEVEN TIERS</h2>', '<h2>TIERS</h2>'), 'pvp-tiers', '/pvp/ [data-tiers] has no heading "SEVEN TIERS"');
  expectFail('U4-AC4 heading not a heading', mutate(P, '<h2>SEVEN TIERS</h2>', '<p>SEVEN TIERS</p>'), 'pvp-tiers', 'has no heading "SEVEN TIERS"');
  expectFail(
    'U4-AC4 order',
    mutate(P, '<li data-tier="Emerald"><span class="tier-name">Emerald</span><span class="tier-min">1700</span></li><li data-tier="Mithril"><span class="tier-name">Mithril</span><span class="tier-min">1800</span></li>', '<li data-tier="Mithril"><span class="tier-name">Mithril</span><span class="tier-min">1800</span></li><li data-tier="Emerald"><span class="tier-name">Emerald</span><span class="tier-min">1700</span></li>'),
    'pvp-tiers',
    '/pvp/ [data-tier] values are',
  );
  expectFail('U4-AC4 a tier missing', mutate(P, '<li data-tier="Silver"><span class="tier-name">Silver</span><span class="tier-min">1500</span></li>', ''), 'pvp-tiers', '/pvp/ [data-tier] values are');
  expectFail('U4-AC4 minimum wrong', mutate(P, '<span class="tier-min">1600</span>', '<span class="tier-min">1650</span>'), 'pvp-tiers', '/pvp/ tier Gold does not show its minimum "1600"');
  expectFail('U4-AC4 Tin shows 0, not START', mutate(P, '<span class="tier-min">START</span>', '<span class="tier-min">0</span>'), 'pvp-tiers', '/pvp/ tier Tin does not show its minimum "START"');
  expectFail('U4-AC4 name wrong', mutate(P, '<span class="tier-name">Chroma</span>', '<span class="tier-name">CHROMA</span>'), 'pvp-tiers', '/pvp/ tier Chroma does not show its name "Chroma"');
  expectFail('U4-AC4 name and minimum run together', mutate(P, '<span class="tier-name">Bronze</span><span class="tier-min">1350</span>', '<span>Bronze 1350</span>'), 'pvp-tiers', '/pvp/ tier Bronze does not show its name');

  // U4-AC5 pvp-facts
  expectFail('U4-AC5 block missing', mutate(P, ' data-facts>', '>'), 'pvp-facts', '/pvp/ has 0 [data-facts], want 1');
  expectFail('U4-AC5 three facts', mutate(P, '<li data-fact><strong>LVL 2</strong>', '<li><strong>LVL 2</strong>'), 'pvp-facts', '/pvp/ [data-facts] has 3 [data-fact], want 4');
  expectFail('U4-AC5 value', mutate(P, '<strong>BO3</strong>', '<strong>BO5</strong>'), 'pvp-facts', '/pvp/ fact 2 is "BO5');
  expectFail('U4-AC5 label', mutate(P, 'ranked opens at level 2', 'ranked opens at level 5'), 'pvp-facts', '/pvp/ fact 4 is');
  expectFail('U4-AC5 divisions value', mutate(P, '<strong>III &middot; II &middot; I</strong>', '<strong>III II I</strong>'), 'pvp-facts', '/pvp/ fact 3 is');
  expectFail(
    'U4-AC5 order',
    mutate(P, '<li data-fact><strong>10</strong><span>placement matches before you get a rank</span></li><li data-fact><strong>BO3</strong><span>every ranked duel is best of three</span></li>', '<li data-fact><strong>BO3</strong><span>every ranked duel is best of three</span></li><li data-fact><strong>10</strong><span>placement matches before you get a rank</span></li>'),
    'pvp-facts',
    '/pvp/ fact 1 is "BO3',
  );

  // U4-AC6 pvp-modes
  expectFail('U4-AC6 block missing', mutate(P, ' data-modes>', '>'), 'pvp-modes', '/pvp/ has 0 [data-modes], want 1');
  expectFail('U4-AC6 heading', mutate(P, '<h2>WHAT YOU CAN PLAY</h2>', '<h2>MODES</h2>'), 'pvp-modes', '/pvp/ [data-modes] has no heading "WHAT YOU CAN PLAY"');
  expectFail('U4-AC6 five cards', mutate(P, '<article class="mode" data-mode><h3>Cosmetics</h3>', '<article class="mode"><h3>Cosmetics</h3>'), 'pvp-modes', '/pvp/ [data-modes] has 5 [data-mode], want 6');
  expectFail('U4-AC6 title', mutate(P, '<h3>FFA Pit</h3>', '<h3>FFA</h3>'), 'pvp-modes', '/pvp/ mode 2 has no heading "FFA Pit"');
  expectFail('U4-AC6 title case', mutate(P, '<h3>Duels</h3>', '<h3>DUELS</h3>'), 'pvp-modes', '/pvp/ mode 1 has no heading "Duels"');
  expectFail('U4-AC6 title not a heading', mutate(P, '<h3>Parties</h3>', '<p>Parties</p>'), 'pvp-modes', '/pvp/ mode 5 has no heading "Parties"');
  expectFail('U4-AC6 description off by one char', mutate(P, 'and the Champion title.', 'and the Champion title!'), 'pvp-modes', '/pvp/ mode "Tournaments" has no description');
  expectFail('U4-AC6 description split', mutate(P, '<p>Bring up to three friends. Queue Arena 2v2v2 as a pair.</p>', '<p>Bring up to three friends.</p><p>Queue Arena 2v2v2 as a pair.</p>'), 'pvp-modes', '/pvp/ mode "Parties" has no description');
  // U4-copy: the old (factually wrong) copy fails, and "Ten rounds" anywhere on /pvp/ fails.
  expectFail('U4-copy old Parties copy', mutate(P, 'Queue Arena 2v2v2 as a pair.', 'Queue Arena 2v2v2 together.'), 'pvp-modes', '/pvp/ mode "Parties" has no description');
  expectFail(
    'U4-copy old Prismatic Arena copy',
    mutate(P, 'A shrinking ring, a new augment each round, and a gold shop between fights. Last team standing wins.', 'Ten rounds, a shrinking ring, a new augment each round, and a gold shop between fights.'),
    'pvp-modes',
    '/pvp/ mode "Prismatic Arena" has no description',
  );
  expectFail('U4-copy Ten rounds elsewhere in the body', mutate(P, '</main>', '<p>Ten rounds of glory.</p></main>'), 'pvp-modes', '/pvp/ mentions "Ten rounds"');
  expectFail('U4-copy Ten rounds in the head', mutate(P, PVP_CANON, `${PVP_CANON}<meta name="keywords" content="Ten rounds">`), 'pvp-modes', '/pvp/ mentions "Ten rounds"');
  expectFail('U4-copy Ten rounds split by markup', mutate(P, '</main>', '<p>Ten <b>rounds</b></p></main>'), 'pvp-modes', '/pvp/ mentions "Ten rounds"');
  expectFail(
    'U4-AC6 order',
    edit(mutate(P, '<article class="mode" data-mode><h3>Duels</h3><p>Ranked or unranked 1v1 on the Mythic and Magic arenas. Build your own kit layout.</p></article>', ''), P, '</section><section class="pvp-join">', '<article class="mode" data-mode><h3>Duels</h3><p>Ranked or unranked 1v1 on the Mythic and Magic arenas. Build your own kit layout.</p></article></section><section class="pvp-join">'),
    'pvp-modes',
    '/pvp/ mode 1 has no heading "Duels"',
  );

  // U4-AC7 pvp-join
  expectFail('U4-AC7 join line', mutate(P, 'and pick Kit PVP in the hub.', 'and pick PVP.'), 'pvp-join', '/pvp/ has no join line');
  expectFail('U4-AC7 no copy button', mutate(P, ' data-copy-ip>', '>'), 'pvp-join', '/pvp/ has 0 [data-copy-ip] buttons, want 1');
  expectFail('U4-AC7 two copy buttons', mutate(P, '</main>', '<button type="button" data-copy-ip>COPY IP</button></main>'), 'pvp-join', '/pvp/ has 2 [data-copy-ip] buttons, want 1');
  expectFail('U4-AC7 copy label', mutate(P, 'data-copy-ip>COPY IP<', 'data-copy-ip>COPY<'), 'pvp-join', '/pvp/ [data-copy-ip] label is "COPY"');
  expectFail('U4-AC7 store credit (any case)', mutate(P, 'hats and titles.</p>', 'hats and titles.</p><p>Win Store&nbsp;Credit</p>'), 'pvp-join', '/pvp/ mentions "store credit"');
  expectFail('U4-AC7 store credit in the head', mutate(P, PVP_CANON, `${PVP_CANON}<meta name="keywords" content="store credit">`), 'pvp-join', '/pvp/ mentions "store credit"');
  expectFail('U4-AC7 Chromabit SMP', mutate(P, '</main>', '<p>Also try Chromabit SMP</p></main>'), 'pvp-join', '/pvp/ mentions "Chromabit SMP"');

  // U4-AC8 nav-links
  expectFail('U4-AC8 PVP link missing on /store/', mutate('store/index.html', '<li><a href="/pvp/">PVP <span class="nav-beta" data-beta>BETA</span></a></li>', ''), 'nav-links', '/store/ nav links are');
  expectFail(
    'U4-AC8 PVP after STORE on /faq/',
    mutate('faq/index.html', '<li><a href="/pvp/">PVP <span class="nav-beta" data-beta>BETA</span></a></li><li><a href="/store/">STORE</a></li>', '<li><a href="/store/">STORE</a></li><li><a href="/pvp/">PVP <span class="nav-beta" data-beta>BETA</span></a></li>'),
    'nav-links',
    '/faq/ nav links are [["/","HOME"],["/store/","STORE"],["/pvp/","PVP"]',
  );
  expectFail('U4-AC8 PVP label on /', mutate(H, '<a href="/pvp/">PVP <span', '<a href="/pvp/">RANKED <span'), 'nav-links', '/ nav links are [["/","HOME"],["/pvp/","RANKED"]');
  expectFail('U4-AC8 PVP href without slash on /privacy/', mutate('privacy/index.html', '<li><a href="/pvp/">PVP', '<li><a href="/pvp">PVP'), 'nav-links', '/privacy/ nav links are');
  expectFail('U4-AC8 FAQ missing from the nav on /smp/', mutate(S, '<a href="/faq/">FAQ</a></header>', '</header>'), 'nav-links', '/smp/ nav links are');
  expectFail('U4-AC8 BETA missing on /auctions/', mutate('auctions/index.html', ' <span class="nav-beta" data-beta>BETA</span>', ''), 'nav-links', '/auctions/ nav PVP link has 0 BETA markers, want 1');
  expectFail('U4-AC8 BETA marker text', mutate(H, '<span class="nav-beta" data-beta>BETA</span>', '<span class="nav-beta" data-beta>NEW</span>'), 'nav-links', '/ nav PVP BETA marker text is "NEW"');
  expectFail(
    'U4-AC8 BETA on STORE',
    mutate('store/index.html', '<li><a href="/store/">STORE</a></li>', '<li><a href="/store/">STORE<span data-beta>BETA</span></a></li>'),
    'nav-links',
    '/store/ nav link /store/ has a BETA marker',
  );
  {
    // The spec allows the marker as .beta-tag too; only the U3 BETA counts on / and /smp/ forbid it there.
    const r = runOn(mutate('faq/index.html', '<span class="nav-beta" data-beta>BETA</span>', '<span class="beta-tag">BETA</span>'));
    check('U4-AC8 a .beta-tag marker is accepted by nav-links', r.lines.includes('PASS nav-links') && r.code === 0, `exit ${r.code}:\n${r.out}`);
  }
  expectFail('U4-AC8 PVP not active on /pvp/', mutate(P, '<a href="/pvp/" aria-current="page" class="active">', '<a href="/pvp/">'), 'nav-links', '/pvp/ nav aria-current="page" links are [], want ["/pvp/"]');
  expectFail('U4-AC8 HOME active on /pvp/', mutate(P, '<li><a href="/">HOME</a></li>', '<li><a href="/" aria-current="page">HOME</a></li>'), 'nav-links', '/pvp/ nav aria-current="page" links are ["/","/pvp/"]');
  expectFail('U4-AC8 PVP active on /faq/', mutate('faq/index.html', '<li><a href="/pvp/">', '<li><a href="/pvp/" aria-current="page">'), 'nav-links', '/faq/ nav marks PVP as the current page');
  {
    const r = runOn(mutate('faq/index.html', '<li><a href="/faq/">FAQ</a></li>', '<li><a href="/faq/" aria-current="page" class="active">FAQ</a></li>'));
    check('U4-AC8 FAQ active on /faq/ is fine', r.code === 0, `exit ${r.code}:\n${r.out}`);
  }
  expectFail('U4-AC8 footer lost PVP on /privacy/', mutate('privacy/index.html', '<a href="/pvp/">PVP</a><a href="/smp/">', '<a href="/smp/">'), 'nav-links', '/privacy/ footer has 0 links to /pvp/, want 1');
  expectFail('U4-AC8 footer PVP label on /pvp/', mutate(P, '<a href="/pvp/">PVP</a><a href="/smp/">', '<a href="/pvp/">RANKED</a><a href="/smp/">'), 'nav-links', '/pvp/ footer /pvp/ link label is "RANKED"');
  expectFail('U4-AC8 no footer on /store/', mutate('store/index.html', FOOTER, ''), 'nav-links', '/store/ has no <footer>');

  // U4-AC9 sitemap-pvp
  expectFail('U4-AC9 sitemap missing', { ...goodSite(), 'sitemap.xml': null }, 'sitemap-pvp', 'dist/sitemap.xml missing');
  expectFail('U4-AC9 no /pvp/ in the sitemap', mutate('sitemap.xml', '  <url><loc>https://chromabit.us/pvp/</loc></url>\n', ''), 'sitemap-pvp', 'lists https://chromabit.us/pvp/ 0 times, want 1');
  expectFail('U4-AC9 /pvp without slash', mutate('sitemap.xml', 'https://chromabit.us/pvp/', 'https://chromabit.us/pvp'), 'sitemap-pvp', '0 times');

  // U4-AC10 internal-links
  expectFail('U4-AC10 a broken link on /faq/', mutate('faq/index.html', 'Everything you need', '<a href="/rules/">Rules</a> Everything you need'), 'internal-links', '/faq/ <a href="/rules/"> does not resolve');
  expectFail('U4-AC10 a broken stylesheet in a head', mutate('store/index.html', '<meta charset="UTF-8">', '<meta charset="UTF-8"><link rel="stylesheet" href="/assets/gone.css">'), 'internal-links', '/store/ <link href="/assets/gone.css"> does not resolve');
  expectFail('U4-AC10 a broken file link on /pvp/', mutate(P, '</main>', '<a href="/pvp/rules.html">rules</a></main>'), 'internal-links', '/pvp/ <a href="/pvp/rules.html"> does not resolve');
  {
    const site = mutate('faq/index.html', 'Everything you need', '<a href="/pvp?board=sword#top">a</a><a href="/og-preview.png">b</a><a href="//cdn.example/x">c</a><a href="https://chromabit.us/nope/">d</a><a href="#faq">e</a> Everything you need');
    const r = runOn(site);
    check('U4-AC10 queries, fragments, dir without slash, files, external and protocol-relative links pass', r.code === 0, `exit ${r.code}:\n${r.out}`);
  }

  // U4-AC11 home-join-rel
  expectFail('U4-AC11 JOIN without rel', mutate(H, `href="${DISCORD}" target="_blank" rel="noopener">JOIN`, `href="${DISCORD}" target="_blank">JOIN`), 'home-join-rel', '/ JOIN link has target="_blank" and rel=""');
  expectFail('U4-AC11 JOIN rel noreferrer only', mutate(H, 'target="_blank" rel="noopener">JOIN', 'target="_blank" rel="noreferrer">JOIN'), 'home-join-rel', 'rel="noreferrer"');
  {
    const r = runOn(mutate(H, 'target="_blank" rel="noopener">JOIN', 'target="_blank" rel="noreferrer noopener">JOIN'));
    check('U4-AC11 rel with more tokens passes', r.code === 0, `exit ${r.code}:\n${r.out}`);
  }

  // U4-copy privacy-mc-heads
  expectFail('U4-copy privacy without mc-heads.net', mutate('privacy/index.html', 'load from mc-heads.net.', 'load from a head service.'), 'privacy-mc-heads', '/privacy/ prerendered body does not mention "mc-heads.net"');
  expectFail('U4-copy mc-heads.net only outside #app', edit(mutate('privacy/index.html', 'load from mc-heads.net.', 'load from a head service.'), 'privacy/index.html', '<meta charset="UTF-8">', '<meta charset="UTF-8"><link rel="preconnect" href="https://mc-heads.net">'), 'privacy-mc-heads', '/privacy/ prerendered body does not mention "mc-heads.net"');
  expectFail('U4-copy privacy says mc-heads.com', mutate('privacy/index.html', 'load from mc-heads.net.', 'load from mc-heads.com.'), 'privacy-mc-heads', 'does not mention "mc-heads.net"');
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}

console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
process.exitCode = failed ? 1 : 0;
