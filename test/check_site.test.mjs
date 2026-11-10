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
import { fileURLToPath, pathToFileURL } from 'node:url';

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
// U4: the nav on every page is HOME PVP STORE AUCTIONS FAQ, and every footer
// links /pvp/ (the U3 navs had HOME STORE AUCTIONS and HOME STORE; the U3 cases
// still find their strings). Owner ruling 2026-11-10: no BETA marker in the nav
// (the earlier fixture had a [data-beta] span in the PVP link).
const NAV = '<header class="site-nav"><a href="/" class="site-nav-brand"><img alt="Chromabit" src="/logo.png" width="30" height="30"><span>CHROMABIT</span></a><ul><li><a href="/">HOME</a></li><li><a href="/pvp/">PVP</a></li><li><a href="/store/">STORE</a></li><li><a href="/auctions/">AUCTIONS</a></li><li><a href="/faq/">FAQ</a></li></ul></header>';
const NAV_PLAIN = '<header class="site-nav"><a href="/" class="site-nav-brand">CHROMABIT</a><a href="/">HOME</a><a href="/pvp/">PVP</a><a href="/store/">STORE</a><a href="/auctions/">AUCTIONS</a><a href="/faq/">FAQ</a></header>';
// U8: every <img> has width and height (the hero logo is above the first screen, so not lazy).
const HERO_LOGO = '<img class="logo" src="/server-icon.png" alt="Chromabit logo" width="64" height="64">';
const HERO_HEAD =
  `<div class="logo-wrap"><a href="/" aria-label="Back to Chromabit home">${HERO_LOGO}</a></div>` +
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
// U8: below the first screen, so also lazy and async.
const SMP_SHOT = '<img src="/assets/build.png" alt="Smuk_&#39;s Baddies" width="640" height="360" loading="lazy" decoding="async">';
const SMP_CARD =
  '<article class="mode-card" data-mode-card="smp">' +
  '<figure class="mode-banner" data-banner="smp">' + SMP_SHOT + '<figcaption>Smuk_\'s Baddies</figcaption></figure>' +
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
// U5: the /faq/ page renders the FAQ as FaqPage.jsx does (.faq-group >
// .faq-section-label + .faq-item > .faq-question / .faq-answer), from a
// faq.json-shaped model, and its FAQPage JSON-LD is generated from the same
// model the way tools/build_faq_ld.py does. A defect planted in the model
// therefore reaches the page and the JSON-LD alike (as a faq.json edit plus
// build_faq_ld.py would); faq-jsonld-sync cases plant defects in the JSON-LD
// only. The FAQ markup sits after #app (before the footer) so the U2 cases
// keep their exact #app strings; the checker reads the whole document.
const FAQ_BASE = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'faq-base.json'), 'utf-8')).groups;
const PVP_FAQ = {
  id: 'pvp',
  title: 'PVP',
  items: [
    { q: 'What is ChromaPVP?', a: "ChromaPVP is the network's kit PVP server. Join play.chromabit.us and pick Kit PVP in the hub. It has ranked and unranked duels, the FFA pit, the Prismatic Arena and tournaments." },
    { q: 'How does ranked work?', a: 'Play 10 placement matches on a kit to get a rank. Ranked duels are best of three. There are seven tiers, from Tin to Chroma, with three divisions in every tier below Chroma. Ranked opens at level 2.' },
    { q: 'Can Bedrock players play ranked?', a: 'Yes. Java and Bedrock players queue into the same matches and share one ladder.' },
    { q: 'Which kits are ranked?', a: 'Sword and Mace.' },
    { q: 'Where are the leaderboards?', a: 'On the [PVP page](/pvp/) of this site, and in game with `/leaderboard`.' },
    { q: 'What happens when a season ends?', a: 'Each season has its own ladder. When a new season starts, everyone plays placement matches again.' },
  ],
};
const KIND_Q = 'What kind of server is Chromabit?';
const KIND_A =
  'Chromabit is a network with two servers behind one address: a survival server with a player-run economy, and ChromaPVP, a ranked kit PVP server. ' +
  'On the SMP, the difficulty is Hard, PvP is on in the wild, and the market is where most of the game happens: you earn by mining, farming spawners and trading, and spend on land, gear and rank.';
const PVPON_Q = 'Is PvP on?';
const PVPON_A = 'On the SMP, PvP is on in the overworld, the Nether and the End, and in the KOTH arena. Off at spawn, inside claims and in the dungeon. A 15-second combat tag blocks `/home`, `/spawn` and teleports while you are fighting.';
/** The spec'd FAQ: base groups, PVP group second, the two re-led answers. */
function goodFaq() {
  const groups = structuredClone(FAQ_BASE);
  for (const g of groups)
    for (const it of g.items) {
      if (it.q === KIND_Q) it.a = KIND_A;
      if (it.q === PVPON_Q) it.a = PVPON_A;
    }
  groups.splice(1, 0, structuredClone(PVP_FAQ));
  return groups;
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** faq.json markdown-lite to HTML, as FaqPage.jsx's rich(). */
function richHtml(md) {
  return md
    .split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g)
    .map((part) => {
      if (!part) return '';
      if (part.startsWith('**')) return `<strong>${esc(part.slice(2, -2))}</strong>`;
      if (part.startsWith('`')) return `<code>${esc(part.slice(1, -1))}</code>`;
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (link) return /^https?:/.test(link[2]) ? `<a href="${link[2]}" target="_blank" rel="noopener">${esc(link[1])}</a>` : `<a href="${link[2]}">${esc(link[1])}</a>`;
      return esc(part);
    })
    .join('');
}
let faqIds = 0;
function faqHtml(groups) {
  return (
    // U8: one <h1> per page and no skipped heading level (the items are h3).
    '<section aria-label="Frequently asked questions" class="faq-section"><h1>HAVE QUESTIONS?</h1><h2>FAQ</h2><div class="faq-list">' +
    groups
      .map(
        (g) =>
          `<div id="${g.id}" class="faq-group"><p class="faq-section-label">${esc(g.title.toUpperCase())}</p>` +
          g.items
            .map(
              (it) =>
                `<div class="faq-item reveal"><h3 class="faq-heading"><button type="button" aria-expanded="false" aria-controls="F${faqIds}" class="faq-question"><span>${esc(it.q)}</span><span aria-hidden="true" class="faq-icon">+</span></button></h3>` +
                `<div id="F${faqIds++}" role="region" inert class="faq-answer-wrap"><div class="faq-answer">${richHtml(it.a)}</div></div></div>`,
            )
            .join('') +
          '</div>',
      )
      .join('') +
    '</div></section>'
  );
}
const ldPlain = (md) => md.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
/** The FAQPage JSON-LD for `groups`, as tools/build_faq_ld.py writes it (compact). */
function faqLd(groups) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    url: 'https://chromabit.us/faq/',
    mainEntity: groups.flatMap((g) => g.items.map((it) => ({ '@type': 'Question', name: it.q, acceptedAnswer: { '@type': 'Answer', text: ldPlain(it.a) } }))),
  });
}
const LD_FAQ = faqLd(goodFaq());

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
  // U4-copy-2: augments only in rounds 1-10, so not "each round".
  ['Prismatic Arena', 'A shrinking ring, augment picks, and a gold shop between fights. Last team standing wins.'],
  ['Tournaments', 'Double elimination. 1000, 500 and 250 Tokens for the top three, and the Champion title.'],
  ['Parties', 'Bring up to three friends. Queue Arena 2v2v2 as a pair.'],
  ['Cosmetics', 'Earn Tokens by playing and spend them on trails, hats and titles.'],
];
const PVP_MODES =
  '<section class="modes" data-modes><h2>WHAT YOU CAN PLAY</h2>' +
  MODE_ROWS.map(([t, d]) => `<article class="mode" data-mode><h3>${t}</h3><p>${d}</p></article>`).join('') +
  '</section>';
const PVP_JOIN =
  '<section class="pvp-join" aria-label="Join"><p>Connect to <span class="accent">play.chromabit.us</span> and pick Kit PVP in the hub.</p>' +
  '<button type="button" class="pvp-copy" data-copy-ip>COPY IP</button></section>';
// U7: the player search block, hidden in the prerender, above the board table.
const PVP_SEARCH =
  '<div class="player-search" data-player-search hidden><label for="player-q">FIND A PLAYER</label>' +
  '<input id="player-q" type="search" autocomplete="off" maxlength="20"><ul class="search-results" data-search-results></ul><p class="search-count" aria-live="polite"></p></div>';
// U7: the search block sits inside the board section, above the tabs (so the U4 mutation strings stay unchanged).
const PVP_BOARD = `<section class="board" data-board>${PVP_SEARCH}${PVP_TABS}${PVP_EMPTY}${PVP_NOTE}</section>`;
const PVP_BODY = `${PVP_NAV}<main>${PVP_MAST}${PVP_BOARD}${PVP_TIERS}${PVP_FACTS}${PVP_MODES}${PVP_JOIN}</main>${FOOTER}`;
// U7: the /pvp/player/ shell as the spec describes it (loading state, no player data).
const PLAYER_TITLE = 'Player | Chromabit';
const PLAYER_ROBOTS = '<meta name="robots" content="noindex,follow">';
const PLAYER_EYEBROW = '<p class="section-eyebrow">CHROMAPVP &middot; PLAYER <span class="beta-tag">BETA</span></p>';
const PLAYER_H1 = '<h1 class="hero-title">PLAYER</h1>';
const PLAYER_BACK = '<a class="profile-back" href="/pvp/">ALL LEADERBOARDS</a>';
const PLAYER_STATE = '<p class="profile-state" data-profile-state>Loading player.</p>';
const PLAYER_MAST =
  `<section class="page-hero profile-hero">${PLAYER_EYEBROW}` +
  `<div class="profile-name"><img class="profile-head" src="/assets/pvp-default-head.svg" alt="" width="64" height="64">${PLAYER_H1}</div>` +
  `<p class="profile-best" data-profile-best hidden></p>${PLAYER_BACK}</section>`;
const PLAYER_BODY = `${PVP_NAV}<main>${PLAYER_MAST}${PLAYER_STATE}</main>${FOOTER}`;
// U8: the sitemap lists exactly the seven indexable pages, each with a lastmod (was / and /pvp/ only, no lastmod).
const INDEXABLE = ['/', '/pvp/', '/smp/', '/faq/', '/store/', '/auctions/', '/privacy/'];
const sitemapLine = (route) => `  <url><loc>https://chromabit.us${route}</loc><lastmod>2026-11-10</lastmod></url>\n`;
const SITEMAP =
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  INDEXABLE.map(sitemapLine).join('') +
  '</urlset>\n';
const SITEMAP_PVP_LINE = sitemapLine('/pvp/');
const ROBOTS_TXT =
  'User-agent: *\nAllow: /\n\n' +
  ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Bingbot'].map((b) => `User-agent: ${b}\nAllow: /\n`).join('\n') +
  '\nSitemap: https://chromabit.us/sitemap.xml\n';
const LLMS_TXT = `# Chromabit Network

> A Minecraft network for Java and Bedrock: ChromaPVP, ranked kit PVP on one ladder, and an economy SMP with a player-run market.

Join at play.chromabit.us. Bedrock uses the same address with port 19132. Java works on any version up to 26.3.

## Pages

- [Home](https://chromabit.us/): the network and how to join.
- [PVP](https://chromabit.us/pvp/): ranked leaderboards. 10 placement matches, seven tiers, best of three, ranked from level 2.
- [Economy SMP](https://chromabit.us/smp/): survival with a player-run market.
- [FAQ](https://chromabit.us/faq/): answers about the network.
- [Store](https://chromabit.us/store/): ranks and crate keys.
- [Auctions](https://chromabit.us/auctions/): live market data.
- [Privacy](https://chromabit.us/privacy/): how data is handled.
`;

/** U4: give a page the site nav and footer (around #app, so the U2 cases keep their exact #app strings). */
function framed(html, nav = NAV) {
  return html.replace('<body>\n', `<body>\n${nav}\n`).replace('\n</body>', `\n${FOOTER}\n</body>`);
}

// U8: WebSite gains url; Organization gains url, logo and sameAs placed before name, so the U2 cases'
// substrings ('"WebSite","@id":...,"name":NET' and '"name":NET,"alternateName":"Chromabit"}]') still occur.
const ORG_ID = 'https://chromabit.us/#organization';
const SITE_ID = 'https://chromabit.us/#website';
const LD_HOME = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': SITE_ID, name: NET, alternateName: 'Chromabit', url: 'https://chromabit.us/' },
    { '@type': 'Organization', '@id': ORG_ID, url: 'https://chromabit.us/', logo: 'https://chromabit.us/server-icon.png', sameAs: [DISCORD], name: NET, alternateName: 'Chromabit' },
  ],
});
// U8: the home VideoGame / GameServer node, in its own block.
const LD_GAME = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  '@id': 'https://chromabit.us/#minecraft',
  name: 'Minecraft',
  gamePlatform: ['Java Edition', 'Bedrock Edition'],
  gameServer: { '@type': 'GameServer', name: 'Chromabit', url: 'https://chromabit.us/', identifier: 'play.chromabit.us' },
});
const crumbs = (route, name) => ({
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://chromabit.us/' },
    { '@type': 'ListItem', position: 2, name, item: `https://chromabit.us${route}` },
  ],
});
/** U8: a sub-page's JSON-LD: a WebPage that references the home WebSite and Organization by @id, and its breadcrumb. */
const ldSub = (route, name) =>
  JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': `https://chromabit.us${route}#webpage`, url: `https://chromabit.us${route}`, isPartOf: { '@id': SITE_ID }, publisher: { '@id': ORG_ID } },
      crumbs(route, name),
    ],
  });
const LD_PVP = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebPage', '@id': 'https://chromabit.us/pvp/#webpage', name: 'ChromaPVP', description: PVP_DESC, url: 'https://chromabit.us/pvp/', isPartOf: { '@id': SITE_ID }, publisher: { '@id': ORG_ID } },
    { '@type': 'ItemList', itemListElement: MODE_ROWS.map(([t], i) => ({ '@type': 'ListItem', position: i + 1, name: t })) },
    crumbs('/pvp/', 'PVP'),
  ],
});
const ldTag = (ld) => `<script type="application/ld+json">${ld}</script>`;

// U8 head tags. The font-ready inline script is the one blocking head script the checker allows.
const FONT_READY = "<script>(function(){var el=document.documentElement;el.classList.add('js');if(!document.fonts){el.classList.add('fonts-ready');return}document.fonts.ready.then(function(){el.classList.add('fonts-ready')})})()</script>";
const FONT_HINTS = '<link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>';
const ROBOTS_META = '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">';
const REFERRER_META = '<meta name="referrer" content="no-referrer">';
const HERO_PRELOAD = '<link rel="preload" as="image" href="/server-icon.png" fetchpriority="high">';
/** U8: the SEO head tags of an indexable page; each option adds a tag the page does not already carry. */
function u8Head(route, { canonical = true, description, ogDescription, twitterTitle, twitterDescription } = {}) {
  const url = `https://chromabit.us${route}`;
  return [
    canonical && `<link rel="canonical" href="${url}">`,
    description && `<meta name="description" content="${description}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:url" content="${url}">`,
    '<meta property="og:locale" content="en_US">',
    ogDescription && `<meta property="og:description" content="${ogDescription}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="Chromabit Network">',
    '<meta name="twitter:card" content="summary_large_image">',
    twitterTitle && `<meta name="twitter:title" content="${twitterTitle}">`,
    twitterDescription && `<meta name="twitter:description" content="${twitterDescription}">`,
    `<meta name="twitter:image" content="${OG}">`,
    ROBOTS_META,
    '<meta name="theme-color" content="#0b0614">',
  ]
    .filter(Boolean)
    .join('\n  ');
}
/** U8: unique descriptions of 70-160 characters for the pages that had none in the fixture. */
const DESC = {
  smp: 'Survival with a player-run market on Chromabit: claims, custom spawners and a dungeon under one big tree.',
  faq: 'Answers about the Chromabit network: the address, versions, ranks, the auction house, claims and rules.',
  store: 'The official Chromabit store. Buy ranks, crate keys and more; every purchase directly helps Chromabit.',
  auctions: 'Live auction house data for the Chromabit SMP: price history, floors, volume and listings for each item.',
  privacy: 'How Chromabit collects and handles data on chromabit.us: analytics, cookies, payments and your choices.',
};
const subHead = (route, title, desc) => u8Head(route, { description: desc, ogDescription: desc, twitterTitle: title, twitterDescription: desc });

function headFor(title, extra = '') {
  return `<title>${title}</title>
  <meta name="author" content="${NET}">
  <meta property="og:site_name" content="${NET}">
  <meta property="og:title" content="${title}">
  <meta property="og:image" content="${OG}">
  ${FONT_READY}
  ${FONT_HINTS}
  ${extra}`;
}

function htmlPage(head, body) {
  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  ${head}\n</head>\n<body>\n<div id="app">${body}</div>\n</body>\n</html>\n`;
}

/** U5: the /faq/ page for a FAQ model (default: the spec'd one) and its JSON-LD (default: generated from the model). */
function faqPage(groups = goodFaq(), ld = faqLd(groups)) {
  return framed(htmlPage(
    headFor('FAQ | Chromabit', `<script type="application/ld+json">${ld}</script>\n  ${subHead('/faq/', 'FAQ | Chromabit', DESC.faq)}\n  ${ldTag(ldSub('/faq/', 'FAQ'))}`),
    '<main>Everything you need to know about Chromabit.</main>',
  )).replace(`\n${FOOTER}\n</body>`, `\n${faqHtml(groups)}\n${FOOTER}\n</body>`);
}

/** U5: the good site with /faq/ built from `edit(groups)` (a faq.json-level change) and optionally a JSON-LD override. */
function faqSite(editFaq = () => {}, ld = null) {
  const groups = goodFaq();
  editFaq(groups);
  return { ...goodSite(), 'faq/index.html': faqPage(groups, ld ?? faqLd(groups)) };
}
const faqItem = (groups, q) => groups.flatMap((g) => g.items).find((it) => it.q === q);

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
  <script type="application/ld+json">${LD_HOME}</script>
  ${u8Head('/')}
  ${HERO_PRELOAD}
  ${ldTag(LD_GAME)}`,
      ),
      HOME_BODY,
    ),
    'smp/index.html': htmlPage(headFor('Economy SMP | Chromabit', `${subHead('/smp/', 'Economy SMP | Chromabit', DESC.smp)}\n  ${ldTag(ldSub('/smp/', 'Economy SMP'))}`), SMP_BODY),
    'faq/index.html': faqPage(goodFaq(), LD_FAQ),
    // U8: each framed page also gets an <h1> (one per page), outside the U2 cases' exact strings.
    'store/index.html': framed(htmlPage(headFor('Store | Chromabit', `${subHead('/store/', 'Store | Chromabit', DESC.store)}\n  ${ldTag(ldSub('/store/', 'Store'))}`), '<main><h1>STORE</h1>Every purchase directly supports Chromabit.</main>')),
    'auctions/index.html': framed(htmlPage(headFor('Auction House | Chromabit SMP', `${subHead('/auctions/', 'Auction House | Chromabit SMP', DESC.auctions)}\n  ${ldTag(ldSub('/auctions/', 'Auctions'))}`), '<main><h1>Auction House</h1>Chromabit SMP market</main>')),
    'privacy/index.html': framed(htmlPage(headFor('Privacy Policy | Chromabit', `${subHead('/privacy/', 'Privacy Policy | Chromabit', DESC.privacy)}\n  ${ldTag(ldSub('/privacy/', 'Privacy'))}`), `<main>Privacy</main><h1>PRIVACY POLICY</h1>${PRIVACY_OTHER}`)),
    'pvp/index.html': htmlPage(
      headFor(
        PVP_TITLE,
        `<meta name="description" content="${PVP_DESC}">\n  <meta name="twitter:title" content="${PVP_TITLE}">\n  ${PVP_CANON}\n  ` +
          `${u8Head('/pvp/', { canonical: false, ogDescription: 'Ranked kit PVP for Java and Bedrock on one ladder.', twitterDescription: 'ChromaPVP ranked leaderboards for Java and Bedrock.' })}\n  ${REFERRER_META}\n  ${ldTag(LD_PVP)}`,
      ),
      PVP_BODY,
    ),
    'pvp/player/index.html': htmlPage(headFor(PLAYER_TITLE, `${PLAYER_ROBOTS}\n  ${PVP_CANON}\n  ${REFERRER_META}`), PLAYER_BODY),
    'sitemap.xml': SITEMAP,
    'og-preview.png': png(1200, 630),
    // U8: the hero logo (preloaded on /, the Organization logo), robots.txt and llms.txt.
    'server-icon.png': png(64, 64),
    'robots.txt': ROBOTS_TXT,
    'llms.txt': LLMS_TXT,
    // U9: a built stylesheet with the surface tokens and a card on them.
    'assets/index-good.css': CARD_CSS,
  };
}

/** U9: minified like Vite's output: the tokens at :root, the frost token still defined (it may stay for non-cards), cards on --surface. */
const CARD_CSS =
  ':root{--accent:#c77dff;--surface:#150f27;--surface-inset:#0f0a1d;--surface-hover:#21193c;--surface-selected:#2c214f;--radius-card:10px;--radius-inset:6px;--divider:#221838;' +
  '--frost:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.01))}' +
  '.card{background-color:var(--surface);border:0;border-radius:var(--radius-card);position:relative}' +
  '.mode-live{background-color:var(--surface-inset);border-radius:var(--radius-inset)}' +
  '.faq-item[data-open],.faq-item:hover{background-color:var(--surface-hover)}' +
  '.btn{background:var(--frost),#9a4dff}.btn:after{content:"";position:absolute;height:1px;background:#fff}' +
  '@media (max-width:600px){.card{padding:1rem}}@keyframes pulse{0%{opacity:.5}to{opacity:1}}' +
  '.join-row+.join-row{border-top:1px solid #221838}';

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
// U8: the checker's snapshot() writes the two frozen-baseline fixtures (titles/descriptions, visible text).
const { snapshot } = await import(pathToFileURL(CHECKER).href);

function writeDist(files) {
  const dist = join(tmpRoot, `dist${n++}`);
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const file = join(dist, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  mkdirSync(dist, { recursive: true });
  return dist;
}

/**
 * Run the checker on `files`. U8: the frozen-baseline fixtures (seo-head-base,
 * visible-text-base) are a snapshot of `base`, by default of `files` itself, so
 * every pre-U8 case is judged against its own site and only the U8 freeze
 * cases pass a different base (the good site) to plant a change.
 */
function runOn(files, base = files) {
  const dist = writeDist(files);
  const baseDist = base === files ? dist : writeDist(base);
  const fixtures = `${dist}-fixtures`;
  mkdirSync(fixtures, { recursive: true });
  const snap = snapshot(baseDist, 'self-test');
  writeFileSync(join(fixtures, 'seo-head-base.json'), JSON.stringify(snap.heads));
  writeFileSync(join(fixtures, 'visible-text-base.json'), JSON.stringify(snap.text));
  const r = spawnSync(process.execPath, [CHECKER, dist], { encoding: 'utf-8', env: { ...process.env, CHECK_SITE_FIXTURES: fixtures } });
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
      // owner ruling 2026-11-10
      'pvp-labels-removed',
      // U5
      'faq-pvp-group',
      'faq-network-answers',
      'faq-unchanged',
      'faq-jsonld-sync',
      // U7
      'player-shell',
      'player-not-in-sitemap',
      'player-nav',
      'player-internal-links',
      'pvp-search-shell',
      // U8
      'seo-head',
      'seo-titles-frozen',
      'seo-jsonld',
      'seo-jsonld-visible-facts',
      'seo-sitemap',
      'seo-robots',
      'seo-llms',
      'seo-404',
      'a11y-headings',
      'a11y-landmarks',
      'a11y-names',
      'img-attrs',
      'perf-hints',
      'pvp-referrer',
      'visible-text-unchanged',
      // U9
      'card-tokens',
      'card-no-frost',
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
  // Since U8 seo-jsonld needs the home Organization and WebSite too (both, and only both).
  expectFails('AC2 JSON-LD missing', mutate('index.html', `<script type="application/ld+json">${LD_HOME}</script>`, ''), {
    'home-head': '/ has 0 JSON-LD WebSite nodes',
    'seo-jsonld': "/ has no Organization node and no @id reference to the home page's Organization",
  });

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
  // Since U8 the planted block also lacks @context/@type (seo-jsonld) and states a name the page does not show
  // (seo-jsonld-visible-facts): all three, and only those. (U8 adds a head block, so the planted one is block 2.)
  expectFails('AC5 JSON-LD on /privacy/', mutate('privacy/index.html', '<main>Privacy</main>', '<main>Privacy</main><script type="application/ld+json">{"name":"Chromabit SMP"}</script>'), {
    'smp-name-allowlist': 'privacy/index.html contains "Chromabit SMP"',
    'seo-jsonld': '/privacy/ JSON-LD block 2 @context is null',
    'seo-jsonld-visible-facts': '/privacy/ JSON-LD states what the page does not show: node name "Chromabit SMP"',
  });
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
  // The mutation rewrites every content="<og url>"; since U8 that includes twitter:image (seo-head): both, and only both.
  expectFails('AC6 og:image wrong url on /store/', mutate('store/index.html', `content="${OG}"`, 'content="/og-preview.png"'), {
    'og-preview-image': '/store/ og:image is "/og-preview.png"',
    'seo-head': '/store/ twitter:image is "/og-preview.png"',
  });

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
  // U8: the hero logo string is HERO_LOGO now (it gained width and height); same defects planted.
  expectFail('U3-AC1 logo missing', mutate(H, HERO_LOGO, ''), 'home-hero', '/ hero has no logo');
  // Since U8 the / image preload must be the hero logo the page uses, and the planted logo is another file (perf-hints): both, and only both.
  expectFails('U3-AC1 logo after the h1', edit(mutate(H, HERO_LOGO, ''), H, '</h1>', '</h1><img class="logo" src="/l.png" alt="" width="64" height="64">'), {
    'home-hero': '/ hero logo comes after the <h1>',
    'perf-hints': '/ image preload ["/server-icon.png"] is not the hero logo "/l.png"',
  });
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
  // U8: the screenshot string is SMP_SHOT now (it gained width, height, loading and decoding); same defects planted.
  expectFail('U3-AC4 smp banner without screenshot', mutate(H, SMP_SHOT, ''),'home-mode-cards', '/ smp card banner has no screenshot <img src>');
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
      mutate(H, SMP_SHOT, `<div class="carousel">${SMP_SHOT}</div>`),
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
  // Since U8 the planted below-the-fold <img> also lacks width/height/lazy/async (img-attrs): both, and only both.
  expectFails('U3-AC6 standalone carousel', mutate(H, '<nav class="footer-nav">', '<div class="carousel reveal"><img src="/a.png" alt=""></div><nav class="footer-nav">'), {
    'home-removed': '/ has 1 .carousel outside the smp card',
    'img-attrs': '/ <img src="/a.png"> width is null',
  });
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
  // Since U5 the /faq/ JSON-LD is the full FAQPage (was '"mainEntity":[]}', which no longer
  // occurs), so the same kind of defect (a stray comma in mainEntity) is planted at the start
  // of the array; faq-jsonld-sync also needs that block, so it fails with ld-json-parses
  // (both, and only both).
  expectFails('U3-AC8 broken JSON-LD on /faq/', mutate('faq/index.html', LD_FAQ, LD_FAQ.replace('"mainEntity":[', '"mainEntity":[,')), {
    'ld-json-parses': '/faq/ JSON-LD block 1 does not parse',
    'faq-jsonld-sync': '/faq/ JSON-LD block 1 does not parse',
  });
  // U8 gives /smp/ and /privacy/ a JSON-LD block in the head, so the planted body block is block 2 (was block 1).
  expectFail('U3-AC8 broken block on /smp/', mutate(S, '</main>', '</main><script type="application/ld+json">{"@type": "WebPage"</script>'), 'ld-json-parses', '/smp/ JSON-LD block 2 does not parse');
  expectFail(
    'U3-AC8 broken block in a /privacy/ body',
    mutate('privacy/index.html', '<main>Privacy</main>', `<main>Privacy</main><script type='application/ld+json'>{name: "x"}</script>`),
    'ld-json-parses',
    '/privacy/ JSON-LD block 2 does not parse',
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
  // Since U8 the /pvp/ WebPage JSON-LD description is the meta description; without the meta it states text the page does not show (both, and only both).
  expectFails('U4-AC1 description missing', mutate(P, `<meta name="description" content="${PVP_DESC}">`, ''), {
    'pvp-page': '/pvp/ has no description',
    'seo-jsonld-visible-facts': '/pvp/ JSON-LD states what the page does not show: WebPage description',
  });
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
  // U8 gives /pvp/ a JSON-LD block in the head, so the planted body block is block 2 (was block 1).
  expectFail('U4-AC1 broken JSON-LD', mutate(P, '</main>', '</main><script type="application/ld+json">{"@type":}</script>'), 'pvp-page', '/pvp/ JSON-LD block 2 does not parse');

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
  // Since U8 the ItemList in the /pvp/ JSON-LD names "FFA Pit", which the page then no longer shows (both, and only both).
  expectFails('U4-AC6 title', mutate(P, '<h3>FFA Pit</h3>', '<h3>FFA</h3>'), {
    'pvp-modes': '/pvp/ mode 2 has no heading "FFA Pit"',
    'seo-jsonld-visible-facts': '/pvp/ JSON-LD states what the page does not show: ListItem name "FFA Pit"',
  });
  expectFail('U4-AC6 title case', mutate(P, '<h3>Duels</h3>', '<h3>DUELS</h3>'), 'pvp-modes', '/pvp/ mode 1 has no heading "Duels"');
  expectFail('U4-AC6 title not a heading', mutate(P, '<h3>Parties</h3>', '<p>Parties</p>'), 'pvp-modes', '/pvp/ mode 5 has no heading "Parties"');
  expectFail('U4-AC6 description off by one char', mutate(P, 'and the Champion title.', 'and the Champion title!'), 'pvp-modes', '/pvp/ mode "Tournaments" has no description');
  expectFail('U4-AC6 description split', mutate(P, '<p>Bring up to three friends. Queue Arena 2v2v2 as a pair.</p>', '<p>Bring up to three friends.</p><p>Queue Arena 2v2v2 as a pair.</p>'), 'pvp-modes', '/pvp/ mode "Parties" has no description');
  // U4-copy: the old (factually wrong) copy fails, and "Ten rounds" anywhere on /pvp/ fails.
  expectFail('U4-copy old Parties copy', mutate(P, 'Queue Arena 2v2v2 as a pair.', 'Queue Arena 2v2v2 together.'), 'pvp-modes', '/pvp/ mode "Parties" has no description');
  expectFail(
    'U4-copy old Prismatic Arena copy',
    mutate(P, 'A shrinking ring, augment picks, and a gold shop between fights. Last team standing wins.', 'Ten rounds, a shrinking ring, a new augment each round, and a gold shop between fights.'),
    'pvp-modes',
    '/pvp/ mode "Prismatic Arena" has no description',
  );
  expectFail('U4-copy Ten rounds elsewhere in the body', mutate(P, '</main>', '<p>Ten rounds of glory.</p></main>'), 'pvp-modes', '/pvp/ mentions "Ten rounds"');
  expectFail('U4-copy Ten rounds in the head', mutate(P, PVP_CANON, `${PVP_CANON}<meta name="keywords" content="Ten rounds">`), 'pvp-modes', '/pvp/ mentions "Ten rounds"');
  // U4-copy-2: the round-2 copy fails, and "each round" anywhere on /pvp/ fails.
  expectFail('U4-copy-2 round-2 Prismatic Arena copy', mutate(P, 'A shrinking ring, augment picks, and a gold shop between fights. Last team standing wins.', 'A shrinking ring, a new augment each round, and a gold shop between fights. Last team standing wins.'), 'pvp-modes', '/pvp/ mentions "each round"');
  expectFail('U4-copy-2 each round elsewhere in the body', mutate(P, '</main>', '<p>New loot each round.</p></main>'), 'pvp-modes', '/pvp/ mentions "each round"');
  expectFail('U4-copy-2 each round in the head', mutate(P, PVP_CANON, `${PVP_CANON}<meta name="keywords" content="augment each round">`), 'pvp-modes', '/pvp/ mentions "each round"');
  expectFail('U4-copy-2 each round split by markup', mutate(P, '</main>', '<p>each <i>round</i></p></main>'), 'pvp-modes', '/pvp/ mentions "each round"');
  expectFail('U4-copy Ten rounds split by markup', mutate(P, '</main>', '<p>Ten <b>rounds</b></p></main>'), 'pvp-modes', '/pvp/ mentions "Ten rounds"');
  expectFail(
    'U4-AC6 order',
    edit(mutate(P, '<article class="mode" data-mode><h3>Duels</h3><p>Ranked or unranked 1v1 on the Mythic and Magic arenas. Build your own kit layout.</p></article>', ''), P, '</section><section class="pvp-join" aria-label="Join">', '<article class="mode" data-mode><h3>Duels</h3><p>Ranked or unranked 1v1 on the Mythic and Magic arenas. Build your own kit layout.</p></article></section><section class="pvp-join" aria-label="Join">'),
    'pvp-modes',
    '/pvp/ mode 1 has no heading "Duels"',
  );

  // Owner ruling 2026-11-10: the /pvp/ section labels are gone (pvp-labels-removed only; the headings stay required).
  expectFail('U4-owner THE CLIMB above the tiers', mutate(P, '<section class="tiers" data-tiers><h2>', '<section class="tiers" data-tiers><p class="section-eyebrow">THE CLIMB</p><h2>'), 'pvp-labels-removed', '/pvp/ mentions "THE CLIMB"');
  expectFail('U4-owner MORE THAN DUELS above the modes', mutate(P, '<section class="modes" data-modes><h2>', '<section class="modes" data-modes><p class="section-eyebrow">MORE THAN DUELS</p><h2>'), 'pvp-labels-removed', '/pvp/ mentions "MORE THAN DUELS"');
  expectFail('U4-owner JOIN AND PLACE in the join section', mutate(P, '<section class="pvp-join" aria-label="Join"><p>', '<section class="pvp-join" aria-label="Join"><p class="section-eyebrow">JOIN AND PLACE</p><p>'), 'pvp-labels-removed', '/pvp/ mentions "JOIN AND PLACE"');
  expectFail('U4-owner a label split by markup', mutate(P, '</main>', '<p>THE <b>CLIMB</b></p></main>'), 'pvp-labels-removed', '/pvp/ mentions "THE CLIMB"');
  expectFail('U4-owner a label in the head', mutate(P, PVP_CANON, `${PVP_CANON}<meta name="keywords" content="JOIN AND PLACE">`), 'pvp-labels-removed', '/pvp/ mentions "JOIN AND PLACE"');
  {
    const r = runOn(mutate(P, '</main>', '<p>The climb starts here. More than duels.</p></main>'));
    check('U4-owner labels are case-sensitive (other case passes)', r.code === 0, `exit ${r.code}:
${r.out}`);
  }

  // U4-AC7 pvp-join
  expectFail('U4-AC7 join line', mutate(P, 'and pick Kit PVP in the hub.', 'and pick PVP.'), 'pvp-join', '/pvp/ has no join line');
  expectFail('U4-AC7 no copy button', mutate(P, ' data-copy-ip>', '>'), 'pvp-join', '/pvp/ has 0 [data-copy-ip] buttons, want 1');
  expectFail('U4-AC7 two copy buttons', mutate(P, '</main>', '<button type="button" data-copy-ip>COPY IP</button></main>'), 'pvp-join', '/pvp/ has 2 [data-copy-ip] buttons, want 1');
  expectFail('U4-AC7 copy label', mutate(P, 'data-copy-ip>COPY IP<', 'data-copy-ip>COPY<'), 'pvp-join', '/pvp/ [data-copy-ip] label is "COPY"');
  expectFail('U4-AC7 store credit (any case)', mutate(P, 'hats and titles.</p>', 'hats and titles.</p><p>Win Store&nbsp;Credit</p>'), 'pvp-join', '/pvp/ mentions "store credit"');
  expectFail('U4-AC7 store credit in the head', mutate(P, PVP_CANON, `${PVP_CANON}<meta name="keywords" content="store credit">`), 'pvp-join', '/pvp/ mentions "store credit"');
  expectFail('U4-AC7 Chromabit SMP', mutate(P, '</main>', '<p>Also try Chromabit SMP</p></main>'), 'pvp-join', '/pvp/ mentions "Chromabit SMP"');

  // Owner ruling 2026-11-10: no badge line on either landing mode card (home-mode-cards only).
  expectFail('U4-owner COMPETITIVE badge on the pvp card', mutate(H, '<p class="mode-desc">Ranked kit PVP.', '<span class="mode-badge">COMPETITIVE &middot; JAVA + BEDROCK</span><p class="mode-desc">Ranked kit PVP.'), 'home-mode-cards', '/ mentions "COMPETITIVE · JAVA + BEDROCK"');
  expectFail('U4-owner SURVIVAL badge on the smp card', mutate(H, '<p class="mode-desc">Survival with', '<span class="mode-badge">SURVIVAL · JAVA + BEDROCK</span><p class="mode-desc">Survival with'), 'home-mode-cards', '/ mentions "SURVIVAL · JAVA + BEDROCK"');
  expectFail('U4-owner badge split by markup', mutate(H, '<p class="mode-desc">Survival with', '<span>SURVIVAL &middot; <b>JAVA + BEDROCK</b></span><p class="mode-desc">Survival with'), 'home-mode-cards', '/ mentions "SURVIVAL · JAVA + BEDROCK"');

  // U4-AC8 nav-links
  expectFail('U4-AC8 PVP link missing on /store/', mutate('store/index.html', '<li><a href="/pvp/">PVP</a></li>', ''), 'nav-links', '/store/ nav links are');
  expectFail(
    'U4-AC8 PVP after STORE on /faq/',
    mutate('faq/index.html', '<li><a href="/pvp/">PVP</a></li><li><a href="/store/">STORE</a></li>', '<li><a href="/store/">STORE</a></li><li><a href="/pvp/">PVP</a></li>'),
    'nav-links',
    '/faq/ nav links are [["/","HOME"],["/store/","STORE"],["/pvp/","PVP"]',
  );
  expectFail('U4-AC8 PVP label on /', mutate(H, '<a href="/pvp/">PVP</a>', '<a href="/pvp/">RANKED</a>'), 'nav-links', '/ nav links are [["/","HOME"],["/pvp/","RANKED"]');
  expectFail('U4-AC8 PVP href without slash on /privacy/', mutate('privacy/index.html', '<li><a href="/pvp/">PVP', '<li><a href="/pvp">PVP'), 'nav-links', '/privacy/ nav links are');
  expectFail('U4-AC8 FAQ missing from the nav on /smp/', mutate(S, '<a href="/faq/">FAQ</a></header>', '</header>'), 'nav-links', '/smp/ nav links are');
  // Owner ruling 2026-11-10 (supersedes Amendment 2's BETA in the nav): no [data-beta] and no .beta-tag in any nav.
  expectFail('U4-owner [data-beta] in the PVP nav link on /auctions/', mutate('auctions/index.html', '<a href="/pvp/">PVP</a></li>', '<a href="/pvp/">PVP <span class="nav-beta" data-beta>BETA</span></a></li>'), 'nav-links', '/auctions/ nav has 1 BETA marker(s)');
  expectFail('U4-owner .beta-tag in the PVP nav link on /faq/', mutate('faq/index.html', '<a href="/pvp/">PVP</a></li>', '<a href="/pvp/">PVP <span class="beta-tag">BETA</span></a></li>'), 'nav-links', '/faq/ nav has 1 BETA marker(s)');
  expectFail('U4-owner [data-beta] on /pvp/ (nav-links only; the eyebrow tag stays)', mutate(P, '<a href="/pvp/" aria-current="page" class="active">PVP</a>', '<a href="/pvp/" aria-current="page" class="active">PVP<span data-beta>BETA</span></a>'), 'nav-links', '/pvp/ nav has 1 BETA marker(s)');
  expectFail('U4-owner BETA on STORE on /store/', mutate('store/index.html', '<li><a href="/store/">STORE</a></li>', '<li><a href="/store/">STORE<span data-beta>BETA</span></a></li>'), 'nav-links', '/store/ nav has 1 BETA marker(s)');
  expectFail('U4-owner marker outside a link but inside the header on /privacy/', mutate('privacy/index.html', '</ul></header>', '</ul><span class="beta-tag">BETA</span></header>'), 'nav-links', '/privacy/ nav has 1 BETA marker(s)');
  expectFail('U4-owner marker in a footer <nav> on /store/', mutate('store/index.html', '<a href="/pvp/">PVP</a><a href="/smp/">', '<a href="/pvp/">PVP</a><span data-beta>BETA</span><a href="/smp/">'), 'nav-links', '/store/ nav has 1 BETA marker(s)');
  expectFail('U4-owner PVP nav text not exactly PVP on /smp/', mutate(S, '<a href="/pvp/">PVP</a><a href="/store/">', '<a href="/pvp/">PVP BETA</a><a href="/store/">'), 'nav-links', '/smp/ nav links are [["/","HOME"],["/pvp/","PVP BETA"]');
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
  // U8: the /pvp/ entry now carries a lastmod (SITEMAP_PVP_LINE); and since U8 seo-sitemap requires all seven pages, so it fails with sitemap-pvp (both, and only both).
  expectFails('U4-AC9 no /pvp/ in the sitemap', mutate('sitemap.xml', SITEMAP_PVP_LINE, ''), {
    'sitemap-pvp': 'lists https://chromabit.us/pvp/ 0 times, want 1',
    'seo-sitemap': 'dist/sitemap.xml lacks ["https://chromabit.us/pvp/"]',
  });
  // Since U8 seo-sitemap requires exactly the seven indexable URLs (both, and only both).
  expectFails('U4-AC9 /pvp without slash', mutate('sitemap.xml', 'https://chromabit.us/pvp/', 'https://chromabit.us/pvp'), {
    'sitemap-pvp': '0 times',
    'seo-sitemap': 'dist/sitemap.xml lacks ["https://chromabit.us/pvp/"]',
  });

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

  // ------------------------------------------------------------------ U5 --
  const pvpGroup = (gs) => gs.find((g) => g.id === 'pvp');
  const moveGroup = (gs, from, to) => gs.splice(to, 0, gs.splice(from, 1)[0]);

  // The base build: no PVP group, old answers, JSON-LD regenerated from the base faq.json.
  expectFails('U5 the base FAQ fails exactly the three new content checks', faqSite((gs) => {
    gs.splice(1, 1);
    faqItem(gs, KIND_Q).a = FAQ_BASE[1].items[0].a;
    faqItem(gs, PVPON_Q).a = FAQ_BASE[1].items[4].a;
  }), {
    'faq-pvp-group': '/faq/ has 0 groups labelled "PVP", want 1',
    'faq-network-answers': 'still starts "A survival server"',
    'faq-jsonld-sync': '/faq/ FAQPage JSON-LD lacks the PVP questions',
  });
  {
    const r = runOn(faqSite((gs) => { faqItem(gs, PVPON_Q).a = PVPON_A.replace('On the SMP, PvP is on in', 'On the SMP, on in'); }));
    check('U5 the re-led "Is PvP on?" may keep "on in the overworld"', r.code === 0, `exit ${r.code}:\n${r.out}`);
  }
  {
    // Curly apostrophe, double spaces and an &nbsp; in the page; extra whitespace in the JSON-LD: all normalised.
    const groups = goodFaq();
    const site = faqSite((gs) => { pvpGroup(gs).items[0].a = pvpGroup(gs).items[0].a.replace("network's kit", 'network’s  kit'); }, faqLd(groups).replace('Sword and Mace.', ' Sword  and Mace. '));
    const [head, body] = site['faq/index.html'].split('</head>');
    site['faq/index.html'] = `${head}</head>${body.replace('Ranked duels are best', 'Ranked duels&nbsp;are best')}`;
    const r = runOn(site);
    check('U5 FAQ text is normalised (quotes, whitespace, nbsp)', r.code === 0, `exit ${r.code}:\n${r.out}`);
  }
  {
    const r = runOn(faqSite((gs) => { pvpGroup(gs).title = 'PvP'; }));
    check('U5 a group titled "PvP" renders as PVP and passes', r.code === 0, `exit ${r.code}:\n${r.out}`);
  }

  // U5-AC1 faq-pvp-group
  expectFail('U5-AC1 group label', faqSite((gs) => { pvpGroup(gs).title = 'Ranked PVP'; }), 'faq-pvp-group', '/faq/ has 0 groups labelled "PVP"');
  expectFail('U5-AC1 group placed after Gameplay', faqSite((gs) => moveGroup(gs, 1, 2)), 'faq-pvp-group', '/faq/ "PVP" group is group 3, want group 2');
  expectFail('U5-AC1 group placed first', faqSite((gs) => moveGroup(gs, 1, 0)), 'faq-pvp-group', '/faq/ "PVP" group is group 1, want group 2');
  expectFail('U5-AC1 group placed last', faqSite((gs) => moveGroup(gs, 1, gs.length - 1)), 'faq-pvp-group', 'want group 2');
  expectFail(
    'U5-AC1 two PVP groups',
    faqSite((gs) => { const g = pvpGroup(gs); gs.splice(2, 0, { id: 'pvp2', title: 'PVP', items: g.items.splice(3) }); }),
    'faq-pvp-group',
    '/faq/ has 2 groups labelled "PVP"',
  );
  expectFail('U5-AC1 questions swapped', faqSite((gs) => moveGroup(pvpGroup(gs).items, 2, 3)), 'faq-pvp-group', '/faq/ PVP questions are');
  // A PVP question that is not on the page is not in the JSON-LD either, which faq-jsonld-sync requires.
  expectFails('U5-AC1 a question missing', faqSite((gs) => pvpGroup(gs).items.splice(5, 1)), {
    'faq-pvp-group': '/faq/ PVP questions are',
    'faq-jsonld-sync': 'lacks the PVP questions ["What happens when a season ends?"]',
  });
  // A reworded PVP question is also a question the base never had, and the spec'd one is missing from the JSON-LD.
  expectFails('U5-AC1 a question reworded', faqSite((gs) => { pvpGroup(gs).items[1].q = 'How does ranked play work?'; }), {
    'faq-pvp-group': '/faq/ PVP questions are',
    'faq-unchanged': '/faq/ groups (besides the PVP questions) are',
    'faq-jsonld-sync': 'lacks the PVP questions ["How does ranked work?"]',
  });
  expectFail(
    'U5-AC1 a PVP question in the Gameplay group',
    faqSite((gs) => { gs[2].items.push(pvpGroup(gs).items.pop()); }),
    'faq-pvp-group',
    '/faq/ PVP questions are',
  );
  expectFail('U5-AC1 answer off by one char', faqSite((gs) => { pvpGroup(gs).items[3].a = 'Sword and Mace!'; }), 'faq-pvp-group', '/faq/ answer to "Which kits are ranked?" is "Sword and Mace!"');
  expectFail('U5-AC1 answer with an extra sentence', faqSite((gs) => { pvpGroup(gs).items[2].a += ' Crossplay is on.'; }), 'faq-pvp-group', '/faq/ answer to "Can Bedrock players play ranked?"');
  expectFail('U5-AC1 answer number wrong', faqSite((gs) => { pvpGroup(gs).items[1].a = pvpGroup(gs).items[1].a.replace('Play 10', 'Play 5'); }), 'faq-pvp-group', '/faq/ answer to "How does ranked work?"');
  expectFail('U5-AC1 em dash in an answer', faqSite((gs) => { pvpGroup(gs).items[5].a = pvpGroup(gs).items[5].a.replace('own ladder. When', 'own ladder — when'); }), 'faq-pvp-group', 'has an em dash');
  expectFail('U5-AC1 leaderboards without the link', faqSite((gs) => { pvpGroup(gs).items[4].a = 'On the PVP page of this site, and in game with `/leaderboard`.'; }), 'faq-pvp-group', 'links in the answer to "Where are the leaderboards?" are []');
  expectFail('U5-AC1 leaderboards link to /pvp', faqSite((gs) => { pvpGroup(gs).items[4].a = pvpGroup(gs).items[4].a.replace('(/pvp/)', '(/pvp)'); }), 'faq-pvp-group', '[["/pvp","PVP page"]]');
  expectFail('U5-AC1 leaderboards link text', faqSite((gs) => { pvpGroup(gs).items[4].a = 'On the PVP [page](/pvp/) of this site, and in game with `/leaderboard`.'; }), 'faq-pvp-group', '[["/pvp/","page"]]');

  // U5-AC2 faq-network-answers
  expectFail('U5-AC2 old "What kind" answer', faqSite((gs) => { faqItem(gs, KIND_Q).a = FAQ_BASE[1].items[0].a; }), 'faq-network-answers', 'still starts "A survival server"');
  expectFail(
    'U5-AC2 network sentence not first',
    faqSite((gs) => { faqItem(gs, KIND_Q).a = `Welcome. ${KIND_A}`; }),
    'faq-network-answers',
    'want it to start "Chromabit is a network with two servers behind one address',
  );
  expectFail(
    'U5-AC2 network sentence reworded',
    faqSite((gs) => { faqItem(gs, KIND_Q).a = KIND_A.replace('two servers behind one address', 'two servers on one address'); }),
    'faq-network-answers',
    'want it to start',
  );
  expectFail(
    'U5-AC2 "What kind" without "On the SMP,"',
    faqSite((gs) => { faqItem(gs, KIND_Q).a = KIND_A.replace('On the SMP, the difficulty', 'The difficulty'); }),
    'faq-network-answers',
    'after the network sentence is "The difficulty is Hard',
  );
  expectFail(
    'U5-AC2 "What kind" keeps the old first sentence too',
    faqSite((gs) => { faqItem(gs, KIND_Q).a = KIND_A.replace('On the SMP,', 'A survival server with a player-run economy. On the SMP,'); }),
    'faq-network-answers',
    'after the network sentence is "A survival server',
  );
  expectFail(
    'U5-AC2 "What kind" drops a fact',
    faqSite((gs) => { faqItem(gs, KIND_Q).a = KIND_A.replace(', and spend on land, gear and rank.', '.'); }),
    'faq-network-answers',
    'after the network sentence is',
  );
  expectFail(
    'U5-AC2 "What kind" adds a claim after "On the SMP,"',
    faqSite((gs) => { faqItem(gs, KIND_Q).a = KIND_A.replace('On the SMP, the difficulty', 'On the SMP, the biggest economy around, the difficulty'); }),
    'faq-network-answers',
    'after the network sentence is',
  );
  expectFail('U5-AC2 old "Is PvP on?" answer', faqSite((gs) => { faqItem(gs, PVPON_Q).a = FAQ_BASE[1].items[4].a; }), 'faq-network-answers', 'still starts "On in the overworld"');
  expectFail(
    'U5-AC2 "Is PvP on?" lead without the comma',
    faqSite((gs) => { faqItem(gs, PVPON_Q).a = PVPON_A.replace('On the SMP, PvP', 'On the SMP PvP'); }),
    'faq-network-answers',
    '/faq/ answer to "Is PvP on?" is "On the SMP PvP',
  );
  expectFail(
    'U5-AC2 "Is PvP on?" fact changed',
    faqSite((gs) => { faqItem(gs, PVPON_Q).a = PVPON_A.replace('15-second', '10-second'); }),
    'faq-network-answers',
    '/faq/ answer to "Is PvP on?" is',
  );
  expectFail(
    'U5-AC2 "Is PvP on?" with an em dash',
    faqSite((gs) => { faqItem(gs, PVPON_Q).a = PVPON_A.replace('On the SMP, PvP is on in', 'On the SMP, PvP is on — in'); }),
    'faq-network-answers',
    'has an em dash',
  );
  expectFail('U5-AC2 store credit on /faq/ (any case)', mutate('faq/index.html', 'Everything you need', 'Win Store&nbsp;Credit. Everything you need'), 'faq-network-answers', '/faq/ mentions "store credit"');
  expectFail('U5-AC2 store credit in the /faq/ head', mutate('faq/index.html', '<title>FAQ | Chromabit</title>', '<title>FAQ | Chromabit</title><meta name="keywords" content="store credit">'), 'faq-network-answers', '/faq/ mentions "store credit"');
  // Renaming a re-led question is a change to a base question too, so faq-unchanged fails with it (both, and only both).
  expectFails('U5-AC2 "What kind" question renamed', faqSite((gs) => { faqItem(gs, KIND_Q).q = 'What is Chromabit?'; }), {
    'faq-network-answers': '/faq/ has 0 questions "What kind of server is Chromabit?", want 1',
    'faq-unchanged': '/faq/ group "gameplay" questions are',
  });

  // U5-AC3 faq-unchanged
  expectFail('U5-AC3 a base answer changed', faqSite((gs) => { faqItem(gs, 'How much money do I start with?').a = faqItem(gs, 'How much money do I start with?').a.replace('$80,000', '$100,000'); }), 'faq-unchanged', '/faq/ answer to "How much money do I start with?" changed');
  expectFail('U5-AC3 a base answer re-led too', faqSite((gs) => { const it = faqItem(gs, 'What happens when I die?'); it.a = `On the SMP, you lose${it.a.slice('You lose'.length)}`; }), 'faq-unchanged', '/faq/ answer to "What happens when I die?" changed');
  expectFail('U5-AC3 markup-only change keeps text but drops a link', faqSite((gs) => { const it = faqItem(gs, 'What is in the auction house?'); it.a = it.a.replace('[auctions page](/auctions/)', 'auctions page'); }), 'faq-unchanged', 'links in the answer to "What is in the auction house?" are []');
  expectFail('U5-AC3 a link target changed', faqSite((gs) => { const it = faqItem(gs, 'What do paid ranks give?'); it.a = it.a.replace('(/store/)', '(/store/?tab=ranks)'); }), 'faq-unchanged', 'links in the answer to "What do paid ranks give?"');
  expectFail('U5-AC3 a base question reworded', faqSite((gs) => { faqItem(gs, 'Is there voice chat?').q = 'Is there proximity voice chat?'; }), 'faq-unchanged', '/faq/ group "joining" questions are');
  expectFail('U5-AC3 a base question removed', faqSite((gs) => gs.at(-1).items.pop()), 'faq-unchanged', '/faq/ group "rules" questions are');
  expectFail('U5-AC3 two base questions swapped', faqSite((gs) => moveGroup(gs.find((g) => g.id === 'ranks').items, 0, 1)), 'faq-unchanged', '/faq/ group "ranks" questions are');
  expectFail('U5-AC3 an extra non-PVP question', faqSite((gs) => { gs.find((g) => g.id === 'gameplay').items.push({ q: 'Is there a network?', a: 'Yes.' }); }), 'faq-unchanged', '/faq/ group "gameplay" questions are');
  // A seventh question in the PVP group breaks the PVP list too.
  expectFails('U5-AC3 a non-PVP question in the PVP group', faqSite((gs) => { pvpGroup(gs).items.push({ q: 'Is there a hub?', a: 'Yes.' }); }), {
    'faq-unchanged': '/faq/ groups (besides the PVP questions) are',
    'faq-pvp-group': '/faq/ PVP questions are',
  });
  expectFail('U5-AC3 a re-led question moved to another group', faqSite((gs) => { const g = gs.find((x) => x.id === 'gameplay'); gs.find((x) => x.id === 'economy').items.unshift(...g.items.splice(4, 1)); }), 'faq-unchanged', '/faq/ group "gameplay" questions are');
  expectFail('U5-AC3 a group renamed', faqSite((gs) => { gs.at(-1).title = 'Server rules'; }), 'faq-unchanged', '"rules:SERVER RULES"');
  expectFail('U5-AC3 a group id changed', faqSite((gs) => { gs.find((g) => g.id === 'events').id = 'events-crates'; }), 'faq-unchanged', '"events-crates:EVENTS AND CRATES"');
  expectFail('U5-AC3 two groups swapped', faqSite((gs) => moveGroup(gs, 3, 4)), 'faq-unchanged', '/faq/ groups (besides the PVP questions) are');
  expectFail('U5-AC3 a group removed', faqSite((gs) => gs.splice(gs.findIndex((g) => g.id === 'protection'), 1)), 'faq-unchanged', '/faq/ groups (besides the PVP questions) are');

  // U5-AC4 faq-jsonld-sync (defects in the JSON-LD only; the page is the spec'd one)
  const ldOf = (editLd) => {
    const doc = JSON.parse(faqLd(goodFaq()));
    editLd(doc);
    return JSON.stringify(doc);
  };
  expectFail('U5-AC4 JSON-LD from the base faq.json (stale)', faqSite(() => {}, faqLd(FAQ_BASE)), 'faq-jsonld-sync', '/faq/ FAQPage JSON-LD lacks the PVP questions');
  expectFail('U5-AC4 a question missing from the JSON-LD', faqSite(() => {}, ldOf((d) => d.mainEntity.pop())), 'faq-jsonld-sync', '/faq/ FAQPage mainEntity has 32 entries, the page shows 33 questions');
  expectFail('U5-AC4 a question twice in the JSON-LD', faqSite(() => {}, ldOf((d) => d.mainEntity.push(d.mainEntity[0]))), 'faq-jsonld-sync', 'mainEntity has 34 entries');
  expectFail('U5-AC4 JSON-LD order differs', faqSite(() => {}, ldOf((d) => moveGroup(d.mainEntity, 0, 1))), 'faq-jsonld-sync', 'mainEntity 1 name is "Can I play on Bedrock, phone or console?", the page shows "What is the server address?"');
  expectFail('U5-AC4 PVP group placed elsewhere in the JSON-LD', faqSite(() => {}, ldOf((d) => d.mainEntity.push(...d.mainEntity.splice(4, 6)))), 'faq-jsonld-sync', 'mainEntity 5 name is');
  expectFail('U5-AC4 stale re-led answer in the JSON-LD', faqSite(() => {}, ldOf((d) => { d.mainEntity.find((e) => e.name === KIND_Q).acceptedAnswer.text = FAQ_BASE[1].items[0].a; })), 'faq-jsonld-sync', `(${JSON.stringify(KIND_Q)}) answer is "A survival server`);
  expectFail('U5-AC4 markup left in a JSON-LD answer', faqSite(() => {}, ldOf((d) => { d.mainEntity[0].acceptedAnswer.text = '**play.chromabit.us** for Java Edition. Bedrock Edition uses the same address with port **19132**. There is no whitelist and no application.'; })), 'faq-jsonld-sync', 'answer is "**play.chromabit.us**');
  expectFail('U5-AC4 question name differs', faqSite(() => {}, ldOf((d) => { d.mainEntity[7].name = 'Which kits are ranked'; })), 'faq-jsonld-sync', 'mainEntity 8 name is "Which kits are ranked"');
  expectFail('U5-AC4 entry not a Question', faqSite(() => {}, ldOf((d) => { d.mainEntity[2]['@type'] = 'Thing'; })), 'faq-jsonld-sync', 'mainEntity 3 @type is "Thing"');
  expectFail('U5-AC4 answer without @type Answer', faqSite(() => {}, ldOf((d) => { delete d.mainEntity[5].acceptedAnswer['@type']; })), 'faq-jsonld-sync', 'mainEntity 6 ("How does ranked work?") has no acceptedAnswer');
  expectFail('U5-AC4 no FAQPage block', faqSite(() => {}, ldOf((d) => { d['@type'] = 'WebPage'; })), 'faq-jsonld-sync', '/faq/ has 0 JSON-LD FAQPage nodes, want 1');
  expectFail('U5-AC4 mainEntity not an array', faqSite(() => {}, ldOf((d) => { d.mainEntity = d.mainEntity[0]; })), 'faq-jsonld-sync', '/faq/ FAQPage mainEntity is not an array');
  {
    const site = faqSite();
    site['faq/index.html'] = site['faq/index.html'].replace('</head>', `<script type="application/ld+json">${LD_FAQ}</script>\n</head>`);
    expectFail('U5-AC4 two FAQPage blocks', site, 'faq-jsonld-sync', '/faq/ has 2 JSON-LD FAQPage nodes, want 1');
  }

  // ===================================================================== U7 ==
  const PL = 'pvp/player/index.html';
  const plMut = (from, to) => mutate(PL, from, to);
  const passes = (name, site) => {
    const r = runOn(site);
    check(name, r.code === 0, `exit ${r.code}:\n${r.out}`);
  };

  // U7 player-shell
  expectFails('U7 profile page missing', { ...goodSite(), [PL]: null }, {
    'player-shell': '/pvp/player/ missing (pvp/player/index.html)',
    'player-nav': '/pvp/player/ missing',
    'player-internal-links': '/pvp/player/ missing',
    // U8: the semantics and hint checks cover the profile page too.
    'a11y-headings': '/pvp/player/ missing',
    'a11y-landmarks': '/pvp/player/ missing',
    'a11y-names': '/pvp/player/ missing',
    'img-attrs': '/pvp/player/ missing',
    'perf-hints': '/pvp/player/ missing',
    'pvp-referrer': '/pvp/player/ missing',
  });
  expectFail('U7 profile shell not prerendered', plMut(`<div id="app">${PLAYER_BODY}</div>`, `<div id="app"></div>${PLAYER_BODY}`), 'player-shell', '/pvp/player/ <div id="app"> is empty');
  expectFail('U7 profile title', plMut(`<title>${PLAYER_TITLE}</title>`, '<title>Player Profile | Chromabit</title>'), 'player-shell', '/pvp/player/ title is "Player Profile | Chromabit"');
  expectFail('U7 profile robots missing', plMut(PLAYER_ROBOTS, ''), 'player-shell', '/pvp/player/ has 0 robots metas, want 1');
  expectFail('U7 profile robots index', plMut(PLAYER_ROBOTS, '<meta name="robots" content="index, follow">'), 'player-shell', '/pvp/player/ robots is "index, follow"');
  expectFail('U7 profile robots nofollow', plMut(PLAYER_ROBOTS, '<meta name="robots" content="noindex,nofollow">'), 'player-shell', '/pvp/player/ robots is "noindex,nofollow"');
  expectFail('U7 profile two robots metas', plMut(PLAYER_ROBOTS, `${PLAYER_ROBOTS}<meta name="robots" content="index">`), 'player-shell', '/pvp/player/ has 2 robots metas');
  passes('U7 profile robots "noindex, follow" (space) passes', plMut(PLAYER_ROBOTS, '<meta name="robots" content="noindex, follow">'));
  expectFail('U7 profile canonical to itself', plMut(PVP_CANON, '<link rel="canonical" href="https://chromabit.us/pvp/player/">'), 'player-shell', '/pvp/player/ canonical is "https://chromabit.us/pvp/player/"');
  expectFail('U7 profile canonical missing', plMut(PVP_CANON, ''), 'player-shell', '/pvp/player/ has 0 <link rel="canonical">');
  expectFail('U7 profile og:site_name', plMut(`<meta property="og:site_name" content="${NET}">`, '<meta property="og:site_name" content="Chromabit">'), 'player-shell', '/pvp/player/ og:site_name is "Chromabit"');
  expectFail('U7 profile author missing', plMut(`<meta name="author" content="${NET}">`, ''), 'player-shell', '/pvp/player/ has no author');
  expectFail('U7 profile JSON-LD broken', plMut('</head>', '<script type="application/ld+json">{nope</script>\n</head>'), 'player-shell', '/pvp/player/ JSON-LD block 1 does not parse');
  expectFail('U7 profile h1 text', plMut(PLAYER_H1, '<h1 class="hero-title">LOADING</h1>'), 'player-shell', '/pvp/player/ <h1> text is "LOADING", want "PLAYER"');
  expectFail('U7 profile two h1', plMut(PLAYER_H1, `${PLAYER_H1}<h1>PLAYER</h1>`), 'player-shell', '/pvp/player/ has 2 <h1>, want 1');
  expectFail('U7 profile no h1', plMut(PLAYER_H1, '<h2>PLAYER</h2>'), 'player-shell', '/pvp/player/ has 0 <h1>, want 1');
  expectFail('U7 profile eyebrow text', plMut('CHROMAPVP &middot; PLAYER <span', 'CHROMAPVP &middot; PROFILE <span'), 'player-shell', '/pvp/player/ has no eyebrow "CHROMAPVP · PLAYER"');
  expectFail('U7 profile eyebrow without BETA', plMut(' <span class="beta-tag">BETA</span></p>', '</p>'), 'player-shell', '/pvp/player/ has 0 .beta-tag, want 1');
  expectFail('U7 profile BETA outside the eyebrow', plMut(' <span class="beta-tag">BETA</span></p>', '</p><span class="beta-tag">BETA</span>'), 'player-shell', 'eyebrow "CHROMAPVP · PLAYER" has no .beta-tag inside it');
  expectFail('U7 profile two BETA tags', plMut(PLAYER_STATE, `${PLAYER_STATE}<span class="beta-tag">BETA</span>`), 'player-shell', '/pvp/player/ has 2 .beta-tag, want 1');
  expectFail('U7 profile BETA tag text', plMut('<span class="beta-tag">BETA</span>', '<span class="beta-tag">NEW</span>'), 'player-shell', 'eyebrow .beta-tag text is "NEW"');
  {
    const site = plMut(`${PLAYER_EYEBROW}<div class="profile-name">`, '<div class="profile-name">');
    expectFail('U7 profile eyebrow after the h1', edit(site, PL, PLAYER_STATE, `${PLAYER_STATE}${PLAYER_EYEBROW}`), 'player-shell', '/pvp/player/ eyebrow comes after the <h1>');
  }
  expectFail('U7 profile state missing', plMut(PLAYER_STATE, '<p>Loading player.</p>'), 'player-shell', '/pvp/player/ has 0 [data-profile-state], want 1');
  expectFail('U7 profile state hidden', plMut('data-profile-state>', 'data-profile-state hidden>'), 'player-shell', '/pvp/player/ [data-profile-state] is hidden');
  expectFail('U7 profile state inside a hidden wrapper', plMut(PLAYER_STATE, `<div hidden>${PLAYER_STATE}</div>`), 'player-shell', '/pvp/player/ [data-profile-state] is hidden');
  expectFail('U7 profile state text', plMut('>Loading player.<', '>Loading...<'), 'player-shell', 'want an element with "Loading player."');
  expectFail('U7 profile two state elements', plMut(PLAYER_STATE, `${PLAYER_STATE}${PLAYER_STATE}`), 'player-shell', '/pvp/player/ has 2 [data-profile-state], want 1');
  passes('U7 profile state text in a child element passes', plMut(PLAYER_STATE, '<div class="profile-state" data-profile-state><p>Loading player.</p></div>'));
  expectFail('U7 profile shell shows the not-ranked text', plMut(PLAYER_STATE, `${PLAYER_STATE}<p>Not ranked this season.</p>`), 'player-shell', 'prerendered shell shows "Not ranked this season."');
  expectFail('U7 profile shell shows the unavailable text', plMut(PLAYER_STATE, `${PLAYER_STATE}<p>Player data is unavailable right now.</p>`), 'player-shell', 'prerendered shell shows "Player data is unavailable right now."');
  passes('U7 profile shell may carry the other states hidden', plMut(PLAYER_STATE, `${PLAYER_STATE}<p hidden>Not ranked this season.</p><div hidden><p>Player data is unavailable right now.</p></div>`));
  expectFail('U7 profile back link missing', plMut(PLAYER_BACK, ''), 'player-shell', 'has no back link <a href="/pvp/">ALL LEADERBOARDS</a>');
  expectFail('U7 profile back link text', plMut(PLAYER_BACK, '<a href="/pvp/">BACK</a>'), 'player-shell', 'has no back link');
  expectFail('U7 profile back link href', plMut(PLAYER_BACK, '<a href="/">ALL LEADERBOARDS</a>'), 'player-shell', 'has no back link');
  expectFail('U7 profile back link hidden', plMut(PLAYER_BACK, '<a href="/pvp/" hidden>ALL LEADERBOARDS</a>'), 'player-shell', '/pvp/player/ back link "ALL LEADERBOARDS" is hidden');
  expectFails('U7 profile back link only in the footer', edit(plMut(PLAYER_BACK, ''), PL, '<a href="/pvp/">PVP</a><a href="/smp/">', '<a href="/pvp/">PVP</a><a href="/pvp/">ALL LEADERBOARDS</a><a href="/smp/">'), {
    'player-shell': 'has no back link',
    'player-nav': '/pvp/player/ footer has 2 links to /pvp/',
  });
  for (const [attr, html] of [
    // U8: the planted kit card's heading is an h2 (was h3), so it does not also skip a level after the h1 (a11y-headings); intent unchanged.
    ['data-kit', '<article data-kit="sword"><h2>Sword</h2></article>'],
    ['data-career', '<section data-career><p>0 kills</p></section>'],
    ['data-recent', '<section data-recent><h2>RECENT RANKED</h2></section>'],
    ['data-recent-row', '<table><tbody><tr data-recent-row><td>WIN</td></tr></tbody></table>'],
  ])
    expectFail(`U7 profile shell shows [${attr}]`, plMut(PLAYER_STATE, `${PLAYER_STATE}${html}`), 'player-shell', `prerendered shell shows 1 [${attr}]`);
  passes('U7 profile shell may carry hidden data blocks', plMut(PLAYER_STATE, `${PLAYER_STATE}<section data-career hidden></section><div hidden><article data-kit="sword"></article><section data-recent></section></div>`));
  expectFail('U7 profile shell with sample data', plMut(PLAYER_STATE, `${PLAYER_STATE}<p hidden>Sample_01</p>`), 'player-shell', '/pvp/player/ contains sample data ("Sample_")');
  expectFail('U7 profile shell with the fixture base', plMut('</head>', '<meta name="x-feed" content="/pvp-fixture">\n</head>'), 'player-shell', '/pvp/player/ contains "/pvp-fixture"');

  // U7 player-not-in-sitemap
  const withLoc = (loc) => ({ ...goodSite(), 'sitemap.xml': SITEMAP.replace('</urlset>', `  <url><loc>${loc}</loc></url>\n</urlset>`) });
  expectFail('U7 sitemap lists the profile page', withLoc('https://chromabit.us/pvp/player/'), 'player-not-in-sitemap', 'dist/sitemap.xml lists the profile page');
  expectFail('U7 sitemap lists a profile', withLoc('https://chromabit.us/pvp/player/?name=sample_01'), 'player-not-in-sitemap', 'dist/sitemap.xml lists the profile page');
  // A missing sitemap stays sitemap-pvp's failure alone (the U4-AC9 "sitemap missing" case covers it).

  // U7 player-nav
  expectFail('U7 profile nav: PVP not current', plMut(PVP_NAV, NAV), 'player-nav', '/pvp/player/ nav aria-current="page" links are [], want ["/pvp/"]');
  expectFail('U7 profile nav: HOME current too', plMut('<a href="/">HOME</a>', '<a href="/" aria-current="page">HOME</a>'), 'player-nav', 'links are ["/","/pvp/"]');
  expectFail('U7 profile nav: STORE missing', plMut('<li><a href="/store/">STORE</a></li>', ''), 'player-nav', '/pvp/player/ nav links are');
  expectFail('U7 profile nav: BETA marker', plMut('aria-current="page" class="active">PVP</a>', 'aria-current="page" class="active">PVP <span data-beta>BETA</span></a>'), 'player-nav', 'BETA marker');
  expectFails('U7 profile nav: .beta-tag in the nav', plMut('aria-current="page" class="active">PVP</a>', 'aria-current="page" class="active">PVP</a><span class="beta-tag">BETA</span>'), {
    'player-nav': 'BETA marker',
    'player-shell': '/pvp/player/ has 2 .beta-tag',
  });
  expectFail('U7 profile nav missing', plMut(PVP_NAV, ''), 'player-nav', '/pvp/player/ has no nav <header>');
  expectFail('U7 profile footer without PVP', plMut('<a href="/pvp/">PVP</a><a href="/smp/">', '<a href="/smp/">'), 'player-nav', '/pvp/player/ footer has 0 links to /pvp/');
  expectFail('U7 profile footer missing', plMut(FOOTER, ''), 'player-nav', '/pvp/player/ has no <footer>');

  // U7 player-internal-links
  expectFail('U7 profile broken internal link', plMut(PLAYER_STATE, `${PLAYER_STATE}<a href="/pvp/players/">x</a>`), 'player-internal-links', '/pvp/player/ <a href="/pvp/players/"> does not resolve');
  passes('U7 profile links with a query resolve', plMut(PLAYER_STATE, `${PLAYER_STATE}<a href="/pvp/?board=sword">x</a><a href="/pvp/player/?name=b-x">y</a>`));

  // U7 pvp-search-shell
  const PV = 'pvp/index.html';
  const svMut = (from, to) => mutate(PV, from, to);
  const BOARD_TABLE = '<table data-board-table><thead><tr><th>#</th></tr></thead><tbody></tbody></table>';
  expectFail('U7 search block missing', svMut(PVP_SEARCH, ''), 'pvp-search-shell', '/pvp/ has 0 [data-player-search], want 1');
  expectFail('U7 two search blocks', svMut(PVP_SEARCH, `${PVP_SEARCH}${PVP_SEARCH.replace(/player-q/g, 'player-q2')}`), 'pvp-search-shell', '/pvp/ has 2 [data-player-search], want 1');
  expectFail('U7 search block not hidden', svMut('data-player-search hidden>', 'data-player-search>'), 'pvp-search-shell', 'has no hidden attribute in the prerendered HTML');
  expectFail('U7 search block only inside a hidden wrapper', svMut(PVP_SEARCH, `<div hidden>${PVP_SEARCH.replace('data-player-search hidden>', 'data-player-search>')}</div>`), 'pvp-search-shell', 'has no hidden attribute');
  passes('U7 search above the board table passes', svMut(PVP_EMPTY, `${BOARD_TABLE}${PVP_EMPTY}`));
  expectFail('U7 search below the board table', edit(svMut(PVP_SEARCH, ''), PV, PVP_EMPTY, `${BOARD_TABLE}${PVP_SEARCH}${PVP_EMPTY}`), 'pvp-search-shell', 'comes after [data-board-table]');
  expectFail('U7 search label text', svMut('>FIND A PLAYER<', '>Find a player<'), 'pvp-search-shell', '/pvp/ search <label> text is "Find a player", want "FIND A PLAYER"');
  expectFail('U7 search label missing', svMut('<label for="player-q">FIND A PLAYER</label>', '<span>FIND A PLAYER</span>'), 'pvp-search-shell', '/pvp/ [data-player-search] has 0 <label>, want 1');
  expectFail('U7 search label not tied', svMut('<label for="player-q">', '<label for="other">'), 'pvp-search-shell', 'is not tied to the <input>');
  passes('U7 search input inside its label passes', svMut('<label for="player-q">FIND A PLAYER</label><input id="player-q" type="search" autocomplete="off" maxlength="20">', '<label>FIND A PLAYER <input type="search" autocomplete="off" maxlength="20"></label>'));
  expectFail('U7 search input type', svMut('type="search"', 'type="text"'), 'pvp-search-shell', 'search <input> type is "text", want "search"');
  expectFail('U7 search input autocomplete missing', svMut(' autocomplete="off"', ''), 'pvp-search-shell', 'search <input> autocomplete is null, want "off"');
  expectFail('U7 search input maxlength', svMut('maxlength="20"', 'maxlength="16"'), 'pvp-search-shell', 'search <input> maxlength is "16", want "20"');
  expectFail('U7 search two inputs', svMut('maxlength="20">', 'maxlength="20"><input type="hidden" name="x">'), 'pvp-search-shell', 'has 2 <input>, want 1');
  expectFail('U7 search results list missing', svMut('<ul class="search-results" data-search-results></ul>', '<ul></ul>'), 'pvp-search-shell', 'has 0 [data-search-results], want 1');
  expectFail('U7 search results list outside the block', edit(svMut('<ul class="search-results" data-search-results></ul>', ''), PV, '<div class="board-tabs"', '<ul data-search-results></ul><div class="board-tabs"'), 'pvp-search-shell', 'has 0 [data-search-results], want 1');
  expectFail('U7 search prerendered with a result', svMut('data-search-results></ul>', 'data-search-results><li><a data-search-result href="/pvp/player/?name=x">x</a></li></ul>'), 'pvp-search-shell', '/pvp/ prerendered HTML has 1 [data-search-result], want 0');
  expectFail('U7 search prerendered with a plain link', svMut('data-search-results></ul>', 'data-search-results><li><a href="/pvp/">x</a></li></ul>'), 'pvp-search-shell', 'prerendered [data-search-results] contains links');
  expectFail('U7 no-match text shown with an empty query', svMut(PVP_SEARCH, `${PVP_SEARCH}<p>No ranked player by that name.</p>`), 'pvp-search-shell', 'shows "No ranked player by that name." with an empty query');

  // ===================================================================== U8 ==
  const ST = 'store/index.html';
  const FQ = 'faq/index.html';
  const AU = 'auctions/index.html';
  const PR = 'privacy/index.html';
  const meta = (attr, key, content) => `<meta ${attr}="${key}" content="${content}">`;
  const withFile = (rel, content) => ({ ...goodSite(), [rel]: content });
  const desc = (n) => `Chromabit ${'x'.repeat(n - 10)}`;

  // seo-head
  expectFail('U8 og:locale missing on /smp/', mutate(S, meta('property', 'og:locale', 'en_US'), ''), 'seo-head', '/smp/ has no og:locale');
  expectFail('U8 og:locale en_GB on /faq/', mutate(FQ, meta('property', 'og:locale', 'en_US'), meta('property', 'og:locale', 'en_GB')), 'seo-head', '/faq/ og:locale is "en_GB", want "en_US"');
  expectFail('U8 og:url is not the canonical on /store/', mutate(ST, meta('property', 'og:url', 'https://chromabit.us/store/'), meta('property', 'og:url', 'https://chromabit.us/store')), 'seo-head', '/store/ og:url is "https://chromabit.us/store"');
  expectFail('U8 canonical missing on /auctions/', mutate(AU, '<link rel="canonical" href="https://chromabit.us/auctions/">', ''), 'seo-head', '/auctions/ has 0 <link rel="canonical">, want 1');
  expectFail('U8 canonical http on /privacy/', mutate(PR, '<link rel="canonical" href="https://chromabit.us/privacy/">', '<link rel="canonical" href="http://chromabit.us/privacy/">'), 'seo-head', '/privacy/ canonical is "http://chromabit.us/privacy/"');
  expectFail('U8 two canonicals on /smp/', mutate(S, '<link rel="canonical" href="https://chromabit.us/smp/">', '<link rel="canonical" href="https://chromabit.us/smp/"><link rel="canonical" href="https://chromabit.us/">'), 'seo-head', '/smp/ has 2 <link rel="canonical">');
  expectFail('U8 og:image:width 1201 on /', mutate(H, meta('property', 'og:image:width', '1200'), meta('property', 'og:image:width', '1201')), 'seo-head', '/ og:image:width is "1201", want "1200"');
  expectFail('U8 og:image:height missing on /pvp/', mutate(P, meta('property', 'og:image:height', '630'), ''), 'seo-head', '/pvp/ has no og:image:height');
  expectFail('U8 og:image:alt empty on /smp/', mutate(S, meta('property', 'og:image:alt', 'Chromabit Network'), meta('property', 'og:image:alt', ' ')), 'seo-head', '/smp/ og:image:alt is empty');
  expectFail('U8 og:type missing on /privacy/', mutate(PR, meta('property', 'og:type', 'website'), ''), 'seo-head', '/privacy/ has 0 og:type, want 1');
  expectFail('U8 twitter:card summary on /faq/', mutate(FQ, meta('name', 'twitter:card', 'summary_large_image'), meta('name', 'twitter:card', 'summary')), 'seo-head', '/faq/ twitter:card is "summary"');
  expectFail('U8 twitter:image another file on /store/', mutate(ST, meta('name', 'twitter:image', OG), meta('name', 'twitter:image', 'https://chromabit.us/server-icon.png')), 'seo-head', '/store/ twitter:image is "https://chromabit.us/server-icon.png"');
  expectFail('U8 twitter:description missing on /smp/', mutate(S, meta('name', 'twitter:description', DESC.smp), ''), 'seo-head', '/smp/ has 0 twitter:description, want 1');
  expectFail('U8 twitter:title missing on /auctions/', mutate(AU, meta('name', 'twitter:title', 'Auction House | Chromabit SMP'), ''), 'seo-head', '/auctions/ has 0 twitter:title');
  expectFail('U8 theme-color missing on /auctions/', mutate(AU, '<meta name="theme-color" content="#0b0614">', ''), 'seo-head', '/auctions/ has 0 theme-color, want 1');
  expectFail('U8 robots without the snippet tokens on /faq/', mutate(FQ, ROBOTS_META, '<meta name="robots" content="index, follow">'), 'seo-head', '/faq/ robots is "index, follow"');
  expectFail('U8 robots noindex on /privacy/ (as at 762b268)', mutate(PR, ROBOTS_META, '<meta name="robots" content="noindex, follow, max-image-preview:large, max-snippet:-1">'), 'seo-head', '/privacy/ robots is "noindex, follow');
  expectFail('U8 robots missing on /store/', mutate(ST, ROBOTS_META, ''), 'seo-head', '/store/ has 0 robots metas, want 1');
  expectFail('U8 <html lang> en-US on /store/', mutate(ST, '<html lang="en">', '<html lang="en-US">'), 'seo-head', '/store/ <html lang> is "en-US", want "en"');
  expectFail('U8 description 161 characters on /smp/', mutate(S, DESC.smp, desc(161)), 'seo-head', '/smp/ description is 161 characters, want 70-160');
  expectFail('U8 description 69 characters on /auctions/', mutate(AU, DESC.auctions, desc(69)), 'seo-head', '/auctions/ description is 69 characters');
  passes('U8 descriptions of exactly 70 and 160 characters pass', edit(mutate(S, DESC.smp, desc(160)), AU, DESC.auctions, desc(70)));
  passes('U8 the home description (167 characters, pinned by home-head) is exempt from the range', goodSite());
  expectFail('U8 two pages share a description', mutate(FQ, DESC.faq, DESC.smp), 'seo-head', '/smp/ and /faq/ share the description');
  expectFail('U8 two descriptions on /faq/', mutate(FQ, meta('name', 'description', DESC.faq), `${meta('name', 'description', DESC.faq)}${meta('name', 'description', DESC.faq)}`), 'seo-head', '/faq/ has 2 meta descriptions, want 1');
  expectFails('U8 two pages share a title (subpage-titles pins it too)', mutate(ST, '<title>Store | Chromabit</title>', '<title>FAQ | Chromabit</title>'), {
    'subpage-titles': '/store/ title is "FAQ | Chromabit"',
    'seo-head': '/faq/ and /store/ share the title',
  });
  expectFail('U8 store description says "the Chromabit Minecraft server" (762b268 wording)', mutate(ST, DESC.store, 'The official Chromabit store. Buy ranks, crate keys, and more for the Chromabit Minecraft server. Every purchase supports the server.'), 'seo-head', '/store/ description still says "the Chromabit Minecraft server"');
  expectFail('U8 store description with "Server" in another phrase', mutate(ST, DESC.store, 'The official Chromabit store. Buy ranks, crate keys and more; every purchase keeps the Server running.'), 'seo-head', '/store/ description contains "server"');
  expectFail('U8 store description without "Chromabit"', mutate(ST, DESC.store, 'The official store. Buy ranks, crate keys and more; every purchase directly helps the network grow.'), 'seo-head', '/store/ description does not name "Chromabit"');

  // seo-titles-frozen: the base fixture is a snapshot of the good site; the site under test differs.
  {
    const r = runOn(goodSite(), mutate(FQ, '<title>FAQ | Chromabit</title>', '<title>FAQ | Chromabit Network</title>'));
    const fails = r.lines.filter((l) => l.startsWith('FAIL '));
    check('U8 frozen: a title that differs from the fixture fails seo-titles-frozen alone', r.code === 1 && fails.length === 1 && fails[0].startsWith('FAIL seo-titles-frozen: /faq/ title is "FAQ | Chromabit", frozen at "FAQ | Chromabit Network"'), `exit ${r.code}:\n${r.out}`);
  }
  {
    const r = runOn(mutate(FQ, DESC.faq, 'Answers about the Chromabit network: the server address, versions, ranks, the auction house, claims and rules.'), goodSite());
    const fails = r.lines.filter((l) => l.startsWith('FAIL '));
    check('U8 frozen: an approved description reworded fails seo-titles-frozen alone', r.code === 1 && fails.length === 1 && fails[0].startsWith('FAIL seo-titles-frozen: /faq/ description is'), `exit ${r.code}:\n${r.out}`);
  }
  {
    // /smp/ was out of range in the base, so it is released: a rewrite passes, a rewrite with a number the page does not show fails.
    const base = mutate(S, DESC.smp, `${DESC.smp} Join the grind at play.chromabit.us and trade with everyone on the market, every day of the week.`);
    let r = runOn(goodSite(), base);
    check('U8 frozen: a released (out-of-range) description may be rewritten', r.code === 0, `exit ${r.code}:\n${r.out}`);
    r = runOn(mutate(S, DESC.smp, 'Survival with a player-run market on Chromabit: 500 players, claims, custom spawners and a dungeon.'), base);
    const fails = r.lines.filter((l) => l.startsWith('FAIL '));
    check('U8 frozen: a rewritten description may not state a number the page does not show', r.code === 1 && fails.length === 1 && fails[0].startsWith('FAIL seo-titles-frozen: /smp/ rewritten description states ["500"]'), `exit ${r.code}:\n${r.out}`);
  }
  {
    // The store description is always released (wording change); a different, rule-abiding one passes.
    const r = runOn(mutate(ST, DESC.store, 'Ranks, crate keys and more from the official Chromabit store. Every purchase directly helps Chromabit.'), goodSite());
    check('U8 frozen: the store description is released', r.code === 0, `exit ${r.code}:\n${r.out}`);
  }

  // visible-text-unchanged: the base fixture is a snapshot of the good site.
  {
    const vis = (name, site, ok, needle = '') => {
      const r = runOn(site, goodSite());
      const fails = r.lines.filter((l) => l.startsWith('FAIL '));
      const good = ok ? r.code === 0 : r.code === 1 && fails.length === 1 && fails[0].startsWith('FAIL visible-text-unchanged:') && fails[0].includes(needle);
      check(name, good, `exit ${r.code}:\n${r.out}`);
    };
    vis('U8 visible: a word changed fails', mutate(PR, '<main>Privacy</main>', '<main>Privacy policy</main>'), false, '/privacy/ visible text differs at character');
    vis('U8 visible: visually hidden text added fails (needs sign-off and a fixture update)', mutate(ST, '<main><h1>STORE</h1>', '<main><h1>STORE<span class="visually-hidden"> for Chromabit ranks</span></h1>'), false, '/store/ visible text differs');
    vis('U8 visible: text reordered fails', mutate(AU, '<main><h1>Auction House</h1>Chromabit SMP market</main>', '<main>Chromabit SMP market<h1>Auction House</h1></main>'), false, '/auctions/ visible text differs');
    vis('U8 visible: text hidden with the hidden attribute still counts (fails)', mutate(ST, '<main><h1>STORE</h1>', '<main><h1>STORE</h1><p hidden>Also on Bedrock.</p>'), false, '/store/ visible text differs');
    vis('U8 visible: an empty live region adds no text (passes)', mutate(ST, '<main><h1>STORE</h1>', '<main><h1>STORE</h1><p class="sr-only" role="status" aria-live="polite"></p>'), true);
    vis('U8 visible: attributes (aria-label, width/height, loading) add no text (passes)', mutate(ST, '<main><h1>STORE</h1>', '<main aria-label="Store"><h1 id="store-title">STORE</h1>'), true);
    vis('U8 visible: whitespace and entity spelling are normalised (passes)', mutate(AU, 'Chromabit SMP market', 'Chromabit&nbsp;SMP\n   market'), true);
    vis('U8 visible: head-only changes are not visible text (passes)', mutate(ST, ROBOTS_META, `${ROBOTS_META}<meta name="keywords" content="ranks">`), true);
  }

  // seo-jsonld
  const homeLd = (fn) => {
    const doc = JSON.parse(LD_HOME);
    fn(doc['@graph']);
    return mutate(H, LD_HOME, JSON.stringify(doc));
  };
  const gameLd = (fn) => {
    const doc = JSON.parse(LD_GAME);
    fn(doc);
    return mutate(H, LD_GAME, JSON.stringify(doc));
  };
  const subLd = (rel, route, name, fn) => {
    const src = ldSub(route, name);
    const doc = JSON.parse(src);
    fn(doc['@graph']);
    return mutate(rel, src, JSON.stringify(doc));
  };
  const pvpLd = (fn) => {
    const doc = JSON.parse(LD_PVP);
    fn(doc['@graph']);
    return mutate(P, LD_PVP, JSON.stringify(doc));
  };
  expectFail('U8 Organization sameAs without Discord', homeLd((g) => { g[1].sameAs = ['https://x.com/chromabit']; }), 'seo-jsonld', '/ Organization sameAs ["https://x.com/chromabit"] lacks the Discord URL');
  expectFail('U8 Organization logo relative', homeLd((g) => { g[1].logo = '/server-icon.png'; }), 'seo-jsonld', '/ Organization logo "/server-icon.png" is not an absolute https://chromabit.us/ URL of a file in dist');
  expectFail('U8 Organization logo missing from dist', homeLd((g) => { g[1].logo = 'https://chromabit.us/logo-512.png'; }), 'seo-jsonld', 'does not resolve to a file in dist');
  passes('U8 Organization logo as an ImageObject passes', homeLd((g) => { g[1].logo = { '@type': 'ImageObject', url: 'https://chromabit.us/server-icon.png', width: 64, height: 64 }; }));
  expectFail('U8 Organization url wrong', homeLd((g) => { g[1].url = 'https://chromabit.us/store/'; }), 'seo-jsonld', '/ Organization url is "https://chromabit.us/store/"');
  expectFail('U8 WebSite url missing', homeLd((g) => { delete g[0].url; }), 'seo-jsonld', '/ WebSite url is null');
  expectFail('U8 no VideoGame on /', mutate(H, ldTag(LD_GAME), ''), 'seo-jsonld', '/ has 0 VideoGame nodes named Minecraft, want 1');
  expectFail('U8 gamePlatform without Bedrock', gameLd((d) => { d.gamePlatform = 'Java Edition'; }), 'seo-jsonld', '/ VideoGame gamePlatform is "Java Edition", want both Java and Bedrock editions');
  expectFail('U8 gameServer not a GameServer', gameLd((d) => { d.gameServer['@type'] = 'Place'; }), 'seo-jsonld', '/ VideoGame has 0 gameServer nodes of @type GameServer, want 1');
  expectFail('U8 GameServer without a name', gameLd((d) => { delete d.gameServer.name; }), 'seo-jsonld', '/ GameServer has no name');
  expectFail('U8 GameServer without url or address', gameLd((d) => { delete d.gameServer.url; delete d.gameServer.identifier; }), 'seo-jsonld', '/ GameServer has neither a url nor the address "play.chromabit.us"');
  passes('U8 GameServer with only the address passes', gameLd((d) => { delete d.gameServer.url; }));
  expectFail('U8 playersOnline in the GameServer', gameLd((d) => { d.gameServer.playersOnline = 'many'; }), 'seo-jsonld', '/ JSON-LD has playersOnline (volatile)');
  expectFail('U8 serverStatus in the GameServer', gameLd((d) => { d.gameServer.serverStatus = 'OnlineServerStatus'; }), 'seo-jsonld', '/ JSON-LD has serverStatus (volatile)');
  expectFail('U8 a volatile number', gameLd((d) => { d.numberOfPlayers = 50; }), 'seo-jsonld', '/ JSON-LD numberOfPlayers is the number 50');
  expectFail('U8 sub page without the Organization reference', subLd(ST, '/store/', 'Store', (g) => { delete g[0].publisher; }), 'seo-jsonld', "/store/ has no Organization node and no @id reference to the home page's Organization (https://chromabit.us/#organization)");
  expectFail('U8 sub page without the WebSite reference', subLd(AU, '/auctions/', 'Auctions', (g) => { delete g[0].isPartOf; }), 'seo-jsonld', "/auctions/ has no WebSite node and no @id reference to the home page's WebSite");
  expectFail('U8 sub page with an inline Organization of another name', subLd(ST, '/store/', 'Store', (g) => { g[0].publisher = { '@type': 'Organization', name: 'Chromabit', url: 'https://chromabit.us/', logo: 'https://chromabit.us/server-icon.png', sameAs: [DISCORD] }; }), 'seo-jsonld', '/store/ Organization name is "Chromabit", want "Chromabit Network"');
  passes('U8 sub page with a valid inline Organization and WebSite passes', subLd(ST, '/store/', 'Store', (g) => {
    g[0].publisher = { '@type': 'Organization', name: NET, url: 'https://chromabit.us/', logo: 'https://chromabit.us/server-icon.png', sameAs: [DISCORD] };
    g[0].isPartOf = { '@type': 'WebSite', name: NET, url: 'https://chromabit.us/' };
  }));
  expectFail('U8 no JSON-LD on /privacy/', mutate(PR, ldTag(ldSub('/privacy/', 'Privacy')), ''), 'seo-jsonld', '/privacy/ has no JSON-LD');
  expectFail('U8 BreadcrumbList missing on /smp/', subLd(S, '/smp/', 'Economy SMP', (g) => g.pop()), 'seo-jsonld', '/smp/ has 0 BreadcrumbList nodes, want 1');
  expectFail('U8 breadcrumb item relative', subLd(FQ, '/faq/', 'FAQ', (g) => { g[1].itemListElement[1].item = '/faq/'; }), 'seo-jsonld', '/faq/ JSON-LD item "/faq/" is not an absolute https URL');
  expectFail('U8 breadcrumb points at another page', subLd(FQ, '/faq/', 'FAQ', (g) => { g[1].itemListElement[1].item = 'https://chromabit.us/store/'; }), 'seo-jsonld', '/faq/ BreadcrumbList is');
  expectFail('U8 breadcrumb without Home', subLd(AU, '/auctions/', 'Auctions', (g) => { g[1].itemListElement.shift(); }), 'seo-jsonld', '/auctions/ BreadcrumbList is');
  passes('U8 breadcrumb items as {@id} objects pass', subLd(AU, '/auctions/', 'Auctions', (g) => { g[1].itemListElement.forEach((it) => { it.item = { '@id': it.item }; }); }));
  expectFail('U8 @context http://schema.org', mutate(S, ldTag(ldSub('/smp/', 'Economy SMP')), ldTag(ldSub('/smp/', 'Economy SMP').replace('"https://schema.org"', '"http://schema.org"'))), 'seo-jsonld', '/smp/ JSON-LD block 1 @context is "http://schema.org"');
  expectFail('U8 a node without @type', subLd(PR, '/privacy/', 'Privacy', (g) => { delete g[0]['@type']; }), 'seo-jsonld', '/privacy/ JSON-LD block 1 has a node without @type');
  expectFail('U8 a relative @id', subLd(PR, '/privacy/', 'Privacy', (g) => { g[0]['@id'] = '#webpage'; }), 'seo-jsonld', '/privacy/ JSON-LD @id "#webpage" is not an absolute https://chromabit.us/ URL');
  expectFail('U8 a url to a page that does not exist', subLd(PR, '/privacy/', 'Privacy', (g) => { g[0].url = 'https://chromabit.us/rules/'; }), 'seo-jsonld', '/privacy/ JSON-LD url "https://chromabit.us/rules/" does not resolve to a file in dist');
  expectFail('U8 /pvp/ WebPage url wrong', pvpLd((g) => { g[0].url = 'https://chromabit.us/pvp'; }), 'seo-jsonld', '/pvp/ WebPage url is "https://chromabit.us/pvp"');
  expectFail('U8 /pvp/ WebPage without description', pvpLd((g) => { delete g[0].description; }), 'seo-jsonld', '/pvp/ WebPage has no description');
  expectFail('U8 /pvp/ ItemList order', pvpLd((g) => { g[1].itemListElement.reverse(); }), 'seo-jsonld', '/pvp/ ItemList names are ["Cosmetics"');
  expectFail('U8 /pvp/ ItemList five modes', pvpLd((g) => { g[1].itemListElement.pop(); }), 'seo-jsonld', '/pvp/ ItemList names are');
  expectFail('U8 /pvp/ ItemList positions from 0', pvpLd((g) => { g[1].itemListElement.forEach((it, i) => { it.position = i; }); }), 'seo-jsonld', '/pvp/ ItemList positions are [0,1,2,3,4,5]');
  expectFail('U8 /pvp/ no ItemList', pvpLd((g) => { g.splice(1, 1); }), 'seo-jsonld', '/pvp/ has 0 ItemList nodes, want 1');

  // seo-jsonld-visible-facts
  expectFail('U8 facts: an invented GameServer description', gameLd((d) => { d.gameServer.description = 'The biggest Minecraft server, with 500 players online.'; }), 'seo-jsonld-visible-facts', '/ JSON-LD states what the page does not show: GameServer description "The biggest Minecraft server, with 500 players online."');
  expectFail('U8 facts: an invented breadcrumb name', subLd(ST, '/store/', 'Store', (g) => { g[1].itemListElement[1].name = 'Gem Shop'; }), 'seo-jsonld-visible-facts', '/store/ JSON-LD states what the page does not show: ListItem name "Gem Shop"');
  expectFail('U8 facts: an invented WebPage headline', subLd(AU, '/auctions/', 'Auctions', (g) => { g[0].headline = 'Live prices for 4000 items'; }), 'seo-jsonld-visible-facts', '/auctions/ JSON-LD states what the page does not show: WebPage headline');
  passes('U8 facts: Organization/WebSite boilerplate is not fact-checked', homeLd((g) => { g[1].description = 'A Minecraft network.'; g[0].description = 'Ranked PVP and an economy SMP.'; }));
  passes('U8 facts: case and whitespace are normalised', subLd(S, '/smp/', 'Economy SMP', (g) => { g[1].itemListElement[1].name = 'economy   smp'; }));
  passes('U8 facts: a string equal to the meta description passes', subLd(S, '/smp/', 'Economy SMP', (g) => { g[0].description = DESC.smp; }));

  // seo-sitemap
  const sm = (from, to) => mutate('sitemap.xml', from, to);
  expectFail('U8 sitemap: /privacy/ missing', sm(sitemapLine('/privacy/'), ''), 'seo-sitemap', 'dist/sitemap.xml lacks ["https://chromabit.us/privacy/"]');
  expectFail('U8 sitemap: an extra URL', sm('</urlset>', '  <url><loc>https://chromabit.us/rules/</loc><lastmod>2026-11-10</lastmod></url>\n</urlset>'), 'seo-sitemap', 'lists ["https://chromabit.us/rules/"], which are not indexable pages');
  expectFail('U8 sitemap: a URL twice', sm('</urlset>', `${sitemapLine('/faq/')}</urlset>`), 'seo-sitemap', 'lists ["https://chromabit.us/faq/"] more than once');
  expectFail('U8 sitemap: lastmod missing', sm('https://chromabit.us/faq/</loc><lastmod>2026-11-10</lastmod>', 'https://chromabit.us/faq/</loc>'), 'seo-sitemap', 'https://chromabit.us/faq/ lastmod is [], want one YYYY-MM-DD date');
  expectFail('U8 sitemap: lastmod with a time', sm('https://chromabit.us/smp/</loc><lastmod>2026-11-10</lastmod>', 'https://chromabit.us/smp/</loc><lastmod>2026-11-10T00:00:00Z</lastmod>'), 'seo-sitemap', 'https://chromabit.us/smp/ lastmod is ["2026-11-10T00:00:00Z"]');
  expectFail('U8 sitemap: lastmod not a date', sm('https://chromabit.us/store/</loc><lastmod>2026-11-10</lastmod>', 'https://chromabit.us/store/</loc><lastmod>2026-13-40</lastmod>'), 'seo-sitemap', 'https://chromabit.us/store/ lastmod is ["2026-13-40"]');
  expectFail('U8 sitemap: not well-formed', sm(`${sitemapLine('/auctions/')}`, '  <url><loc>https://chromabit.us/auctions/</loc><lastmod>2026-11-10</lastmod>\n'), 'seo-sitemap', 'dist/sitemap.xml is not well-formed');
  expectFail('U8 sitemap: a bare ampersand', sm('https://chromabit.us/auctions/</loc>', 'https://chromabit.us/auctions/?a=1&b=2</loc>'), 'seo-sitemap', 'dist/sitemap.xml is not well-formed: bad entity "&b=2"');
  expectFail('U8 sitemap: wrong namespace', sm('http://www.sitemaps.org/schemas/sitemap/0.9', 'http://www.google.com/schemas/sitemap/0.84'), 'seo-sitemap', 'root is not <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  passes('U8 sitemap: extra changefreq/priority and an XML comment pass', sm('<lastmod>2026-11-10</lastmod></url>\n</urlset>', '<lastmod>2026-11-10</lastmod><changefreq>weekly</changefreq><priority>0.5</priority></url>\n<!-- generated -->\n</urlset>'));

  // seo-robots
  const rb = (from, to) => mutate('robots.txt', from, to);
  expectFail('U8 robots: Disallow: / for everyone', rb('User-agent: *\nAllow: /\n', 'User-agent: *\nDisallow: /\n'), 'seo-robots', 'dist/robots.txt has "Disallow: /" for ["*"]');
  expectFail('U8 robots: GPTBot group missing', rb('User-agent: GPTBot\nAllow: /\n', ''), 'seo-robots', 'dist/robots.txt has no explicit group for GPTBot');
  expectFail('U8 robots: Google-Extended disallowed', rb('User-agent: Google-Extended\nAllow: /\n', 'User-agent: Google-Extended\nDisallow: /\n'), 'seo-robots', 'dist/robots.txt has "Disallow: /" for ["google-extended"]');
  expectFail('U8 robots: ClaudeBot group without Allow: /', rb('User-agent: ClaudeBot\nAllow: /\n', 'User-agent: ClaudeBot\nCrawl-delay: 5\n'), 'seo-robots', 'dist/robots.txt group for ClaudeBot has no "Allow: /"');
  expectFail('U8 robots: an indexable page disallowed', rb('User-agent: *\nAllow: /\n', 'User-agent: *\nAllow: /\nDisallow: /pvp/\n'), 'seo-robots', '"Disallow: /pvp/" for ["*"] blocks ["/pvp/"]');
  expectFail('U8 robots: Sitemap line missing', rb('\nSitemap: https://chromabit.us/sitemap.xml\n', '\n'), 'seo-robots', 'dist/robots.txt has no "Sitemap: https://chromabit.us/sitemap.xml" line');
  expectFail('U8 robots: no User-agent: * group', rb('User-agent: *\nAllow: /\n\n', ''), 'seo-robots', 'dist/robots.txt has no "User-agent: *" group');
  expectFail('U8 robots: robots.txt missing', withFile('robots.txt', null), 'seo-robots', 'dist/robots.txt missing');
  passes('U8 robots: Disallow /pvp/player/ (not indexable), comments and a shared group pass', rb('User-agent: *\nAllow: /\n', '# all crawlers\nUser-agent: *\nAllow: /\nDisallow: /pvp/player/\n'));
  passes('U8 robots: bots listed together in one group pass', withFile('robots.txt', 'User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nUser-agent: OAI-SearchBot\nUser-agent: ClaudeBot\nUser-agent: PerplexityBot\nUser-agent: Google-Extended\nUser-agent: Bingbot\nAllow: /\n\nSitemap: https://chromabit.us/sitemap.xml\n'));

  // seo-llms
  const ll = (from, to) => mutate('llms.txt', from, to);
  expectFail('U8 llms: missing', withFile('llms.txt', null), 'seo-llms', 'dist/llms.txt missing');
  expectFail('U8 llms: title line without Chromabit', ll('# Chromabit Network', '# A Minecraft network'), 'seo-llms', 'first line is "# A Minecraft network"');
  expectFail('U8 llms: title not a "# " line', ll('# Chromabit Network\n', 'Chromabit Network\n'), 'seo-llms', 'first line is "Chromabit Network"');
  expectFail('U8 llms: no Bedrock port', ll('with port 19132', 'with its own port'), 'seo-llms', 'does not contain "19132"');
  expectFail('U8 llms: no Java version', ll('up to 26.3', 'up to the latest'), 'seo-llms', 'does not contain "26.3"');
  expectFail('U8 llms: no "ranked"', edit(edit(ll('ranked kit PVP on one ladder', 'kit PVP on one ladder'), 'llms.txt', 'ranked leaderboards', 'leaderboards'), 'llms.txt', 'ranked from level 2', 'open from level 2'), 'seo-llms', 'does not contain "ranked"');
  expectFail('U8 llms: "store credit" (any case)', ll('ranks and crate keys', 'ranks, crate keys and Store Credit'), 'seo-llms', 'contains "store credit"');
  expectFail('U8 llms: "Ten rounds"', ll('survival with a player-run market', 'survival with a player-run market. Arena: ten rounds'), 'seo-llms', 'contains "ten rounds"');
  expectFail('U8 llms: "each round"', ll('survival with a player-run market', 'survival with a player-run market. New augment each round'), 'seo-llms', 'contains "each round"');
  expectFail('U8 llms: a number that is not a site fact (6)', ll('ranked leaderboards.', 'ranked leaderboards across 6 modes.'), 'seo-llms', 'states numbers that are not site facts: ["6"]');
  expectFail('U8 llms: a number word that is not a site fact (six)', ll('ranked leaderboards.', 'ranked leaderboards across six modes.'), 'seo-llms', '"six (6)"');
  expectFail('U8 llms: "1v1" states a 1', ll('ranked leaderboards.', 'ranked leaderboards, 1v1 duels.'), 'seo-llms', 'states numbers that are not site facts: ["1"]');
  expectFail('U8 llms: a year', ll('ranked leaderboards.', 'ranked leaderboards since 2026.'), 'seo-llms', '["2026"]');
  passes('U8 llms: allowlisted numbers pass (1000, 500 and 250 Tokens; 9 zones, 4 difficulties, 3 phases; best of three; 1,000)', ll('ranked leaderboards.', 'ranked leaderboards. Tournaments pay 1000, 500 and 250 Tokens (1,000 for first). Heartwood: 9 zones, 4 difficulties, 3 phases.'));
  passes('U8 llms: 80,000 passes while the built FAQ states it', ll('survival with a player-run market.', 'survival with a player-run market. You start with $80,000.'));
  expectFails('U8 llms: 80,000 fails once the FAQ no longer states it', edit(faqSite((gs) => {
    // Both FAQ answers that state 80,000 (starting money, the claim-block cap).
    for (const q of ['How much money do I start with?', 'How do I protect my land?']) faqItem(gs, q).a = faqItem(gs, q).a.replace(/\$?80,000/, 'plenty');
  }), 'llms.txt', 'survival with a player-run market.', 'survival with a player-run market. You start with $80,000.'), {
    'faq-unchanged': '/faq/ answer to "How much money do I start with?" changed',
    'seo-llms': 'states numbers that are not site facts: ["80000"]',
  });
  passes('U8 llms: digits inside URLs are not numbers', ll('## Pages', `Discord: ${DISCORD}\n\n## Pages`));
  expectFail('U8 llms: a link to a page missing from dist', ll('- [Privacy]', '- [Rules](https://chromabit.us/rules/): the rules.\n- [Privacy]'), 'seo-llms', 'links "https://chromabit.us/rules/", which is missing from dist');
  expectFail('U8 llms: an indexable page not linked', ll('- [Privacy](https://chromabit.us/privacy/): how data is handled.\n', ''), 'seo-llms', 'does not link ["https://chromabit.us/privacy/"]');
  expectFail('U8 llms: a relative link', ll('- [Store](https://chromabit.us/store/)', '- [Store](/store/)'), 'seo-llms', 'has relative links ["/store/"]');
  expectFail('U8 llms: an http link', ll('(https://chromabit.us/faq/)', '(http://chromabit.us/faq/)'), 'seo-llms', 'links "http://chromabit.us/faq/" (want https://chromabit.us/...)');

  // seo-404
  passes('U8 404: a noindex 404.html passes', withFile('404.html', '<!DOCTYPE html><html lang="en"><head><meta name="robots" content="noindex"></head><body>Not found</body></html>'));
  expectFail('U8 404: a 404.html without noindex', withFile('404.html', '<!DOCTYPE html><html lang="en"><head><meta name="robots" content="index, follow"></head><body>Not found</body></html>'), 'seo-404', 'dist/404.html has no robots noindex');

  // a11y-headings
  expectFail('U8 headings: /store/ without an h1', mutate(ST, '<h1>STORE</h1>', '<h2>STORE</h2>'), 'a11y-headings', '/store/ has 0 <h1>, want 1');
  expectFail('U8 headings: two h1 on /auctions/', mutate(AU, 'Chromabit SMP market</main>', 'Chromabit SMP market<h1>Prices</h1></main>'), 'a11y-headings', '/auctions/ has 2 <h1>, want 1');
  expectFail('U8 headings: h1 -> h3 on /faq/', mutate(FQ, '<h2>FAQ</h2>', ''), 'a11y-headings', '/faq/ <h1> "HAVE QUESTIONS?" is followed by <h3>');
  expectFail('U8 headings: h2 -> h4 on /pvp/', mutate(P, '<h3>Duels</h3>', '<h4>Duels</h4>'), 'a11y-headings', '/pvp/ <h2> "WHAT YOU CAN PLAY" is followed by <h4> "Duels"');
  expectFail('U8 headings: h1 -> h3 on /pvp/player/', plMut(PLAYER_STATE, `${PLAYER_STATE}<h3>Sword</h3>`), 'a11y-headings', '/pvp/player/ <h1> "PLAYER" is followed by <h3> "Sword"');
  passes('U8 headings: going back up a level passes', mutate(P, '<h2>WHAT YOU CAN PLAY</h2>', '<h2>WHAT YOU CAN PLAY</h2><h3>Pick one</h3>'));

  // a11y-landmarks
  expectFail('U8 landmarks: two <main> on /privacy/', mutate(PR, '<main>Privacy</main>', '<main>Privacy</main><main>Again</main>'), 'a11y-landmarks', '/privacy/ has 2 <main>, want 1');
  expectFail('U8 landmarks: no <main> on /pvp/player/', edit(plMut('<main>', '<div class="m">'), PL, '</main>', '</div>'), 'a11y-landmarks', '/pvp/player/ has 0 <main>, want 1');
  expectFail('U8 landmarks: two unnamed <nav>', mutate(ST, '<main><h1>STORE</h1>', '<nav class="crumbs"><a href="/">Home</a></nav><main><h1>STORE</h1>'), 'a11y-landmarks', '/store/ <nav class="crumbs"> has no aria-label');
  passes('U8 landmarks: two named <nav> pass', edit(mutate(ST, '<main><h1>STORE</h1>', '<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a></nav><main><h1>STORE</h1>'), ST, '<nav class="footer-nav">', '<nav class="footer-nav" aria-labelledby="fn"><span id="fn" hidden>Footer</span>'));
  expectFail('U8 landmarks: aria-labelledby that resolves to nothing', edit(mutate(ST, '<main><h1>STORE</h1>', '<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a></nav><main><h1>STORE</h1>'), ST, '<nav class="footer-nav">', '<nav class="footer-nav" aria-labelledby="nope">'), 'a11y-landmarks', '/store/ <nav class="footer-nav"> has no aria-label or resolvable aria-labelledby');

  // a11y-names
  expectFail('U8 names: an icon-only button', mutate(S, '</main>', '<button type="button" class="sound-toggle"><svg><path d="M0 0"></path></svg></button></main>'), 'a11y-names', '/smp/ <button class="sound-toggle"> has no accessible name');
  expectFail('U8 names: a link whose only text is aria-hidden', mutate(S, '</main>', '<a href="/" class="x"><span aria-hidden="true">+</span></a></main>'), 'a11y-names', '/smp/ <a class="x" href="/"> has no accessible name');
  passes('U8 names: aria-label, aria-labelledby, img alt and title all name a control', mutate(S, '</main>', '<button type="button" aria-label="Mute"><svg></svg></button><span id="lb">Menu</span><button type="button" aria-labelledby="lb"></button><a href="/"><img src="/logo.png" alt="Home" width="1" height="1" loading="lazy" decoding="async"></a><button type="button" title="Copy"></button></main>'));
  expectFail('U8 names: /pvp/ join section unlabelled', mutate(P, '<section class="pvp-join" aria-label="Join">', '<section class="pvp-join">'), 'a11y-names', '/pvp/ join section (.pvp-join) has no aria-label or resolvable aria-labelledby');
  passes('U8 names: /pvp/ join section labelled by a heading id passes', mutate(P, '<section class="pvp-join" aria-label="Join"><p>', '<section class="pvp-join" aria-labelledby="join-copy"><p id="join-copy">'));
  expectFail('U8 names: /pvp/ join aria-labelledby to a missing id', mutate(P, '<section class="pvp-join" aria-label="Join">', '<section class="pvp-join" aria-labelledby="nope">'), 'a11y-names', '/pvp/ join section (.pvp-join) has no aria-label');
  expectFail('U8 names: search count not announced', mutate(P, '<p class="search-count" aria-live="polite"></p>', '<p class="search-count"></p>'), 'a11y-names', '/pvp/ [data-player-search] has no polite live region');
  expectFail('U8 names: assertive is not polite', mutate(P, '<p class="search-count" aria-live="polite"></p>', '<p class="search-count" aria-live="assertive"></p>'), 'a11y-names', 'has no polite live region');
  passes('U8 names: role="status" counts as the polite live region', mutate(P, '<p class="search-count" aria-live="polite"></p>', '<p class="search-count" role="status"></p>'));
  expectFail('U8 names: live region outside the search block', mutate(P, '<p class="search-count" aria-live="polite"></p></div>', '</div><p class="search-count" aria-live="polite"></p>'), 'a11y-names', 'has no polite live region');

  // img-attrs
  expectFail('U8 img: no alt', mutate(H, SMP_SHOT, SMP_SHOT.replace(' alt="Smuk_&#39;s Baddies"', '')), 'img-attrs', '/ <img src="/assets/build.png"> has no alt');
  passes('U8 img: an empty alt (decorative) passes', mutate(H, SMP_SHOT, SMP_SHOT.replace('alt="Smuk_&#39;s Baddies"', 'alt=""')));
  expectFail('U8 img: no width', mutate(H, SMP_SHOT, SMP_SHOT.replace(' width="640"', '')), 'img-attrs', '/ <img src="/assets/build.png"> width is null, want a positive integer');
  expectFail('U8 img: height "auto"', mutate(H, SMP_SHOT, SMP_SHOT.replace('height="360"', 'height="auto"')), 'img-attrs', 'height is "auto"');
  expectFail('U8 img: below the fold, eager', mutate(H, SMP_SHOT, SMP_SHOT.replace('loading="lazy"', 'loading="eager"')), 'img-attrs', 'is below the first screen with loading="eager" decoding="async"');
  expectFail('U8 img: below the fold, no decoding', mutate(H, SMP_SHOT, SMP_SHOT.replace(' decoding="async"', '')), 'img-attrs', 'decoding=null, want "lazy" and "async"');
  expectFail('U8 img: the hero logo without width and height', mutate(H, HERO_LOGO, '<img class="logo" src="/server-icon.png" alt="Chromabit logo">'), 'img-attrs', '/ <img src="/server-icon.png"> width is null');
  passes('U8 img: hero and nav images need no lazy/async', goodSite());
  expectFail('U8 img: the profile head without height', plMut('alt="" width="64" height="64"', 'alt="" width="64"'), 'img-attrs', '/pvp/player/ <img src="/assets/pvp-default-head.svg"> height is null');

  // perf-hints
  expectFail('U8 hints: gstatic preconnect without crossorigin', mutate(ST, '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>', '<link rel="preconnect" href="https://fonts.gstatic.com">'), 'perf-hints', '/store/ fonts.gstatic.com preconnect has no crossorigin');
  expectFail('U8 hints: googleapis preconnect missing on /pvp/player/', plMut('<link rel="preconnect" href="https://fonts.googleapis.com">', ''), 'perf-hints', '/pvp/player/ has no <link rel="preconnect" href="https://fonts.googleapis.com">');
  expectFail('U8 hints: gstatic preconnect missing on /faq/', mutate(FQ, '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>', ''), 'perf-hints', '/faq/ has no <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
  expectFail('U8 hints: no hero preload on /', mutate(H, HERO_PRELOAD, ''), 'perf-hints', '/ has no <link rel="preload" as="image" fetchpriority="high">');
  expectFail('U8 hints: hero preload without fetchpriority', mutate(H, HERO_PRELOAD, '<link rel="preload" as="image" href="/server-icon.png">'), 'perf-hints', '/ has no <link rel="preload" as="image" fetchpriority="high">');
  expectFail('U8 hints: preload of another image', mutate(H, HERO_PRELOAD, '<link rel="preload" as="image" href="/og-preview.png" fetchpriority="high">'), 'perf-hints', '/ image preload ["/og-preview.png"] is not the hero logo "/server-icon.png"');
  passes('U8 hints: an absolute preload href of the same file passes', mutate(H, HERO_PRELOAD, '<link rel="preload" as="image" href="https://chromabit.us/server-icon.png" fetchpriority="high">'));
  expectFail('U8 hints: a blocking external script in the head', mutate(AU, FONT_HINTS, `${FONT_HINTS}<script src="https://cdn.example/x.js"></script>`), 'perf-hints', '/auctions/ head has a render-blocking <script src="https://cdn.example/x.js">');
  passes('U8 hints: defer, async and module scripts pass', mutate(AU, FONT_HINTS, `${FONT_HINTS}<script defer src="https://cdn.example/a.js"></script><script async src="https://cdn.example/b.js"></script><script type="module" src="https://cdn.example/c.js"></script>`));
  expectFail('U8 hints: another inline script', mutate(PR, FONT_HINTS, `${FONT_HINTS}<script>window.x = 1;</script>`), 'perf-hints', '/privacy/ head has a render-blocking <script (inline, 13 chars)>');
  expectFail('U8 hints: a second font-ready script', mutate(PR, FONT_HINTS, `${FONT_HINTS}${FONT_READY}`), 'perf-hints', '/privacy/ head has a render-blocking <script (inline');
  expectFail('U8 hints: a font-ready script over 2000 characters', mutate(PR, FONT_READY, FONT_READY.replace('(function(){', `(function(){/*${'x'.repeat(2000)}*/`)), 'perf-hints', '/privacy/ head has a render-blocking <script (inline');
  passes('U8 hints: a blocking script in the body is not a head hint', mutate(PR, '<main>Privacy</main>', '<main>Privacy</main><script>window.y = 2;</script>'));

  // pvp-referrer
  expectFail('U8 referrer: /pvp/ without no-referrer', mutate(P, REFERRER_META, ''), 'pvp-referrer', '/pvp/ referrer metas are [], want ["no-referrer"]');
  expectFail('U8 referrer: /pvp/player/ with origin', plMut(REFERRER_META, '<meta name="referrer" content="origin">'), 'pvp-referrer', '/pvp/player/ referrer metas are ["origin"]');
  expectFail('U8 referrer: /store/ changes referrer behaviour', mutate(ST, ROBOTS_META, `${ROBOTS_META}${REFERRER_META}`), 'pvp-referrer', '/store/ has a referrer meta ["no-referrer"]');

  // ---------------------------------------------------------------- U9 --
  // card-tokens / card-no-frost read the built CSS (assets/*.css).
  const CSS = 'assets/index-good.css';
  const cssMut = (from, to) => mutate(CSS, from, to);
  const cssAdd = (extra) => cssMut('.join-row+.join-row', `${extra}.join-row+.join-row`);
  expectFails('U9 no built CSS', { ...goodSite(), [CSS]: null }, { 'card-tokens': 'no built CSS under dist/assets', 'card-no-frost': 'no built CSS under dist/assets' });
  passes('U9 tokens: two stylesheets, tokens in the second, pass', { ...goodSite(), 'assets/a-first.css': '.x{color:red}' });
  passes('U9 tokens: upper-case hex passes', cssMut('--surface:#150f27', '--surface:#150F27'));
  passes('U9 tokens: spaces and !important pass', cssMut('--radius-card:10px', '--radius-card: 10px !important'));
  expectFail('U9 tokens: --surface-hover missing', cssMut('--surface-hover:#21193c;', ''), 'card-tokens', '--surface-hover is not declared in a top-level :root rule');
  // Amendment U9-states: the round-1 hover value was imperceptible (1.044:1); a new selected token; the divider pinned.
  expectFail('U9 tokens: --surface-hover at the round-1 value #1a1330', cssMut('--surface-hover:#21193c', '--surface-hover:#1a1330'), 'card-tokens', '--surface-hover is "#1a1330" in :root, want #21193c');
  expectFail('U9 tokens: --surface-selected missing', cssMut('--surface-selected:#2c214f;', ''), 'card-tokens', '--surface-selected is not declared in a top-level :root rule');
  expectFail('U9 tokens: --surface-selected equal to the hover value', cssMut('--surface-selected:#2c214f', '--surface-selected:#21193c'), 'card-tokens', '--surface-selected is "#21193c" in :root, want #2c214f');
  expectFail('U9 tokens: --divider missing', cssMut('--divider:#221838;', ''), 'card-tokens', '--divider is not declared in a top-level :root rule');
  expectFail('U9 tokens: --divider wrong value', cssMut('--divider:#221838', '--divider:#2a1e44'), 'card-tokens', '--divider is "#2a1e44" in :root, want #221838');
  expectFail('U9 tokens: --surface wrong value', cssMut('--surface:#150f27', '--surface:#16102a'), 'card-tokens', '--surface is "#16102a" in :root, want #150f27');
  expectFail('U9 tokens: --surface-inset wrong value', cssMut('--surface-inset:#0f0a1d', '--surface-inset:#0f0a1e'), 'card-tokens', '--surface-inset is "#0f0a1e"');
  expectFail('U9 tokens: --radius-card 12px', cssMut('--radius-card:10px', '--radius-card:12px'), 'card-tokens', '--radius-card is "12px" in :root, want 10px');
  expectFail('U9 tokens: --radius-inset in rem', cssMut('--radius-inset:6px', '--radius-inset:.375rem'), 'card-tokens', '--radius-inset is ".375rem"');
  expectFail('U9 tokens: overridden in a media query', cssAdd('@media (max-width:600px){:root{--radius-card:12px}}'), 'card-tokens', '--radius-card is "12px" in :root (@media (max-width:600px)), want 10px');
  expectFail('U9 tokens: overridden on a card', cssAdd('.pkg-card{--surface:#222}'), 'card-tokens', '--surface is "#222" in .pkg-card');
  expectFail('U9 tokens: only declared inside a media query', edit(cssAdd('@media (min-width:1px){:root{--surface-inset:#0f0a1d}}'), CSS, '--surface-inset:#0f0a1d;--surface-hover', '--surface-hover'), 'card-tokens', '--surface-inset is not declared in a top-level :root rule');
  passes('U9 tokens: a comment with another value is ignored', cssAdd('/* :root{--surface:#000} */'));
  expectFail('U9 frost: var(--frost) on .card', cssAdd('.card{background:var(--frost),var(--surface)}'), 'card-no-frost', '.card applies the frost gradient (background: var(--frost),var(--surface))');
  expectFail('U9 frost: var(--frost) on .pkg-card:hover', cssAdd('.pkg-card:hover{background-image:var(--frost)}'), 'card-no-frost', '.pkg-card:hover applies the frost gradient');
  expectFail('U9 frost: the literal gradient, unminified, on .faq-item', cssAdd('.faq-item{background:linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.01)), #16102a}'), 'card-no-frost', '.faq-item applies the frost gradient');
  expectFail('U9 frost: inside a media query', cssAdd('@media (max-width:600px){.mode-card{background:var(--frost)}}'), 'card-no-frost', '.mode-card applies the frost gradient');
  expectFail('U9 frost: one card in a selector list', cssAdd('.btn,.ip-block{background:var(--frost)}'), 'card-no-frost', '.ip-block applies the frost gradient');
  passes('U9 frost: on a button inside a card passes (not a card)', cssAdd('.card .btn{background:var(--frost)}'));
  passes('U9 frost: defining the token and using it on a button pass', goodSite());
  passes('U9 frost: a commented-out rule is ignored', cssAdd('/* .card{background:var(--frost)} */'));
  expectFail('U9 hairline: .card::before 1px strip', cssAdd('.card:before{content:"";position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,#c77dff,transparent)}'), 'card-no-frost', '.card:before still draws a 1px hairline');
  expectFail('U9 hairline: .mode-card--pvp::before 2px strip', cssAdd('.mode-card--pvp::before{content:"";position:absolute;height:2px;background:#ff7de1}'), 'card-no-frost', '.mode-card--pvp::before still draws a 2px hairline');
  passes('U9 hairline: a button ::after shine is not a card', goodSite());
  passes('U9 hairline: a 1px divider between join rows is not a pseudo hairline', cssAdd('.join-row+.join-row{border-top:1px solid #221838}'));
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}

console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
process.exitCode = failed ? 1 : 0;
