"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActiveSection } from "./is-active-nav";
import { NAV_UNDERLINE_BASE } from "./nav-underline";

/** Brand ears mark. Stored as a static asset at public/brand/mark-ears-on-light.svg;
 *  inlined here so it inherits the brand-strong token (clay) via currentColor rather
 *  than hardcoding a color — keeps it on-brand against both the public (dark text) and
 *  admin (already clay) wordmark. Source viewBox is preserved verbatim. */
function EarsMark() {
  return (
    <svg
      viewBox="30 36 140 122"
      aria-hidden="true"
      focusable="false"
      className="text-brand-strong h-12 w-auto shrink-0"
      fill="currentColor"
    >
      <path d="M 107 143 C 109 89, 124 92, 130.0 51.5 Q 133 43, 136.4 51.3 C 152.5 73, 166 77, 166 113 L 166.0 113.0 L 161.5 116.9 L 168.7 126.5 L 150.3 126.7 L 157.5 136.3 L 139.0 136.4 L 146.2 146.0 L 121.0 152.0  Q 111.0 154, 107 143 Z" />
      <path d="M 93.0 143 C 91.0 89, 76.0 92, 70.0 51.5 Q 67.0 43, 63.6 51.3 C 47.5 73, 34.0 77, 34.0 113 L 34.0 113.0 L 38.5 116.9 L 31.3 126.5 L 49.7 126.7 L 42.5 136.3 L 61.0 136.4 L 53.8 146.0 L 79.0 152.0  Q 89.0 154, 93.0 143 Z" />
    </svg>
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
