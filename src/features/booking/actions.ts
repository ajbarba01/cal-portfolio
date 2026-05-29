"use server";

/**
 * Server action entry points for booking operations.
 *
 * SECURITY: All booking writes use the SERVICE ROLE client (createServiceClient).
 * The column-grant guard blocks authenticated sessions from writing protected
 * columns (status, final_cents, distance_miles, etc.). This is the ONLY entry
 * point that should create a service-role repo for bookings.
 *
 * Authentication: the caller's identity is verified via createClient().auth.getUser()
 * (session cookie). The userId is NEVER taken from the client payload.
 *
 * Admin cancel bypass: when cancelling, the action checks whether the caller
 * is an admin (profile.role = 'admin') and allows the cancel even if
 * client_id !== userId. The core cancelBookingCore only checks ownership;
 * the admin path passes the booking's actual client_id as userId to satisfy
 * the core's ownership check.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createSupabaseBookingRepository } from "./booking-repository";
import { createBookingCore, cancelBookingCore } from "./booking-service";
import type {
  CreateBookingResult,
  CancelBookingResult,
  CreateBookingInput,
  CancelBookingInput,
} from "./booking-service";

// Re-export result types for consumers.
export type { CreateBookingResult, CancelBookingResult };

/**
 * Server action: create a booking.
 *
 * The caller supplies only: serviceSlug, startsAt, endsAt, quantities, and
 * an optional recurringRule. All money, status, distance, and approval fields
 * are recomputed server-side.
 */
export async function createBooking(
  input: Omit<CreateBookingInput, "userId">,
): Promise<CreateBookingResult> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const serviceClient = createServiceClient();
  const repo = createSupabaseBookingRepository(serviceClient);

  return createBookingCore({ repo }, { ...input, userId: user.id });
}

/**
 * Server action: cancel a booking.
 *
 * The caller must own the booking (client_id === authenticated user's id),
 * OR be an admin. Admin check is performed here before delegating to core.
 * Refunds are MANUAL by Cal — no automatic refund logic.
 */
export async function cancelBooking(
  input: Omit<CancelBookingInput, "userId">,
): Promise<CancelBookingResult> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const serviceClient = createServiceClient();
  const repo = createSupabaseBookingRepository(serviceClient);

  // Admin bypass: load the caller's role from the profile.
  // Service role bypasses RLS so this read is always authoritative.
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";

  if (isAdmin) {
    // Admin path: load the booking to get the actual client_id, then pass it
    // as userId to satisfy the core's ownership check without re-implementing
    // admin logic in the pure core.
    const booking = await repo.getBookingById(input.bookingId);
    if (!booking) {
      return { kind: "not_found" };
    }
    return cancelBookingCore({ repo }, { ...input, userId: booking.client_id });
  }

  return cancelBookingCore({ repo }, { ...input, userId: user.id });
}
