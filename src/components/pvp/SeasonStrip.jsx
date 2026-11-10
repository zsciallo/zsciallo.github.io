import { seasonView } from '../../lib/pvp';

/**
 * Season name, time left and the ranked player count, under the masthead.
 * Hidden (the `hidden` attribute) until season.json answers with a season;
 * the countdown drops out once the season has ended, the count until
 * boards.json has one. The `{' '}` between items keep the text readable as
 * one line for anything that reads it without the layout.
 */
export function SeasonStrip({ season, boards, now }) {
  const view = seasonView(season, now);
  const count = Number.isFinite(boards?.rankedPlayers) ? boards.rankedPlayers : null;
  return (
    <p class="pvp-season" data-season hidden={!view}>
      {view && (
        <>
          <span class="pvp-season-name">{view.name}</span>
          {view.endsIn && (
            <>
              {' '}
              <span>ENDS IN <b>{view.endsIn}</b></span>
            </>
          )}
          {count != null && (
            <>
              {' '}
              <span>RANKED PLAYERS <b>{count}</b></span>
            </>
          )}
        </>
      )}
    </p>
  );
}
