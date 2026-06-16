import { cva, type VariantProps } from "class-variance-authority";

/**
 * The control track — the shared sizing + border + focus-ring shell that every
 * single-line interactive control (Input, Select trigger, …) composes, so a text
 * field, a dropdown, and a same-size button line up by construction instead of
 * each hardcoding `h-9`.
 *
 * Height / horizontal padding / radius resolve to the CSS-var control tokens in
 * globals.css (the single swap point when re-theming the system). The border and
 * focus/invalid/disabled treatment is the one source of truth for that look.
 *
 * Fill is intentionally NOT set here — it varies by control (a transparent field
 * vs a muted segmented track vs a card stepper) and is the deferred input-fill
 * decision. Callers compose this and add their own background + type-specific
 * classes (placeholder color, file inputs, mobile text size, hover, etc.).
 */
export const controlVariants = cva(
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 rounded-control border transition-colors outline-none focus-visible:ring-3 aria-invalid:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        sm: "h-[var(--control-h-sm)] px-[var(--control-px-sm)]",
        md: "h-[var(--control-h-md)] px-[var(--control-px-md)]",
        lg: "h-[var(--control-h-lg)] px-[var(--control-px-lg)]",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export type ControlVariantProps = VariantProps<typeof controlVariants>;

/**
 * Height + radius only (no border/padding/ring) — for composite controls whose
 * internals differ but whose outer box must still sit on the same track as a
 * plain field (the Multiswitch track, the NumberStepper root). Keeps them
 * height-aligned with Inputs without inheriting the field shell.
 */
export const controlBox = {
  sm: "h-[var(--control-h-sm)] rounded-control",
  md: "h-[var(--control-h-md)] rounded-control",
  lg: "h-[var(--control-h-lg)] rounded-control",
} as const;
