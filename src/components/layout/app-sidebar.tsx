"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition, type MouseEvent } from "react";
import { Lock, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { activeNavHref, optimisticActiveHref } from "./is-active-nav";
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
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const hrefs = nav.items.map((i) => i.href);
  const committedHref = activeNavHref(
    pathname,
    locked ? [ONBOARDING_HREF, ...hrefs] : hrefs,
  );
  // Highlight the clicked tab instantly rather than waiting for the destination
  // page to load — usePathname only updates on navigation commit. See
  // optimisticActiveHref.
  const activeHref = optimisticActiveHref(
    committedHref,
    pendingHref,
    isNavigating,
  );

  // Plain left-clicks navigate via the router inside a transition so isNavigating
  // tracks the in-flight nav (driving the optimistic highlight above). Modified /
  // non-primary clicks fall through to the <Link> default (open in new tab, etc.).
  const handleNavigate =
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
      event.preventDefault();
      setPendingHref(href);
      startNavigation(() => router.push(href));
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
            onClick={handleNavigate(ONBOARDING_HREF)}
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
              onClick={handleNavigate(href)}
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
