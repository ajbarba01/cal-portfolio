"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Shared "a soft navigation is in flight" signal.
 *
 * The App Router keeps the previous page visible during a transition and only
 * re-shows `loading.tsx` on first entry to a zone — not on soft sibling nav. So
 * without this, clicking a nav tab holds the old content (no feedback) for the
 * whole server wait. Nav links call `start()` from their click handler; a
 * `<ContentArea>` reads `pending` and swaps to a skeleton instantly.
 *
 * Mechanism note: we deliberately do NOT use `useLinkStatus()` + an effect to
 * bridge per-link status — surfacing that async state to a provider requires
 * set-state-in-effect, which the repo's eslint config bans. Instead we mark
 * pending in the click handler (events may set state freely) and clear it at
 * render time when the route commits — the same sanctioned pattern as the
 * sidebar's optimistic highlight (see `app-sidebar.tsx`).
 */

const normalize = (p: string) =>
  p !== "/" && p.endsWith("/") ? p.slice(0, -1) : p;

interface NavPendingValue {
  pending: boolean;
  /** Mark a navigation in-flight. No-ops for clicks targeting the current path. */
  start: (href: string) => void;
}

const NavPendingContext = createContext<NavPendingValue | null>(null);

export function NavPendingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  // Clear once the route actually commits — render-time "store info from a
  // previous render" pattern, not an effect. Covers the click landing AND
  // external navigation (browser back, header links).
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setPending(false);
  }

  const start = (href: string) => {
    // Drop query/hash: a same-path click won't change `pathname`, so the flag
    // would never clear and the skeleton would stick.
    const target = normalize(href.split("?")[0].split("#")[0]);
    if (target !== normalize(pathname)) setPending(true);
  };

  return (
    <NavPendingContext.Provider value={{ pending, start }}>
      {children}
    </NavPendingContext.Provider>
  );
}

/**
 * Reads the shared nav-pending state. Falls back to an inert value when rendered
 * outside a provider (e.g. the header on auth/onboarding routes, which are not
 * wrapped) so nav components never crash there.
 */
export function useNavPending(): NavPendingValue {
  return useContext(NavPendingContext) ?? { pending: false, start: () => {} };
}
