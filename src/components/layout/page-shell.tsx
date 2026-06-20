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
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="bg-background panel-ombre dark:border-border relative mx-auto flex w-full max-w-6xl flex-1 flex-col sm:shadow-[0_4px_40px_-8px_rgba(28,24,19,0.16)] dark:shadow-none dark:sm:border-x">
        {/* Site-wide cursor glow, masked to this sheet (so the textured canvas
            gutters stay untinted) with hero photos [data-ring-exclude] cut out. */}
        <CursorRing />
        <SiteHeader />
        {STICKY_NAV && <HeaderHeightVar />}
        {children}
        <SiteFooter />
      </div>
    </div>
  );
}
