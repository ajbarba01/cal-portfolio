"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActiveSection } from "./is-active-nav";
import { NAV_UNDERLINE_BASE } from "./nav-underline";

/** Brand ears mark, served from public/brand/cal-logo.png (transparent background,
 *  clay baked in — matches the brand-strong token both wordmark variants use). */
function EarsMark() {
  return (
    <Image
      src="/brand/cal-logo.png"
      alt=""
      aria-hidden="true"
      width={568}
      height={492}
      sizes="56px"
      priority
      className="h-12 w-auto shrink-0"
    />
  );
}

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
        "font-heading group flex items-center gap-5 justify-self-start text-2xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2",
        isAdmin && "text-brand-strong",
      )}
    >
      <EarsMark />
      <span
        className={cn(
          isAdmin &&
            `${NAV_UNDERLINE_BASE} ${active ? "after:scale-x-100" : "group-hover:after:scale-x-100"}`,
        )}
      >
        Cal Barba
      </span>
    </Link>
  );
}
