"use client";

import { type ReactNode } from "react";
import { useNavPending } from "./nav-pending";

/**
 * Wraps a zone's `<main>` content. While a soft navigation is in flight
 * (`useNavPending`), it swaps the stale page for the zone skeleton instantly —
 * so a click gets immediate feedback even though the App Router won't re-show
 * `loading.tsx` on soft sibling navigations. Once the route commits, the flag
 * clears and the freshly-rendered `children` (the new page) replace the skeleton.
 */
export function ContentArea({
  children,
  skeleton,
}: {
  children: ReactNode;
  skeleton: ReactNode;
}) {
  const { pending } = useNavPending();
  return pending ? <>{skeleton}</> : <>{children}</>;
}
