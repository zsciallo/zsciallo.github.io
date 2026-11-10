import { useEffect, useState } from 'preact/hooks';
import { boardQuery, boardView, builtinTierColour, selectBoardKey, tabList } from '../../lib/pvp';
import defaultHead from '../../assets/pvp-default-head.svg';
import { ArcadeButton } from '../ArcadeButton';

/** Column classes, in the order of boardView().columns; the CSS lays them out by these. */
const COLUMN_CLASS = {
  rating: ['rank', 'player', 'tier', 'rating', 'rec', 'pct'],
  count: ['rank', 'player', 'value'],
};

/** ?board= from the address bar, or null (and always null in the prerender). */
const requestedBoard = () => (typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('board'));

/**
 * A broken head image hides itself; the frame around it already shows the
 * default head as its background, so the row never shows a broken-image icon.
 */
function hideBroken(e) {
  e.currentTarget.style.visibility = 'hidden';
}

function Player({ row }) {
  const bedrock = row.edition === 'bedrock';
  return (
    <div class="pvp-player">
      <span class="pvp-head">
        <img src={row.headUrl ?? defaultHead} width="24" height="24" alt="" loading="lazy" decoding="async"
          referrerpolicy="no-referrer" onError={hideBroken} />
      </span>
      <span class="pvp-who">
        {/* Text, never markup: names come from the game. */}
        <span class="pvp-name" title={row.name}>{row.name}</span>
        <span class={`pvp-ed pvp-ed--${row.edition}`} data-edition={row.edition}>{bedrock ? 'BEDROCK' : 'JAVA'}</span>
      </span>
    </div>
  );
}

/** The feed ladder's colour, else the built-in ladder's (a feed without `ladder` still colours the badges). */
const badgeColour = (tier) => tier.colour ?? builtinTierColour(tier.label.split(' ')[0]);

function Row({ row, kind }) {
  const colour = row.tier ? badgeColour(row.tier) : null;
  return (
    <tr data-row data-top={row.top ?? undefined}>
      <td class="pvp-c-rank"><span class="pvp-rank">{row.rank}</span></td>
      <td class="pvp-c-player"><Player row={row} /></td>
      {kind === 'count' ? (
        <td class="pvp-c-value">{row.value}</td>
      ) : (
        <>
          <td class="pvp-c-tier">
            {row.tier ? (
              <span class="pvp-tier" style={colour ? { color: colour } : undefined}>{row.tier.label}</span>
            ) : (
              <span class="pvp-tier pvp-tier--none">-</span>
            )}
          </td>
          <td class="pvp-c-rating">{row.rating}</td>
          <td class="pvp-c-rec">{row.record}</td>
          <td class="pvp-c-pct">{row.winPct}</td>
        </>
      )}
    </tr>
  );
}

/**
 * The empty board: three faint podium rows under the message, so the card
 * keeps its shape and reads as a ladder waiting for players. This is what the
 * prerendered page shows, and what shows while loading or with the feed down.
 */
function Empty() {
  return (
    <div class="pvp-empty">
      <ol class="pvp-ghosts" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <li key={n} class="pvp-ghost" data-ghost={n}>
            <span class="pvp-rank">{n}</span>
            <i class="pvp-ghost-head" />
            <i class="pvp-ghost-bar" />
            <i class="pvp-ghost-bar pvp-ghost-bar--short" />
          </li>
        ))}
      </ol>
      <p class="pvp-empty-text" data-board-empty>No ranked players yet. Play 10 placement matches to appear here.</p>
    </div>
  );
}

/** The leaderboard: board tabs, the table, the empty state and the note line. */
export function Leaderboard({ doc }) {
  const [requested, setRequested] = useState(requestedBoard);
  const tabs = tabList(doc);
  const key = selectBoardKey(doc, requested);
  const view = boardView(doc, key);
  const classes = COLUMN_CLASS[view.kind];

  // Keep the address bar in step with the board on screen: shareable after a
  // tab click without a reload or a history entry per click, and a bad
  // ?board= (a soon or unknown board) is cleared on load. Other parameters stay.
  useEffect(() => {
    const url = new URL(location.href);
    const query = boardQuery(doc, requested);
    if (query) url.searchParams.set('board', key);
    else url.searchParams.delete('board');
    if (url.href !== location.href) history.replaceState(history.state, '', url);
  }, [doc, requested]);

  return (
    <section class="pvp-board" data-board aria-label="Leaderboards">
      <div class="pvp-tabs" role="group" aria-label="Choose a leaderboard">
        {tabs.map((t) => (
          <ArcadeButton
            key={t.key}
            type="button"
            size="sm"
            class="pvp-tab"
            variant={t.key === key ? 'primary' : 'secondary'}
            data-board-tab={t.key}
            aria-pressed={t.key === key ? 'true' : 'false'}
            disabled={t.soon}
            onClick={() => setRequested(t.key)}
          >
            {t.label}
          </ArcadeButton>
        ))}
      </div>

      <div class="card pvp-board-card">
        <table class={`pvp-table pvp-table--${view.kind}`} data-board-table aria-label={`${view.label} leaderboard`}>
          <thead>
            <tr>
              {view.columns.map((c, i) => (
                <th key={c} scope="col" class={`pvp-c-${classes[i]}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <Row key={`${row.rank}:${row.name}`} row={row} kind={view.kind} />
            ))}
          </tbody>
        </table>
        {view.rows.length === 0 && <Empty />}
      </div>

      <p class="pvp-note">Updates every minute. Players appear after 10 placement matches.</p>
    </section>
  );
}
