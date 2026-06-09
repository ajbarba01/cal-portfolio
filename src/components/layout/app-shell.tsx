import * as React from "react";
import { AppSidebar } from "./app-sidebar";
import type { ZoneNav } from "./nav-config";

/**
 * Account/admin body: persistent desktop sidebar + content. Rendered inside
 * PageShell, below the global SiteHeader. The mobile section nav lives in the
 * header's merged drawer (SiteNavMobile), not here.
 */
export function AppShell({
  nav,
  identity,
  locked = false,
  children,
}: {
  nav: ZoneNav;
  identity: string;
  locked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1">
      <aside className="border-border bg-sidebar hidden w-60 shrink-0 border-r md:block">
        <div className="sticky top-0 h-dvh overflow-y-auto py-3">
          <AppSidebar nav={nav} identity={identity} locked={locked} />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8">{children}</main>
    </div>
  );
}
