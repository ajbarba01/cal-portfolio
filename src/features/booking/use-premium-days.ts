"use client";

/**
 * usePremiumDays — the set of premium (holiday-surcharge) days as Denver
 * calendar-day keys ("YYYY-MM-DD").
 *
 * Server-seeded: the booking pages already load settings server-side, so they
 * pass `holiday_dates` down as `initialPremiumDays`. Holidays don't change
 * mid-session, so there's no client fetch and no realtime subscription (the old
 * `settings` channel never fired — the publication was empty — and would have
 * been dead weight even if it had).
 */

import { useState } from "react";

export interface UsePremiumDaysResult {
  /** Set of Denver day-keys ("YYYY-MM-DD") that carry a premium surcharge. */
  premiumDays: Set<string>;
  loading: boolean;
  error: string | null;
}

export function usePremiumDays(
  initialPremiumDays: string[] = [],
): UsePremiumDaysResult {
  // Seeded once from the server prop; stable for the session.
  const [premiumDays] = useState<Set<string>>(
    () => new Set(initialPremiumDays),
  );
  return { premiumDays, loading: false, error: null };
}
