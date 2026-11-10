// SEO and answer-engine data for every page, in one place.
//
// What reads this:
//   vite.config.js  (seoHead plugin)  writes each page's <title>, meta tags,
//                   canonical, Open Graph, Twitter card and JSON-LD into the
//                   `<!--seo-head-->` marker of its index.html, in dev and build.
//   ssg.js          writes dist/sitemap.xml, dist/robots.txt and dist/llms.txt.
//
// Plain ESM with no JSON imports, so Node (ssg.js) and Vite (the config) both
// load it as is; faq.json and config.json are passed in by the caller.
//
// Rules (test/check_site.mjs, the seo-* checks): titles never change; the
// descriptions are frozen except where a check released them; structured data
// and llms.txt state only what the pages show (names, texts and descriptions
// appear in the page or equal its meta description), with no live numbers.
// No em dashes anywhere in here: these strings reach people.

import { PVP_MODES } from './pvpModes.js';

export const SITE = 'https://chromabit.us';
export const NETWORK = 'Chromabit Network';
export const GAME_ADDRESS = 'play.chromabit.us';
export const THEME_COLOR = '#0c0718';
export const LOCALE = 'en_US';
const ROBOTS_INDEX = 'index, follow, max-image-preview:large, max-snippet:-1';
const OG_IMAGE = {
  url: `${SITE}/og-preview.png`,
  width: 1200,
  height: 630,
  alt: 'The Chromabit logo above the words CHROMABIT NETWORK, Ranked PVP + Economy SMP for Java + Bedrock, and play.chromabit.us',
};
// An exact 8x nearest-neighbour upscale of the 64x64 server icon (tools/make_logo.py):
// Google ignores Organization logos under 112x112. Only the structured data uses it.
const LOGO = { url: `${SITE}/logo-512.png`, width: 512, height: 512 };

/**
 * Every page, in sitemap order. `indexable: false` keeps a page out of the
 * sitemap and llms.txt. `crumb` names the page in its BreadcrumbList and
 * `pageName` its WebPage node: both are words the page shows.
 * `sources` are the files whose last commit dates the page in the sitemap.
 */
export const PAGES = [
  {
    route: '/',
    entry: 'index.html',
    title: 'Chromabit Network | Ranked PVP and Economy SMP for Java + Bedrock',
    description:
      'Chromabit is a Minecraft network for Java and Bedrock: ranked kit PVP on one shared ladder, and a survival server with a player-run economy. Join at play.chromabit.us.',
    keywords:
      'Chromabit, Chromabit Network, ChromaPVP, ranked kit PVP, Minecraft Bedrock PVP, Minecraft economy SMP, Minecraft server, play.chromabit.us',
    social: 'Ranked kit PVP and a player-run economy SMP for Java and Bedrock. Join at play.chromabit.us',
    pageName: NETWORK,
    sources: ['index.html', 'src/main.jsx', 'src/App.jsx', 'src/components/JoinBox.jsx', 'src/components/ClaimBand.jsx', 'src/components/ModeCards.jsx', 'src/components/ServerCarousel.jsx', 'src/assets/serverImages'],
  },
  {
    route: '/pvp/',
    entry: 'pvp/index.html',
    title: 'Ranked PVP Leaderboards | Chromabit',
    description:
      'ChromaPVP ranked leaderboards for Java and Bedrock. Seven tiers from Tin to Chroma, Sword and Mace ladders, tournaments.',
    keywords: 'Minecraft ranked PVP, Minecraft PVP leaderboard, kit PVP server, Java and Bedrock PVP, ChromaPVP, Chromabit',
    ogDescription: 'Ranked kit PVP for Java and Bedrock on one ladder. Seven tiers from Tin to Chroma. Join at play.chromabit.us',
    twitterDescription: 'ChromaPVP ranked leaderboards for Java and Bedrock. play.chromabit.us',
    crumb: 'PVP',
    pageName: 'ChromaPVP',
    sources: ['pvp/index.html', 'src/pvp.jsx', 'src/pages/PvpPage.jsx', 'src/data/pvpModes.js', 'src/components/pvp'],
  },
  {
    route: '/smp/',
    entry: 'smp/index.html',
    title: 'Economy SMP | Chromabit',
    // Rewritten for U8 (was 173 characters): only what /smp/ itself shows.
    description:
      "Chromabit Economy SMP: survival with an auction house, the market's top movers and the Season 4 Heartwood dungeon, 9 zones each with its own boss.",
    keywords: 'Economy SMP, Economy SMP Minecraft, Economy SMP server, Minecraft economy server, Minecraft server prizes, Chromabit',
    ogDescription: 'A player-run economy SMP for Java and Bedrock with an auction house and server events. Join Chromabit.',
    twitterDescription: 'Trade, build and compete on the Chromabit Economy SMP. play.chromabit.us',
    crumb: 'Economy SMP',
    pageName: 'Economy SMP',
    sources: ['smp/index.html', 'src/smp.jsx', 'src/pages/SmpPage.jsx', 'src/components/MarketTicker.jsx'],
  },
  {
    route: '/faq/',
    entry: 'faq/index.html',
    title: 'FAQ | Chromabit',
    description:
      'Server address for Java and Bedrock, versions, ranks, the auction house, events, claims and rules. Every answer checked against the server config.',
    keywords: 'Chromabit FAQ, Chromabit server IP, Chromabit Bedrock, Minecraft economy server help',
    crumb: 'FAQ',
    sources: ['faq/index.html', 'src/faq.jsx', 'src/pages/FaqPage.jsx', 'src/components/FaqItem.jsx', 'src/data/faq.json'],
  },
  {
    route: '/store/',
    entry: 'store/index.html',
    title: 'Store | Chromabit',
    // U8: Chromabit wording only (was "...for the Chromabit Minecraft server. Every purchase supports the server.").
    description: 'The official Chromabit store. Buy ranks, crate keys, and more. Every purchase directly supports Chromabit.',
    keywords: 'Chromabit store, Minecraft server store, Economy SMP ranks, crate keys, Chromabit shop',
    social: 'Buy ranks, crate keys, and more. Every purchase supports Chromabit.',
    crumb: 'Store',
    pageName: 'Store',
    sources: ['store/index.html', 'src/store.jsx', 'src/pages/StorePage.jsx', 'src/data/storeContent.json', 'src/components/store'],
  },
  {
    route: '/auctions/',
    entry: 'auctions/index.html',
    title: 'Auction House | Chromabit SMP',
    description:
      'Live auction house market data for Chromabit Economy SMP. Price history, current floors, trade volume and active listings for every item traded on the server.',
    keywords: 'Chromabit auction house, Minecraft market prices, Economy SMP prices, Minecraft item price history',
    ogDescription: 'Price history, floors and trade volume for every item on the Chromabit auction house.',
    twitterDescription: 'Track item prices and market trends on Chromabit Economy SMP.',
    crumb: 'Auction House',
    pageName: 'Auction House',
    sources: ['auctions/index.html', 'src/auctions.jsx', 'src/pages/AuctionsPage.jsx', 'src/components/market'],
  },
  {
    route: '/privacy/',
    entry: 'privacy/index.html',
    title: 'Privacy Policy | Chromabit',
    description: 'How Chromabit collects and handles data on chromabit.us: analytics, cookies, payments, and your choices.',
    social: 'How Chromabit collects and handles data on chromabit.us.',
    crumb: 'Privacy Policy',
    pageName: 'Privacy Policy',
    sources: ['privacy/index.html', 'src/privacy.jsx', 'src/pages/PrivacyPage.jsx'],
  },
  {
    route: '/pvp/player/',
    entry: 'pvp/player/index.html',
    // One page serves every player (?name=), so it stays out of search results and the sitemap.
    indexable: false,
    canonical: `${SITE}/pvp/`,
    title: 'Player | Chromabit',
    description: "A ChromaPVP ranked player's season: tier and rating per kit, career totals and recent ranked matches.",
    social: 'Ranked kit PVP for Java and Bedrock on one ladder. Join at play.chromabit.us',
    sources: ['pvp/player/index.html', 'src/pvpPlayer.jsx', 'src/pages/PvpPlayerPage.jsx'],
  },
];

export const pageFor = (route) => PAGES.find((p) => p.route === route) ?? null;
/** The page whose index.html is `file` (relative to the repo root, e.g. 'pvp/index.html'), or null. */
export const pageForEntry = (file) => PAGES.find((p) => p.entry === file) ?? null;
export const indexablePages = () => PAGES.filter((p) => p.indexable !== false);
const abs = (route) => `${SITE}${route}`;

// ----------------------------------------------------------- JSON-LD --

const ORG_ID = `${SITE}/#organization`;
const GAME_ID = `${SITE}/#minecraft`;
const WEBSITE_ID = `${SITE}/#website`;
const HOME = PAGES[0];

/** The network itself. Inline on every page, so each page stands alone for a crawler. */
export function organizationNode(config) {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: NETWORK,
    alternateName: 'Chromabit',
    url: `${SITE}/`,
    logo: { '@type': 'ImageObject', url: LOGO.url, width: LOGO.width, height: LOGO.height },
    sameAs: [config.discord],
  };
}

export function websiteNode() {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: NETWORK,
    alternateName: 'Chromabit',
    url: `${SITE}/`,
    description: HOME.description,
    inLanguage: 'en',
    publisher: { '@id': ORG_ID },
  };
}

function breadcrumbNode(page) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${abs(page.route)}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: page.crumb, item: abs(page.route) },
    ],
  };
}

function webPageNode(page, type = 'WebPage') {
  const node = {
    '@type': type,
    '@id': `${abs(page.route)}#webpage`,
    url: abs(page.route),
    ...(page.pageName ? { name: page.pageName } : {}),
    description: page.description,
    inLanguage: 'en',
    isPartOf: { '@id': WEBSITE_ID },
    publisher: { '@id': ORG_ID },
    primaryImageOfPage: { '@type': 'ImageObject', url: OG_IMAGE.url, width: OG_IMAGE.width, height: OG_IMAGE.height },
  };
  if (page.crumb) node.breadcrumb = { '@id': `${abs(page.route)}#breadcrumb` };
  return node;
}

/** faq.json's markdown-lite as plain text: **b** and `c` lose their marks, [text](href) keeps the text. */
export function plainAnswer(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function faqNode(page, faq) {
  const node = webPageNode(page, 'FAQPage');
  node.mainEntity = faq.groups.flatMap((group) =>
    group.items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: plainAnswer(item.a) },
    })),
  );
  return node;
}

/** The game and the address to join it, on the home page. No player counts or status: those change by the minute. */
function videoGameNode() {
  return {
    '@type': 'VideoGame',
    '@id': GAME_ID,
    name: 'Minecraft',
    gamePlatform: ['Minecraft: Java Edition', 'Minecraft: Bedrock Edition'],
    gameServer: {
      '@type': 'GameServer',
      '@id': `${SITE}/#server`,
      name: GAME_ADDRESS,
      url: `${SITE}/`,
      game: { '@id': GAME_ID },
    },
  };
}

/**
 * What /pvp/ is about: the ranked ladder, in words the page shows (its SEVEN
 * TIERS ladder and its four facts). check_site holds every word of the
 * description to the page's visible text.
 */
function pvpLadderNode() {
  return {
    '@type': 'Thing',
    name: 'Seven tiers',
    description:
      'Seven tiers from Tin to Chroma. Play 10 placement matches before you get a rank. Every ranked duel is best of three. Three divisions in every tier below Chroma. Ranked opens at level 2.',
  };
}

/** The six modes /pvp/ lists under WHAT YOU CAN PLAY, in page order. */
function pvpModesNode() {
  return {
    '@type': 'ItemList',
    '@id': `${SITE}/pvp/#modes`,
    name: 'What you can play',
    itemListElement: PVP_MODES.map(([name, description], i) => ({ '@type': 'ListItem', position: i + 1, name, description })),
  };
}

/** The JSON-LD document for a page (one @graph), or null for a page without one. */
export function jsonLdFor(route, { faq, config }) {
  const page = pageFor(route);
  if (!page || page.indexable === false) return null;
  const graph = [organizationNode(config), websiteNode()];
  if (route === '/') graph.push({ ...webPageNode(page), about: { '@id': GAME_ID } }, videoGameNode());
  else if (route === '/faq/') graph.push(faqNode(page, faq), breadcrumbNode(page));
  else if (route === '/pvp/') graph.push({ ...webPageNode(page), about: pvpLadderNode() }, breadcrumbNode(page));
  else graph.push(webPageNode(page), breadcrumbNode(page));
  if (route === '/pvp/') graph.push(pvpModesNode());
  return { '@context': 'https://schema.org', '@graph': graph };
}

// -------------------------------------------------------------- head --

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const meta = (attr, key, content) => `<meta ${attr}="${key}" content="${esc(content)}">`;

/** The head tags for a page: what replaces `<!--seo-head-->` in its index.html. */
export function headFor(route, { faq, config }) {
  const page = pageFor(route);
  if (!page) throw new Error(`seo: no page ${route} in src/data/seo.js`);
  const url = page.canonical ?? abs(route);
  const ogDescription = page.ogDescription ?? page.social ?? page.description;
  const twitterDescription = page.twitterDescription ?? page.social ?? page.description;
  const tags = [
    `<title>${esc(page.title)}</title>`,
    meta('name', 'description', page.description),
    ...(page.keywords ? [meta('name', 'keywords', page.keywords)] : []),
    meta('name', 'robots', page.indexable === false ? 'noindex, follow' : ROBOTS_INDEX),
    meta('name', 'author', NETWORK),
    meta('name', 'theme-color', THEME_COLOR),
    `<link rel="canonical" href="${esc(url)}">`,
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', NETWORK),
    meta('property', 'og:locale', LOCALE),
    meta('property', 'og:url', url),
    meta('property', 'og:title', page.title),
    meta('property', 'og:description', ogDescription),
    meta('property', 'og:image', OG_IMAGE.url),
    meta('property', 'og:image:width', OG_IMAGE.width),
    meta('property', 'og:image:height', OG_IMAGE.height),
    meta('property', 'og:image:alt', OG_IMAGE.alt),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', page.title),
    meta('name', 'twitter:description', twitterDescription),
    meta('name', 'twitter:image', OG_IMAGE.url),
    meta('name', 'twitter:image:alt', OG_IMAGE.alt),
  ];
  const ld = jsonLdFor(route, { faq, config });
  // `<` escaped so no string in the data can close the script element.
  if (ld) tags.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
  return tags.join('\n  ');
}

// ------------------------------------------------------- crawl files --

export function sitemapXml(lastmods) {
  const urls = indexablePages().map(
    (p) => `  <url>\n    <loc>${abs(p.route)}</loc>\n    <lastmod>${lastmods[p.route]}</lastmod>\n  </url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/** Search and answer engines named one by one, so a later blanket rule for unknown bots cannot shut them out by accident. */
export const CRAWLERS = ['Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot'];

export function robotsTxt() {
  const groups = CRAWLERS.map((bot) => `User-agent: ${bot}\nAllow: /`);
  return `# Every page is open to every crawler, including search and answer engines.\nUser-agent: *\nAllow: /\n\n${groups.join('\n\n')}\n\nSitemap: ${SITE}/sitemap.xml\n`;
}

/**
 * llms.txt (llmstxt.org): a short markdown summary for answer engines. Only
 * facts the pages show, and only numbers they state; check_site's seo-llms
 * holds the allowlist.
 */
export function llmsTxt() {
  const links = indexablePages().map((p) => `- [${p.title}](${abs(p.route)}): ${p.description}`);
  return [
    `# ${NETWORK}`,
    '',
    `> ${HOME.description}`,
    '',
    'The network has ChromaPVP, ranked kit PVP, and an Economy SMP, survival with a player-run market. Java and Bedrock players join at the same address.',
    '',
    '## Join',
    '',
    `- Java Edition: connect to ${GAME_ADDRESS}. Any Java version up to 26.3 connects.`,
    `- Bedrock Edition: the same address, ${GAME_ADDRESS}, port 19132.`,
    '- There is no whitelist and no application.',
    '',
    '## ChromaPVP: ranked kit PVP',
    '',
    '- The only ranked competitive PVP for Java and Bedrock. Java and Bedrock players queue into the same matches and share one ladder.',
    '- Ranked kits: Sword and Mace.',
    '- Play 10 placement matches on a kit to get a rank. Every ranked duel is best of three. Ranked opens at level 2.',
    '- Seven tiers, from Tin to Chroma, with three divisions in every tier below Chroma.',
    `- Modes: ${PVP_MODES.map(([name]) => name).join(', ')}.`,
    ...PVP_MODES.filter(([name]) => name === 'Tournaments').map(([name, line]) => `- ${name}: ${line}`),
    '- To play, connect to play.chromabit.us and pick Kit PVP in the hub.',
    '',
    '## Economy SMP',
    '',
    '- Survival with a player-run market. Claims, custom spawners, King of the Hill.',
    '- The auction house has price history, current floors, trade volume and active listings for every item traded.',
    '- Season 4 dungeon, Heartwood: 9 zones, each with its own boss; 4 difficulties, from Easy to Very Hard; 3 phases to the final boss, The Rotroot Heart; 9 armour sets, one from every zone.',
    '',
    '## Pages',
    '',
    ...links,
    '',
  ].join('\n');
}
