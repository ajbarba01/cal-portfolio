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
 *
 * The shell footer pairs with this: `<FooterReveal>` hides the footer while
 * `pending` is set and eases it in on commit, so the footer lands in its final
 * spot as part of the arriving page rather than snapping there.
 */
export function ContentArea({ children }: { children: ReactNode }) {
  const { pending } = useNavPending();
  return pending ? <DelayedPageLoader /> : <>{children}</>;
}
