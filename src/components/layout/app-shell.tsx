import * as React from "react";
import { Suspense } from "react";
import { AppSidebar } from "./app-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import type { ZoneNav, NavBadges } from "./nav-config";

/**
 * Async server component: resolves the deferred navBadges promise and renders the
 * full sidebar. Wrapped in Suspense by AppShell so badge resolution never blocks
 * the sidebar from painting (the skeleton renders immediately instead).
 */
async function SidebarWithBadges({
  nav,
  identity,
  locked,
  navBadgesPromise,
}: {
  nav: ZoneNav;
  identity: string;
  locked: boolean;
  navBadgesPromise?: Promise<NavBadges>;
}) {
  const navBadges = navBadgesPromise ? await navBadgesPromise : undefined;
  return (
    <AppSidebar
      nav={nav}
      identity={identity}
      locked={locked}
      navBadges={navBadges}
    />
  );
}

/** Lightweight sidebar skeleton shown while badge data resolves. */
function SidebarSkeleton({ nav }: { nav: ZoneNav }) {
  return (
    <div className="flex h-full flex-col" aria-busy="true">
      <p className="text-muted-foreground px-4 pt-3 pb-1 text-xs font-medium tracking-wide uppercase">
        {nav.zoneLabel}
      </p>
      <div className="flex flex-col gap-1 px-2" aria-hidden="true">
        {nav.items.map((item) => (
          <Skeleton key={item.href} className="h-9 w-full rounded-lg" />
        ))}
      </div>
      <div className="border-border mt-auto border-t p-4">
        <Skeleton className="mb-2 h-3 w-32" />
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
    </div>
  );
}

/**
 * Account/admin body: persistent desktop sidebar + content. Rendered inside
 * PageShell, below the global SiteHeader. The mobile section nav lives in the
 * header's merged drawer (SiteNavMobile), not here.
 *
 * `navBadgesPromise` (admin only) is resolved inside SidebarWithBadges behind
 * Suspense so badge data never blocks the shell from painting.
 */
export function AppShell({
  nav,
  identity,
  locked = false,
  navBadgesPromise,
  children,
}: {
  nav: ZoneNav;
  identity: string;
  locked?: boolean;
  navBadgesPromise?: Promise<NavBadges>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1">
      <aside className="border-border bg-sidebar hidden w-60 shrink-0 border-r md:block">
        <div className="sticky top-0 h-dvh overflow-y-auto py-3">
          {/* Only the admin zone defers data (attention badges) — wrap that in
              Suspense so badge counts stream in without blocking. The account
              zone has no async data: render the sidebar directly so it doesn't
              flash a skeleton on every mount (e.g. switching back from marketing). */}
          {navBadgesPromise ? (
            <Suspense fallback={<SidebarSkeleton nav={nav} />}>
              <SidebarWithBadges
                nav={nav}
                identity={identity}
                locked={locked}
                navBadgesPromise={navBadgesPromise}
              />
            </Suspense>
          ) : (
            <AppSidebar nav={nav} identity={identity} locked={locked} />
          )}
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8">{children}</main>
    </div>
  );
}
