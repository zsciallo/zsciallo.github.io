import { useEffect } from 'preact/hooks';
import { LazyMotion, MotionConfig } from 'motion/react';
import { click } from './sound';

const loadFeatures = () => import('./motionFeatures').then((mod) => mod.default);

/** Shared feel for every interactive element, so a button on the store and a
 *  link in the nav give under the cursor the same way. `press` is the
 *  arcade-button travel: stiff and nearly undamped, it bottoms out fast. */
export const spring = {
  press: { type: 'spring', stiffness: 700, damping: 30 },
  hover: { type: 'spring', stiffness: 400, damping: 22 },
  pop: { type: 'spring', stiffness: 500, damping: 18 },
  // Quantity stepper: + slams in hard and rattles; − sinks without bounce.
  slam: { type: 'spring', stiffness: 900, damping: 14, mass: 0.6 },
  deflate: { type: 'spring', stiffness: 500, damping: 30 },
};

/** Wraps a page. LazyMotion keeps the bundle to the DOM animation features,
 *  fetched in their own chunk after the page renders (`m.*` components render
 *  plain elements until then; `strict` throws on a stray `motion.*`), and
 *  reducedMotion="user" turns transforms off for anyone who asked their OS for
 *  less motion while leaving colour and opacity feedback in place. */
export function MotionRoot({ children }) {
  useClickSound();
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

// Anything pressable clicks. Controls with their own sound design (the
// quantity stepper) opt out with data-sound="own".
const PRESSABLE = 'button, a[href], [role="button"], select, summary, label';

function pressable(target) {
  if (!(target instanceof Element) || target.closest('[data-sound="own"]')) return null;
  const el = target.closest(PRESSABLE);
  if (!el) return null;
  if (el.disabled || el.getAttribute('aria-disabled') === 'true') return null;
  return el;
}

/** One delegated listener for the whole page: pointer presses, plus Enter and
 *  Space on a focused control so keyboard users hear the same click. */
function useClickSound() {
  useEffect(() => {
    const onPointer = (e) => {
      if (e.button === 0 && pressable(e.target)) click();
    };
    const onKey = (e) => {
      if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
      const el = pressable(e.target);
      // Enter on a text field submits rather than presses; let it be.
      if (el && !(e.target instanceof HTMLInputElement)) click();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);
}
