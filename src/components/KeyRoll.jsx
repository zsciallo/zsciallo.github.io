import { useEffect, useRef, useState } from 'preact/hooks';
import { m, useReducedMotion } from 'motion/react';
import { ArcadeButton } from './ArcadeButton';
import { spring } from '../lib/motion';
import { freeKey, levelUp, maxOut, reelStop, reelTick, tick } from '../lib/sound';

// Height of one key on a reel; the window shows the centre key with a sliver
// of its neighbours.
const SYMBOL = 84;
const STRIP = [28, 36, 46];
const BULBS = 14;
// The beat of silence between the last reel locking and the result landing.
const HANG_MS = 400;

// What a roll is called, by how many reels match.
const OUTCOME = {
  3: { shout: 'JACKPOT!', note: 'Three of a kind' },
  2: { shout: 'DOUBLE!', note: 'Two of a kind' },
  1: { shout: '3 KEYS!', note: 'One of each' },
};

function formatPrice(amount, currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
}

const pickFrom = (list) => list[Math.floor(Math.random() * list.length)];

// The centre of the window lines up with key `i`; the window is two keys tall.
const offsetFor = (i) => SYMBOL / 2 - i * SYMBOL;
const REST = offsetFor(0);

/**
 * How a reel comes to rest. Every reel lands its result at L-2; what differs
 * is the last second of travel:
 *   plain  - decelerates, nudges a little past, settles back
 *   near   - the *tease* key (L-3) drifts slowly through the centre on its
 *            way to the result: a near miss you notice, not one that taunts
 *   creep  - (a jackpot after a pair) the winning key eases in from just
 *            above the centre
 */
function travel(length, mode) {
  const start = offsetFor(0);
  const fast = offsetFor(length - 6);
  const land = offsetFor(length - 2);
  if (mode === 'near') {
    // Slows as the tease key comes past, but never stops on it.
    const tease = offsetFor(length - 3);
    return {
      y: [start, fast, tease + SYMBOL * 0.3, land - SYMBOL * 0.08, land],
      times: [0, 0.55, 0.8, 0.95, 1],
      ease: ['linear', 'easeOut', 'easeInOut', 'easeOut'],
    };
  }
  if (mode === 'creep') {
    return {
      y: [start, fast, land + SYMBOL * 0.35, land - SYMBOL * 0.06, land],
      times: [0, 0.55, 0.84, 0.95, 1],
      ease: ['linear', 'easeOut', 'easeInOut', 'easeOut'],
    };
  }
  return {
    y: [start, fast, land - SYMBOL * 0.14, land],
    times: [0, 0.62, 0.9, 1],
    ease: ['linear', 'easeOut', 'easeOut'],
  };
}

/** Choreograph a roll for `picks`: which reels tease, how long each runs. */
function stage(picks, pool) {
  const [a, b, c] = picks;
  const pair = a.id === b.id;
  const plans = [{ mode: 'plain', duration: 1.5, tease: null }];
  // Reel 2: now and then, when it misses reel 1, reel 1's key drifts past.
  plans.push(b.id !== a.id && Math.random() < 0.3
    ? { mode: 'near', duration: 2.7, tease: a }
    : { mode: 'plain', duration: 2.5, tease: null });
  // Reel 3 carries the drama. After a pair it's a crawl either way: the third
  // match creeps in for the jackpot, or slides past just short of it.
  if (pair) {
    plans.push(c.id === a.id
      ? { mode: 'creep', duration: 4.1, tease: null }
      : { mode: 'near', duration: 4.0, tease: a });
  } else {
    const missed = [a, b].find((k) => k.id !== c.id);
    plans.push(missed && Math.random() < 0.3
      ? { mode: 'near', duration: 3.7, tease: missed }
      : { mode: 'plain', duration: 3.5, tease: null });
  }
  const strips = plans.map((plan, r) => {
    const length = STRIP[r];
    const strip = Array.from({ length }, () => pickFrom(pool));
    strip[length - 2] = picks[r];
    if (plan.tease) strip[length - 3] = plan.tease;
    // A creep needs something other than the winner just above it, or the
    // hang shows the same key twice.
    if (plan.mode === 'creep') {
      const other = pool.find((k) => k.id !== picks[r].id);
      if (other) strip[length - 3] = other;
    }
    return strip;
  });
  // Built once per roll: Motion restarts an animation whose target arrays
  // change identity, so re-renders mid-roll must see these same arrays.
  plans.forEach((plan, r) => { plan.path = travel(STRIP[r], plan.mode); });
  return { plans, strips, pair };
}

function Sparks({ count, reach }) {
  const sparks = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const dist = reach * (0.6 + Math.random() * 0.8);
    return { x: Math.round(Math.cos(angle) * dist), y: Math.round(Math.sin(angle) * dist), s: Math.random() < 0.4 ? 8 : 5 };
  });
  return (
    <span class="qty-burst qty-burst--key slot-burst" aria-hidden="true">
      {sparks.map((p, i) => <i key={i} style={{ '--x': `${p.x}px`, '--y': `${p.y}px`, '--s': `${p.s}px` }} />)}
    </span>
  );
}

/**
 * The RANDOM? key roll: three reels, each landing on a random crate key, and
 * all three keys go in the cart. Matching reels make it a DOUBLE or a JACKPOT.
 * Closing before the keys are added adds nothing.
 */
export function KeyRoll({ pool, currency, onWin, onClose }) {
  const still = useReducedMotion();
  const [phase, setPhase] = useState('idle'); // idle | rolling | landed | added
  const [results, setResults] = useState(null);
  const [show, setShow] = useState(null); // { plans, strips, pair }
  const [locked, setLocked] = useState(0); // reels at rest
  const [closing, setClosing] = useState(false);
  const lockedRef = useRef(0);
  const lastIndex = useRef([0, 0, 0]);
  const timers = useRef([]);
  const cabinetRef = useRef(null);
  const resultsRef = useRef(null);
  const showRef = useRef(null);

  useEffect(() => {
    // Straight to ROLL, so Enter or Space plays.
    cabinetRef.current?.querySelector('.slot-spin')?.focus();
    const onKey = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      timers.current.forEach(clearTimeout);
    };
  }, []);

  function later(fn, ms) {
    timers.current.push(setTimeout(fn, ms));
  }

  function close() {
    if (closing) return;
    setClosing(true);
    later(onClose, 200);
  }

  function roll() {
    if (phase !== 'idle' || !pool.length) return;
    const picks = [0, 1, 2].map(() => pickFrom(pool));
    const staged = stage(picks, pool);
    resultsRef.current = picks;
    showRef.current = staged;
    setResults(picks);
    setShow(staged);
    lockedRef.current = 0;
    setLocked(0);
    lastIndex.current = [0, 0, 0];
    tick(0);
    setPhase('rolling');
    // No spin to watch: land straight away, still with the payoff.
    if (still) later(() => [0, 1, 2].forEach((r) => reelLanded(r)), 250);
  }

  function reelLanded(r) {
    const staged = showRef.current;
    const picks = resultsRef.current;
    lockedRef.current += 1;
    setLocked(lockedRef.current);
    // Reel 2 making a pair dings; the last reel's landing ends the suspense.
    reelStop(r, r === 1 && staged.pair);
    if (lockedRef.current < 3) return;
    // A beat of silence, then the result.
    later(() => {
      const matches = matchCount(picks);
      setPhase('landed');
      if (matches === 3) {
        maxOut();
        later(freeKey, 350);
      } else if (matches === 2) {
        levelUp(4);
      } else {
        levelUp(2);
      }
      later(() => setPhase('added'), 1600);
      later(() => onWin(picks), 2300);
    }, still ? 0 : HANG_MS);
  }

  const matches = results ? matchCount(results) : 0;
  const outcome = OUTCOME[matches];
  const total = results ? results.reduce((sum, p) => sum + p.total_price, 0) : 0;
  const landed = phase === 'landed' || phase === 'added';
  // The keys that make the match glow; a no-match roll lights all three.
  const lit = (p) => matches === 1 || results.filter((q) => q.id === p.id).length > 1;
  // Two down and matching, one to go.
  const tense = phase === 'rolling' && show?.pair && locked === 2;

  return (
    <div class={`modal-overlay slot-overlay${closing ? ' closing' : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div class={`slot-cabinet card is-${phase}${tense ? ' is-tense' : ''}${outcome && landed ? ` is-match-${matches}` : ''}`}
        role="dialog" aria-modal="true" aria-labelledby="roll-title" ref={cabinetRef}>
        <button type="button" class="pkg-modal-close" onClick={close} aria-label="Close">✕</button>

        <div class="slot-marquee">
          <span class="slot-bulbs" aria-hidden="true">
            {Array.from({ length: BULBS }, (_, i) => <i key={i} />)}
          </span>
          <p class="slot-title" id="roll-title">KEY ROLL</p>
          <span class="slot-bulbs" aria-hidden="true">
            {Array.from({ length: BULBS }, (_, i) => <i key={i} />)}
          </span>
        </div>

        <div class="slot-body">
          <div class="slot-reels">
            {[0, 1, 2].map((r) => {
              const strip = show?.strips[r];
              const plan = show?.plans[r];
              const path = plan?.path || null;
              const isLocked = strip && r < locked;
              const pairLit = tense && r < 2;
              return (
                <div key={r} class={[
                  'slot-window',
                  isLocked && 'is-locked',
                  pairLit && 'is-pair',
                  tense && r === 2 && 'is-pending',
                  landed && lit(results[r]) && 'is-lit',
                ].filter(Boolean).join(' ')}>
                  <m.div
                    class="slot-strip"
                    initial={false}
                    animate={{ y: path && !still ? path.y : path ? path.y[path.y.length - 1] : REST }}
                    transition={path && !still
                      ? { duration: plan.duration, times: path.times, ease: path.ease }
                      : { duration: 0 }}
                    onUpdate={(latest) => {
                      if (!strip || still) return;
                      const i = Math.round((SYMBOL / 2 - latest.y) / SYMBOL);
                      if (i !== lastIndex.current[r]) {
                        lastIndex.current[r] = i;
                        reelTick(r, r === 2 && showRef.current?.pair && lockedRef.current >= 2);
                      }
                    }}
                    onAnimationComplete={() => { if (strip && !still) reelLanded(r); }}
                  >
                    {(strip || [pool[r % Math.max(pool.length, 1)]]).map((p, i) => (
                      <span class="slot-symbol" key={i}>
                        {p?.image ? <img src={p.image} alt="" /> : <b>?</b>}
                      </span>
                    ))}
                  </m.div>
                </div>
              );
            })}
          </div>
        </div>

        <div class="slot-foot" aria-live="polite">
          {phase === 'idle' && (
            <>
              <p class="slot-hint">Three random crate keys. Match them for a DOUBLE or a JACKPOT.</p>
              <ArcadeButton variant="primary" class="slot-spin" onClick={roll} disabled={!pool.length}>ROLL!</ArcadeButton>
            </>
          )}
          {phase === 'rolling' && (
            <p class={`slot-hint slot-hint--spin${tense ? ' slot-hint--tense' : ''}`}>
              {tense ? 'ONE MORE...' : 'ROLLING...'}
            </p>
          )}
          {landed && outcome && (
            <div class="slot-prize">
              <m.p class={`slot-jackpot slot-jackpot--${matches}`} initial={{ scale: 2.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }} transition={spring.slam}>{outcome.shout}</m.p>
              <p class="slot-prize-name">
                {summarise(results)} <span>{formatPrice(total, currency)}</span>
              </p>
              <p class="slot-prize-note">{phase === 'added' ? 'ADDED TO CART!' : outcome.note.toUpperCase()}</p>
              {!still && <Sparks count={matches === 3 ? 28 : matches === 2 ? 16 : 10} reach={matches === 3 ? 170 : 120} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Most reels showing the same key: 3, 2, or 1 when all differ. */
function matchCount(keys) {
  const counts = {};
  keys.forEach((k) => { counts[k.id] = (counts[k.id] || 0) + 1; });
  return Math.max(...Object.values(counts));
}

/** "2x Chroma Key + Spawner Key" */
function summarise(keys) {
  const groups = [];
  keys.forEach((k) => {
    const found = groups.find((g) => g.pkg.id === k.id);
    if (found) found.n += 1;
    else groups.push({ pkg: k, n: 1 });
  });
  return groups.map((g) => (g.n > 1 ? `${g.n}x ${g.pkg.name}` : g.pkg.name)).join(' + ');
}
