"use client";

/**
 * AccountMenu — header control for signed-in users.
 *
 * The "Account" trigger links to /account (unchanged behavior); hovering or
 * keyboard-focusing it reveals a minimal dropdown with Profile + Sign out.
 * Reveal is CSS-only (group-hover / group-focus-within) so it works for mouse
 * and keyboard without extra state; the only client logic is the sign-out
 * handler, which clears the Supabase session and refreshes server components so
 * the header flips back to "Sign in".
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AccountMenu() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

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
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="text-muted-foreground hover:text-foreground hover:bg-muted px-3 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:opacity-50"
          >
            {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}
