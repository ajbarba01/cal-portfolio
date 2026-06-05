"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActiveNav } from "./is-active-nav";
import type { ZoneNav } from "./nav-config";
import { LogOut } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";

export function AppSidebar({
  nav,
  identity,
}: {
  nav: ZoneNav;
  identity: string;
}) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <p className="text-muted-foreground px-4 pt-3 pb-1 text-xs font-medium tracking-wide uppercase">
        {nav.zoneLabel}
      </p>
      <nav
        aria-label={`${nav.zoneLabel} sections`}
        className="flex flex-col px-2"
      >
        {nav.items.map(({ href, label }) => {
          const active = isActiveNav(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center rounded-lg px-3 text-sm transition-colors duration-200 ease-out focus-visible:outline-2 focus-visible:-outline-offset-2 md:min-h-9",
                active
                  ? "bg-sidebar-active text-brand-strong font-semibold"
                  : "text-foreground hover:bg-sidebar-accent",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-border mt-auto flex flex-col gap-2 border-t p-4">
        <span className="text-muted-foreground text-xs">{identity}</span>
        <SignOutButton className="bg-destructive/10 text-destructive hover:bg-destructive/20 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2">
          <LogOut className="size-4" /> Sign out
        </SignOutButton>
      </div>
    </div>
  );
}
