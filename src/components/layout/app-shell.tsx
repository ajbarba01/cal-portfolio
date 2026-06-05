"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Drawer } from "@base-ui/react/drawer";
import { Menu, X } from "lucide-react";
import { AppSidebar } from "./app-sidebar";
import type { ZoneNav } from "./nav-config";

export function AppShell({
  nav,
  identity,
  children,
}: {
  nav: ZoneNav;
  identity: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Slim top bar — bg-card (lighter surface, matching the marketing header) */}
      <header className="border-border bg-card flex items-center gap-2 border-b px-4 py-3 md:px-6">
        <MobileNavTrigger nav={nav} identity={identity} />
        <Link
          href="/"
          className="font-heading text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Cal Barba
        </Link>
      </header>

      <div className="flex flex-1">
        {/* Persistent sidebar — desktop only */}
        <aside className="border-border bg-sidebar hidden w-60 shrink-0 border-r md:block">
          <div className="sticky top-0 h-[100dvh] py-3">
            <AppSidebar nav={nav} identity={identity} />
          </div>
        </aside>
        <main className="min-w-0 flex-1 py-8">{children}</main>
      </div>
    </div>
  );
}

/**
 * Wrapper that reads pathname and passes it as the `key` to MobileNavDrawer.
 * React remounts MobileNavDrawer on every route change, resetting its open
 * state to false — no useEffect/setState needed (repo ESLint bans that pattern).
 */
function MobileNavTrigger({
  nav,
  identity,
}: {
  nav: ZoneNav;
  identity: string;
}) {
  const pathname = usePathname();
  return <MobileNavDrawer key={pathname} nav={nav} identity={identity} />;
}

function MobileNavDrawer({
  nav,
  identity,
}: {
  nav: ZoneNav;
  identity: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="md:hidden">
      <Drawer.Root open={open} onOpenChange={(nextOpen) => setOpen(nextOpen)}>
        <Drawer.Trigger
          aria-label="Open menu"
          className="inline-flex size-11 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Menu className="size-5" />
        </Drawer.Trigger>
        <Drawer.Portal>
          <Drawer.Backdrop className="bg-foreground/20 fixed inset-0 z-50" />
          <Drawer.Popup className="bg-sidebar fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col">
            <div className="flex justify-end p-2">
              <Drawer.Close
                aria-label="Close menu"
                className="inline-flex size-11 items-center justify-center rounded-lg"
              >
                <X className="size-5" />
              </Drawer.Close>
            </div>
            <AppSidebar nav={nav} identity={identity} />
          </Drawer.Popup>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}
