"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Drawer } from "@base-ui/react/drawer";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isActiveNav,
  isActiveSection,
} from "@/components/layout/is-active-nav";
import { navUnderline } from "@/components/layout/nav-underline";
import { SignOutButton } from "@/components/sign-out-button";
import type { NavItem, ZoneNav } from "@/components/layout/nav-config";

/** Desktop-only centered tab row. */
export function SiteNavTabs({ links }: { links: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation">
      <ul className="flex items-center justify-center gap-7 text-sm">
        {links.map(({ href, label }) => {
          const active = isActiveSection(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={navUnderline(active)}
              >
                {label}
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
  zoneNav,
  isSignedIn,
  isAdmin,
}: {
  links: NavItem[];
  zoneNav?: ZoneNav;
  isSignedIn: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  // Remount on navigation so the drawer always starts closed (repo eslint bans
  // set-state-in-effect; key={pathname} is the sanctioned auto-close pattern).
  return (
    <SiteNavMobileDrawer
      key={pathname}
      links={links}
      zoneNav={zoneNav}
      pathname={pathname}
      isSignedIn={isSignedIn}
      isAdmin={isAdmin}
    />
  );
}

function SiteNavMobileDrawer({
  links,
  zoneNav,
  pathname,
  isSignedIn,
  isAdmin,
}: {
  links: NavItem[];
  zoneNav?: ZoneNav;
  pathname: string;
  isSignedIn: boolean;
  isAdmin: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(nextOpen) => setOpen(nextOpen)}
      swipeDirection="right"
    >
      <Drawer.Trigger
        aria-label="Open menu"
        className="text-foreground inline-flex size-11 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Menu className="size-5" />
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop className="bg-foreground/20 fixed inset-0 z-50" />
        <Drawer.Viewport className="fixed inset-0 z-50">
          <Drawer.Popup className="bg-background absolute inset-y-0 right-0 flex w-72 max-w-[85vw] translate-x-[var(--drawer-swipe-movement-x,0px)] flex-col overflow-y-auto shadow-xl transition-transform duration-300 ease-out data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full">
            <div className="flex items-center justify-between p-4">
              <span className="font-heading text-lg font-semibold">Menu</span>
              <Drawer.Close
                aria-label="Close menu"
                className="inline-flex size-11 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2"
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
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-11 items-center rounded-lg px-3 text-base",
                            active
                              ? "bg-sidebar-active text-brand-strong font-semibold"
                              : "text-foreground hover:bg-muted",
                          )}
                        >
                          {label}
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
                {links.map(({ href, label }) => {
                  const active = isActiveSection(pathname, href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "border-border flex min-h-11 items-center border-b px-4 text-base",
                          active
                            ? "text-brand-strong border-l-brand-strong border-l-2 font-semibold"
                            : "text-foreground",
                        )}
                      >
                        {label}
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
                      className="border-border text-foreground flex min-h-11 items-center border-b px-4 text-base font-medium"
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
                        className="border-border text-foreground flex min-h-11 items-center border-b px-4 text-base"
                      >
                        Account
                      </Link>
                    </li>
                    <li>
                      <SignOutButton className="border-border text-foreground flex min-h-11 w-full items-center border-b px-4 text-base" />
                    </li>
                  </>
                ) : (
                  <li>
                    <Link
                      href="/login"
                      className="border-border text-foreground flex min-h-11 items-center border-b px-4 text-base"
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
