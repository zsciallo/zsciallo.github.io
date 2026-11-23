// The wiki, server-rendered by ssg.js from src/wiki/index.js (pages come in as props). The client
// script (src/wiki.jsx) only brings the nav to life and runs the home page's title filter.
// Every wiki route puts its whole content in one opaque panel (.wiki-panel): no text on the dithered page.
import { Footer } from '../components/Footer';
import { NavBar } from '../components/NavBar';
import { MotionRoot } from '../lib/motion';
import { rich } from '../lib/rich';
import { plainAnswer } from '../data/seo.js';
import { HALVES, enchantCount, iconPicture, picture, wikiChanges } from '../wiki/index.js';

const anchor = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const Day = ({ date }) => <time datetime={date}>{date}</time>;
const wiki = (text) => rich(text, iconPicture);

/** A picture at a display width; sprites (64 px or less) scale up pixelated. */
function Pic({ pic, alt, width, class: cls }) {
  const w = Math.min(width, pic.width <= 64 ? width : pic.width);
  return (
    <img class={`${cls}${pic.width <= 64 ? ' wiki-pixel' : ''}`} src={pic.src} alt={alt} width={w} height={Math.round((w * pic.height) / pic.width)} loading="lazy" decoding="async" />
  );
}

function Shell({ children }) {
  return (
    <MotionRoot>
      {/* src/wiki.jsx renders the live nav into this slot (display: contents keeps the nav sticky). */}
      <div id="wiki-nav" class="wiki-nav-slot">
        <NavBar current="wiki" />
      </div>
      <main class="wiki">
        <div class="wiki-panel">{children}</div>
      </main>
      <Footer />
    </MotionRoot>
  );
}

function Crumbs({ here }) {
  return (
    <nav class="wiki-crumbs" aria-label="Breadcrumb">
      <ol>
        <li><a href="/">Home</a></li>
        <li><a href="/wiki/">Wiki</a></li>
        <li aria-current="page">{here}</li>
      </ol>
    </nav>
  );
}

function ChangeTable({ rows, withPage }) {
  if (!rows.length) return <p>No recorded changes yet.</p>;
  return (
    <div class="wiki-scroll">
      <table class="wiki-table">
        <thead>
          <tr><th scope="col">Date</th>{withPage && <th scope="col">Page</th>}<th scope="col">Change</th></tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} data-wiki-change={row.date}>
              <td class="wiki-nowrap"><Day date={row.date} /></td>
              {withPage && <td><a href={row.page.route}>{row.page.title}</a></td>}
              <td>{wiki(row.text)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Facts({ data }) {
  return (
    <div class="wiki-scroll">
      <table class="wiki-table">
        <caption>{data.title}</caption>
        <thead>
          <tr>{data.columns.map((c) => <th scope="col" key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => {
            const pic = data.icons?.[i] ? iconPicture(data.icons[i]) : null;
            return (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>
                    {j === 0 && pic && <img class="wiki-sprite" src={pic.src} alt="" width="20" height="20" loading="lazy" decoding="async" />}
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Figure({ img }) {
  const pic = picture(img.src);
  if (!pic) return null;
  return (
    <figure class="wiki-figure">
      <Pic pic={pic} alt={img.alt ?? ''} width={640} class="wiki-figure-img" />
      {img.caption && <figcaption>{wiki(img.caption)}</figcaption>}
    </figure>
  );
}

function Block({ block, facts }) {
  if (block.p) return <p>{wiki(block.p)}</p>;
  if (block.ul) return <ul>{block.ul.map((li, i) => <li key={i}>{wiki(li)}</li>)}</ul>;
  if (block.img) return <Figure img={block.img} />;
  // A facts id without a file renders nothing here; test:wiki fails on it.
  if (block.facts && facts[block.facts]) return <Facts data={facts[block.facts]} />;
  return null;
}

/** The links of one nav box row: every page in `list`, the current one bold and unlinked. */
const PageLinks = ({ list, here }) => (
  <ul class="wiki-inline">
    {list.map((p) => <li key={p.route}>{p.route === here ? <strong>{p.title}</strong> : <a href={p.route}>{p.title}</a>}</li>)}
  </ul>
);

export function WikiArticle({ page, pages, facts }) {
  const sections = page.sections ?? [];
  const history = [...(page.history ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const related = (page.related ?? []).map((r) => pages.find((p) => p.route === `/wiki/${r}/`)).filter(Boolean);
  const half = HALVES.find(([h]) => h === page.half) ?? HALVES[0];
  const pic = page.image ? picture(page.image.src) : null;
  return (
    <Shell>
      <Crumbs here={page.title} />
      <h1 class="wiki-h1">{page.title}</h1>
      <div class="wiki-article">
        <aside class="wiki-box wiki-infobox" aria-label={`${page.title} at a glance`} data-wiki-infobox>
          <p class="wiki-box-title">{page.title}</p>
          {pic && (
            <div class="wiki-infobox-pic">
              <Pic pic={pic} alt={page.image.alt ?? ''} width={256} class="wiki-infobox-img" />
            </div>
          )}
          <table>
            <tbody>
              {(page.infobox ?? []).map(([k, v]) => (
                <tr key={k}><th scope="row">{k}</th><td>{wiki(v)}</td></tr>
              ))}
            </tbody>
          </table>
        </aside>
        <p class="wiki-lead">{wiki(page.summary)}</p>
        <nav class="wiki-box wiki-toc" aria-label="Contents">
          <p class="wiki-toc-title">Contents</p>
          <ol>
            {sections.map((s) => <li key={s.h}><a href={`#${anchor(s.h)}`}>{s.h}</a></li>)}
            <li><a href="#history">History</a></li>
          </ol>
        </nav>
        {sections.map((s) => (
          <section key={s.h} aria-labelledby={anchor(s.h)}>
            <h2 id={anchor(s.h)}>{s.h}</h2>
            {(s.blocks ?? []).map((b, i) => <Block key={i} block={b} facts={facts} />)}
          </section>
        ))}
        <section aria-labelledby="history">
          <h2 id="history">History</h2>
          <ChangeTable rows={history.map((h) => ({ ...h, page }))} />
        </section>
      </div>
      <nav class="wiki-box wiki-navbox" aria-label={`${half[1]} pages`}>
        <h2 class="wiki-box-title">{half[1]}</h2>
        <table>
          <tbody>
            {related.length > 0 && <tr><th scope="row">Related</th><td><PageLinks list={related} here={page.route} /></td></tr>}
            <tr><th scope="row">Pages</th><td><PageLinks list={pages.filter((p) => p.half === half[0])} here={page.route} /></td></tr>
          </tbody>
        </table>
      </nav>
    </Shell>
  );
}

function Tile({ page }) {
  const pic = iconPicture(page.icon);
  return (
    <li data-wiki-title={page.title.toLowerCase()}>
      <a class="wiki-tile" href={page.route} title={plainAnswer(page.summary)}>
        {pic ? <img class="wiki-tile-icon wiki-pixel" src={pic.src} alt="" width="48" height="48" loading="lazy" decoding="async" /> : <span class="wiki-tile-icon" aria-hidden="true" />}
        <span>{page.title}</span>
      </a>
    </li>
  );
}

export function WikiHome({ pages }) {
  const enchants = enchantCount();
  return (
    <Shell>
      <div class="wiki-box wiki-home-head">
        <img class="wiki-home-logo wiki-pixel" src="/server-icon-old-2.png" alt="" width="64" height="64" loading="lazy" decoding="async" />
        <div>
          <h1 class="wiki-h1">Chromabit Wiki</h1>
          <p class="wiki-stats">{pages.length} pages{enchants ? ` · ${enchants} custom enchants` : ''}</p>
          <p class="wiki-filter">
            <label for="wiki-filter">Filter pages by title</label>
            <input id="wiki-filter" type="search" autocomplete="off" data-wiki-filter />
          </p>
        </div>
      </div>
      <div class="wiki-boxes">
        {HALVES.map(([half, name]) => {
          const list = pages.filter((p) => p.half === half);
          return (
            <section key={half} class="wiki-box" aria-labelledby={`wiki-${half}`}>
              <h2 id={`wiki-${half}`} class="wiki-box-title">{name}</h2>
              {list.length ? <ul class="wiki-tiles">{list.map((p) => <Tile key={p.route} page={p} />)}</ul> : <p class="wiki-box-body">No pages yet.</p>}
            </section>
          );
        })}
        <section class="wiki-box wiki-box-wide" aria-labelledby="wiki-recent">
          <h2 id="wiki-recent" class="wiki-box-title">Recent changes</h2>
          <div class="wiki-box-body">
            <ChangeTable rows={wikiChanges(pages).slice(0, 5)} withPage />
            <p><a href="/wiki/changes/">All changes</a></p>
          </div>
        </section>
      </div>
    </Shell>
  );
}

export function WikiChanges({ pages }) {
  return (
    <Shell>
      <Crumbs here="Changes" />
      <h1 class="wiki-h1">Wiki changes</h1>
      <ChangeTable rows={wikiChanges(pages)} withPage />
    </Shell>
  );
}
