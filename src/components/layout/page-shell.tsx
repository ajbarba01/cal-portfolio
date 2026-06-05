import * as React from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "./site-footer";
import type { ZoneNav } from "./nav-config";

/**
 * The "sheet on a desk" shell composed by every zone layout. The desk (bg-canvas
 * + faint grain) fills the viewport; one centered sheet (bg-card, full height)
 * lifts off the desk with a soft shadow (light) / hairline side borders (dark,
 * where the shadow can't read) and holds the global header, body, and footer.
 * At phone width the sheet goes full-bleed (no max-width, no shadow/border) so the
 * gutters collapse. `zoneNav` (account/admin only) feeds the header's merged
 * mobile drawer with the zone's section links.
 */
export function PageShell({
  zoneNav,
  children,
}: {
  zoneNav?: ZoneNav;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-canvas relative flex min-h-dvh flex-col">
      <div
        aria-hidden
        className="desk-grain pointer-events-none absolute inset-0"
      />
      <div className="bg-card dark:border-border relative mx-auto flex w-full max-w-5xl flex-1 flex-col sm:shadow-[0_4px_40px_-8px_rgba(28,24,19,0.16)] dark:shadow-none dark:sm:border-x">
        <SiteHeader zoneNav={zoneNav} />
        {children}
        <SiteFooter />
      </div>
    </div>
  );
}
