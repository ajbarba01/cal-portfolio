"use server";

/**
 * Admin server actions for booking approvals queue.
 *
 * SECURITY: Same model as availability-actions — service-role after admin check.
 * Identity from session; role re-derived from DB inside the core.
 */

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "./admin-guard";
import { transition } from "@/features/booking/state-machine";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingEvent } from "@/features/booking/state-machine";

// ──────────────────────────────────────────────────────────────────────────────
// Row shape
// ──────────────────────────────────────────────────────────────────────────────

export interface PendingBookingRow {
  id: string;
  client_id: string;
  status: "pending_approval";
  starts_at: string;
  ends_at: string;
  final_cents: number;
  service_id: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Result types
// ──────────────────────────────────────────────────────────────────────────────

export type ApprovalResult =
  | { kind: "success"; newStatus: string }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

export type ListPendingResult =
  | { kind: "success"; bookings: PendingBookingRow[] }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

// ──────────────────────────────────────────────────────────────────────────────
// Deps
// ──────────────────────────────────────────────────────────────────────────────

export interface ApprovalDeps {
  serviceClient: SupabaseClient;
  actorUserId: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Core functions
// ──────────────────────────────────────────────────────────────────────────────

export async function listPendingBookingsCore(
  deps: ApprovalDeps,
): Promise<ListPendingResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const { data, error } = await deps.serviceClient
    .from("bookings")
    .select(
      "id, client_id, status, starts_at, ends_at, final_cents, service_id",
    )
    .eq("status", "pending_approval")
    .order("starts_at", { ascending: true });

  if (error) return { kind: "error", message: error.message };

  return {
    kind: "success",
    bookings: (data ?? []) as PendingBookingRow[],
  };
}

const transitionInputSchema = z.object({
  actorUserId: z.string().uuid(),
  bookingId: z.string().uuid(),
  event: z.enum(["approve", "decline"]),
});

/**
 * Core: approve or decline a pending_approval booking.
 *
 * Returns forbidden if actor is not admin; not_found if booking missing;
 * validation_error if event is invalid from current state.
 */
export async function transitionBookingByAdminCore(
  deps: ApprovalDeps,
  rawInput: { bookingId: string; event: BookingEvent },
): Promise<ApprovalResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const parsed = transitionInputSchema.safeParse({
    actorUserId: deps.actorUserId,
    ...rawInput,
  });
  if (!parsed.success)
    return { kind: "validation_error", message: parsed.error.message };

  const { bookingId, event } = parsed.data;

  // Load current booking status.
  const { data: booking, error: bookingErr } = await deps.serviceClient
    .from("bookings")
    .select("id, status")
    .eq("id", bookingId)
    .single();

  if (bookingErr || !booking) return { kind: "not_found" };

  const result = transition(booking.status as "pending_approval", event, {
    requiresApproval: true,
  });

  if ("error" in result)
    return { kind: "validation_error", message: result.error };

  const { error: updateErr } = await deps.serviceClient
    .from("bookings")
    .update({ status: result.state })
    .eq("id", bookingId);

  if (updateErr) return { kind: "error", message: updateErr.message };

  return { kind: "success", newStatus: result.state };
}

// ──────────────────────────────────────────────────────────────────────────────
// "use server" wrappers
// ──────────────────────────────────────────────────────────────────────────────

async function getActorOrRedirect() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

export async function listPendingBookings(): Promise<ListPendingResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  return listPendingBookingsCore({ serviceClient, actorUserId });
}

export async function approveBooking(
  bookingId: string,
): Promise<ApprovalResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const result = await transitionBookingByAdminCore(
    { serviceClient, actorUserId },
    { bookingId, event: "approve" },
  );
  if (result.kind === "success") revalidatePath("/admin/bookings");
  return result;
}

export async function declineBooking(
  bookingId: string,
): Promise<ApprovalResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const result = await transitionBookingByAdminCore(
    { serviceClient, actorUserId },
    { bookingId, event: "decline" },
  );
  if (result.kind === "success") revalidatePath("/admin/bookings");
  return result;
}
