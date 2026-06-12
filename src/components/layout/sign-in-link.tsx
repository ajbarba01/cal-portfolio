"use client";

/**
 * SignInLink — a thin client wrapper around the "Sign in" nav link that reads
 * the current pathname via `usePathname` and appends it as `returnTo` so the
 * user lands back on the page they came from after authenticating.
 *
 * Used by `HeaderAuth` (an async server component that cannot call hooks
 * itself). The mobile drawer (`SiteNavMobile`) handles this inline because it
 * is already a client component.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navUnderline } from "@/components/layout/nav-underline";

interface SignInLinkProps {
  className?: string;
}

export function SignInLink({ className }: SignInLinkProps) {
  const pathname = usePathname();
  const href =
    pathname && pathname !== "/"
      ? `/login?returnTo=${encodeURIComponent(pathname)}`
      : "/login";

  return (
    <Link href={href} className={className ?? navUnderline(false)}>
      Sign in
    </Link>
  );
}
