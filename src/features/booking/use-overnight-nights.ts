"use client";

/**
 * useOvernightNights — client realtime hook for the overnight night-set.
 *
 * Fetches the set of Denver calendar-day keys ("YYYY-MM-DD") from the
 * `overnight_nights` table that represent nights Cal is available for
 * house_sitting. Subscribes to Supabase Realtime changes on the table and
 * re-fetches on any change. State updates are batched inside `startTransition`
 * to avoid cascading renders.
 *
 * WHY NO INTEGRATION TEST FOR THIS HOOK
 * --------------------------------------
 * Realtime subscriptions require a live Supabase Realtime channel (websocket).
 * Vitest runs in a Node environment without a browser and without a running
 * Supabase instance wired for realtime. Mocking the entire channel lifecycle
 * would test the mock, not the hook. The pure derivation that consumes this
 * set (`deriveBookableDays`, `validateStayRange`) is unit-tested separately,
 * and the read the hook wraps is a separate function tested in
 * use-availability.test.ts alongside the sibling windows read. The hook itself
 * is thin glue: fetch → subscribe → setState.
 *
 * USAGE
 * -----
 * ```tsx
 * const { overnightNights, loading, error } = useOvernightNights();
 * ```
 */

import { useEffect, useState, useCallback, startTransition } from "react";
import type { DbClient } from "@/lib/supabase/db-client";
import { createClient } from "@/lib/supabase/client";
import { denverDayKey } from "@/lib/time-of-day";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface UseOvernightNightsResult {
  /** Set of Denver day-keys ("YYYY-MM-DD") that are overnight-bookable. */
  overnightNights: Set<string>;
  loading: boolean;
  error: string | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Read (extracted for unit-testability — see use-availability.test.ts)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * The overnight-bookable nights from `fromDayKey` onward, as Denver day-keys.
 *
 * The bound matters: the table accumulates a row per night Cal has ever opened,
 * and every past one is unbookable, so without it the browser downloads the
 * whole history on mount and again on every realtime ping.
 *
 * Throws on a failed read so the caller decides what the viewer sees.
 */
export async function fetchOvernightNights(
  client: DbClient,
  fromDayKey: string,
): Promise<Set<string>> {
  const { data, error } = await client
    .from("overnight_nights")
    .select("night")
    .gte("night", fromDayKey);

  if (error) throw new Error(error.message);

  return new Set((data ?? []).map((row: { night: string }) => row.night));
}

// ──────────────────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────────────────

export function useOvernightNights(): UseOvernightNightsResult {
  const [overnightNights, setOvernightNights] = useState<Set<string>>(
    () => new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetches fresh overnight nights and batches all setState calls inside
   * startTransition to avoid cascading renders.
   */
  const fetchAndApply = useCallback(async () => {
    try {
      const nights = await fetchOvernightNights(
        createClient(),
        denverDayKey(new Date()),
      );
      startTransition(() => {
        setOvernightNights(nights);
        setLoading(false);
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      startTransition(() => {
        setError(`Failed to load overnight nights: ${message}`);
      });
    }
  }, []);

  useEffect(() => {
    void fetchAndApply();

    const supabase = createClient();

    const channel = supabase
      .channel("overnight-nights-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "overnight_nights" },
        () => {
          void fetchAndApply();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAndApply]);

  return { overnightNights, loading, error };
}
