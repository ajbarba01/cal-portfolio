"use server";

/** Admin booking-calendar read enriched with client and service names. */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/service";

import { assertActorIsAdmin } from "@/lib/admin-guard";
import { getActorOrRedirect } from "@/lib/admin-session";
import type { BookingPaymentStatus } from "@/features/payments";

export interface BookingCalendarRow {
  id: string;
  client_id: string;
  client_name: string | null;
  service_name: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  final_cents: number;
  payment_status: BookingPaymentStatus;
}

export type ListBookingsInRangeResult =
  | { kind: "success"; bookings: BookingCalendarRow[] }
  | { kind: "forbidden" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

export interface AdminDeps {
  serviceClient: SupabaseClient;
  actorUserId: string;
}

const rangeSchema = z.object({
  startIso: z.string().datetime(),
  endIso: z.string().datetime(),
});

function joinName(
  join: { name: string } | { name: string }[] | null,
): string | null {
  if (Array.isArray(join)) return join[0]?.name ?? null;
  return join?.name ?? null;
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
    return { kind: "validation_error", message: parsed.error.message };
  }

  const { data, error } = await deps.serviceClient
    .from("bookings")
    .select(
      "id, client_id, status, starts_at, ends_at, final_cents, payment_status, profiles(full_name), services(name)",
    )
    .gte("starts_at", parsed.data.startIso)
    .lt("starts_at", parsed.data.endIso)
    .order("starts_at", { ascending: true });
  if (error) return { kind: "error", message: error.message };

  const bookings: BookingCalendarRow[] = (data ?? []).map((booking) => {
    const profileJoin = booking.profiles as
      | { full_name: string }
      | { full_name: string }[]
      | null;
    const rawPaymentStatus = booking.payment_status as string | null;
    const paymentStatus: BookingPaymentStatus =
      rawPaymentStatus === "paid" ||
      rawPaymentStatus === "partially_refunded" ||
      rawPaymentStatus === "refunded"
        ? rawPaymentStatus
        : "unpaid";
    return {
      id: booking.id as string,
      client_id: booking.client_id as string,
      client_name: Array.isArray(profileJoin)
        ? (profileJoin[0]?.full_name ?? null)
        : (profileJoin?.full_name ?? null),
      service_name: joinName(
        booking.services as { name: string } | { name: string }[] | null,
      ),
      status: booking.status as string,
      starts_at: booking.starts_at as string,
      ends_at: booking.ends_at as string,
      final_cents: booking.final_cents as number,
      payment_status: paymentStatus,
    };
  });
  return { kind: "success", bookings };
}

export async function listBookingsInRange(range: {
  startIso: string;
  endIso: string;
}): Promise<ListBookingsInRangeResult> {
  const actorUserId = await getActorOrRedirect();
  return listBookingsInRangeCore(
    { serviceClient: createServiceClient(), actorUserId },
    range,
  );
}
