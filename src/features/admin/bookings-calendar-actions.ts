"use server";

/** Admin booking-calendar read enriched with client and service names. */

import type { QueryData } from "@supabase/supabase-js";
import type { DbClient } from "@/lib/supabase/db-client";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/service";

import { assertActorIsAdmin } from "@/lib/admin-guard";
import { getActorOrRedirect } from "@/lib/admin-session";
import type { BookingStatusDb } from "@/features/booking";
import type { BookingPaymentStatus } from "@/features/payments";

import { denverMonthWindow } from "./bookings-view";

export interface BookingCalendarRow {
  id: string;
  client_id: string;
  client_name: string | null;
  service_name: string | null;
  status: BookingStatusDb;
  starts_at: string;
  ends_at: string;
  final_cents: number;
  payment_status: BookingPaymentStatus;
}

export type ListBookingsInRangeResult =
  | { kind: "success"; bookings: BookingCalendarRow[]; startIso: string }
  | { kind: "forbidden" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

export interface AdminDeps {
  serviceClient: DbClient;
  actorUserId: string;
}

const rangeSchema = z.object({
  startIso: z.string().datetime(),
  endIso: z.string().datetime(),
});

const BOOKING_COLUMNS =
  "id, client_id, status, starts_at, ends_at, final_cents, payment_status, profiles(full_name), services(name)";

/**
 * The hub's read: every booking column the calendar renders, plus the client and
 * service names it joins in. Both joins are to-one on a non-null foreign key, so
 * each embed is a single row and never an array.
 */
function readBookingsQuery(serviceClient: DbClient) {
  return serviceClient
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .order("starts_at", { ascending: true });
}

type BookingCalendarSelect = QueryData<
  ReturnType<typeof readBookingsQuery>
>[number];

function toCalendarRow(booking: BookingCalendarSelect): BookingCalendarRow {
  return {
    id: booking.id,
    client_id: booking.client_id,
    client_name: booking.profiles.full_name,
    service_name: booking.services.name,
    status: booking.status,
    starts_at: booking.starts_at,
    ends_at: booking.ends_at,
    final_cents: booking.final_cents,
    payment_status: booking.payment_status,
  };
}

export async function listBookingsInRangeCore(
  deps: AdminDeps,
  range: { startIso: string; endIso: string },
): Promise<ListBookingsInRangeResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }
  const parsed = rangeSchema.safeParse(range);
  if (!parsed.success) {
    console.error(
      "bookings-calendar action: input validation failed",
      parsed.error.issues,
    );
    return {
      kind: "validation_error",
      message: "Please check your entries and try again.",
    };
  }

  const readBookings = () => readBookingsQuery(deps.serviceClient);

  const [windowed, pending] = await Promise.all([
    // Overlap, not "starts inside the window": a stay that began before the
    // window is still in progress during it, and the hub has to show it on
    // every day it covers.
    readBookings()
      .lt("starts_at", parsed.data.endIso)
      .gte("ends_at", parsed.data.startIso),
    // Pending approvals come along whatever month they start in. A booking
    // pends because it starts beyond the auto-confirm horizon, so the month
    // window hid the very requests the nav badge counts and the dashboard links
    // to — and the badge and the hub then disagreed about how many there were.
    readBookings().eq("status", "pending_approval"),
  ]);
  if (windowed.error) return { kind: "error", message: windowed.error.message };
  if (pending.error) return { kind: "error", message: pending.error.message };

  // A pending booking inside the window comes back from both reads; key by id
  // so it stays one row.
  const byId = new Map<string, BookingCalendarRow>();
  for (const booking of [...(windowed.data ?? []), ...(pending.data ?? [])]) {
    const row = toCalendarRow(booking);
    byId.set(row.id, row);
  }
  const bookings = [...byId.values()].sort((a, b) =>
    a.starts_at.localeCompare(b.starts_at),
  );
  return { kind: "success", bookings, startIso: parsed.data.startIso };
}

/**
 * The bookings overlapping one Denver month — the one named by `monthParam`
 * (`YYYY-MM`), or the current month when it is absent or malformed — plus every
 * pending approval, which is never clamped to a month. The window start comes
 * back with the rows so the caller can caption and lay out the month it got.
 */
export async function listBookingsInRange(input: {
  monthParam?: string;
}): Promise<ListBookingsInRangeResult> {
  const actorUserId = await getActorOrRedirect();
  return listBookingsInRangeCore(
    { serviceClient: createServiceClient(), actorUserId },
    denverMonthWindow(input.monthParam, new Date()),
  );
}
