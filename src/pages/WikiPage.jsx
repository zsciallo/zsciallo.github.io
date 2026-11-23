// The wiki, server-rendered by ssg.js from src/wiki/index.js (pages come in as props). The client
// script (src/wiki.jsx) only brings the nav to life and runs the home page's title filter.
import { Footer } from '../components/Footer';
import { NavBar } from '../components/NavBar';
import { MotionRoot } from '../lib/motion';
import { rich } from '../lib/rich';
import { plainAnswer } from '../data/seo.js';
import { HALVES, wikiChanges } from '../wiki/index.js';

const anchor = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const Day = ({ date }) => <time datetime={date}>{date}</time>;

function Shell({ children }) {
  return (
    <MotionRoot>
      {/* src/wiki.jsx renders the live nav into this slot (display: contents keeps the nav sticky). */}
      <div id="wiki-nav" class="wiki-nav-slot">
        <NavBar current="wiki" />
      </div>
      <main class="wiki container">{children}</main>
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
    <div class="store-table-wrap">
      <table class="store-table wiki-table">
        <thead>
          <tr><th scope="col">Date</th>{withPage && <th scope="col">Page</th>}<th scope="col">Change</th></tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} data-wiki-change={row.date}>
              <td><Day date={row.date} /></td>
              {withPage && <td><a href={row.page.route}>{row.page.title}</a></td>}
              <td>{rich(row.text)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Facts({ data }) {
  return (
    <div class="store-table-wrap wiki-facts">
      <table class="store-table">
        <caption>{data.title}</caption>
        <thead>
          <tr>{data.columns.map((c) => <th scope="col" key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Block({ block, facts }) {
  if (block.p) return <p>{rich(block.p)}</p>;
  if (block.ul) return <ul>{block.ul.map((li, i) => <li key={i}>{rich(li)}</li>)}</ul>;
  // A facts id without a file renders nothing here; test:wiki fails on it.
  if (block.facts && facts[block.facts]) return <Facts data={facts[block.facts]} />;
  return null;
}

export function WikiArticle({ page, pages, facts }) {
  const sections = page.sections ?? [];
  const history = [...(page.history ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const related = (page.related ?? []).map((r) => pages.find((p) => p.route === `/wiki/${r}/`)).filter(Boolean);
  return (
    <Shell>
      <Crumbs here={page.title} />
      <h1 class="wiki-h1">{page.title}</h1>
      <div class="wiki-article legal">
        <aside class="card wiki-infobox" aria-label={`${page.title} at a glance`} data-wiki-infobox>
          <p class="wiki-infobox-title">{page.title}</p>
          <table>
            <tbody>
              {(page.infobox ?? []).map(([k, v]) => (
                <tr key={k}><th scope="row">{k}</th><td>{rich(v)}</td></tr>
              ))}
            </tbody>
          </table>
        </aside>
        <p class="wiki-lead">{rich(page.summary)}</p>
        <nav class="wiki-toc" aria-label="Contents">
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
        {related.length > 0 && (
          <aside class="card wiki-related" aria-labelledby="wiki-related">
            <h2 id="wiki-related">Related pages</h2>
            <ul>{related.map((p) => <li key={p.route}><a href={p.route}>{p.title}</a></li>)}</ul>
          </aside>
        )}
      </div>
    </Shell>
  );
}

export function WikiHome({ pages }) {
  return (
    <Shell>
      <h1 class="wiki-h1">WIKI</h1>
      <p class="wiki-filter">
        <label for="wiki-filter">Filter pages by title</label>
        <input id="wiki-filter" type="search" autocomplete="off" data-wiki-filter />
      </p>
      {HALVES.map(([half, name]) => {
        const list = pages.filter((p) => p.half === half);
        return (
          <section key={half} aria-labelledby={`wiki-${half}`}>
            <h2 id={`wiki-${half}`} class="wiki-group">{name}</h2>
            {list.length ? (
              <ul class="wiki-tiles">
                {list.map((p) => (
                  <li key={p.route} data-wiki-title={p.title.toLowerCase()}>
                    <a class="card wiki-tile" href={p.route}>
                      <h3>{p.title}</h3>
                      <p>{plainAnswer(p.summary)}</p>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No pages yet.</p>
            )}
          </section>
        );
      })}
      <section aria-labelledby="wiki-recent">
        <h2 id="wiki-recent" class="wiki-group">Recent changes</h2>
        <ChangeTable rows={wikiChanges(pages).slice(0, 5)} withPage />
        <p><a href="/wiki/changes/">All changes</a></p>
      </section>
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
