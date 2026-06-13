"use client";

import { type ReactNode } from "react";
import { useNavPending } from "./nav-pending";
import { DelayedPageLoader } from "@/components/ui/delayed-page-loader";

/**
 * Wraps a zone's `<main>` content. While a soft navigation is in flight
 * (`useNavPending`), it swaps the stale page for the page loading circle
 * instantly — so a click gets feedback even though the App Router won't re-show
 * `loading.tsx` on soft sibling navigations. The circle itself is buffered
 * (blank first; see DelayedPageLoader), so a quick load shows no spinner blip.
 * Once the route commits, the flag clears and the new page replaces the loader.
 */
export function ContentArea({ children }: { children: ReactNode }) {
  const { pending } = useNavPending();
  return pending ? <DelayedPageLoader /> : <>{children}</>;
}
