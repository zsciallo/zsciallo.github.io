import { useRef, useState } from 'preact/hooks';
import { builtinTierColour, searchPlayers } from '../../lib/pvp';
import { EditionBadge } from './EditionBadge';

/** What searchPlayers() matches on: the query without spaces around it or a leading '.'. */
const meaningful = (query) => query.trim().replace(/^\./, '') !== '';

/**
 * FIND A PLAYER above the board: filters players.json as you type and lists
 * up to eight profiles. Hidden (its own `hidden` attribute) until the index
 * has loaded, so the prerendered page and a page without the feed never show
 * a search that cannot answer.
 *
 * Keys: Enter in the box opens the first result, Escape clears it, the arrow
 * keys move between the box and the results (Tab works too: they are links).
 */
export function PlayerSearch({ index }) {
  const [query, setQuery] = useState('');
  const input = useRef(null);
  const list = useRef(null);
  const results = searchPlayers(index, query);

  const links = () => [...(list.current?.querySelectorAll('a') ?? [])];
  const clear = () => {
    setQuery('');
    input.current?.focus();
  };

  const onInputKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (results[0]) location.assign(results[0].href);
    } else if (e.key === 'Escape' && query) {
      e.preventDefault();
      clear();
    } else if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault();
      links()[0]?.focus();
    }
  };

  const onResultKey = (e) => {
    const all = links();
    const at = all.indexOf(e.currentTarget);
    if (e.key === 'Escape') {
      e.preventDefault();
      clear();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      all[at + 1]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (at > 0 ? all[at - 1] : input.current)?.focus();
    }
  };

  return (
    <div class="pvp-search" data-player-search hidden={!index}>
      <label class="pvp-search-label" for="pvp-player-search">FIND A PLAYER</label>
      <input
        ref={input}
        id="pvp-player-search"
        class="pvp-search-input"
        type="search"
        autocomplete="off"
        autocapitalize="off"
        spellcheck={false}
        maxlength="20"
        aria-controls="pvp-search-results"
        value={query}
        onInput={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={onInputKey}
      />
      <ul ref={list} id="pvp-search-results" class="pvp-search-results" data-search-results hidden={!results.length}>
        {results.map((r) => {
          const colour = r.tierLabel === 'UNPLACED' ? null : builtinTierColour(r.tierLabel.split(' ')[0]);
          return (
            <li key={r.key}>
              <a class="pvp-search-hit" href={r.href} data-search-result onKeyDown={onResultKey}>
                <span class="pvp-who">
                  {/* Text, never markup: names come from the game. */}
                  <span class="pvp-name">{r.name}</span>
                  <EditionBadge edition={r.edition} />
                </span>
                <span class={`pvp-tier${colour ? '' : ' pvp-tier--unplaced'}`} style={colour ? { color: colour } : undefined}>
                  {r.tierLabel}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      {meaningful(query) && !results.length && (
        <p class="pvp-search-none" role="status">No ranked player by that name.</p>
      )}
    </div>
  );
}
