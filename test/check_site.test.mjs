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
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
      '<header><img alt="Chromabit" src="/logo.png"></header><main>Welcome</main>',
    ),
    'smp/index.html': htmlPage(headFor('Economy SMP | Chromabit'), '<main>Chromabit SMP is allowed here</main>'),
    'faq/index.html': htmlPage(
      headFor('FAQ | Chromabit'),
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
    const r = runOn(mutate('index.html', 'Welcome', 'Earn store credit'));
    check('AC7 only the head is checked', r.code === 0, `exit ${r.code}:\n${r.out}`);
  }
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}

console.log(failed ? `RESULT: FAIL ${failed} of ${passed + failed}` : `RESULT: PASS ${passed} checks`);
process.exitCode = failed ? 1 : 0;
