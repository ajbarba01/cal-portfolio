"use client";

/**
 * useAvailability — client realtime hook for OPEN WINDOWS only.
 *
 * Subscribes to Supabase Realtime changes on `availability_windows`, then derives
 * candidate open slots via the pure `deriveOpenSlots` (fitsWindow + passesGuards)
 * — no business logic is duplicated here.
 *
 * BUSY DATA LIVES ELSEWHERE: this hook no longer reads `bookings`. The old direct
 * query saw only the viewer's OWN bookings (RLS), so it could not subtract other
 * clients' busy slots. Busy ranges now come from the service-role
 * `useBusyRanges` hook (identity-free public source); the caller marks slots busy
 * via `markSlotsBusy`. The DB exclusion constraint remains the submit-time arbiter.
 *
 * WHY NO INTEGRATION TEST FOR THIS HOOK
 * --------------------------------------
 * Realtime subscriptions require a live Supabase Realtime channel (websocket).
 * Vitest runs in a Node environment without a browser and without a running
 * Supabase instance wired for realtime. Mocking the entire channel lifecycle
 * would test the mock, not the hook. The pure slot-derivation helper
 * `deriveOpenSlots` is pure and IS unit-tested in use-availability.test.ts.
 * The hook itself is thin glue: fetch → subscribe → setState; the integration
 * is best verified manually or via a Playwright E2E test in a future phase.
 *
 * USAGE
 * -----
 * ```tsx
 * const { openWindows, openSlots, loading, error } =
 *   useAvailability({ durationMs: 60 * 60 * 1000, rules });
 * ```
 */

import { useEffect, useState, useCallback, startTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { fitsWindow, passesGuards } from "./availability";
import type { TimeRange, BookingRuleSettings } from "./availability";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

/** A candidate slot: a window the UI can display as bookable. */
export interface AvailableSlot {
  startsAt: Date;
  endsAt: Date;
}

export interface UseAvailabilityOptions {
  /** Duration of the booking the user is trying to make (ms). Used to derive candidate slots. */
  durationMs: number;
  /** Booking rule settings (open/close hour, lead time, max advance). Load from DB or pass from a parent server component. */
  rules: BookingRuleSettings;
  /**
   * Granularity for slot enumeration in milliseconds.
   * @default 30 minutes (30 * 60 * 1000)
   */
  slotStepMs?: number;
}

export interface UseAvailabilityResult {
  openWindows: TimeRange[];
  /** Derived open slots: candidates that fit a window AND pass guards. */
  openSlots: AvailableSlot[];
  loading: boolean;
  error: string | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Pure helper (extracted for unit-testability — see use-availability.test.ts)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Derives open slots from availability windows by enumerating candidate start
 * times at `slotStepMs` increments within each window and filtering through
 * the pure `fitsWindow` and `passesGuards` guards.
 *
 * This function is intentionally exported so it can be unit-tested without
 * mounting the hook or requiring a Supabase connection.
 */
export function deriveOpenSlots(
  openWindows: TimeRange[],
  durationMs: number,
  rules: BookingRuleSettings,
  now: Date,
  slotStepMs: number,
): AvailableSlot[] {
  const slots: AvailableSlot[] = [];

  for (const window of openWindows) {
    let cursor = window.startsAt.getTime();
    const windowEnd = window.endsAt.getTime();

    while (cursor + durationMs <= windowEnd) {
      const candidate: TimeRange = {
        startsAt: new Date(cursor),
        endsAt: new Date(cursor + durationMs),
      };

      if (
        fitsWindow(candidate, openWindows) &&
        passesGuards(candidate, rules, now)
      ) {
        slots.push({ startsAt: candidate.startsAt, endsAt: candidate.endsAt });
      }

      cursor += slotStepMs;
    }
  }

  return slots;
}

// ──────────────────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────────────────

const DEFAULT_SLOT_STEP_MS = 30 * 60 * 1000; // 30 minutes

export function useAvailability({
  durationMs,
  rules,
  slotStepMs = DEFAULT_SLOT_STEP_MS,
}: UseAvailabilityOptions): UseAvailabilityResult {
  const [openWindows, setOpenWindows] = useState<TimeRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetches fresh windows and batches all setState calls inside startTransition
   * to avoid cascading renders (satisfies react-hooks/set-state-in-effect).
   */
  const fetchAndApply = useCallback(async () => {
    const supabase = createClient();

    const windowsRes = await supabase
      .from("availability_windows")
      .select("starts_at, ends_at")
      .gte("ends_at", new Date().toISOString());

    if (windowsRes.error) {
      startTransition(() => {
        setError(`Failed to load availability: ${windowsRes.error.message}`);
      });
      return;
    }

    const windows = (windowsRes.data ?? []).map((r) => ({
      startsAt: new Date(r.starts_at),
      endsAt: new Date(r.ends_at),
    }));

    startTransition(() => {
      setOpenWindows(windows);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    void fetchAndApply();

    const supabase = createClient();

    // Subscribe to realtime changes on availability_windows. Busy bookings are
    // tracked separately by useBusyRanges (service-role source).
    // NOTE: realtime delivery needs the table to be in the `supabase_realtime`
    // publication (it currently isn't), so this channel does not fire today;
    // windows refresh on (re)mount. Kept for when the publication is extended.
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

  const now = new Date();
  const openSlots = deriveOpenSlots(
    openWindows,
    durationMs,
    rules,
    now,
    slotStepMs,
  );

  return { openWindows, openSlots, loading, error };
}
