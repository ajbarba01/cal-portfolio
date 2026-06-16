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
import {
  createBookingCore,
  rescheduleBookingCore,
  cancelBookingCore,
  grantFullRefundCore,
  markNoShowCore,
  settleDebtCore,
  setKicheAppliedCore,
  editBookingCore,
} from "./booking-service";
import { CLIENT_POLICY, ADMIN_POLICY } from "./mutation-policy";
import { StripeGateway } from "@/features/payments";
import { ResendNotifier } from "@/features/notifications";
import { createBookingMutation } from "./mutations/create-booking.mutation";
import type {
  CreateBookingResult,
  RescheduleBookingResult,
  CancelBookingResult,
  CreateBookingInput,
  CancelBookingInput,
  AdminBookingResult,
  SetKicheAppliedResult,
  EditBookingPatch,
  EditBookingResult,
} from "./booking-service";

// NOTE: result types are intentionally NOT re-exported here. A "use server"
// module may export ONLY async functions; a `export type { … }` re-export is
// emitted as a runtime action binding and crashes module eval
// ("X is not defined"). Import these types from ./booking-service (their source).

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
  const notifier = new ResendNotifier();

  return createBookingMutation(
    {
      repo,
      notifier,
      loadConfirmationRow: async (bookingId) => {
        const { data } = await serviceClient
          .from("bookings")
          .select("starts_at, ends_at, final_cents, services(name)")
          .eq("id", bookingId)
          .single();
        return data;
      },
      now: new Date(),
    },
    { ...input, userId: user.id, userEmail: user.email ?? undefined },
  );
}

/**
 * Server action: reschedule a booking to a new start time. The booking's
 * duration, status, and price are preserved — only the time moves. Ownership is
 * verified in the core against the authenticated user id.
 */
export async function rescheduleBooking(input: {
  bookingId: string;
  startsAt: Date;
}): Promise<RescheduleBookingResult> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const serviceClient = createServiceClient();
  const repo = createSupabaseBookingRepository(serviceClient);

  return rescheduleBookingCore(
    { repo, now: new Date() },
    { bookingId: input.bookingId, userId: user.id, startsAt: input.startsAt },
  );
}

/**
 * Server action: cancel a booking.
 *
 * The caller must own the booking (client_id === authenticated user's id),
 * OR be an admin. Admin check is performed here before delegating to core.
 * Refunds are MANUAL by Cal — no automatic refund logic.
 *
 * SECURITY: `fullRefund` is decided HERE by role, never accepted from the
 * caller — the param type omits it. Only the admin branch sets it true (a
 * Cal-initiated cancel refunds 100% regardless of timing); a client self-cancel
 * always goes through the timing-based `computeRefund` penalty.
 */
export async function cancelBooking(
  input: Omit<CancelBookingInput, "userId" | "fullRefund">,
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
  const gateway = new StripeGateway();

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
    // admin logic in the pure core. fullRefund: true so Cal-initiated cancels
    // always refund 100% regardless of timing (DESIGN: decision 14).
    const booking = await repo.getBookingById(input.bookingId);
    if (!booking) {
      return { kind: "not_found" };
    }
    return cancelBookingCore(
      { repo, now: new Date(), gateway },
      { ...input, userId: booking.client_id, fullRefund: true },
    );
  }

  return cancelBookingCore(
    { repo, now: new Date(), gateway },
    { ...input, userId: user.id, fullRefund: false },
  );
}

/**
 * Admin-only: load the caller and assert the admin role. Returns the
 * service-role repo + gateway + serviceClient, or a forbidden result.
 */
async function requireAdminDeps(): Promise<
  | {
      ok: true;
      repo: ReturnType<typeof createSupabaseBookingRepository>;
      gateway: StripeGateway;
      serviceClient: ReturnType<typeof createServiceClient>;
    }
  | { ok: false }
> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) redirect("/login");

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { ok: false };

  return {
    ok: true,
    repo: createSupabaseBookingRepository(serviceClient),
    gateway: new StripeGateway(),
    serviceClient,
  };
}

/** Admin: grant the remaining (full) refund beyond the default late tier. */
export async function grantFullRefund(
  bookingId: string,
): Promise<AdminBookingResult> {
  const admin = await requireAdminDeps();
  if (!admin.ok) return { kind: "error", message: "Forbidden" };
  return grantFullRefundCore(
    { repo: admin.repo, now: new Date(), gateway: admin.gateway },
    bookingId,
  );
}

/** Admin: mark a confirmed booking a no-show (writes a debit). */
export async function markNoShow(
  bookingId: string,
): Promise<AdminBookingResult> {
  const admin = await requireAdminDeps();
  if (!admin.ok) return { kind: "error", message: "Forbidden" };
  return markNoShowCore({ repo: admin.repo, now: new Date() }, bookingId);
}

/** Admin: mark a client debit settled. */
export async function settleDebt(debitId: string): Promise<AdminBookingResult> {
  const admin = await requireAdminDeps();
  if (!admin.ok) return { kind: "error", message: "Forbidden" };
  return settleDebtCore({ repo: admin.repo, now: new Date() }, debitId);
}

/**
 * Admin: apply or remove the Kiche discount on a booking. Re-quotes the booking
 * and refunds any overpayment when applying to an already-paid booking.
 */
export async function setKicheApplied(
  bookingId: string,
  applied: boolean,
): Promise<SetKicheAppliedResult> {
  const admin = await requireAdminDeps();
  if (!admin.ok) return { kind: "error", message: "Forbidden" };
  return setKicheAppliedCore(
    { repo: admin.repo, now: new Date(), gateway: admin.gateway },
    { bookingId, applied },
  );
}

/**
 * Server action: edit a booking in place (time / pets / quantities / comments).
 *
 * The actor's policy is derived from the verified session role (service-role read
 * of `profiles.role`) and is NEVER taken from the payload. Admins receive
 * `ADMIN_POLICY` (all gates warn-don't-block; may edit any client's booking);
 * clients receive `CLIENT_POLICY` (all gates enforced; may only edit their own).
 *
 * Note: patch dates (`startsAt`, `endsAt`) cross the server-action boundary as
 * `Date` objects (Next.js serializes them). If a caller holds ISO strings, coerce
 * with `new Date(...)` before building the patch.
 */
export async function editBooking(input: {
  bookingId: string;
  patch: EditBookingPatch;
  forceConfirm?: boolean;
}): Promise<EditBookingResult> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) redirect("/login");

  const serviceClient = createServiceClient();
  const repo = createSupabaseBookingRepository(serviceClient);

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.role === "admin";
  const policy = isAdmin
    ? {
        ...ADMIN_POLICY,
        forceStatus: input.forceConfirm ? ("confirmed" as const) : undefined,
      }
    : CLIENT_POLICY;

  return editBookingCore(
    { repo, now: new Date() },
    {
      bookingId: input.bookingId,
      actorUserId: user.id,
      policy,
      patch: input.patch,
    },
  );
}

/**
 * Admin: create a booking on behalf of a client. The target client id comes
 * from the (admin-verified) caller; the actor identity is never trusted from a
 * client payload. Runs ADMIN_POLICY (all gates warn-don't-block) with optional
 * force-confirm. Takes no payment and never touches Stripe (offline payment is
 * handled separately).
 */
export async function createBookingForClient(input: {
  clientId: string;
  serviceSlug: string;
  startsAt: Date;
  endsAt: Date;
  quantities: Record<string, unknown>;
  petIds?: string[];
  recurringRule: {
    freq: "daily" | "weekly" | "monthly";
    interval: number;
    count?: number;
    until?: Date;
  } | null;
  comments?: string;
  kicheWelcome?: boolean;
  forceConfirm?: boolean;
}): Promise<CreateBookingResult> {
  const admin = await requireAdminDeps();
  if (!admin.ok) return { kind: "error", message: "Forbidden" };

  // Verify the target is a real client profile (service-role read bypasses RLS).
  const { data: target } = await admin.serviceClient
    .from("profiles")
    .select("role")
    .eq("id", input.clientId)
    .single();
  if (!target || target.role !== "client") {
    return { kind: "error", message: "Target is not a client" };
  }

  const policy = {
    ...ADMIN_POLICY,
    forceStatus: input.forceConfirm ? ("confirmed" as const) : undefined,
  };

  return createBookingCore(
    { repo: admin.repo, now: new Date() },
    {
      userId: input.clientId,
      serviceSlug: input.serviceSlug,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      quantities: input.quantities,
      petIds: input.petIds,
      recurringRule: input.recurringRule,
      comments: input.comments,
      kicheWelcome: input.kicheWelcome,
    },
    policy,
  );
}
