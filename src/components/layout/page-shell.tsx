import * as React from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "./site-footer";
import { CursorRing } from "@/components/effects/cursor-ring";
import { STICKY_NAV } from "./sticky-nav";
import { HeaderHeightVar } from "./header-height-var";

/**
 * The "sheet on a desk" shell, rendered ONCE by the (site) layout and preserved
 * across all in-site navigation. The desk (canvas + texture) is painted on <html>
 * and shows through the gutters; one centered sheet holds the global header, the
 * zone content, and the footer. Header/footer self-source any auth/zone data, so
 * this shell takes no props beyond children.
 *
 * The skip link is the first thing in the sheet so a keyboard user's very first
 * Tab can jump the ~10 header stops; every zone gives its `<main>` the matching
 * `id="main-content"` plus `tabIndex={-1}` — Safari/VoiceOver scrolls to a
 * non-focusable fragment target without moving the virtual cursor, so a `<main>`
 * missing the tabindex makes this link a silent no-op there.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="bg-background panel-ombre dark:border-border relative mx-auto flex w-full max-w-6xl flex-1 flex-col sm:shadow-[0_4px_40px_-8px_color-mix(in_oklab,var(--sand-950)_16%,transparent)] dark:shadow-none dark:sm:border-x">
        {/* Parked above the sheet rather than `sr-only`: `not-sr-only` resets
            padding and width, so the revealed chip would have lost its own box.
            A transform keeps it fully styled and simply off-screen until focus
            slides it in. */}
        <a
          href="#main-content"
          className="bg-brand text-brand-foreground focus:ring-ring/50 shadow-elev-2 rounded-card absolute top-3 left-3 z-40 -translate-y-[200%] px-4 py-2.5 text-sm font-semibold transition-transform duration-200 ease-out focus:translate-y-0 focus:ring-3 focus:outline-none motion-reduce:transition-none"
        >
          Skip to content
        </a>
        <CursorRing />
        <SiteHeader />
        {STICKY_NAV && <HeaderHeightVar />}
        {children}
        <SiteFooter />
      </div>
    </div>
  );
}
