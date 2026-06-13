/**
 * Reminder cron — queries confirmed bookings due within `reminder_lead_hours`
 * and sends one reminder email per booking (idempotent via reminder_sent_at).
 *
 * Pure predicate `isRemindable` is unit-testable without IO.
 * `runReminderCron` accepts injected deps (serviceClient, mailer, now) so
 * integration tests can use a fake Mailer and real DB.
 */

import { buildBookingReminderEmail } from "./emails";
import type { Mailer, SendResult } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// ──────────────────────────────────────────────────────────────────────────────
// Pure predicate
// ──────────────────────────────────────────────────────────────────────────────

export interface RemindableBooking {
  status: string;
  startsAt: Date;
  reminderSentAt: Date | null;
}

/**
 * Returns true iff a booking should receive a reminder now.
 *
 * Conditions (ALL must hold):
 *  - status === 'confirmed'
 *  - reminderSentAt === null  (idempotency: stamp prevents double-send)
 *  - startsAt is in the future window (now, now + leadHours*3_600_000]
 *    (excludes past-start bookings; includes the boundary at now+leadHours)
 */
export function isRemindable(
  booking: RemindableBooking,
  now: Date,
  leadHours: number,
): boolean {
  if (booking.status !== "confirmed") return false;
  if (booking.reminderSentAt !== null) return false;
  const windowEnd = new Date(now.getTime() + leadHours * 3_600_000);
  return booking.startsAt > now && booking.startsAt <= windowEnd;
}

// ──────────────────────────────────────────────────────────────────────────────
// DB row schema
// ──────────────────────────────────────────────────────────────────────────────

const reminderBookingRowSchema = z.object({
  id: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  reminder_sent_at: z.string().nullable(),
  status: z.string(),
  profiles: z
    .object({
      email: z.string(),
    })
    .nullable(),
  services: z
    .object({
      name: z.string(),
    })
    .nullable(),
});

type ReminderBookingRow = z.infer<typeof reminderBookingRowSchema>;

// ──────────────────────────────────────────────────────────────────────────────
// Cron deps + core
// ──────────────────────────────────────────────────────────────────────────────

export interface ReminderCronDeps {
  serviceClient: SupabaseClient;
  mailer: Mailer;
  now: Date;
}

export async function runReminderCron(
  deps: ReminderCronDeps,
): Promise<{ ok: true; sent: number } | { ok: false; error: string }> {
  const { serviceClient, mailer, now } = deps;

  // Read reminder_lead_hours from settings.
  const { data: settingsData, error: settingsErr } = await serviceClient
    .from("settings")
    .select("reminder_lead_hours")
    .limit(1)
    .single();

  if (settingsErr || !settingsData) {
    return {
      ok: false,
      error: `Failed to load settings: ${settingsErr?.message ?? "no row"}`,
    };
  }

  const leadHours: number =
    typeof settingsData.reminder_lead_hours === "number"
      ? settingsData.reminder_lead_hours
      : 24;

  const windowEnd = new Date(now.getTime() + leadHours * 3_600_000);

  // Query confirmed bookings with no reminder sent, starting within window.
  const { data: rows, error: queryErr } = await serviceClient
    .from("bookings")
    .select(
      "id, starts_at, ends_at, reminder_sent_at, status, profiles(email), services(name)",
    )
    .eq("status", "confirmed")
    .is("reminder_sent_at", null)
    .gt("starts_at", now.toISOString())
    .lte("starts_at", windowEnd.toISOString())
    // Bound the per-run batch. Idempotent via reminder_sent_at, so a backlog
    // drains across the daily runs without re-sending.
    .limit(100);

  if (queryErr) {
    return {
      ok: false,
      error: `Failed to query bookings: ${queryErr.message}`,
    };
  }

  let sent = 0;

  for (const raw of rows ?? []) {
    const parsed = reminderBookingRowSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(
        "reminder-cron: unexpected booking row shape",
        parsed.error.message,
      );
      continue;
    }
    const row: ReminderBookingRow = parsed.data;

    const booking: RemindableBooking = {
      status: row.status,
      startsAt: new Date(row.starts_at),
      reminderSentAt: row.reminder_sent_at
        ? new Date(row.reminder_sent_at)
        : null,
    };

    if (!isRemindable(booking, now, leadHours)) continue;

    const clientEmail = row.profiles?.email;
    const serviceName = row.services?.name;

    if (!clientEmail || !serviceName) {
      console.error(
        `reminder-cron: booking ${row.id} missing profile email or service name — skipping`,
      );
      continue;
    }

    const msg = buildBookingReminderEmail({
      to: clientEmail,
      serviceName,
      startsAt: booking.startsAt,
    });

    const result: SendResult = await mailer.send(msg);

    if (result.ok) {
      // Stamp reminder_sent_at only on successful send (idempotency).
      const { error: stampErr } = await serviceClient
        .from("bookings")
        .update({ reminder_sent_at: now.toISOString() })
        .eq("id", row.id);

      if (stampErr) {
        // Email already went out but the idempotency stamp failed — the next
        // run will see reminder_sent_at IS NULL and send a DUPLICATE. Logged
        // distinctly so this is visible in case it recurs.
        console.error(
          `reminder-cron: WARNING email sent but reminder_sent_at stamp FAILED for ${row.id} (may double-send next run): ${stampErr.message}`,
        );
      } else {
        sent++;
      }
    } else {
      // Don't stamp — let the next run retry.
      console.error(
        `reminder-cron: send failed for booking ${row.id}: ${result.error}`,
      );
    }
  }

  return { ok: true, sent };
}
