import { m, useReducedMotion } from 'motion/react';
import { spring } from '../lib/motion';

// The edge is the button's "depth": the hard shadow under it. Hover lifts the
// cap off the edge, a press drives it flush, like an arcade cabinet button.
// Sizes match the .btn-sm / .btn CSS, which sets the resting edge.
const EDGE = { sm: 4, md: 5 };

/**
 * The site's button. Renders an <a> when given `href`, otherwise a <button>,
 * keeping the existing .btn classes so styling stays in index.css. The hover
 * shine is CSS (.btn::after); only the travel is animated here.
 */
export function ArcadeButton({ href, variant = 'primary', size = 'md', class: cls = '', disabled, children, ...rest }) {
  const edge = EDGE[size] ?? EDGE.md;
  const Tag = href ? m.a : m.button;
  // Reduced motion: MotionConfig only makes movement instant, so drop the
  // travel entirely here. Colour and the edge still answer hover and press.
  const still = useReducedMotion();
  const off = disabled || rest['aria-disabled'] === true || rest['aria-disabled'] === 'true';

  const classes = ['btn', `btn-${variant}`, size === 'sm' && 'btn-sm', cls].filter(Boolean).join(' ');

  return (
    <Tag
      href={href}
      class={classes}
      data-arcade
      disabled={href ? undefined : disabled}
      style={{ '--edge': `${edge}px` }}
      initial={false}
      whileHover={off ? undefined : still ? { '--edge': `${edge + 2}px` } : { y: -2, '--edge': `${edge + 2}px` }}
      whileTap={off ? undefined : still ? { '--edge': '0px' } : { y: edge, '--edge': '0px', transition: spring.press }}
      transition={spring.hover}
      {...rest}
    >
      {children}
    </Tag>
  );
}
