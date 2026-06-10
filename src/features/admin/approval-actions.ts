"use server";

/**
 * Admin server actions for booking approvals queue.
 *
 * SECURITY: Same model as availability-actions — service-role after admin check.
 * Identity from session; role re-derived from DB inside the core.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "@/lib/admin-guard";
import { getActorOrRedirect } from "@/lib/admin-session";
import { transition } from "@/features/booking";
import {
  ResendMailer,
  sendBookingConfirmation,
} from "@/features/notifications";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingEvent, BookingStatus } from "@/features/booking";

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

/** Parse pending-booking rows at the DB edge (ENGINEERING #11). */
const pendingBookingRowSchema = z.object({
  id: z.string(),
  client_id: z.string(),
  status: z.literal("pending_approval"),
  starts_at: z.string(),
  ends_at: z.string(),
  final_cents: z.number(),
  service_id: z.string(),
});

/** Shape of the booking row read back for the approval confirmation email. */
const approvalConfirmationRowSchema = z.object({
  starts_at: z.string(),
  ends_at: z.string(),
  final_cents: z.number(),
  profiles: z.object({ email: z.string() }).nullable(),
  services: z.object({ name: z.string() }).nullable(),
});

// ──────────────────────────────────────────────────────────────────────────────
// Result types
// ──────────────────────────────────────────────────────────────────────────────

export type ApprovalResult =
  | { kind: "success"; newStatus: BookingStatus }
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

  const bookings: PendingBookingRow[] = [];
  for (const row of data ?? []) {
    const parsed = pendingBookingRowSchema.safeParse(row);
    if (!parsed.success)
      return {
        kind: "error",
        message: `Unexpected booking row shape: ${parsed.error.message}`,
      };
    bookings.push(parsed.data);
  }

  return { kind: "success", bookings };
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

  // Load the booking, scoped to pending_approval — approve/decline only apply
  // there. A booking in any other status returns not_found (cannot be moderated).
  const { data: booking, error: bookingErr } = await deps.serviceClient
    .from("bookings")
    .select("id, status")
    .eq("id", bookingId)
    .eq("status", "pending_approval")
    .single();

  if (bookingErr || !booking) return { kind: "not_found" };

  const result = transition(booking.status as BookingStatus, event, {
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

  if (result.kind === "success") {
    revalidatePath("/admin/bookings");

    // Best-effort confirmation email — a failed send NEVER alters the result.
    try {
      const { data: bookingRow } = await serviceClient
        .from("bookings")
        .select(
          "starts_at, ends_at, final_cents, profiles(email), services(name)",
        )
        .eq("id", bookingId)
        .single();

      const parsed = approvalConfirmationRowSchema.safeParse(bookingRow);
      if (parsed.success) {
        const row = parsed.data;
        const clientEmail = row.profiles?.email;
        const serviceName = row.services?.name ?? "Booking";
        if (clientEmail) {
          const mailer = new ResendMailer();
          const sendResult = await sendBookingConfirmation(mailer, {
            to: clientEmail,
            serviceName,
            startsAt: new Date(row.starts_at),
            endsAt: new Date(row.ends_at),
            finalCents: row.final_cents,
          });
          if (!sendResult.ok) {
            console.error(
              "approveBooking: confirmation email failed:",
              sendResult.error,
            );
          }
        }
      }
    } catch (e: unknown) {
      console.error("approveBooking: error sending confirmation email:", e);
    }
  }

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
