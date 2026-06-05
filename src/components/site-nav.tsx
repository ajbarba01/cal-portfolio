"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Drawer } from "@base-ui/react/drawer";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActiveNav } from "@/components/layout/is-active-nav";
import { SignOutButton } from "@/components/sign-out-button";
import type { NavItem } from "@/components/layout/nav-config";

/** Desktop-only centered tab row. Rendered in the bottom tier of SiteHeader. */
export function SiteNavTabs({ links }: { links: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation">
      <ul className="flex items-center justify-center gap-7 text-sm">
        {links.map(({ href, label }) => {
          const active = isActiveNav(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "after:bg-brand-strong relative py-1 text-sm transition-colors after:absolute after:inset-x-0 after:-bottom-2 after:h-0.5 after:origin-center after:scale-x-0 after:rounded after:transition-transform after:duration-200 after:ease-out",
                  active
                    ? "text-brand-strong font-semibold after:scale-x-100"
                    : "text-muted-foreground hover:text-foreground hover:after:scale-x-100",
                )}
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

/** Mobile-only hamburger + slide-in drawer. Rendered in the top-tier right slot of SiteHeader. */
export function SiteNavMobile({
  links,
  isSignedIn,
  isAdmin,
}: {
  links: NavItem[];
  isSignedIn: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  // Remount the drawer subtree on every navigation to guarantee it starts closed.
  // Using pathname as the key means React tears down and recreates the Drawer.Root
  // whenever the route changes — no effect or ref needed.
  return (
    <SiteNavMobileDrawer
      key={pathname}
      links={links}
      pathname={pathname}
      isSignedIn={isSignedIn}
      isAdmin={isAdmin}
    />
  );
}

function SiteNavMobileDrawer({
  links,
  pathname,
  isSignedIn,
  isAdmin,
}: {
  links: NavItem[];
  pathname: string;
  isSignedIn: boolean;
  isAdmin: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Drawer.Root open={open} onOpenChange={(nextOpen) => setOpen(nextOpen)}>
      <Drawer.Trigger
        aria-label="Open menu"
        className="text-foreground inline-flex size-11 items-center justify-center rounded-lg"
      >
        <Menu className="size-5" />
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop className="bg-foreground/20 fixed inset-0 z-50" />
        <Drawer.Popup className="bg-background fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col">
          <div className="flex items-center justify-between p-4">
            <span className="font-heading text-lg font-semibold">Menu</span>
            <Drawer.Close
              aria-label="Close menu"
              className="inline-flex size-11 items-center justify-center"
            >
              <X className="size-5" />
            </Drawer.Close>
          </div>
          <nav aria-label="Mobile navigation">
            <ul className="flex flex-col">
              {links.map(({ href, label }) => {
                const active = isActiveNav(pathname, href);
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
      </Drawer.Portal>
    </Drawer.Root>
  );
}
