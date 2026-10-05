// Split out so Motion's animation engine loads after first paint rather than
// in the page's entry chunk. LazyMotion in motion.jsx imports this on demand.
export { domAnimation as default } from 'motion/react';
