"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActiveSection } from "./is-active-nav";
import { NAV_UNDERLINE_BASE } from "./nav-underline";

/** Brand wordmark. For admins it doubles as the /admin affordance: clay-tinted,
 *  underline-on-hover, and the underline persists while on any /admin route. */
export function Wordmark({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const active = isAdmin && isActiveSection(pathname, "/admin");
  return (
    <Link
      href={isAdmin ? "/admin" : "/"}
      aria-current={active ? "page" : undefined}
      className={cn(
        "font-heading justify-self-start text-xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2",
        isAdmin &&
          `${NAV_UNDERLINE_BASE} text-brand-strong ${active ? "after:scale-x-100" : "hover:after:scale-x-100"}`,
      )}
    >
      Cal Barba
    </Link>
  );
}
