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
 * The pure busy→slot marking lives in `calendar-model.markSlotsBusy`; this hook
 * is thin glue (fetch → subscribe → setState) — no business logic, so it is not
 * unit-tested (see use-availability.ts for the same rationale).
 */

import { useEffect, useState, useCallback, startTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { getPublicBusyRanges } from "./busy-ranges";
import type { PublicBusyRange } from "./busy-ranges";

const FALLBACK_REFRESH_MS = 60 * 1000;

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

    const interval = setInterval(() => void refresh(), FALLBACK_REFRESH_MS);

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { busy, loading, error, refresh };
}
