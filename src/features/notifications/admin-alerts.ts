import "server-only";

/**
 * Admin alerts — the mail Cal receives when something needs him.
 *
 * One gate governs all of it: `ADMIN_NOTIFICATION_EMAIL`. Unset or blank and
 * nothing is built, nothing is read from the database, and no mailer is
 * constructed, so an unconfigured deploy sends no alerts at all rather than
 * failing to send them. The address is read per call rather than at module
 * load so a deploy can turn alerts on without a rebuild.
 *
 * Best-effort by contract, like the client sends: a failed alert is logged and
 * never surfaced to the caller, because no booking or inquiry should fail
 * because Cal's copy of it did not go out.
 */

import { z } from "zod";
import {
  buildBookingCancelledAlertEmail,
  buildBookingRequestAlertEmail,
  buildInquiryAlertEmail,
} from "./emails";
import { ResendMailer } from "./resend-mailer";
import type { AdminAlertDispatch, AdminAlertEvent } from "./notifier";
import type { EmailMessage, Mailer } from "./types";
import type { DbClient } from "@/lib/supabase/db-client";

/** Cal's alert address, or null when alerts are off. */
function alertAddress(): string | null {
  const address = process.env.ADMIN_NOTIFICATION_EMAIL?.trim();
  return address ? address : null;
}

function buildAlert(to: string, event: AdminAlertEvent): EmailMessage {
  switch (event.type) {
    case "booking_requested":
      return buildBookingRequestAlertEmail(to, event.payload);
    case "inquiry_received":
      return buildInquiryAlertEmail(to, event.payload);
    case "booking_cancelled":
      return buildBookingCancelledAlertEmail(to, event.payload);
  }
}

/**
 * Send one alert to Cal. A no-op while `ADMIN_NOTIFICATION_EMAIL` is unset.
 * `mailer` is injectable for tests; the default routes to Resend.
 */
export async function notifyAdmin(
  event: AdminAlertEvent,
  mailer?: Mailer,
): Promise<void> {
  const to = alertAddress();
  if (!to) return;

  try {
    // Constructed after the gate: ResendMailer asserts its env vars, and an
    // unconfigured deploy must not throw on an alert it was never going to send.
    const result = await (mailer ?? new ResendMailer()).send(
      buildAlert(to, event),
    );
    if (!result.ok) {
      console.error(`notifyAdmin: ${event.type} alert failed: ${result.error}`);
    }
  } catch (e: unknown) {
    console.error(`notifyAdmin: error sending the ${event.type} alert:`, e);
  }
}

/** The booking columns a cancellation alert is built from. */
const CANCELLATION_COLUMNS =
  "starts_at, profiles(email, full_name), services(name)";

const cancellationRowSchema = z.object({
  starts_at: z.string(),
  profiles: z
    .object({ email: z.string().nullable(), full_name: z.string().nullable() })
    .nullable(),
  services: z.object({ name: z.string() }).nullable(),
});

/**
 * Alert Cal that a client cancelled `bookingId`. The booking is re-read here
 * rather than passed in, so the caller — a server action that holds ids and
 * not rows — stays a single line.
 *
 * `dispatch` is injectable for tests. Never throws.
 */
export async function notifyAdminOfCancellation(
  serviceClient: DbClient,
  bookingId: string,
  dispatch: AdminAlertDispatch = notifyAdmin,
): Promise<void> {
  if (!alertAddress()) return;

  try {
    const { data, error } = await serviceClient
      .from("bookings")
      .select(CANCELLATION_COLUMNS)
      .eq("id", bookingId)
      .single();

    if (error) {
      console.error(
        `notifyAdminOfCancellation: failed to load booking ${bookingId}: ${error.message}`,
      );
      return;
    }

    const parsed = cancellationRowSchema.safeParse(data);
    if (!parsed.success) {
      console.error(
        `notifyAdminOfCancellation: unexpected booking row for ${bookingId}: ${parsed.error.message}`,
      );
      return;
    }
    // `profiles.email` is nullable in the database, so an address is something
    // to check for rather than something the row schema can promise.
    const client = parsed.data.profiles;
    if (!client?.email) {
      console.error(
        `notifyAdminOfCancellation: booking ${bookingId} has no client email address — skipping`,
      );
      return;
    }

    await dispatch({
      type: "booking_cancelled",
      payload: {
        bookingId,
        clientName: client.full_name ?? client.email,
        clientEmail: client.email,
        serviceName: parsed.data.services?.name ?? "Booking",
        startsAt: new Date(parsed.data.starts_at),
      },
    });
  } catch (e: unknown) {
    console.error(
      `notifyAdminOfCancellation: error alerting on booking ${bookingId}:`,
      e,
    );
  }
}
