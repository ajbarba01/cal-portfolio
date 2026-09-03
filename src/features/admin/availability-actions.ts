"use server";

/**
 * Admin server actions for availability window CRUD and block-out.
 *
 * SECURITY: All mutations use the service-role client AFTER verifying the actor
 * is an admin. Identity comes from the session; role is re-checked from DB.
 *
 * Block-out: deletes (or trims) a window and cancels any active booking that
 * falls inside the removed range by reusing cancelBookingCore (admin path).
 * No route calls these any more — the scheduler carves availability out through
 * setWindowUnavailableCore instead, and cancelling is the operator's own
 * decision at the confirm. They stay because the integration suite pins the
 * block-out semantics.
 *
 * Refuse-not-cancel cores: createWindowsBatchCore and setWindowUnavailableCore
 * implement the NEW scheduler policy — refuse on conflict, never cancel.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "@/lib/admin-guard";
import { getActorOrRedirect } from "@/lib/admin-session";
import {
  cancelBookingCore,
  createSupabaseBookingRepository,
  denverMidnight,
} from "@/features/booking";
import type { DbClient } from "@/lib/supabase/db-client";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import type { PaymentGateway } from "@/features/payments";

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

/**
 * What a rejected input tells the operator. Zod's own message is a dump of the
 * issue list — it names internal field paths and would land verbatim in Cal's
 * toast, so the detail goes to the server log and she gets this instead.
 */
const VALIDATION_MESSAGE = "Please check your entries and try again.";

/**
 * What a failed read or write tells the operator. Postgres names tables and
 * constraints in its own messages, so the detail goes to the server log and she
 * gets this instead.
 */
const ERROR_MESSAGE = "Something went wrong. Please try again.";

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
  serviceClient: DbClient;
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

  if (error) {
    console.error("availability action: window read failed", error);
    return { kind: "error", message: ERROR_MESSAGE };
  }

  const windows: AvailabilityWindow[] = [];
  for (const row of data ?? []) {
    const parsed = availabilityWindowSchema.safeParse(row);
    if (!parsed.success) {
      console.error(
        "availability action: unexpected availability_window row",
        parsed.error.issues,
      );
      return { kind: "error", message: ERROR_MESSAGE };
    }
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
  if (!parsed.success) {
    console.error(
      "availability action: input validation failed",
      parsed.error.issues,
    );
    return { kind: "validation_error", message: VALIDATION_MESSAGE };
  }

  const { data: input } = parsed;

  const { error } = await deps.serviceClient
    .from("availability_windows")
    .insert({
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      note: input.note ?? null,
    });

  if (error) {
    console.error("availability action: window insert failed", error);
    return { kind: "error", message: ERROR_MESSAGE };
  }
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
  if (!parsed.success) {
    console.error(
      "availability action: input validation failed",
      parsed.error.issues,
    );
    return { kind: "validation_error", message: VALIDATION_MESSAGE };
  }

  const { data: input } = parsed;

  // Load the window's current (old) bounds.
  const { data: windowData, error: windowErr } = await deps.serviceClient
    .from("availability_windows")
    .select("id, starts_at, ends_at")
    .eq("id", input.windowId)
    .single();

  if (windowErr || !windowData) return { kind: "not_found" };

  const oldStart = windowData.starts_at;
  const oldEnd = windowData.ends_at;
  const newStart = input.newStartsAt ?? oldStart;
  const newEnd = input.newEndsAt ?? oldEnd;

  // A trim must not invert the window.
  if (new Date(newEnd).getTime() <= new Date(newStart).getTime()) {
    console.error(
      "availability action: trim would invert the window",
      input.windowId,
    );
    return { kind: "validation_error", message: VALIDATION_MESSAGE };
  }

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

  const update: TablesUpdate<"availability_windows"> = {};
  if (input.newStartsAt) update.starts_at = input.newStartsAt;
  if (input.newEndsAt) update.ends_at = input.newEndsAt;

  const { error } = await deps.serviceClient
    .from("availability_windows")
    .update(update)
    .eq("id", input.windowId);

  if (error) {
    console.error("availability action: window trim failed", error);
    return { kind: "error", message: ERROR_MESSAGE };
  }
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
  serviceClient: DbClient,
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

  if (error) {
    console.error("availability action: overlap query failed", error);
    return { kind: "error", message: ERROR_MESSAGE };
  }

  const repo = createSupabaseBookingRepository(serviceClient);
  for (const booking of overlapping ?? []) {
    const result = await cancelBookingCore(
      { repo, now, gateway },
      { userId: booking.client_id, bookingId: booking.id },
    );
    // Abort the block-out if any cancellation fails — leaving the window
    // removed while a booking inside it stays active is a consistency bug.
    if (result.kind === "error" || result.kind === "forbidden") {
      console.error(
        "availability action: cancelling a booking inside the removed window failed",
        booking.id,
        result.kind === "error" ? result.message : result.kind,
      );
      return { kind: "error", message: ERROR_MESSAGE };
    }
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
  if (!parsed.success) {
    console.error(
      "availability action: input validation failed",
      parsed.error.issues,
    );
    return { kind: "validation_error", message: VALIDATION_MESSAGE };
  }

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
    windowData.starts_at,
    windowData.ends_at,
  );
  if (cancelErr) return cancelErr;

  // Delete the window.
  const { error: deleteErr } = await deps.serviceClient
    .from("availability_windows")
    .delete()
    .eq("id", windowId);

  if (deleteErr) {
    console.error("availability action: window delete failed", deleteErr);
    return { kind: "error", message: ERROR_MESSAGE };
  }
  return { kind: "success" };
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
  if (!parsed.success) {
    console.error(
      "availability action: input validation failed",
      parsed.error.issues,
    );
    return { kind: "validation_error", message: VALIDATION_MESSAGE };
  }

  const { dayKeys, openMinute, closeMinute } = parsed.data;

  const rows = dayKeys.map((dayKey) => {
    const midnight = denverMidnight(dayKey).getTime();
    return {
      starts_at: new Date(midnight + openMinute * 60000).toISOString(),
      ends_at: new Date(midnight + closeMinute * 60000).toISOString(),
      note: null,
    };
  });

  const { error } = await deps.serviceClient
    .from("availability_windows")
    .insert(rows);

  if (error) {
    console.error("availability action: window batch insert failed", error);
    return { kind: "error", message: ERROR_MESSAGE };
  }
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
 *
 * Mutation order (insert-before-delete): for each window, remainders are
 * inserted BEFORE the original is deleted. availability_windows has no
 * exclusion constraint, so the brief temporal overlap between the original
 * and its remainder subsets is safe. This ordering avoids silent availability
 * loss: if the insert fails we return the error without deleting (window
 * intact); if the delete fails after a successful insert we return the error
 * (the duplicate slice is a recoverable over-count, not a data loss).
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
  if (!parsed.success) {
    console.error(
      "availability action: input validation failed",
      parsed.error.issues,
    );
    return { kind: "validation_error", message: VALIDATION_MESSAGE };
  }

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

  if (conflictErr) {
    console.error("availability action: conflict query failed", conflictErr);
    return { kind: "error", message: ERROR_MESSAGE };
  }

  const conflictBookings: ConflictBooking[] = (conflicting ?? []).map(
    (row) => ({
      id: row.id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
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

  if (windowsErr) {
    console.error("availability action: window query failed", windowsErr);
    return { kind: "error", message: ERROR_MESSAGE };
  }

  // ── 3. Trim/split each overlapping window ───────────────────────────────
  for (const w of windows ?? []) {
    const ws = w.starts_at;
    const we = w.ends_at;
    const wId = w.id;
    const note = w.note;

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

    // Insert-before-delete: remainders go in first so a delete failure
    // cannot leave the surviving slices orphaned.
    if (remainders.length > 0) {
      const { error: insertErr } = await deps.serviceClient
        .from("availability_windows")
        .insert(remainders);

      if (insertErr) {
        console.error(
          "availability action: remainder insert failed",
          insertErr,
        );
        return { kind: "error", message: ERROR_MESSAGE };
      }
    }

    const { error: delErr } = await deps.serviceClient
      .from("availability_windows")
      .delete()
      .eq("id", wId);

    if (delErr) {
      console.error("availability action: window delete failed", delErr);
      return { kind: "error", message: ERROR_MESSAGE };
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
