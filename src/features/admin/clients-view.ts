/**
 * Pure view-layer helpers for the admin clients index and client detail.
 * No IO, no side effects — fully unit-testable.
 *
 * OnboardingStatus mapping:
 *   "needs_onboarding" ← info_pending | meet_greet_pending (pre-active states)
 *   "active"           ← approved
 *   (declined is excluded from both — not active, not awaiting onboarding)
 */

// Narrow entry, not the client barrel: this module is re-exported from the
// admin client barrel, which the site header pulls into every public page, and
// `booking/index.client.ts` carries the Scheduler (react-day-picker + date-fns)
// with it. The type import below is erased, so it costs nothing.
import { deriveMeetGreetUpcoming } from "@/features/booking/meet-greet-upcoming";
import type { BookingStatusDb } from "@/features/booking/index.client";
import type { BookingPaymentStatus } from "@/features/payments/index.client";

import type { ClientBookingRow, ClientListRow } from "./clients-actions";

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

// ──────────────────────────────────────────────────────────────────────────────
// Client detail projections
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Slug of the meet-and-greet service. Every surface that asks "is this the
 * meet & greet?" keys off the slug, which is fixed, and never off the display
 * name, which Cal can rename from the services editor.
 */
export const MEET_GREET_SLUG = "meet-greet";

/** A `services` embed: an object for a to-one join, an array in some row shapes. */
type ServiceEmbed = { name: string | null; slug: string | null };

/** A `bookings` row as the client-detail read selects it. */
export interface DetailBookingRow {
  id: string;
  status: BookingStatusDb;
  starts_at: string;
  ends_at: string;
  final_cents: number;
  payment_status: BookingPaymentStatus | null;
  /** Frozen server-written QuoteBreakdown (jsonb); legacy bookings hold `{}`. */
  quote_breakdown: unknown;
  services: ServiceEmbed | ServiceEmbed[] | null;
}

/** A `payments` row as the client-detail read selects it. */
export interface DetailPaymentRow {
  booking_id: string;
  stripe_payment_intent_id: string | null;
  status: string;
  refunded_cents: number;
  disputed_at: string | null;
  dispute_status: string | null;
}

/** What one booking's payment rows say about its money. */
export interface BookingPaymentSummary {
  paymentIntentId: string | null;
  refundedCents: number;
  disputedAt: string | null;
  disputeStatus: string | null;
}

function serviceOf(embed: DetailBookingRow["services"]): ServiceEmbed | null {
  if (!embed) return null;
  return Array.isArray(embed) ? (embed[0] ?? null) : embed;
}

/**
 * Summarize one booking's payment rows.
 *
 * The intent and dispute fields come from the live row — the newest attempt that
 * did not fail, falling back to the newest row when every attempt failed. Refunds
 * are summed across every row instead: a booking charged through two intents can
 * be refunded on either, and the retained-half line reads the total.
 *
 * @param rows - the booking's payment rows, newest first
 */
export function pickLivePayment(
  rows: DetailPaymentRow[],
): BookingPaymentSummary {
  const live = rows.find((row) => row.status !== "failed") ?? rows[0] ?? null;
  return {
    paymentIntentId: live?.stripe_payment_intent_id ?? null,
    refundedCents: rows.reduce((total, row) => total + row.refunded_cents, 0),
    disputedAt: live?.disputed_at ?? null,
    disputeStatus: live?.dispute_status ?? null,
  };
}

/**
 * Join booking rows to their payment rows for the client-detail view.
 *
 * @param bookings - booking rows in the order they should render
 * @param payments - payment rows for those bookings, newest first
 */
export function toBookingViews(
  bookings: DetailBookingRow[],
  payments: DetailPaymentRow[],
): ClientBookingRow[] {
  const byBooking = new Map<string, DetailPaymentRow[]>();
  for (const row of payments) {
    const existing = byBooking.get(row.booking_id);
    if (existing) existing.push(row);
    else byBooking.set(row.booking_id, [row]);
  }

  return bookings.map((booking) => {
    const service = serviceOf(booking.services);
    const payment = pickLivePayment(byBooking.get(booking.id) ?? []);
    return {
      id: booking.id,
      service_name: service?.name ?? null,
      service_slug: service?.slug ?? null,
      status: booking.status,
      starts_at: booking.starts_at,
      ends_at: booking.ends_at,
      final_cents: booking.final_cents,
      payment_status: booking.payment_status ?? "unpaid",
      quote_breakdown: booking.quote_breakdown,
      refunded_cents: payment.refundedCents,
      disputed_at: payment.disputedAt,
      dispute_status: payment.disputeStatus,
      payment_intent_id: payment.paymentIntentId,
    };
  });
}

/**
 * Whether this client has a future, non-terminal meet & greet — the condition
 * the admin approve button confirms against. Shares the index's rule so the
 * detail page and the directory cannot disagree.
 */
export function hasUpcomingMeetGreet(
  bookings: ClientBookingRow[],
  clientId: string,
  now: Date,
): boolean {
  const meetGreets = bookings
    .filter((booking) => booking.service_slug === MEET_GREET_SLUG)
    .map((booking) => ({
      client_id: clientId,
      starts_at: booking.starts_at,
      status: booking.status,
    }));
  return deriveMeetGreetUpcoming(meetGreets, now).has(clientId);
}
