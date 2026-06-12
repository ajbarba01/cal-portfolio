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
 * Tab-pill style for the desktop marketing nav row.
 *
 * Hover: muted background surface (rounded-lg). Active: brand-strong text +
 * semibold + a 2px underline tucked inside the label (inset by the horizontal
 * padding so the line matches the text width, not the full pill width). The
 * underline is `after:` pseudo-element positioned at the bottom of the pill.
 *
 * Differs from `navUnderline` (center-grow animation) — used only in
 * SiteNavTabs; `navUnderline` and `NAV_UNDERLINE_BASE` remain for the account
 * link, sign-in link, and admin wordmark.
 *
 * @param active  whether the link targets the current section.
 */
export function navTab(active: boolean): string {
  return cn(
    // Pill geometry: padding matches the mockup (px-[11px] py-2 ≈ 8px 11px),
    // rounded-lg hover surface, smooth color + bg transitions.
    "relative px-[11px] py-2 text-[0.84375rem] rounded-lg transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2",
    // Tucked underline: after:: sits bottom-[2px], inset left/right by the
    // 11px horizontal padding so the line spans the text, not the full pill.
    "after:absolute after:left-[11px] after:right-[11px] after:bottom-[2px] after:h-[2px] after:rounded-sm after:bg-brand-strong",
    active
      ? // Active: brand-strong text + semibold + underline visible.
        "text-brand-strong font-semibold after:opacity-100"
      : // Inactive: subdued text + hover bg surface; underline hidden.
        "text-foreground/70 hover:text-foreground hover:bg-muted after:opacity-0",
  );
}
