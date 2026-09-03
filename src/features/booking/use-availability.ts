"use client";

/**
 * useAvailability — client realtime hook for OPEN WINDOWS only.
 *
 * BUSY DATA LIVES ELSEWHERE: this hook does not read `bookings`. The old direct
 * query saw only the viewer's OWN bookings (RLS), so it could not subtract other
 * clients' busy slots. Busy ranges come from the service-role `useBusyRanges`
 * hook (identity-free public source). The DB exclusion constraint remains the
 * submit-time arbiter.
 *
 * WHY NO INTEGRATION TEST FOR THIS HOOK
 * --------------------------------------
 * Realtime subscriptions require a live Supabase Realtime channel (websocket).
 * Vitest runs in a Node environment without a browser and without a running
 * Supabase instance wired for realtime. Mocking the entire channel lifecycle
 * would test the mock, not the hook. The read the hook wraps is the part that
 * can regress silently, so it is a separate function and IS unit-tested in
 * use-availability.test.ts. The rest is glue: fetch → subscribe → setState.
 *
 * USAGE
 * -----
 * ```tsx
 * const { openWindows, loading, error } = useAvailability({ durationMs, rules });
 * ```
 */

import { useEffect, useState, useCallback, startTransition } from "react";
import type { DbClient } from "@/lib/supabase/db-client";
import { createClient } from "@/lib/supabase/client";
import type { TimeRange, BookingRuleSettings } from "./availability";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface UseAvailabilityOptions {
  /**
   * Duration of the booking the user is trying to make (ms). Part of the shape
   * the schedulers already pass; the windows read does not narrow by it.
   */
  durationMs: number;
  /** Booking rule settings (open/close hour, lead time, max advance). Load from DB or pass from a parent server component. */
  rules: BookingRuleSettings;
}

export interface UseAvailabilityResult {
  openWindows: TimeRange[];
  loading: boolean;
  error: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ──────────────────────────────────────────────────────────────────────────────
// Read (extracted for unit-testability — see use-availability.test.ts)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * The open windows a viewer could still book into: those that have not already
 * ended and that start no later than the hard max-advance horizon. A window
 * outside either bound can never hold a candidate `passesGuards` accepts, so
 * both bounds belong in the query rather than in a filter the browser runs
 * afterwards over every window Cal has ever painted.
 *
 * Throws on a failed read so the caller decides what the viewer sees.
 */
export async function fetchOpenWindows(
  client: DbClient,
  now: Date,
  hardMaxAdvanceDays: number,
): Promise<TimeRange[]> {
  const horizon = new Date(now.getTime() + hardMaxAdvanceDays * MS_PER_DAY);

  const { data, error } = await client
    .from("availability_windows")
    .select("starts_at, ends_at")
    .gte("ends_at", now.toISOString())
    .lte("starts_at", horizon.toISOString());

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: { starts_at: string; ends_at: string }) => ({
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
  }));
}

// ──────────────────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────────────────

export function useAvailability({
  rules,
}: UseAvailabilityOptions): UseAvailabilityResult {
  const [openWindows, setOpenWindows] = useState<TimeRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { hardMaxAdvanceDays } = rules;

  /**
   * Fetches fresh windows and batches all setState calls inside startTransition
   * to avoid cascading renders (satisfies react-hooks/set-state-in-effect).
   *
   * Depends on the horizon NUMBER, not the `rules` object: callers rebuild that
   * object every render, and depending on it would re-subscribe in a loop.
   */
  const fetchAndApply = useCallback(async () => {
    try {
      const windows = await fetchOpenWindows(
        createClient(),
        new Date(),
        hardMaxAdvanceDays,
      );
      startTransition(() => {
        setOpenWindows(windows);
        setLoading(false);
      });
    } catch (cause) {
      console.error("useAvailability: failed to load windows", cause);
      startTransition(() => {
        setError("Something went wrong. Please try again.");
      });
    }
  }, [hardMaxAdvanceDays]);

  useEffect(() => {
    void fetchAndApply();

    const supabase = createClient();

    // `availability_windows` is in the `supabase_realtime` publication and is
    // anon-readable, so this channel delivers to every viewer: a window Cal
    // opens or closes reaches an open booking page without a reload. Busy
    // bookings are tracked separately by useBusyRanges (service-role source).
    const channel = supabase
      .channel("availability-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "availability_windows" },
        () => {
          void fetchAndApply();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAndApply]);

  return { openWindows, loading, error };
}
