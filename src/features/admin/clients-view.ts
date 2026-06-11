/**
 * Pure view-layer helpers for the admin clients index.
 * No IO, no side effects — fully unit-testable.
 *
 * OnboardingStatus mapping:
 *   "needs_onboarding" ← info_pending | meet_greet_pending (pre-active states)
 *   "active"           ← approved
 *   (declined is excluded from both — not active, not awaiting onboarding)
 */

import type { ClientListRow } from "./clients-actions";

export type ClientFilter = "all" | "owing" | "needs_onboarding" | "active";
export type ClientSortKey = "name" | "balance" | "bookings";
export type SortDir = "asc" | "desc";

/**
 * Filter the client list by triage category.
 *
 * - "all"               → every row
 * - "owing"             → outstandingCents > 0
 * - "needs_onboarding"  → onboardingStatus is info_pending or meet_greet_pending
 * - "active"            → onboardingStatus is approved
 */
export function applyClientFilter(
  rows: ClientListRow[],
  filter: ClientFilter,
): ClientListRow[] {
  switch (filter) {
    case "all":
      return rows;
    case "owing":
      return rows.filter((r) => r.outstandingCents > 0);
    case "needs_onboarding":
      return rows.filter(
        (r) =>
          r.onboardingStatus === "info_pending" ||
          r.onboardingStatus === "meet_greet_pending",
      );
    case "active":
      return rows.filter((r) => r.onboardingStatus === "approved");
  }
}

/**
 * Sort a copy of the client list by the given key and direction.
 * Stable — equal elements preserve original order.
 *
 * - name     → full_name (fallback: email), case-insensitive
 * - balance  → outstandingCents
 * - bookings → bookingCount
 */
export function sortClients(
  rows: ClientListRow[],
  key: ClientSortKey,
  dir: SortDir,
): ClientListRow[] {
  const copy = [...rows];
  const sign = dir === "asc" ? 1 : -1;

  copy.sort((a, b) => {
    switch (key) {
      case "name": {
        const nameA = (a.full_name ?? a.email ?? "").toLowerCase();
        const nameB = (b.full_name ?? b.email ?? "").toLowerCase();
        return sign * nameA.localeCompare(nameB);
      }
      case "balance":
        return sign * (a.outstandingCents - b.outstandingCents);
      case "bookings":
        return sign * (a.bookingCount - b.bookingCount);
    }
  });

  return copy;
}
