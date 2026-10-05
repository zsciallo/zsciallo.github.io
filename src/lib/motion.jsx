import { LazyMotion, MotionConfig } from 'motion/react';

const loadFeatures = () => import('./motionFeatures').then((mod) => mod.default);

/** Shared feel for every interactive element, so a button on the store and a
 *  link in the nav give under the cursor the same way. `press` is the
 *  arcade-button travel: stiff and nearly undamped, it bottoms out fast. */
export const spring = {
  press: { type: 'spring', stiffness: 700, damping: 30 },
  hover: { type: 'spring', stiffness: 400, damping: 22 },
  pop: { type: 'spring', stiffness: 500, damping: 18 },
};

/** Wraps a page. LazyMotion keeps the bundle to the DOM animation features,
 *  fetched in their own chunk after the page renders (`m.*` components render
 *  plain elements until then; `strict` throws on a stray `motion.*`), and
 *  reducedMotion="user" turns transforms off for anyone who asked their OS for
 *  less motion while leaving colour and opacity feedback in place. */
export function MotionRoot({ children }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
