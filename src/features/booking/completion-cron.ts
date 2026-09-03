/**
 * Completion cron — flips past-end confirmed bookings to completed, in one
 * bounded read and one update for the whole batch.
 *
 * Pure predicate `isCompletable` is unit-testable without IO.
 * `runCompletionCron` accepts injected deps (serviceClient, now) so
 * integration tests can run against real DB.
 *
 * SAFETY: Only touches confirmed bookings with ends_at < now.
 * Never touches payment_status or any other projection column.
 *
 * Lives in the booking feature rather than with the other crons in
 * notifications: it sends no mail, it only advances the booking state machine.
 */

import { transition } from "./state-machine";
import type { DbClient } from "@/lib/supabase/db-client";
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
  serviceClient: DbClient;
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
    .lt("ends_at", now.toISOString())
    // Bound the per-run batch. The ids travel back as a query-string `in(…)`
    // filter, so an unbounded backlog would build an over-long URL. Completing
    // a booking takes it out of this predicate, so a backlog drains over runs.
    .limit(100);

  if (queryErr) {
    return {
      ok: false,
      error: `Failed to query bookings: ${queryErr.message}`,
    };
  }

  const dueIds: string[] = [];

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

    if (isCompletable(booking, now)) dueIds.push(row.id);
  }

  if (dueIds.length === 0) return { ok: true, completed: 0 };

  // Every booking in the batch makes the same transition, so the state machine
  // is consulted once rather than per row.
  const result = transition("confirmed", "complete", {
    requiresApproval: false,
  });

  if ("error" in result) {
    return {
      ok: false,
      error: `State machine rejected completion: ${result.error}`,
    };
  }

  // Only update status — never touch payment_status or other columns.
  const { error: updateErr } = await serviceClient
    .from("bookings")
    .update({ status: result.state })
    .in("id", dueIds);

  if (updateErr) {
    return {
      ok: false,
      error: `Failed to complete bookings: ${updateErr.message}`,
    };
  }

  return { ok: true, completed: dueIds.length };
}
