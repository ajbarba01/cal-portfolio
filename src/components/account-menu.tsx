"use client";

/**
 * AccountMenu — header control for signed-in users.
 *
 * The "Account" trigger links to /account (unchanged behavior); hovering or
 * keyboard-focusing it reveals a minimal dropdown with Profile + Sign out.
 * Reveal is CSS-only (group-hover / group-focus-within) so it works for mouse
 * and keyboard without extra state; sign-out logic lives in SignOutButton.
 */

import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";

export function AccountMenu() {
  return (
    <div className="group relative">
      <Link
        href="/account"
        className="text-muted-foreground hover:text-foreground focus-visible:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        aria-haspopup="menu"
      >
        Account
      </Link>

      {/* Reveal on hover or when focus is anywhere inside the group. The outer
          wrapper sits flush against the trigger (top-full, no margin) and uses
          pt-2 for the visual gap — that padding is part of the hovered subtree,
          so moving the cursor from trigger to panel never crosses a dead zone
          that would close the menu. */}
      <div className="invisible absolute top-full right-0 z-10 pt-2 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <div
          role="menu"
          className="border-border bg-background flex min-w-32 flex-col rounded-md border py-1"
        >
          <Link
            href="/account"
            role="menuitem"
            className="text-muted-foreground hover:text-foreground hover:bg-muted px-3 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
          >
            Profile
          </Link>
          <SignOutButton
            role="menuitem"
            className="text-muted-foreground hover:text-foreground hover:bg-muted px-3 py-1.5 focus-visible:outline-2 focus-visible:-outline-offset-2"
          />
        </div>
      </div>
    </div>
  );
}
