/**
 * Design tokens (TS side).
 *
 * Color + radius live in `src/app/globals.css` as CSS variables (the runtime source of truth,
 * two-layer: primitive palette -> semantic roles). This file holds the **non-color** tokens that
 * are useful in TypeScript (motion, breakpoints, z-index) plus the canonical list of semantic
 * color roles, so code references roles by name rather than hardcoding values.
 *
 * See docs/FRONTEND.md ("Modular theming"). Project palette/type are finalized in docs/DESIGN.md.
 */

/** Semantic color roles defined in globals.css. Use via Tailwind classes (e.g. `bg-primary`), never raw hex. */
export const SEMANTIC_COLORS = [
  "background",
  "foreground",
  "card",
  "popover",
  "primary",
  "secondary",
  "muted",
  "accent",
  "destructive",
  "border",
  "input",
  "ring",
] as const;

export type SemanticColor = (typeof SEMANTIC_COLORS)[number];

/** Motion tokens — keep animations consistent and easy to tune in one place. */
export const motion = {
  duration: { fast: 150, base: 250, slow: 400 },
  easing: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    emphasized: "cubic-bezier(0.3, 0, 0, 1)",
  },
} as const;

/** Breakpoints (px). Mirror Tailwind's defaults; mobile-first. */
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

/** Z-index scale — named layers so stacking order is intentional, not ad hoc. */
export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  overlay: 30,
  modal: 40,
  toast: 50,
} as const;
