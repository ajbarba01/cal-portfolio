"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { TextLink } from "@/components/ui/text-link";

/**
 * The link under an auth card that switches to the other auth route, carrying
 * the deferred-auth `returnTo` across so a visitor who detours to sign up
 * still lands back on the booking they started. The value rides through raw —
 * `safeReturnTo` at redirect time stays the single validation point.
 *
 * The query-string read has its own Suspense boundary because an unbounded one
 * would make every auth page render per request (ENGINEERING §13: public
 * routes stay static). The prerendered HTML carries the plain link; hydration
 * adds the parameter.
 */
export function AuthSwitchLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<TextLink href={href}>{children}</TextLink>}>
      <LinkWithReturnTo href={href}>{children}</LinkWithReturnTo>
    </Suspense>
  );
}

function LinkWithReturnTo({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const returnTo = useSearchParams().get("returnTo");
  return (
    <TextLink
      href={
        returnTo ? `${href}?returnTo=${encodeURIComponent(returnTo)}` : href
      }
    >
      {children}
    </TextLink>
  );
}
