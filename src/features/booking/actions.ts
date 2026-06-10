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

import { z } from "zod";
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
  editBookingCore,
} from "./booking-service";
import { CLIENT_POLICY, ADMIN_POLICY } from "./mutation-policy";
import { StripeGateway } from "@/features/payments";
import {
  ResendMailer,
  sendBookingConfirmation,
} from "@/features/notifications";
import type {
  CreateBookingResult,
  RescheduleBookingResult,
  CancelBookingResult,
  CreateBookingInput,
  CancelBookingInput,
  AdminBookingResult,
  EditBookingPatch,
  EditBookingResult,
} from "./booking-service";

/** Shape of the booking row read back for the confirmation email (DB edge). */
const confirmationRowSchema = z.object({
  starts_at: z.string(),
  ends_at: z.string(),
  final_cents: z.number(),
  services: z.object({ name: z.string() }).nullable(),
});

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

  const result = await createBookingCore(
    { repo, now: new Date() },
    { ...input, userId: user.id },
  );

  // Best-effort confirmation email — a failed send NEVER alters the result.
  // For a multi-occurrence series we send one confirmation for the first
  // occurrence (the series, not each individual row) — this is intentional.
  if (result.kind === "success") {
    try {
      const firstBookingId = result.bookingIds[0];
      if (firstBookingId && user.email) {
        const { data: bookingRow } = await serviceClient
          .from("bookings")
          .select("starts_at, ends_at, final_cents, services(name)")
          .eq("id", firstBookingId)
          .single();

        const parsed = confirmationRowSchema.safeParse(bookingRow);
        if (parsed.success) {
          const row = parsed.data;
          const serviceName = row.services?.name ?? "Booking";
          const mailer = new ResendMailer();
          const sendResult = await sendBookingConfirmation(mailer, {
            to: user.email,
            serviceName,
            startsAt: new Date(row.starts_at),
            endsAt: new Date(row.ends_at),
            finalCents: row.final_cents,
          });
          if (!sendResult.ok) {
            console.error(
              "createBooking: confirmation email failed:",
              sendResult.error,
            );
          }
        }
      }
    } catch (e: unknown) {
      console.error("createBooking: error sending confirmation email:", e);
    }
  }

  return result;
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
    // admin logic in the pure core.
    const booking = await repo.getBookingById(input.bookingId);
    if (!booking) {
      return { kind: "not_found" };
    }
    return cancelBookingCore(
      { repo, now: new Date(), gateway },
      { ...input, userId: booking.client_id },
    );
  }

  return cancelBookingCore(
    { repo, now: new Date(), gateway },
    { ...input, userId: user.id },
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
    },
    policy,
  );
}
