import { useState, useEffect } from 'preact/hooks';

export function useServerStatus(serverIP, underConstruction) {
  const [status, setStatus] = useState(() =>
    underConstruction
      ? { loading: false, online: false, underConstruction: true }
      : { loading: true }
  );

  useEffect(() => {
    if (underConstruction) return;

    const start = Date.now();
    // A hung checker used to leave the badge on CHECKING… forever; time out and
    // fall through to the optimistic branch below instead.
    fetch(`https://api.mcsrvstat.us/3/${serverIP}`, { signal: AbortSignal.timeout(6000) })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`status check failed (${r.status})`))))
      .then(data => {
        // mcsrvstat has served Cloudflare challenge pages in place of JSON
        // before — a 200 isn't proof we got an answer, the `online` flag is.
        if (typeof data?.online !== 'boolean') throw new Error('unusable status response');
        const ping = Date.now() - start;
        setStatus({ loading: false, online: data.online, ping: data.online ? ping : null });
      })
      .catch(() => {
        // The *checker* failed, which says nothing about the server. Assume
        // online rather than letting a third-party outage brand the server as
        // under construction and pull the store link off the page. No ping,
        // since we never measured one — `unknown` marks the guess for anything
        // that wants to treat it differently later.
        setStatus({ loading: false, online: true, unknown: true });
      });
  }, [serverIP, underConstruction]);

  return status;
}
