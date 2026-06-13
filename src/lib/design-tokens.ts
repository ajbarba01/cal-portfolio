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

/**
 * Curated list of the primary semantic color roles defined in globals.css — the ones referenced by
 * name in code. Use via Tailwind classes (e.g. `bg-primary`), never raw hex. Intentionally NOT
 * exhaustive: paired `*-foreground` variants (e.g. `card-foreground`) are implied by their base role
 * and omitted here to keep this a concise reference, not a mirror of every CSS var.
 */
export const SEMANTIC_COLORS = [
  "background",
  "foreground",
  "card",
  "popover",
  "primary",
  "secondary",
  "muted",
  "accent",
  "canvas",
  "section-alt",
  "brand",
  "brand-foreground",
  "brand-strong",
  "sidebar-active",
  "destructive",
  "border",
  "input",
  "ring",
  "status-available",
  "status-available-foreground",
  "status-booked",
  "status-booked-foreground",
  "status-unavailable",
  "status-unavailable-foreground",
  "warning",
] as const;

export type SemanticColor = (typeof SEMANTIC_COLORS)[number];

/** Motion tokens — keep animations consistent and easy to tune in one place. */
export const motion = {
  duration: { fast: 150, base: 250, slow: 400 },
  easing: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    emphasized: "cubic-bezier(0.3, 0, 0, 1)",
  },
  /**
   * Scroll reveal (effects/reveal.tsx). Mirrors the `--reveal-*` CSS vars in
   * globals.css (the runtime source of truth); duplicated here for the JS
   * stagger math + discoverability. `distancePx: 0` ⇒ fade-only today; raise it
   * (and the matching CSS var) to enable a synchronized rise.
   */
  reveal: {
    durationMs: 1000,
    distancePx: 0,
    ease: "cubic-bezier(0.4, 0, 0.2, 1)",
    /**
     * Within a RevealGroup, a child's delay = its reading-order index ×
     * staggerStepMs, capped at staggerMaxMs (so long lists don't drag on). Keep
     * the step a meaningful fraction of durationMs or the cascade reads as
     * simultaneous (the fades overlap).
     */
    staggerStepMs: 140,
    staggerMaxMs: 700,
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

/**
 * Spacing scale — whitespace is a token, not a per-page choice. These are the ONLY
 * approved gap/padding conventions; shells (Phase 1) consume them so marketing,
 * account, and admin breathe identically. All values are Tailwind 4px-base steps.
 */
export const space = {
  /** Responsive container horizontal padding. */
  pageX: "px-5 sm:px-8",
  /** Vertical gap between major page sections. */
  sectionY: "py-12 sm:py-16",
  /** Default gap within a vertical content stack. */
  stack: "gap-6",
  /** Gap between a label and its form control. */
  field: "gap-1.5",
} as const;

/** Reading measure for long-form/marketing content (also the `.measure` CSS utility). */
export const measure = "65ch";

/**
 * Type scale — one documented set of steps. Headings use Fraunces (var `--font-heading`),
 * body uses Public Sans (var `--font-sans`). Pages pick a step; never ad-hoc sizes.
 */
export const typeScale = {
  display: { size: "3rem", leading: "1.05", font: "heading", weight: 600 },
  h1: { size: "2.25rem", leading: "1.1", font: "heading", weight: 600 },
  h2: { size: "1.5rem", leading: "1.2", font: "heading", weight: 600 },
  h3: { size: "1.175rem", leading: "1.3", font: "heading", weight: 600 },
  body: { size: "1rem", leading: "1.6", font: "sans", weight: 400 },
  small: { size: "0.875rem", leading: "1.5", font: "sans", weight: 400 },
  eyebrow: { size: "0.72rem", leading: "1.4", font: "sans", weight: 600 },
} as const;
