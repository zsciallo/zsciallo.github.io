import { useId, useState } from 'preact/hooks';
import { m, useReducedMotion } from 'motion/react';
import { spring } from '../lib/motion';

/** One accordion row. The answer stays in the DOM when closed (height 0,
 *  inert) so search engines and find-in-page still see it; Motion springs the
 *  height open and shut and turns the + into a ×. */
export function FaqItem({ question, children }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const still = useReducedMotion();

  return (
    // Open state is a data attribute, not a class: useScrollReveal adds
    // `is-visible` to the class list imperatively, and re-rendering `class`
    // would wipe it and hide the row.
    <div class="faq-item reveal" data-open={open ? '' : undefined}>
      <h3 class="faq-heading">
        <m.button type="button" class="faq-question" aria-expanded={open} aria-controls={id}
          onClick={() => setOpen((v) => !v)} whileTap={still ? undefined : { scale: 0.985 }} transition={spring.press}>
          <span>{question}</span>
          <m.span class="faq-icon" aria-hidden="true" initial={false}
            animate={{ rotate: open ? 45 : 0 }} transition={spring.pop}>+</m.span>
        </m.button>
      </h3>
      <m.div id={id} class="faq-answer-wrap" role="region" inert={!open} initial={false}
        animate={open ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
        transition={still ? { duration: 0 } : { height: { type: 'spring', stiffness: 380, damping: 34 }, opacity: { duration: 0.18 } }}>
        <div class="faq-answer">{children}</div>
      </m.div>
    </div>
  );
}
