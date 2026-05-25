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
    fetch(`https://api.mcsrvstat.us/3/${serverIP}`)
      .then(r => r.json())
      .then(data => {
        const ping = Date.now() - start;
        setStatus({ loading: false, online: data.online, ping: data.online ? ping : null });
      })
      .catch(() => {
        setStatus({ loading: false, online: false });
      });
  }, [serverIP, underConstruction]);

  return status;
}
