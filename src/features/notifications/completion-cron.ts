/**
 * Completion cron — flips past-end confirmed bookings to completed.
 *
 * Pure predicate `isCompletable` is unit-testable without IO.
 * `runCompletionCron` accepts injected deps (serviceClient, now) so
 * integration tests can run against real DB.
 *
 * SAFETY: Only touches confirmed bookings with ends_at < now.
 * Never touches payment_status or any other projection column.
 */

import { transition } from "@/features/booking";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// ──────────────────────────────────────────────────────────────────────────────
// Pure predicate
// ──────────────────────────────────────────────────────────────────────────────

export interface CompletableBooking {
  status: string;
  endsAt: Date;
}

/**
 * Returns true iff a confirmed booking's end time is in the past.
 */
export function isCompletable(booking: CompletableBooking, now: Date): boolean {
  return booking.status === "confirmed" && booking.endsAt < now;
}

// ──────────────────────────────────────────────────────────────────────────────
// DB row schema
// ──────────────────────────────────────────────────────────────────────────────

const completionBookingRowSchema = z.object({
  id: z.string(),
  status: z.string(),
  ends_at: z.string(),
});

// ──────────────────────────────────────────────────────────────────────────────
// Cron deps + core
// ──────────────────────────────────────────────────────────────────────────────

export interface CompletionCronDeps {
  serviceClient: SupabaseClient;
  now: Date;
}

export async function runCompletionCron(
  deps: CompletionCronDeps,
): Promise<{ ok: true; completed: number } | { ok: false; error: string }> {
  const { serviceClient, now } = deps;

  const { data: rows, error: queryErr } = await serviceClient
    .from("bookings")
    .select("id, status, ends_at")
    .eq("status", "confirmed")
    .lt("ends_at", now.toISOString());

  if (queryErr) {
    return {
      ok: false,
      error: `Failed to query bookings: ${queryErr.message}`,
    };
  }

  let completed = 0;

  for (const raw of rows ?? []) {
    const parsed = completionBookingRowSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(
        "completion-cron: unexpected booking row shape",
        parsed.error.message,
      );
      continue;
    }
    const row = parsed.data;

    const booking: CompletableBooking = {
      status: row.status,
      endsAt: new Date(row.ends_at),
    };

    if (!isCompletable(booking, now)) continue;

    const result = transition("confirmed", "complete", {
      requiresApproval: false,
    });

    if ("error" in result) {
      console.error(
        `completion-cron: state machine error for booking ${row.id}: ${result.error}`,
      );
      continue;
    }

    // Only update status — never touch payment_status or other columns.
    const { error: updateErr } = await serviceClient
      .from("bookings")
      .update({ status: result.state })
      .eq("id", row.id);

    if (updateErr) {
      console.error(
        `completion-cron: failed to update booking ${row.id}: ${updateErr.message}`,
      );
    } else {
      completed++;
    }
  }

  return { ok: true, completed };
}
