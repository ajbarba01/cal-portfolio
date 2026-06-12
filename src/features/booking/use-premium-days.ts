"use client";

/**
 * usePremiumDays — client hook for the set of premium (holiday-surcharge) days.
 *
 * Fetches the `holiday_dates` JSONB column from the settings row as a
 * `Set<string>` of Denver calendar-day keys ("YYYY-MM-DD"). Subscribes to
 * Supabase Realtime changes on the settings table and re-fetches on any change
 * so booking calendars stay current if Cal marks new premium days while a
 * booking session is open.
 *
 * Parallel to `useOvernightNights` — same fetch-then-subscribe pattern, same
 * startTransition batching.
 */

import { useEffect, useState, useCallback, startTransition } from "react";
import { createClient } from "@/lib/supabase/client";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface UsePremiumDaysResult {
  /** Set of Denver day-keys ("YYYY-MM-DD") that carry a premium surcharge. */
  premiumDays: Set<string>;
  loading: boolean;
  error: string | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────────────────

export function usePremiumDays(): UsePremiumDaysResult {
  const [premiumDays, setPremiumDays] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAndApply = useCallback(async () => {
    const supabase = createClient();

    const res = await supabase
      .from("settings")
      .select("holiday_dates")
      .limit(1)
      .single();

    if (res.error) {
      startTransition(() => {
        setError(`Failed to load premium days: ${res.error.message}`);
      });
      return;
    }

    const raw: unknown = res.data?.holiday_dates;
    const days = new Set(
      Array.isArray(raw)
        ? (raw as unknown[]).filter((v): v is string => typeof v === "string")
        : [],
    );

    startTransition(() => {
      setPremiumDays(days);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    void fetchAndApply();

    const supabase = createClient();

    const channel = supabase
      .channel("premium-days-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings" },
        () => {
          void fetchAndApply();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAndApply]);

  return { premiumDays, loading, error };
}
