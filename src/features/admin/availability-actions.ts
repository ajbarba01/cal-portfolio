"use server";

/**
 * Admin server actions for availability window CRUD and block-out.
 *
 * SECURITY: All mutations use the service-role client AFTER verifying the actor
 * is an admin. Identity comes from the session; role is re-checked from DB.
 *
 * Block-out: deletes (or trims) a window and cancels any active booking that
 * falls inside the removed range by reusing cancelBookingCore (admin path).
 *
 * Refuse-not-cancel cores: createWindowsBatchCore and setWindowUnavailableCore
 * implement the NEW scheduler policy — refuse on conflict, never cancel.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "./admin-guard";
import { getActorOrRedirect } from "./admin-session";
import { cancelBookingCore } from "@/features/booking/booking-service";
import { createSupabaseBookingRepository } from "@/features/booking/booking-repository";
import { denverMidnight } from "@/features/booking/availability";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentGateway } from "@/features/payments/types";

// ──────────────────────────────────────────────────────────────────────────────
// Row shape
// ──────────────────────────────────────────────────────────────────────────────

export interface AvailabilityWindow {
  id: string;
  starts_at: string; // ISO UTC
  ends_at: string; // ISO UTC
  note: string | null;
}

const availabilityWindowSchema = z.object({
  id: z.string().uuid(),
  starts_at: z.string(),
  ends_at: z.string(),
  note: z.string().nullable(),
});

// ──────────────────────────────────────────────────────────────────────────────
// Result types
// ──────────────────────────────────────────────────────────────────────────────

export type AvailabilityResult =
  | { kind: "success" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

export type ListWindowsResult =
  | { kind: "success"; windows: AvailabilityWindow[] }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

// ──────────────────────────────────────────────────────────────────────────────
// Deps
// ──────────────────────────────────────────────────────────────────────────────

export interface AvailabilityDeps {
  serviceClient: SupabaseClient;
  actorUserId: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Core functions (no Next.js imports — testable via DI)
// ──────────────────────────────────────────────────────────────────────────────

export async function listWindowsCore(
  deps: AvailabilityDeps,
): Promise<ListWindowsResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const { data, error } = await deps.serviceClient
    .from("availability_windows")
    .select("id, starts_at, ends_at, note")
    .order("starts_at", { ascending: true });

  if (error) return { kind: "error", message: error.message };

  const windows: AvailabilityWindow[] = [];
  for (const row of data ?? []) {
    const parsed = availabilityWindowSchema.safeParse(row);
    if (!parsed.success)
      return {
        kind: "error",
        message: `Unexpected availability_window shape: ${parsed.error.message}`,
      };
    windows.push(parsed.data);
  }

  return { kind: "success", windows };
}

const createWindowInputSchema = z
  .object({
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    note: z.string().max(500).nullable().optional(),
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

export async function createWindowCore(
  deps: AvailabilityDeps,
  rawInput: { startsAt: string; endsAt: string; note?: string | null },
): Promise<AvailabilityResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const parsed = createWindowInputSchema.safeParse(rawInput);
  if (!parsed.success)
    return { kind: "validation_error", message: parsed.error.message };

  const { data: input } = parsed;

  const { error } = await deps.serviceClient
    .from("availability_windows")
    .insert({
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      note: input.note ?? null,
    });

  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

const trimWindowInputSchema = z
  .object({
    windowId: z.string().uuid(),
    newStartsAt: z.string().datetime({ offset: true }).optional(),
    newEndsAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine((d) => d.newStartsAt !== undefined || d.newEndsAt !== undefined, {
    message: "At least one of newStartsAt or newEndsAt must be provided",
  });

/**
 * Trim (shrink/grow) a window. Trimming is a block-out of the removed portion:
 * any active booking that falls in the slice no longer covered by the new bounds
 * is cancelled (same admin-path block-out as deleteWindowCore). Growing a bound
 * removes nothing.
 *
 * Removed slices:
 *   - start moved later   → [oldStart, newStart)
 *   - end moved earlier   → (newEnd, oldEnd]
 */
export async function trimWindowCore(
  deps: AvailabilityDeps & { now: Date; gateway: PaymentGateway },
  rawInput: {
    windowId: string;
    newStartsAt?: string;
    newEndsAt?: string;
  },
): Promise<AvailabilityResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const parsed = trimWindowInputSchema.safeParse(rawInput);
  if (!parsed.success)
    return { kind: "validation_error", message: parsed.error.message };

  const { data: input } = parsed;

  // Load the window's current (old) bounds.
  const { data: windowData, error: windowErr } = await deps.serviceClient
    .from("availability_windows")
    .select("id, starts_at, ends_at")
    .eq("id", input.windowId)
    .single();

  if (windowErr || !windowData) return { kind: "not_found" };

  const oldStart = windowData.starts_at as string;
  const oldEnd = windowData.ends_at as string;
  const newStart = input.newStartsAt ?? oldStart;
  const newEnd = input.newEndsAt ?? oldEnd;

  // A trim must not invert the window.
  if (new Date(newEnd).getTime() <= new Date(newStart).getTime())
    return {
      kind: "validation_error",
      message: "Trimmed window would have endsAt <= startsAt",
    };

  // Cancel active bookings in each removed slice (block-out semantics).
  if (new Date(newStart).getTime() > new Date(oldStart).getTime()) {
    const err = await cancelActiveBookingsInRange(
      deps.serviceClient,
      deps.now,
      deps.gateway,
      oldStart,
      newStart,
    );
    if (err) return err;
  }
  if (new Date(newEnd).getTime() < new Date(oldEnd).getTime()) {
    const err = await cancelActiveBookingsInRange(
      deps.serviceClient,
      deps.now,
      deps.gateway,
      newEnd,
      oldEnd,
    );
    if (err) return err;
  }

  const update: Record<string, string> = {};
  if (input.newStartsAt) update.starts_at = input.newStartsAt;
  if (input.newEndsAt) update.ends_at = input.newEndsAt;

  const { error } = await deps.serviceClient
    .from("availability_windows")
    .update(update)
    .eq("id", input.windowId);

  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

/**
 * Cancels every active (pending_approval | confirmed) booking overlapping the
 * range [rangeStart, rangeEnd), reusing cancelBookingCore (admin path: the
 * booking's own client_id is passed as userId to satisfy the ownership check).
 *
 * Overlap condition: booking.starts_at < rangeEnd AND booking.ends_at > rangeStart.
 * Returns an error result on query failure, otherwise null (success).
 *
 * Cancellation is sequential and self-excluding: each cancel flips status to
 * 'cancelled', so a booking is never returned twice across successive calls.
 */
async function cancelActiveBookingsInRange(
  serviceClient: SupabaseClient,
  now: Date,
  gateway: PaymentGateway,
  rangeStart: string,
  rangeEnd: string,
): Promise<{ kind: "error"; message: string } | null> {
  const { data: overlapping, error } = await serviceClient
    .from("bookings")
    .select("id, client_id, status")
    .lt("starts_at", rangeEnd)
    .gt("ends_at", rangeStart)
    .in("status", ["pending_approval", "confirmed"]);

  if (error)
    return { kind: "error", message: `Overlap query failed: ${error.message}` };

  const repo = createSupabaseBookingRepository(serviceClient);
  for (const booking of overlapping ?? []) {
    const result = await cancelBookingCore(
      { repo, now, gateway },
      { userId: booking.client_id as string, bookingId: booking.id as string },
    );
    // Abort the block-out if any cancellation fails — leaving the window
    // removed while a booking inside it stays active is a consistency bug.
    if (result.kind === "error" || result.kind === "forbidden")
      return {
        kind: "error",
        message: `Failed to cancel booking ${booking.id} inside removed window: ${
          result.kind === "error" ? result.message : "forbidden"
        }`,
      };
  }
  return null;
}

/**
 * Block-out: delete window + cancel all active bookings that overlap it.
 *
 * Reuses cancelActiveBookingsInRange (admin path: pass booking's client_id as userId).
 */
export async function deleteWindowCore(
  deps: AvailabilityDeps & { now: Date; gateway: PaymentGateway },
  rawInput: { windowId: string },
): Promise<AvailabilityResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const parsed = z.object({ windowId: z.string().uuid() }).safeParse(rawInput);
  if (!parsed.success)
    return { kind: "validation_error", message: parsed.error.message };

  const { windowId } = parsed.data;

  // Load the window to get its time range.
  const { data: windowData, error: windowErr } = await deps.serviceClient
    .from("availability_windows")
    .select("id, starts_at, ends_at")
    .eq("id", windowId)
    .single();

  if (windowErr || !windowData) return { kind: "not_found" };

  // Cancel every active booking inside the window being removed.
  const cancelErr = await cancelActiveBookingsInRange(
    deps.serviceClient,
    deps.now,
    deps.gateway,
    windowData.starts_at as string,
    windowData.ends_at as string,
  );
  if (cancelErr) return cancelErr;

  // Delete the window.
  const { error: deleteErr } = await deps.serviceClient
    .from("availability_windows")
    .delete()
    .eq("id", windowId);

  if (deleteErr) return { kind: "error", message: deleteErr.message };
  return { kind: "success" };
}

// ──────────────────────────────────────────────────────────────────────────────
// "use server" wrappers
// ──────────────────────────────────────────────────────────────────────────────

export async function listWindows(): Promise<ListWindowsResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  return listWindowsCore({ serviceClient, actorUserId });
}

export async function createWindow(input: {
  startsAt: string;
  endsAt: string;
  note?: string | null;
}): Promise<AvailabilityResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const result = await createWindowCore({ serviceClient, actorUserId }, input);
  if (result.kind === "success") revalidatePath("/admin/availability");
  return result;
}

export async function trimWindow(input: {
  windowId: string;
  newStartsAt?: string;
  newEndsAt?: string;
}): Promise<AvailabilityResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const { StripeGateway } = await import("@/features/payments/stripe-gateway");
  const result = await trimWindowCore(
    {
      serviceClient,
      actorUserId,
      now: new Date(),
      gateway: new StripeGateway(),
    },
    input,
  );
  if (result.kind === "success") revalidatePath("/admin/availability");
  return result;
}

export async function deleteWindow(input: {
  windowId: string;
}): Promise<AvailabilityResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const { StripeGateway } = await import("@/features/payments/stripe-gateway");
  const result = await deleteWindowCore(
    {
      serviceClient,
      actorUserId,
      now: new Date(),
      gateway: new StripeGateway(),
    },
    input,
  );
  if (result.kind === "success") revalidatePath("/admin/availability");
  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// Refuse-not-cancel result types (new scheduler policy)
// ──────────────────────────────────────────────────────────────────────────────

export type ConflictBooking = { id: string; startsAt: string; endsAt: string };

export type SetWindowUnavailableResult =
  | { kind: "success" }
  | { kind: "forbidden" }
  | { kind: "validation_error"; message: string }
  | { kind: "conflict"; bookings: ConflictBooking[] }
  | { kind: "error"; message: string };

// ──────────────────────────────────────────────────────────────────────────────
// Validation schemas
// ──────────────────────────────────────────────────────────────────────────────

const dayKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Each dayKey must be a YYYY-MM-DD date string");

const createWindowsBatchInputSchema = z
  .object({
    dayKeys: z
      .array(dayKeySchema)
      .nonempty("dayKeys must be a non-empty array"),
    openMinute: z.number().int().min(0).max(1440),
    closeMinute: z.number().int().min(0).max(1440),
  })
  .refine((d) => d.openMinute < d.closeMinute, {
    message: "openMinute must be less than closeMinute",
    path: ["openMinute"],
  });

const setWindowUnavailableInputSchema = z
  .object({
    dayKey: dayKeySchema,
    fromMinute: z.number().int().min(0).max(1440),
    toMinute: z.number().int().min(0).max(1440),
  })
  .refine((d) => d.fromMinute < d.toMinute, {
    message: "fromMinute must be less than toMinute",
    path: ["fromMinute"],
  });

// ──────────────────────────────────────────────────────────────────────────────
// createWindowsBatchCore — bulk window create, no conflict check
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Creates one availability window per dayKey spanning [openMinute, closeMinute)
 * of the Denver calendar day. Adding availability is always safe — no conflict
 * check. All rows inserted in a single .insert([...]) call.
 */
export async function createWindowsBatchCore(
  deps: AvailabilityDeps,
  rawInput: { dayKeys: string[]; openMinute: number; closeMinute: number },
): Promise<AvailabilityResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const parsed = createWindowsBatchInputSchema.safeParse(rawInput);
  if (!parsed.success)
    return { kind: "validation_error", message: parsed.error.message };

  const { dayKeys, openMinute, closeMinute } = parsed.data;

  const rows = dayKeys.map((dayKey) => {
    const midnight = denverMidnight(dayKey).getTime();
    return {
      starts_at: new Date(midnight + openMinute * 60000).toISOString(),
      ends_at: new Date(midnight + closeMinute * 60000).toISOString(),
      note: null as string | null,
    };
  });

  const { error } = await deps.serviceClient
    .from("availability_windows")
    .insert(rows);

  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

// ──────────────────────────────────────────────────────────────────────────────
// setWindowUnavailableCore — trim/split with refuse-not-cancel policy
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Removes the instant slice R = [denverMidnight(dayKey)+fromMinute*60000,
 * denverMidnight(dayKey)+toMinute*60000) from availability by trimming/splitting
 * any overlapping windows.
 *
 * Refuse-not-cancel: if any active booking (pending_approval | confirmed) of
 * ANY concurrency class overlaps R, returns conflict and mutates nothing.
 *
 * Split logic per overlapping window W = [ws, we):
 *   left  remainder [ws, R.start)   iff ws < R.start
 *   right remainder [R.end, we)     iff R.end < we
 *   full-cover (W ⊆ R)              → delete, no remainders
 */
export async function setWindowUnavailableCore(
  deps: AvailabilityDeps,
  rawInput: { dayKey: string; fromMinute: number; toMinute: number },
): Promise<SetWindowUnavailableResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const parsed = setWindowUnavailableInputSchema.safeParse(rawInput);
  if (!parsed.success)
    return { kind: "validation_error", message: parsed.error.message };

  const { dayKey, fromMinute, toMinute } = parsed.data;

  const midnight = denverMidnight(dayKey).getTime();
  const rStart = new Date(midnight + fromMinute * 60000);
  const rEnd = new Date(midnight + toMinute * 60000);

  // ── 1. Read-only conflict check ──────────────────────────────────────────
  const { data: conflicting, error: conflictErr } = await deps.serviceClient
    .from("bookings")
    .select("id, starts_at, ends_at")
    .lt("starts_at", rEnd.toISOString())
    .gt("ends_at", rStart.toISOString())
    .in("status", ["pending_approval", "confirmed"]);

  if (conflictErr)
    return {
      kind: "error",
      message: `Conflict query failed: ${conflictErr.message}`,
    };

  const conflictBookings: ConflictBooking[] = (conflicting ?? []).map(
    (row) => ({
      id: row.id as string,
      startsAt: row.starts_at as string,
      endsAt: row.ends_at as string,
    }),
  );

  if (conflictBookings.length > 0) {
    return { kind: "conflict", bookings: conflictBookings };
  }

  // ── 2. Fetch overlapping availability windows ────────────────────────────
  const { data: windows, error: windowsErr } = await deps.serviceClient
    .from("availability_windows")
    .select("id, starts_at, ends_at, note")
    .lt("starts_at", rEnd.toISOString())
    .gt("ends_at", rStart.toISOString());

  if (windowsErr)
    return {
      kind: "error",
      message: `Window query failed: ${windowsErr.message}`,
    };

  // ── 3. Trim/split each overlapping window ───────────────────────────────
  for (const w of windows ?? []) {
    const ws = w.starts_at as string;
    const we = w.ends_at as string;
    const wId = w.id as string;
    const note = w.note as string | null;

    const { error: delErr } = await deps.serviceClient
      .from("availability_windows")
      .delete()
      .eq("id", wId);

    if (delErr)
      return {
        kind: "error",
        message: `Delete window failed: ${delErr.message}`,
      };

    const remainders: {
      starts_at: string;
      ends_at: string;
      note: string | null;
    }[] = [];

    // Left remainder: [ws, R.start) — exists iff window starts before R
    if (new Date(ws).getTime() < rStart.getTime()) {
      remainders.push({ starts_at: ws, ends_at: rStart.toISOString(), note });
    }

    // Right remainder: [R.end, we) — exists iff window ends after R
    if (rEnd.getTime() < new Date(we).getTime()) {
      remainders.push({ starts_at: rEnd.toISOString(), ends_at: we, note });
    }

    if (remainders.length > 0) {
      const { error: insertErr } = await deps.serviceClient
        .from("availability_windows")
        .insert(remainders);

      if (insertErr)
        return {
          kind: "error",
          message: `Insert remainder failed: ${insertErr.message}`,
        };
    }
  }

  return { kind: "success" };
}

// ──────────────────────────────────────────────────────────────────────────────
// "use server" wrappers — refuse-not-cancel cores
// ──────────────────────────────────────────────────────────────────────────────

export async function createWindowsBatch(input: {
  dayKeys: string[];
  openMinute: number;
  closeMinute: number;
}): Promise<AvailabilityResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const result = await createWindowsBatchCore(
    { serviceClient, actorUserId },
    input,
  );
  if (result.kind === "success") revalidatePath("/admin/availability");
  return result;
}

export async function setWindowUnavailable(input: {
  dayKey: string;
  fromMinute: number;
  toMinute: number;
}): Promise<SetWindowUnavailableResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const result = await setWindowUnavailableCore(
    { serviceClient, actorUserId },
    input,
  );
  if (result.kind === "success") revalidatePath("/admin/availability");
  return result;
}
