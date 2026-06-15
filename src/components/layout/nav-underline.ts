import { cn } from "@/lib/utils";

/**
 * Top-bar link interaction: an underline that grows from center on hover and
 * persists when active. The single source for the marketing tabs, the account
 * link, and the admin wordmark — so the "nav-underline" language is defined once.
 */
export const NAV_UNDERLINE_BASE =
  "after:bg-brand-strong relative py-1 transition-colors after:absolute after:inset-x-0 after:-bottom-2 after:h-0.5 after:origin-center after:scale-x-0 after:rounded after:transition-transform after:duration-200 after:ease-out focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * @param active       whether the link targets the current section.
 * @param hoverReveal  when true (default, e.g. tabs) an inactive link reveals
 *                     its underline on hover. Set false for a dropdown trigger
 *                     (the account menu) where hover opens a panel instead — the
 *                     underline then shows ONLY when active, never on hover.
 */
export function navUnderline(active: boolean, hoverReveal = true): string {
  return cn(
    NAV_UNDERLINE_BASE,
    "text-[0.95rem] font-medium",
    active
      ? "text-brand-strong font-semibold after:scale-x-100"
      : hoverReveal
        ? "text-foreground/80 hover:text-foreground hover:after:scale-x-100"
        : "text-foreground/80 hover:text-foreground",
  );
}

/**
 * Underline style for the desktop marketing nav row.
 *
 * A 2px clay underline tucked to the label width (inset by the horizontal
 * padding) that grows from center. Active: brand-strong text + semibold +
 * underline pinned full. Inactive: subdued, and the underline scales with `--u`
 * — the proximity value <CursorRing> writes as the cursor ring nears the tab —
 * so it grows in as the ring approaches and a real `:hover` pins it full. Base
 * defaults `--u` to 0 so a no-JS / reduced-motion render shows no stray line.
 *
 * Used only in SiteNavTabs; `navUnderline` (center-grow on hover/focus) and
 * `NAV_UNDERLINE_BASE` remain for the account link, sign-in link, and admin
 * wordmark.
 *
 * @param active  whether the link targets the current section.
 */
export function navTab(active: boolean): string {
  return cn(
    "relative px-[11px] py-2 text-base font-medium rounded-lg transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 [--u:0]",
    "after:absolute after:left-[11px] after:right-[11px] after:bottom-[2px] after:h-[2px] after:rounded-sm after:bg-brand-strong after:origin-center after:transition-transform after:duration-200 after:ease-out",
    // translateZ(0) is baked into every transform on purpose: it forces each
    // underline onto its own compositor layer. Without it, the active tab's
    // identity scaleX(1) gets optimized back into the main paint layer while the
    // proximity underline (animated scaleX(var(--u))) stays composited — and
    // Chromium antialiases the 2px line differently on those two paths, so the
    // selected underline renders a hair thinner than the hover/proximity one.
    active
      ? "text-brand-strong font-semibold after:[transform:translateZ(0)_scaleX(1)]"
      : "text-foreground/70 hover:text-brand-strong after:[transform:translateZ(0)_scaleX(var(--u))] hover:after:[transform:translateZ(0)_scaleX(1)]",
  );
}
