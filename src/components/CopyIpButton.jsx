import { m, useReducedMotion } from 'motion/react';
import config from '../config.json';
import { useCopyIp } from '../hooks/useCopyIp';
import { spring } from '../lib/motion';
import { ArcadeButton } from './ArcadeButton';

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * The one COPY IP button: the join box, both mode cards and the SMP page all
 * use it, so the address, the COPIED! feedback and the press feel are the same
 * everywhere. `data-copy-ip` is the hook the site checker counts.
 */
export function CopyIpButton({ variant = 'primary', size = 'sm', ip = config.serverIP, class: cls = '' }) {
  const { copied, clicked, copy } = useCopyIp(ip);
  const still = useReducedMotion();

  return (
    <ArcadeButton type="button" variant={variant} size={size} onClick={copy} data-copy-ip
      class={`copy-ip${copied ? ' is-copied' : ''}${cls ? ` ${cls}` : ''}`}>
      {/* Keyed on state so the label remounts and pops in on each change. */}
      <m.span class="copy-ip-label" key={copied ? 'copied' : 'copy'}
        initial={still || !clicked ? false : { scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={spring.pop}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? 'COPIED!' : 'COPY IP'}
      </m.span>
    </ArcadeButton>
  );
}
