"use client";

/**
 * useBusyRanges — client busy-source hook for the customer calendar.
 *
 * Fetches identity-free public busy ranges through the `getPublicBusyRanges`
 * SERVICE-ROLE action (so it sees every client's active bookings, not just the
 * viewer's — the limitation the old direct `bookings` query had). Re-fetches on
 * a Supabase Realtime ping for `bookings` / `availability_windows`, with an
 * interval fallback, plus a manual `refresh()` for post-submit refresh.
 *
 * This hook is thin glue (fetch → subscribe → setState) — no business logic, so
 * it is not unit-tested (see use-availability.ts for the same rationale).
 */

import { useEffect, useState, useCallback, startTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { getPublicBusyRanges } from "./busy-ranges";
import type { PublicBusyRange } from "./busy-ranges";

/**
 * How often a visible calendar re-reads busy ranges when realtime cannot tell
 * it to. Each poll is a service-role read plus a pass over the pet photos, so
 * the interval is a cost, not just a delay; five minutes keeps a stale slot on
 * screen briefly while the exclusion constraint still refuses it at submit.
 */
const FALLBACK_REFRESH_MS = 5 * 60 * 1000;

export interface UseBusyRangesResult {
  busy: PublicBusyRange[];
  loading: boolean;
  error: string | null;
  /** Re-fetch immediately (e.g. after a booking submit). */
  refresh: () => Promise<void>;
}

export function useBusyRanges(
  serviceSlug: string | null,
  initial: PublicBusyRange[] = [],
): UseBusyRangesResult {
  const [busy, setBusy] = useState<PublicBusyRange[]>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const ranges = await getPublicBusyRanges(serviceSlug);
      startTransition(() => {
        setBusy(ranges);
        setError(null);
        setLoading(false);
      });
    } catch (e: unknown) {
      startTransition(() => {
        setError(
          e instanceof Error ? e.message : "Failed to load availability.",
        );
        setLoading(false);
      });
    }
  }, [serviceSlug]);

  useEffect(() => {
    void refresh();

    // `availability_windows` is published and anon-readable, so that half of the
    // channel delivers. `bookings` is deliberately NOT in `supabase_realtime`
    // (its rows carry client identity) and a public viewer could not see other
    // clients' rows anyway, so another client's booking reaches this calendar
    // only through the interval below. Do NOT add a status filter to the UPDATE
    // subscription — it would match the NEW row and miss cancellations.
    const supabase = createClient();
    const channel = supabase
      .channel("busy-ranges-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "availability_windows" },
        () => void refresh(),
      )
      .subscribe();

    // A hidden tab has no calendar to keep fresh, so it neither polls nor mints
    // photo URLs; coming back to the tab refreshes at once instead of waiting
    // out the rest of the interval.
    const interval = setInterval(() => {
      if (!document.hidden) void refresh();
    }, FALLBACK_REFRESH_MS);
    const onVisibilityChange = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { busy, loading, error, refresh };
}
