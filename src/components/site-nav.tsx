"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Drawer } from "@base-ui/react/drawer";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isActiveNav,
  isActiveNavItem,
  isCurrentNavItem,
} from "@/components/layout/is-active-nav";
import { useNavPending } from "@/components/layout/nav-pending";
import { navTab } from "@/components/layout/nav-underline";
import { SignOutButton } from "@/components/sign-out-button";
import { NAV_ICONS } from "@/components/layout/nav-config";
import type {
  NavItem,
  NavBadges,
  ZoneNav,
} from "@/components/layout/nav-config";
import { zoneNavForPath } from "@/components/layout/zone-for-path";
import { focusRing } from "@/components/ui/control-variants";
import { NavBadge } from "@/components/ui/nav-badge";

/**
 * Drawer rows are full-bleed inside a scroll container, so an outset focus ring
 * would be clipped at the panel edge — draw it inside the row instead.
 */
const DRAWER_ROW_FOCUS = cn(focusRing, "focus-visible:-outline-offset-2");

/** Desktop-only centered tab row. */
export function SiteNavTabs({ links }: { links: NavItem[] }) {
  const pathname = usePathname();
  const { start } = useNavPending();
  // Optimistically highlight the clicked tab before usePathname commits, and
  // signal the content area to show its skeleton — mirrors app-sidebar.tsx.
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);
  const [lastPathname, setLastPathname] = React.useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setPendingHref(null);
  }

  const markPending =
    (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      // Skip modified / non-primary clicks (open-in-new-tab): they don't change
      // this tab's route, so optimism would leave a stale highlight.
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

  return (
    <nav aria-label="Main navigation">
      <ul className="flex items-center justify-center gap-1">
        {links.map((item) => {
          const active = pendingHref
            ? pendingHref === item.href
            : isActiveNavItem(pathname, item);
          const current = pendingHref
            ? pendingHref === item.href
            : isCurrentNavItem(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={markPending(item.href)}
                aria-current={current ? "page" : undefined}
                data-spotlight-link
                className={navTab(active)}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Mobile-only hamburger + slide-in drawer (merged: zone sections + marketing + account). */
export function SiteNavMobile({
  links,
  navBadges,
  isSignedIn,
  isAdmin,
}: {
  links: NavItem[];
  navBadges?: NavBadges;
  isSignedIn: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const zoneNav = zoneNavForPath(pathname);
  // Remount on navigation so the drawer always starts closed (repo eslint bans
  // set-state-in-effect; key={pathname} is the sanctioned auto-close pattern).
  return (
    <SiteNavMobileDrawer
      key={pathname}
      links={links}
      zoneNav={zoneNav}
      navBadges={navBadges}
      pathname={pathname}
      isSignedIn={isSignedIn}
      isAdmin={isAdmin}
    />
  );
}

function SiteNavMobileDrawer({
  links,
  zoneNav,
  navBadges,
  pathname,
  isSignedIn,
  isAdmin,
}: {
  links: NavItem[];
  zoneNav?: ZoneNav;
  navBadges?: NavBadges;
  pathname: string;
  isSignedIn: boolean;
  isAdmin: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const { start } = useNavPending();

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(nextOpen) => setOpen(nextOpen)}
      swipeDirection="right"
    >
      <Drawer.Trigger
        aria-label="Open menu"
        className={cn(
          "text-foreground -mr-3 inline-flex size-11 items-center justify-center rounded-lg",
          focusRing,
        )}
      >
        <Menu className="size-5" />
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop className="bg-foreground/20 fixed inset-0 z-50" />
        <Drawer.Viewport className="fixed inset-0 z-50">
          <Drawer.Popup className="bg-background shadow-elev-2 absolute inset-y-0 right-0 flex w-72 max-w-[85vw] translate-x-[var(--drawer-swipe-movement-x,0px)] flex-col overflow-y-auto transition-transform duration-300 ease-out data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full">
            <div className="flex items-center justify-between p-4">
              {/* Drawer.Title, not a bare span: it is what names the dialog, so
                  a screen reader announces "Menu" instead of an unlabelled
                  popup on open. */}
              <Drawer.Title className="font-heading text-lg font-semibold">
                Menu
              </Drawer.Title>
              <Drawer.Close
                aria-label="Close menu"
                className={cn(
                  "inline-flex size-11 items-center justify-center rounded-lg",
                  focusRing,
                )}
              >
                <X className="size-5" />
              </Drawer.Close>
            </div>

            {/* Zone sections first (account/admin only) */}
            {zoneNav ? (
              <nav aria-label={`${zoneNav.zoneLabel} sections`}>
                <p className="text-muted-foreground px-4 pt-1 pb-1 text-xs font-medium tracking-wide uppercase">
                  {zoneNav.zoneLabel}
                </p>
                <ul className="flex flex-col px-2 pb-2">
                  {zoneNav.items.map(({ href, label }) => {
                    const active = isActiveNav(pathname, href);
                    const badge = navBadges?.[href];
                    const Icon = NAV_ICONS[href];
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          onClick={() => start(href)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-11 items-center gap-2 rounded-lg px-3 text-base",
                            DRAWER_ROW_FOCUS,
                            active
                              ? "bg-sidebar-active text-brand-strong font-semibold"
                              : "text-foreground hover:bg-muted",
                          )}
                        >
                          {Icon ? (
                            <Icon
                              className="size-4 shrink-0"
                              aria-hidden="true"
                            />
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
                      </li>
                    );
                  })}
                </ul>
                <div className="border-border mx-4 my-1 border-t" />
              </nav>
            ) : null}

            {/* Marketing links */}
            <nav aria-label="Site navigation">
              <ul className="flex flex-col">
                {links.map((item) => {
                  const active = isActiveNavItem(pathname, item);
                  const current = isCurrentNavItem(pathname, item);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => start(item.href)}
                        aria-current={current ? "page" : undefined}
                        className={cn(
                          "border-border flex min-h-11 items-center border-b px-4 text-base",
                          DRAWER_ROW_FOCUS,
                          active
                            ? "text-brand-strong border-l-brand-strong border-l-2 font-semibold"
                            : "text-foreground",
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="border-border my-2 border-t" />
              <ul className="flex flex-col">
                {isAdmin && (
                  <li>
                    <Link
                      href="/admin"
                      className={cn(
                        "border-border text-foreground flex min-h-11 items-center border-b px-4 text-base font-medium",
                        DRAWER_ROW_FOCUS,
                      )}
                    >
                      Admin
                    </Link>
                  </li>
                )}
                {isSignedIn ? (
                  <>
                    <li>
                      <Link
                        href="/account"
                        className={cn(
                          "border-border text-foreground flex min-h-11 items-center border-b px-4 text-base",
                          DRAWER_ROW_FOCUS,
                        )}
                      >
                        Account
                      </Link>
                    </li>
                    <li>
                      <SignOutButton
                        className={cn(
                          "border-border text-foreground flex min-h-11 w-full items-center border-b px-4 text-base",
                          DRAWER_ROW_FOCUS,
                        )}
                      />
                    </li>
                  </>
                ) : (
                  <li>
                    <Link
                      href={
                        pathname && pathname !== "/"
                          ? `/login?returnTo=${encodeURIComponent(pathname)}`
                          : "/login"
                      }
                      className={cn(
                        "border-border text-foreground flex min-h-11 items-center border-b px-4 text-base",
                        DRAWER_ROW_FOCUS,
                      )}
                    >
                      Sign in
                    </Link>
                  </li>
                )}
              </ul>
            </nav>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
