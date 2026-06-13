"use client";

/**
 * AccountMenu — header control for signed-in users.
 *
 * The "Account" trigger links to /account (unchanged behavior); hovering or
 * keyboard-focusing it reveals a dropdown mirroring the account sidebar — every
 * accountNav section plus Sign out. Reveal is CSS-only (group-hover /
 * group-focus-within) so it works for mouse and keyboard without extra state;
 * sign-out logic lives in SignOutButton.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navUnderline } from "@/components/layout/nav-underline";
import {
  isActiveNav,
  isActiveSection,
} from "@/components/layout/is-active-nav";
import { accountNav } from "@/components/layout/nav-config";
import { SignOutButton } from "@/components/sign-out-button";

export function AccountMenu() {
  const pathname = usePathname();
  const active = isActiveSection(pathname, "/account");
  return (
    <div className="group relative">
      <Link
        href="/account"
        className={cn(
          // hoverReveal=false: this is a menu trigger, so it only underlines when
          // active — hovering opens the panel rather than revealing an underline.
          navUnderline(active, false),
          // And when active, suppress the underline while the menu is open so it
          // never sits awkwardly between the trigger and the dropdown panel.
          "group-focus-within:after:scale-x-0 group-hover:after:scale-x-0",
        )}
        aria-current={active ? "page" : undefined}
        aria-haspopup="menu"
        // Clicking the trigger (mouse) navigates but leaves focus on it, so
        // group-focus-within would pin the panel open after the cursor leaves.
        // Blur on click so only genuine keyboard focus keeps the menu revealed.
        onClick={(e) => e.currentTarget.blur()}
      >
        Account
      </Link>

      {/* Reveal on hover or when focus is anywhere inside the group. The outer
          wrapper sits flush against the trigger (top-full, no margin) and uses
          pt-2 for the visual gap — that padding is part of the hovered subtree,
          so moving the cursor from trigger to panel never crosses a dead zone
          that would close the menu. */}
      <div
        data-ring-include
        className="invisible absolute top-full right-0 z-10 pt-2 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        <div
          role="menu"
          className="border-border bg-background flex min-w-32 flex-col rounded-md border py-1 shadow-lg"
        >
          {accountNav.items.map(({ href, label }) => {
            const itemActive = isActiveNav(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                role="menuitem"
                aria-current={itemActive ? "page" : undefined}
                onClick={(e) => e.currentTarget.blur()}
                className={cn(
                  "hover:text-foreground hover:bg-muted px-3 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2",
                  itemActive
                    ? "text-brand-strong font-semibold"
                    : "text-muted-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
          <SignOutButton
            role="menuitem"
            className="text-destructive-warm hover:bg-destructive-warm/10 px-3 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
          />
        </div>
      </div>
    </div>
  );
}
