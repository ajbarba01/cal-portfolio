"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type MouseEvent } from "react";
import { Lock, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { activeNavHref } from "./is-active-nav";
import { useNavPending } from "./nav-pending";
import { NAV_ICONS } from "./nav-config";
import type { ZoneNav, NavBadges } from "./nav-config";
import { SignOutButton } from "@/components/sign-out-button";
import { NavBadge } from "@/components/ui/nav-badge";

const ONBOARDING_HREF = "/onboarding";

export function AppSidebar({
  nav,
  identity,
  locked = false,
  navBadges,
}: {
  nav: ZoneNav;
  identity: string;
  /** When true (account zone, onboarding incomplete), real tabs are disabled and an active "Onboarding" entry is shown. */
  locked?: boolean;
  navBadges?: NavBadges;
}) {
  const pathname = usePathname();
  const { start } = useNavPending();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  // Clear the optimistic highlight whenever the route actually changes — covers
  // the click landing on its page AND external navigation (browser back, header
  // links). Adjusting state during render (React's "storing info from previous
  // renders" pattern), not an effect.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setPendingHref(null);
  }

  const hrefs = nav.items.map((i) => i.href);
  const committedHref = activeNavHref(
    pathname,
    locked ? [ONBOARDING_HREF, ...hrefs] : hrefs,
  );
  // Optimistically highlight the clicked tab before usePathname commits, so the
  // active tab switches the instant you click while the destination's loading.tsx
  // renders. Cleared above once the route lands. The <Link> navigates natively
  // (no transition), so the loading fallback shows during the wait.
  const activeHref = pendingHref ?? committedHref;

  // Mark the clicked tab active immediately. No preventDefault — the <Link>
  // navigates natively so loading.tsx shows. Skip modified / non-primary clicks
  // (open-in-new-tab): those don't change this tab's route, so optimism would
  // leave a stale highlight.
  const markPending =
    (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      setPendingHref(href);
      start(href);
    };

  const itemBase =
    "flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm transition-colors duration-200 ease-out focus-visible:outline-2 focus-visible:-outline-offset-2 md:min-h-9";
  const activeCls = "bg-sidebar-active text-brand-strong font-semibold";
  const idleCls = "text-foreground hover:bg-sidebar-accent";

  return (
    <div className="flex h-full flex-col">
      <p className="text-muted-foreground px-4 pt-3 pb-1 text-xs font-medium tracking-wide uppercase">
        {nav.zoneLabel}
      </p>
      <nav
        aria-label={`${nav.zoneLabel} sections`}
        className="flex flex-col px-2"
      >
        {locked ? (
          <Link
            href={ONBOARDING_HREF}
            onClick={markPending(ONBOARDING_HREF)}
            aria-current={activeHref === ONBOARDING_HREF ? "page" : undefined}
            className={cn(
              itemBase,
              activeHref === ONBOARDING_HREF ? activeCls : idleCls,
            )}
          >
            Onboarding
          </Link>
        ) : null}

        {nav.items.map(({ href, label }) => {
          const badge = navBadges?.[href];
          const Icon = NAV_ICONS[href];
          return locked ? (
            <span
              key={href}
              aria-disabled="true"
              title="Available after onboarding"
              className={cn(
                itemBase,
                "text-muted-foreground/60 cursor-not-allowed",
              )}
            >
              <Lock className="size-3.5" aria-hidden="true" />
              {label}
            </span>
          ) : (
            <Link
              key={href}
              href={href}
              onClick={markPending(href)}
              aria-current={activeHref === href ? "page" : undefined}
              className={cn(
                itemBase,
                activeHref === href ? activeCls : idleCls,
              )}
            >
              {Icon ? (
                <Icon className="size-4 shrink-0" aria-hidden="true" />
              ) : null}
              {label}
              {badge ? (
                <NavBadge
                  count={badge.count}
                  label={badge.label}
                  className="ml-auto"
                />
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-border mt-auto flex flex-col gap-2 border-t p-4">
        <span className="text-muted-foreground text-xs">{identity}</span>
        <SignOutButton className="bg-destructive-warm/10 text-destructive-warm hover:bg-destructive-warm/20 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2">
          <LogOut className="size-4" /> Sign out
        </SignOutButton>
      </div>
    </div>
  );
}
