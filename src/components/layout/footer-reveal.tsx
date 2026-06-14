"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Reveal } from "@/components/effects/reveal";

/**
 * Fades the shell footer in on every navigation. The footer is rendered ONCE by
 * the persistent shell and never remounts on its own, so the `<Reveal>` (which
 * IS the <footer> element via `as`, so the fade covers its background too) is
 * keyed by `pathname` to REMOUNT on each commit and replay the fade.
 *
 * It does NOT need to hide itself during loading: the page loader fills the
 * viewport (`min-h-dvh`, see DelayedPageLoader / PageLoader), which pushes the
 * footer below the fold for the whole load — so it is never seen at a wrong
 * position, on either loading path (the `pending` swap or a route `loading.tsx`).
 * On commit the footer lands at its final spot already at opacity 0 (the move is
 * unseen) and `immediate` fades it in there with the same effect page content
 * uses — so a short page eases in instead of snapping.
 */
export function FooterReveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <Reveal key={pathname} as="footer" immediate className={className}>
      {children}
    </Reveal>
  );
}
