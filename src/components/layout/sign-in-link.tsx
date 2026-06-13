"use client";

/**
 * SignInLink — the signed-out counterpart to AccountMenu, sharing its exact
 * shape: a clay-soft profile disc (a person glyph instead of initials) with the
 * proximity caret, and a dropdown hung from the navbar's bottom edge with the
 * same crest band + ombre + safe-triangle hover bridge.
 *
 * The disc links straight to /login (carrying returnTo so the user lands back on
 * the page they came from); the menu surfaces "Sign in" and "Create account".
 *
 * Mirrors AccountMenu's positioning contract: the panel is absolutely positioned
 * against the header's inner container (top-full = navbar bottom regardless of
 * header height), and the hover bridge is the classic safe triangle. See
 * account-menu.tsx for the full rationale on each piece.
 *
 * Rendered by HeaderAuth (an async server component that cannot call hooks) for
 * signed-out visitors. The mobile drawer handles sign-in inline.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn, UserPlus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export function SignInLink() {
  const pathname = usePathname();
  const loginHref =
    pathname && pathname !== "/"
      ? `/login?returnTo=${encodeURIComponent(pathname)}`
      : "/login";

  return (
    <div className="group">
      {/* Safe-triangle hover bridge — see account-menu.tsx. */}
      <span
        aria-hidden
        className="invisible absolute top-1/2 right-5 bottom-0 w-60 opacity-0 transition-[opacity,visibility] delay-150 duration-200 [clip-path:polygon(100%_0,100%_100%,0_100%)] group-focus-within:visible group-focus-within:opacity-100 group-focus-within:delay-0 group-hover:visible group-hover:opacity-100 group-hover:delay-0 sm:right-8"
      />

      <Link
        href={loginHref}
        aria-haspopup="menu"
        aria-label="Sign in"
        onClick={(e) => e.currentTarget.blur()}
        className="relative block rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span data-spotlight-link className="relative block size-11">
          {/* Profile disc — same soft-clay fill as the account disc, with a person
              glyph in place of initials. Inset hover ring (won't clip on the edge). */}
          <span
            aria-hidden
            className={cn(
              "flex size-11 items-center justify-center rounded-full",
              "bg-sidebar-active text-brand-strong",
              "transition-transform duration-300 ease-out",
              "group-focus-within:scale-105 group-hover:scale-105",
              "group-hover:ring-brand/15 group-hover:ring-2 group-hover:ring-inset",
              "group-focus-within:ring-brand/15 group-focus-within:ring-2 group-focus-within:ring-inset",
            )}
          >
            <UserRound className="size-5" aria-hidden />
          </span>

          {/* Proximity caret — see account-menu.tsx. */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 transform-[rotate(calc(90deg*(1_-_var(--u,0))))]",
              "transition-transform duration-200 ease-out",
              "group-focus-within:transform-[rotate(0deg)] group-hover:transform-[rotate(0deg)]",
              "motion-reduce:transition-none",
            )}
          >
            <span className="border-t-brand-strong absolute -bottom-2.25 left-1/2 -ml-1.25 h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent" />
          </span>
        </span>
      </Link>

      {/* Panel — hung from the navbar bottom, same as AccountMenu. */}
      <div
        data-ring-include
        className="invisible absolute top-full right-5 z-30 opacity-0 transition-[opacity,visibility] delay-150 duration-200 group-focus-within:visible group-focus-within:opacity-100 group-focus-within:delay-0 group-hover:visible group-hover:opacity-100 group-hover:delay-0 sm:right-8"
      >
        <div
          role="menu"
          className="border-border bg-card w-60 overflow-hidden rounded-b-2xl border shadow-xl"
        >
          {/* Crest — mirrors the account crest, with a generic avatar + welcome. */}
          <div className="border-border panel-ombre bg-background border-b px-4 pt-6 pb-5 text-center">
            <span
              aria-hidden
              className="bg-sidebar-active text-brand-strong mx-auto mb-2.5 flex size-14 items-center justify-center rounded-full shadow-sm"
            >
              <UserRound className="size-7" aria-hidden />
            </span>
            <p className="font-heading text-foreground text-base font-semibold">
              Welcome
            </p>
            <p className="text-brand-strong mt-0.5 text-xs">
              Sign in to manage your bookings
            </p>
          </div>

          <div className="panel-ombre py-1.5">
            <Link
              href={loginHref}
              role="menuitem"
              onClick={(e) => e.currentTarget.blur()}
              className="bg-sidebar-active text-brand-strong flex items-center gap-3 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
            >
              <LogIn
                className="text-brand-strong size-4 shrink-0"
                aria-hidden
              />
              Sign in
            </Link>
            <Link
              href="/signup"
              role="menuitem"
              onClick={(e) => e.currentTarget.blur()}
              className="group/item text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-3 px-4 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
            >
              <UserPlus
                className="text-muted-foreground/70 group-hover/item:text-brand-strong size-4 shrink-0 transition-colors"
                aria-hidden
              />
              Create account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
