import { useState, useEffect } from 'preact/hooks';

// Our own status endpoint (the staff bot pings the server directly, see the
// discord-bot repo's web/). mcsrvstat stays as the fallback when it is down.
const STATUS_API = 'https://api.chromabit.us/api/status';

// Both sources answer with {online, players:{online,max}} once normalised.
function readStatus(data) {
  if (typeof data?.online !== 'boolean') throw new Error('unusable status response');
  const count = data.players?.online;
  return {
    online: data.online,
    players: typeof count === 'number'
      ? { online: count, max: typeof data.players.max === 'number' ? data.players.max : null }
      : null,
  };
}

async function fetchJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`status check failed (${r.status})`);
  return r.json();
}

export function useServerStatus(serverIP, underConstruction) {
  const [status, setStatus] = useState(() =>
    underConstruction
      ? { loading: false, online: false, underConstruction: true }
      : { loading: true }
  );

  useEffect(() => {
    if (underConstruction) return;

    const start = Date.now();
    // A hung checker used to leave the badge on CHECKING… forever; each source
    // times out and we fall through to the optimistic branch below instead.
    // Our API answers "offline" with a reason when its own ping fails; that is
    // a real answer, so only a transport/shape failure moves on to mcsrvstat.
    fetchJson(STATUS_API)
      .then(readStatus)
      .catch(() =>
        // mcsrvstat has served Cloudflare challenge pages in place of JSON
        // before - a 200 isn't proof we got an answer, the `online` flag is.
        fetchJson(`https://api.mcsrvstat.us/3/${serverIP}`).then(readStatus)
      )
      .then(({ online, players }) => {
        const ping = Date.now() - start;
        // A server with nobody on it reports 0, which is a real answer and has
        // to survive to the card. Only a missing or malformed count is null.
        setStatus({ loading: false, online, ping: online ? ping : null, players });
      })
      .catch(() => {
        // The *checker* failed, which says nothing about the server. Assume
        // online rather than letting a third-party outage brand the server as
        // under construction and pull the store link off the page. No ping,
        // since we never measured one - `unknown` marks the guess for anything
        // that wants to treat it differently later.
        setStatus({ loading: false, online: true, unknown: true, players: null });
      });
  }, [serverIP, underConstruction]);

  return status;
}
