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
const NAV = '<header class="site-nav"><a href="/" class="site-nav-brand"><img alt="Chromabit" src="/logo.png"><span>CHROMABIT</span></a><ul><li><a href="/">HOME</a></li><li><a href="/store/">STORE</a></li><li><a href="/auctions/">AUCTIONS</a></li></ul></header>';
const NAV_PLAIN = '<header class="site-nav"><a href="/">CHROMABIT</a><a href="/store/">STORE</a></header>';
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
const FOOTER = '<footer><nav class="footer-nav"><a href="/">HOME</a><a href="/smp/">ECONOMY SMP</a><a href="/store/">STORE</a></nav>Welcome &copy; 2026 Chromabit LLC</footer>';
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
const LD_FAQ = '{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[]}';

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
    'faq/index.html': htmlPage(
      headFor('FAQ | Chromabit', `<script type="application/ld+json">${LD_FAQ}</script>`),
      '<main>Everything you need to know about Chromabit.</main>',
    ),
    'store/index.html': htmlPage(headFor('Store | Chromabit'), '<main>Every purchase directly supports Chromabit.</main>'),
    'auctions/index.html': htmlPage(headFor('Auction House | Chromabit SMP'), '<main>Chromabit SMP market</main>'),
    'privacy/index.html': htmlPage(headFor('Privacy Policy | Chromabit'), '<main>Privacy</main>'),
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
  expectFail(
    'U3-AC7 /smp/ in the home nav',
    mutate(H, '<li><a href="/auctions/">AUCTIONS</a></li>', '<li><a href="/smp/">SMP</a></li><li><a href="/auctions/">AUCTIONS</a></li>'),
    'smp-page',
    '/ nav links to /smp/',
  );
  expectFail('U3-AC7 /smp/ in the smp nav', mutate(S, '<a href="/store/">STORE</a></header>', '<a href="/store/">STORE</a><a href="/smp/">SMP</a></header>'), 'smp-page', '/smp/ nav links to /smp/');
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
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}

console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
process.exitCode = failed ? 1 : 0;
