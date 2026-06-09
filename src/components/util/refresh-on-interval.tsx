"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Mounts a timer that calls router.refresh() every `ms`. Used on the onboarding
 * booked-state card so that when Cal approves, the next refresh re-runs the
 * server component and hits its approved -> /account redirect. Clears on unmount.
 */
export function RefreshOnInterval({ ms = 15_000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), ms);
    return () => clearInterval(id);
  }, [router, ms]);
  return null;
}
