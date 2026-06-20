import type { Transition, Variants } from 'motion/react';

// Shared motion presets so timing/easing stays consistent across the app.
// `MotionConfig reducedMotion="user"` (main.tsx) already flattens these for
// users who prefer reduced motion, so individual components don't special-case it.

// Gentle "ease-out-expo"-ish curve — feels calm, not bouncy. Good for finance UI.
export const easeOut: Transition = { duration: 0.34, ease: [0.22, 1, 0.36, 1] };

// Card / block entrance: fade + small rise.
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: easeOut },
};

// Container that staggers its direct children (use with list*/fade* item variants).
export const listContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
};

// List row entrance with a small rise — only safe on non-table elements
// (div/li); table rows can't be transformed reliably, use `fadeItem` there.
export const listItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: easeOut },
};

// Opacity-only entrance — safe to apply to <tr> in real <table>s.
export const fadeItem: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.28, ease: 'easeOut' } },
};
