import { cn } from "@/lib/utils";

/**
 * Top-bar link interaction: an underline that grows from center on hover and
 * persists when active. The single source for the marketing tabs, the account
 * link, and the admin wordmark — so the "nav-underline" language is defined once.
 */
export const NAV_UNDERLINE_BASE =
  "after:bg-brand-strong relative py-1 transition-colors after:absolute after:inset-x-0 after:-bottom-2 after:h-0.5 after:origin-center after:scale-x-0 after:rounded after:transition-transform after:duration-200 after:ease-out focus-visible:outline-2 focus-visible:outline-offset-2";

export function navUnderline(active: boolean): string {
  return cn(
    NAV_UNDERLINE_BASE,
    active
      ? "text-brand-strong font-semibold after:scale-x-100"
      : "text-muted-foreground hover:text-foreground hover:after:scale-x-100",
  );
}
