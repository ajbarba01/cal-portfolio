"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { isActiveSection } from "./is-active-nav";
import { NAV_UNDERLINE_BASE } from "./nav-underline";
import { useAdminHint, rememberAdminHint } from "./admin-hint";

/** Brand wordmark. For admins it doubles as the /admin affordance: clay-tinted,
 *  underline-on-hover, and the underline persists while on any /admin route.
 *
 *  `isAdmin` is the authoritative role from the server. When omitted (the header's
 *  Suspense fallback during a zone switch, before the role query resolves) the
 *  wordmark falls back to the optimistic [[admin-hint]] so an admin's clay tint
 *  doesn't flash back to black mid-navigation. The authoritative value, once
 *  known, is persisted and always wins. */
export function Wordmark({ isAdmin }: { isAdmin?: boolean }) {
  const hint = useAdminHint();
  const admin = isAdmin ?? hint;

  // Persist the authoritative flag so future fallbacks render the right state.
  useEffect(() => {
    if (isAdmin !== undefined) rememberAdminHint(isAdmin);
  }, [isAdmin]);

  const pathname = usePathname();
  const active = admin && isActiveSection(pathname, "/admin");
  return (
    <Link
      href={admin ? "/admin" : "/"}
      aria-current={active ? "page" : undefined}
      className={cn(
        "font-heading group flex items-center gap-5 justify-self-start text-2xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2",
        admin && "text-brand-strong",
      )}
    >
      <span
        className={cn(
          admin &&
            `${NAV_UNDERLINE_BASE} ${active ? "after:scale-x-100" : "group-hover:after:scale-x-100"}`,
        )}
      >
        Cal Barba
      </span>
    </Link>
  );
}
