"use server";

/**
 * Admin server actions for booking approvals queue.
 *
 * SECURITY: Same model as availability-actions — service-role after admin check.
 * Identity from session; role re-derived from DB inside the core.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "@/lib/admin-guard";
import { getActorOrRedirect } from "@/lib/admin-session";
import { transition } from "@/features/booking";
import { sendBookingConfirmationFor } from "@/features/notifications";
import type { DbClient } from "@/lib/supabase/db-client";
import type { BookingEvent, BookingStatus } from "@/features/booking";

// ──────────────────────────────────────────────────────────────────────────────
// Result types
// ──────────────────────────────────────────────────────────────────────────────

export type ApprovalResult =
  | { kind: "success"; newStatus: BookingStatus }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

// ──────────────────────────────────────────────────────────────────────────────
// Deps
// ──────────────────────────────────────────────────────────────────────────────

export interface ApprovalDeps {
  serviceClient: DbClient;
  actorUserId: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Core functions
// ──────────────────────────────────────────────────────────────────────────────

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
  if (!parsed.success) {
    console.error(
      "approval action: input validation failed",
      parsed.error.issues,
    );
    return {
      kind: "validation_error",
      message: "Please check your entries and try again.",
    };
  }

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

  const result = transition(booking.status, event, {
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

    // Approval is the transition that actually confirms the booking, so this is
    // where the client's confirmation email comes from. Deferred with after()
    // so it runs AFTER the response flushes: the admin's approve click returns
    // immediately and doesn't wait on Resend. The send is best-effort — it logs
    // its own failures and never throws.
    after(() => sendBookingConfirmationFor(serviceClient, bookingId));
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
