import { useState, useEffect, useRef } from 'preact/hooks';
import { m, useReducedMotion } from 'motion/react';
import { spring } from '../lib/motion';
import { click, deflate, freeKey, ignite, levelUp as levelUpSound, maxOut, stopFire, tick } from '../lib/sound';

import { MAX_QUANTITY } from '../lib/tebex';

export { MAX_QUANTITY };

// Quantity "levels", every 5 through the range most people buy (1-10 keys):
// 5 purple, 10 pink, 15 gold, 20 mint, then 30 diamond and 40 inferno for the
// big spenders, and MAX at Tebex's cap of 50. Crossing up into a new one fires
// LEVEL UP; the stepper and its number take the tier's colour (see
// .qty-fx[data-tier] in index.css).
const TIER_FLOORS = [1, 5, 10, 15, 20, 30, 40, MAX_QUANTITY];
const TIER_SHOUT = { 6: 'DIAMOND!', 7: 'INFERNO!' };

function tierOf(value) {
  let tier = 1;
  TIER_FLOORS.forEach((floor, i) => { if (value >= floor) tier = i + 1; });
  return tier;
}

// A + inside this window of the last one extends the combo.
const COMBO_WINDOW_MS = 700;
// A combo this long sets the stepper on (purple) fire.
const FIRE_AT = 10;
// How long each effect lives; matches the keyframe durations in index.css.
const LIFETIME = { float: 900, burst: 750, levelup: 1200 };

function sparks(count, reach) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
    const dist = reach * (0.7 + Math.random() * 0.6);
    return {
      x: Math.round(Math.cos(angle) * dist),
      y: Math.round(Math.sin(angle) * dist),
      size: Math.random() < 0.35 ? 6 : 4,
    };
  });
}

// Flames for an on-fire combo: fixed positions and staggers, so they don't
// reshuffle on every render.
const FLAMES = Array.from({ length: 18 }, (_, i) => ({
  x: 2 + (i * 96) / 17,
  d: -((i * 0.29) % 0.6).toFixed(2),
  h: (0.75 + ((i * 7) % 5) * 0.14).toFixed(2),
  dx: ((i % 3) - 1) * 5,
  s: 6 + ((i * 5) % 3) * 2,
}));

/** A − or + key: a raised arcade key on a hard edge that springs up on hover
 *  and presses flush on tap, the same feel as ArcadeButton at key size. */
function QtyKey({ up = false, size, still, disabled, onHold, onRelease, onKeyStep, children, ...rest }) {
  const edge = size === 'sm' ? 3 : 4;
  return (
    <m.button
      type="button"
      class={`qty-btn${up ? ' qty-btn--up' : ''}`}
      disabled={disabled}
      // Pointer presses step on the way down and repeat while held; the
      // capture keeps the release on this key even if the pointer drifts.
      onPointerDown={(e) => {
        if (e.button !== 0 || disabled) return;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // No live pointer to capture (synthetic events); the hold still
          // works, it just ends on pointerup over the key.
        }
        onHold();
      }}
      onPointerUp={onRelease}
      onPointerLeave={onRelease}
      onPointerCancel={onRelease}
      onLostPointerCapture={onRelease}
      // A long press on touch would open the context menu instead.
      onContextMenu={(e) => e.preventDefault()}
      // Keyboard presses arrive as clicks with no pointer behind them
      // (detail 0); pointer clicks were already handled on pointerdown.
      onClick={(e) => { if (e.detail === 0) onKeyStep(); }}
      style={{ '--edge': `${edge}px` }}
      initial={false}
      whileHover={disabled ? undefined : still ? { '--edge': `${edge + 1}px` } : { y: -1, '--edge': `${edge + 1}px` }}
      whileTap={disabled ? undefined : still ? { '--edge': '0px' } : { y: edge, '--edge': '0px', transition: spring.press }}
      transition={spring.hover}
      {...rest}
    >
      {children}
    </m.button>
  );
}

/**
 * −/+ quantity control with a typable field for larger amounts. Clicks and keys
 * are kept inside the control so it can sit on a clickable package card.
 *
 * Every change "levels up": the number slams in (or deflates on −), a +1
 * floats off XP-style, + bursts pixel sparks, fast clicks build a combo, and
 * crossing a tier fires LEVEL UP. Effects fire from the click itself, not the
 * value, because in the cart the value only changes once Tebex answers.
 *
 * With `commitDelay`, changes are counted locally and only handed to
 * `onChange` once clicking has stopped for that long - one basket update for a
 * whole burst, so combos can build instead of every click locking the control
 * while it posts.
 */
export function QuantityStepper({
  value: outer,
  onChange,
  disabled = false,
  min = 1,
  max = MAX_QUANTITY,
  size = 'md',
  label = 'Quantity',
  // Optional: (quantity) => free keys the basket would earn at that quantity.
  // Crossing up a step fires FREE KEY! (see lib/freeKeys.js).
  rewardAt = null,
  commitDelay = 0,
}) {
  // A value counted locally but not yet handed over (commitDelay only).
  const [pending, setPending] = useState(null);
  const value = pending ?? outer;
  const commitTimer = useRef(null);
  const pendingRef = useRef(null);
  pendingRef.current = pending;

  // Hand-off settled: the outside value caught up, or the post finished (the
  // control re-enabled) with a different answer - either way, show the truth.
  useEffect(() => {
    if (pending != null && outer === pending) setPending(null);
  }, [outer]);
  const wasDisabled = useRef(disabled);
  useEffect(() => {
    if (wasDisabled.current && !disabled && pending != null && !commitTimer.current) setPending(null);
    wasDisabled.current = disabled;
  }, [disabled]);
  // Leaving with a change still counted: send it rather than drop it.
  useEffect(() => () => {
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      if (pendingRef.current != null) live.current.onChange(pendingRef.current);
    }
  }, []);

  function emit(next) {
    if (!commitDelay) return onChange(next);
    setPending(next);
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      commitTimer.current = null;
      live.current.onChange(next);
    }, commitDelay);
  }

  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const [fx, setFx] = useState([]);
  const [jolt, setJolt] = useState(null);
  const [comboTag, setComboTag] = useState(null);
  const [onFire, setOnFire] = useState(false);
  const still = useReducedMotion();

  const nextId = useRef(0);
  const timers = useRef(new Set());
  const combo = useRef({ count: 0, at: 0 });
  const comboTimer = useRef(null);
  const fireRef = useRef(false);
  const prevValue = useRef(value);
  const mounted = useRef(false);

  // Follow the outside value whenever it changes under us (e.g. a cart update).
  useEffect(() => setDraft(String(value)), [value]);

  // The slam direction is read during render, then the baseline moves on.
  const dir = value > prevValue.current ? 1 : value < prevValue.current ? -1 : 0;
  useEffect(() => {
    prevValue.current = value;
    mounted.current = true;
  }, [value]);

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    clearTimeout(comboTimer.current);
    if (fireRef.current) stopFire();
  }, []);

  function setFire(on) {
    if (fireRef.current === on) return;
    fireRef.current = on;
    setOnFire(on);
    if (on) ignite();
    else stopFire();
  }

  function spawn(effect) {
    const id = nextId.current++;
    setFx((list) => [...list, { ...effect, id }]);
    const t = setTimeout(() => {
      timers.current.delete(t);
      setFx((list) => list.filter((e) => e.id !== id));
    }, LIFETIME[effect.kind]);
    timers.current.add(t);
  }

  function bump(from, to, { fromClick = true } = {}) {
    if (to === from) return;
    const up = to > from;

    const now = Date.now();
    const c = combo.current;
    if (up && fromClick && now - c.at < COMBO_WINDOW_MS) c.count += 1;
    else c.count = up && fromClick ? 1 : 0;
    c.at = now;
    const streak = c.count;

    const tierTo = tierOf(to);
    const levelUp = tierTo > tierOf(from);
    const maxed = to >= MAX_QUANTITY;
    const ignites = up && streak === FIRE_AT;
    const freeKeyWon = Boolean(rewardAt) && rewardAt(to) > rewardAt(from);

    // Sound: + climbs a note per combo step, − drops. A tier crossing or MAX
    // plays over it. The key still gets a soft mechanical click underneath.
    click({ soft: true });
    if (up) tick(streak - 1);
    else deflate();
    if (freeKeyWon) freeKey();
    else if (maxed && levelUp) maxOut();
    else if (levelUp) levelUpSound(tierTo);

    // A free key outranks a tier: it's real loot, the tier is just a colour.
    if (freeKeyWon) spawn({ kind: 'levelup', text: 'FREE KEY!', freeKey: true });
    else if (levelUp) spawn({ kind: 'levelup', text: maxed ? 'MAX!' : TIER_SHOUT[tierTo] ?? 'LEVEL UP!' });

    // One combo sticker at a time, beside the stepper rather than over the
    // number; each new streak count slams in over the last. The streak (and
    // any fire) ends when the window runs out without another +.
    clearTimeout(comboTimer.current);
    if (streak >= 3) {
      setComboTag({ n: streak, id: now });
      if (streak >= FIRE_AT) setFire(true);
      comboTimer.current = setTimeout(() => {
        setComboTag(null);
        setFire(false);
      }, COMBO_WINDOW_MS + 300);
    } else {
      setComboTag(null);
      setFire(false);
    }

    if (still) return;

    // Alternating the attribute between two identical keyframes restarts the
    // CSS animation on every press.
    setJolt((j) => ({ n: (j?.n ?? 0) + 1, big: levelUp || ignites || freeKeyWon }));
    const delta = to - from;
    spawn({ kind: 'float', text: `${up ? '+' : '−'}${Math.abs(delta)}`, up, streak: streak >= 3 ? streak : 0 });
    if (up) {
      const extra = Math.min(streak - 1, 4);
      spawn({ kind: 'burst', sparks: sparks(6 + extra * 2, 26 + extra * 4) });
      if (levelUp) spawn({ kind: 'burst', sparks: sparks(12, 46) });
      if (ignites) spawn({ kind: 'burst', sparks: sparks(16, 58), fire: true });
      if (freeKeyWon) spawn({ kind: 'burst', sparks: sparks(18, 62), freeKey: true });
    }
  }

  // A held key steps from timers, so it reads the latest value, limits and
  // callback through refs rather than the render it started in. The value is
  // advanced optimistically so repeats compound before the next render.
  const live = useRef({});
  live.current = { value, min, max, disabled, onChange };

  function step(delta) {
    const { value: current, min: lo, max: hi } = live.current;
    const next = Math.min(hi, Math.max(lo, current + delta));
    bump(current, next);
    if (next !== current) {
      live.current.value = next;
      emit(next);
    }
    return next !== current;
  }

  // Hold: one step on press, then after a beat repeat, speeding up from
  // ~7 to ~17 steps a second. Stops at a limit, on release, or when the
  // control goes busy (the cart waits on Tebex between changes).
  const holdTimer = useRef(null);

  function startHold(delta) {
    stopHold();
    if (!step(delta)) return;
    let interval = 147;
    const repeat = () => {
      if (live.current.disabled || !step(delta)) return stopHold();
      interval = Math.max(60, interval * 0.9);
      holdTimer.current = setTimeout(repeat, interval);
    };
    holdTimer.current = setTimeout(repeat, 380);
  }

  function stopHold() {
    clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }

  useEffect(() => stopHold, []);

  function commit(raw) {
    const parsed = parseInt(raw, 10);
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
    setDraft(String(next));
    if (next !== value) {
      bump(value, next, { fromClick: false });
      emit(next);
    }
  }

  const tier = tierOf(value);
  const streak = combo.current.count;
  const slamFrom = dir > 0
    ? { scale: 1.9 + Math.min(streak, 6) * 0.12, y: -16, opacity: 0.5 }
    : { scale: 0.55, y: 10, opacity: 0.4 };

  return (
    <div
      class={`qty-fx qty-fx--${size}${editing ? ' is-editing' : ''}${onFire ? ' is-on-fire' : ''}`}
      data-sound="own"
      data-tier={tier === TIER_FLOORS.length ? 'max' : tier}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {onFire && (
        <span class="qty-fire" aria-hidden="true">
          {FLAMES.map((f, i) => (
            <i key={i} style={{ '--fx': `${f.x}%`, '--fd': `${f.d}s`, '--fh': f.h, '--fdx': `${f.dx}px`, '--fs': `${f.s}px` }} />
          ))}
        </span>
      )}
      <div
        class={`qty-stepper qty-stepper--${size}`}
        data-jolt={jolt ? (jolt.n % 2 ? 'a' : 'b') : undefined}
        data-jolt-big={jolt?.big ? '' : undefined}
      >
        <QtyKey
          size={size}
          still={still}
          onHold={() => startHold(-1)}
          onRelease={stopHold}
          onKeyStep={() => step(-1)}
          disabled={disabled || value <= min}
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          −
        </QtyKey>
        <span class="qty-field">
          <input
            class="qty-input"
            type="text"
            inputMode="numeric"
            value={draft}
            disabled={disabled}
            aria-label={label}
            onFocus={() => setEditing(true)}
            onInput={(e) => setDraft(e.currentTarget.value.replace(/[^0-9]/g, ''))}
            onBlur={(e) => { setEditing(false); commit(e.currentTarget.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
          {/* The number players see. The input underneath keeps typing and
              screen readers working; its own text shows only while editing. */}
          <m.span
            key={value}
            class="qty-num"
            aria-hidden="true"
            initial={!mounted.current || still || dir === 0 ? false : slamFrom}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={dir > 0 ? spring.slam : spring.deflate}
          >
            {value}
          </m.span>
        </span>
        <QtyKey
          up
          size={size}
          still={still}
          onHold={() => startHold(1)}
          onRelease={stopHold}
          onKeyStep={() => step(1)}
          disabled={disabled || value >= max}
          aria-label={`Increase ${label.toLowerCase()}`}
        >
          +
        </QtyKey>
      </div>

      <span class="qty-fx-layer" aria-hidden="true">
        {comboTag && (
          <m.span key={comboTag.id} class="qty-combo"
            initial={{ scale: 2.2, rotate: -18, opacity: 0 }}
            animate={{ scale: 1, rotate: -8, opacity: 1 }}
            transition={spring.slam}>
            {comboTag.n >= FIRE_AT ? 'ON FIRE' : 'COMBO'} x{comboTag.n}
          </m.span>
        )}
        {fx.map((e) => {
          if (e.kind === 'float') {
            return (
              <span key={e.id} class={`qty-float${e.up ? '' : ' qty-float--down'}`}
                style={e.streak ? { '--boost': Math.min(e.streak, 8) } : undefined}>
                {e.text}
              </span>
            );
          }
          if (e.kind === 'burst') {
            return (
              <span key={e.id} class={`qty-burst${e.fire ? ' qty-burst--fire' : ''}${e.freeKey ? ' qty-burst--key' : ''}`}>
                {e.sparks.map((s, i) => (
                  <i key={i} style={{ '--x': `${s.x}px`, '--y': `${s.y}px`, '--s': `${s.size}px` }} />
                ))}
              </span>
            );
          }
          return <span key={e.id} class={`qty-levelup${e.freeKey ? ' qty-levelup--key' : ''}`}>{e.text}</span>;
        })}
      </span>
    </div>
  );
}
