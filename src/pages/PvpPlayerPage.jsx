import { useEffect, useState } from 'preact/hooks';
import { Footer } from '../components/Footer';
import { NavBar } from '../components/NavBar';
import { ArcadeButton } from '../components/ArcadeButton';
import { EditionBadge } from '../components/pvp/EditionBadge';
import { LADDER, builtinTierColour, fetchPlayer, isValidPlayerKey, profileView } from '../lib/pvp';
import { MotionRoot } from '../lib/motion';
import defaultHead from '../assets/pvp-default-head.svg';

/**
 * /pvp/player/?name=<key>: one ranked player's season. The prerendered page is
 * the loading shell; the profile document comes from the feed
 * (players/<key>.json) once, with no refresh. The key is checked before any
 * request, so a bad ?name= never reaches the network: it reads as not ranked,
 * like a 404. Anything else that goes wrong reads as unavailable.
 *
 * Tier colours come from the built-in ladder (the same hexes the feed ships),
 * so the page needs no second request for boards.json.
 */

const STATES = {
  loading: 'Loading player.',
  missing: 'Not ranked this season.',
  error: 'Player data is unavailable right now.',
};

const LADDER_DOC = { tiers: LADDER };

/** ?name= from the address bar; undefined in the prerender (no location). */
const requestedKey = () => (typeof location === 'undefined' ? undefined : new URLSearchParams(location.search).get('name'));

function initialState() {
  const key = requestedKey();
  if (key === undefined) return { phase: 'loading', key: null };
  return isValidPlayerKey(key) ? { phase: 'loading', key } : { phase: 'missing', key: null };
}

/** A tier's colour: the view's (from the ladder), else the built-in ladder's. */
const tierStyle = (tier) => {
  const colour = tier.colour ?? builtinTierColour(tier.label.split(' ')[0]);
  return colour ? { color: colour } : undefined;
};

/** A broken head hides itself over the frame, which shows the default head. */
function hideBroken(e) {
  e.currentTarget.style.visibility = 'hidden';
}

function Best({ best }) {
  if (!best) {
    return (
      <span class="pvp-profile-best pvp-profile-best--none" data-profile-best>
        UNPLACED
      </span>
    );
  }
  return (
    <span class="pvp-profile-best" data-profile-best>
      <span class="pvp-tier" style={tierStyle(best)}>{best.label}</span>
      {best.overallRank != null && (
        <>
          {' '}
          <span>OVERALL <b>#{best.overallRank}</b></span>
        </>
      )}
    </span>
  );
}

function KitCard({ kit }) {
  // profileView's lines: placed -> Rating, Peak, record, Win streak, #rank;
  // placing -> Placing g/p, record.
  const [first, ...rest] = kit.lines;
  const stats = kit.placed ? kit.lines.slice(0, 4) : rest;
  const rank = kit.placed ? kit.lines[4] : null;
  return (
    <article class="card pvp-kit" data-kit={kit.key}>
      <div class="pvp-kit-top">
        <h2 class="pvp-kit-title">{kit.label}</h2>
        {rank && <span class="pvp-kit-rank">{rank}</span>}
      </div>
      {kit.placed ? (
        kit.tier && <span class="pvp-tier pvp-kit-tier" style={tierStyle(kit.tier)}>{kit.tier.label}</span>
      ) : (
        <span class="pvp-kit-placing">{first}</span>
      )}
      <ul class="pvp-kit-lines">
        {stats.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </article>
  );
}

function CareerCard({ career }) {
  return (
    <article class="card pvp-kit pvp-career" data-career>
      <div class="pvp-kit-top">
        <h2 class="pvp-kit-title">Career</h2>
      </div>
      <ul class="pvp-kit-lines">
        {career.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </article>
  );
}

const ratingClass = (rating) => (rating.startsWith('+') ? ' pvp-up' : rating.startsWith('-') ? ' pvp-down' : '');

function Recent({ view }) {
  return (
    <section class="pvp-section pvp-recent-section" data-recent aria-labelledby="pvp-recent-title">
      <h2 class="section-title" id="pvp-recent-title">RECENT RANKED</h2>
      <div class="card pvp-board-card">
        {view.empty ? (
          <p class="pvp-empty-text pvp-recent-empty">No ranked matches yet this season.</p>
        ) : (
          <table class="pvp-recent" aria-labelledby="pvp-recent-title">
            <thead>
              <tr>
                <th scope="col" class="pvp-r-result">RESULT</th>
                <th scope="col" class="pvp-r-kit">KIT</th>
                <th scope="col" class="pvp-r-opp">OPPONENT</th>
                <th scope="col" class="pvp-r-rating">RATING</th>
              </tr>
            </thead>
            <tbody>
              {view.recent.map((r, i) => (
                <tr key={i} data-recent-row>
                  <td class={`pvp-r-result pvp-r-result--${r.result.toLowerCase()}`}>{r.result}</td>
                  <td class="pvp-r-kit">{r.kit}</td>
                  <td class="pvp-r-opp">
                    <span class="pvp-who">
                      {/* Text, never markup: names come from the game. */}
                      {r.opponent.href ? (
                        <a class="pvp-name pvp-name-link" href={r.opponent.href} title={r.opponent.name}>{r.opponent.name}</a>
                      ) : (
                        <span class="pvp-name" title={r.opponent.name}>{r.opponent.name}</span>
                      )}
                      <EditionBadge edition={r.opponent.edition} />
                    </span>
                  </td>
                  <td class={`pvp-r-rating${ratingClass(r.rating)}`}>{r.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export function PvpPlayerPage() {
  const [state, setState] = useState(initialState);
  const view = state.phase === 'ready' ? state.view : null;

  useEffect(() => {
    if (!state.key) return undefined;
    let live = true;
    fetchPlayer(state.key).then((answer) => {
      if (!live) return;
      const loaded = answer.status === 'ok' ? profileView(answer.doc, LADDER_DOC) : null;
      if (loaded) setState({ phase: 'ready', key: null, view: loaded });
      else setState({ phase: answer.status === 'missing' ? 'missing' : 'error', key: null });
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (view) document.title = `${view.name} | Chromabit`;
  }, [view]);

  return (
    <MotionRoot>
      <NavBar current="pvp" />
      <main class="pvp-profile">
        <section class="page-hero container pvp-hero pvp-profile-hero" aria-label="Player">
          <p class="section-eyebrow">
            CHROMAPVP · PLAYER <span class="beta-tag">BETA</span>
          </p>
          <div class="pvp-profile-id">
            {view && (
              <span class="pvp-head pvp-profile-head">
                <img src={view.headUrl ?? defaultHead} width="56" height="56" alt="" decoding="async"
                  referrerpolicy="no-referrer" onError={hideBroken} />
              </span>
            )}
            {/* Text, never markup: names come from the game. */}
            <h1 class="hero-title pvp-profile-name">{view ? view.name : 'PLAYER'}</h1>
          </div>
          {view ? (
            <p class="pvp-season pvp-profile-meta">
              <EditionBadge edition={view.edition} />{' '}
              <Best best={view.best} />
            </p>
          ) : (
            <p class="pvp-profile-state" data-profile-state role="status">
              <span>{STATES[state.phase]}</span>
            </p>
          )}
          <ArcadeButton href="/pvp/" variant="secondary" size="sm" class="pvp-back">ALL LEADERBOARDS</ArcadeButton>
        </section>

        {view && (
          <div class="pvp-body container pvp-profile-body">
            <section class="pvp-kits" aria-label="Kits and career">
              {view.kits.map((kit) => (
                <KitCard key={kit.key} kit={kit} />
              ))}
              <CareerCard career={view.career} />
            </section>
            <Recent view={view} />
          </div>
        )}
      </main>
      <Footer />
    </MotionRoot>
  );
}
