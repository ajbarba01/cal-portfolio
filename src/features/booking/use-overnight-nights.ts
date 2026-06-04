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
 * set (`deriveBookableDays`, `validateStayRange`) is unit-tested separately.
 * The hook itself is thin glue: fetch → subscribe → setState; integration is
 * best verified manually or via a Playwright E2E test in a future phase.
 *
 * USAGE
 * -----
 * ```tsx
 * const { overnightNights, loading, error } = useOvernightNights();
 * ```
 */

import { useEffect, useState, useCallback, startTransition } from "react";
import { createClient } from "@/lib/supabase/client";

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
    const supabase = createClient();

    const res = await supabase.from("overnight_nights").select("night");

    if (res.error) {
      startTransition(() => {
        setError(`Failed to load overnight nights: ${res.error.message}`);
      });
      return;
    }

    const nights = new Set((res.data ?? []).map((r) => r.night as string));

    startTransition(() => {
      setOvernightNights(nights);
      setLoading(false);
    });
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
