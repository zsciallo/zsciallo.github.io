import { useEffect, useRef, useState } from 'preact/hooks';

/**
 * Copy the server address, and say so for two seconds.
 *
 * `clicked` turns true on the first press and stays true. The label only pops
 * in once it has changed: animating it on first paint would ship it invisible
 * in the prerendered HTML. The click sound is MotionRoot's delegated listener,
 * like every other button on the site.
 */
export function useCopyIp(ip) {
  const [copied, setCopied] = useState(false);
  const [clicked, setClicked] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  function copy() {
    setClicked(true);
    // No clipboard (an insecure origin, an old browser) or a refused write:
    // the address is on screen to read, so there is nothing more to do.
    const write = navigator.clipboard?.writeText(ip) ?? Promise.reject();
    write.then(
      () => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  }

  return { copied, clicked, copy };
}
