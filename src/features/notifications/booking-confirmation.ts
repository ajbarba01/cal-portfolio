/**
 * The one place a created or confirmed booking's mail is sent.
 *
 * Four paths call it with a booking id: a self-serve create, an admin create on
 * a client's behalf, Cal approving a pending request, and the series-roll cron
 * promoting one past the horizon. The row is re-read here, so what gets sent is
 * decided from the stored status rather than from whatever the caller believed
 * it wrote. A `confirmed` booking gets the confirmation; one that came out
 * `pending_approval` gets the received acknowledgement instead, plus an alert
 * to Cal that a request is waiting on him, and its confirmation arrives later
 * from whichever path confirms it.
 *
 * The recipient comes from the row too, not from the caller's session, because
 * the admin paths have no session belonging to the client being emailed.
 *
 * Best-effort by contract: this never throws and never reports failure. Mail
 * that cannot be sent is logged, never surfaced to the caller.
 */

import { z } from "zod";
import { PAYMENTS_ENABLED } from "@/lib/payments-enabled";
import { ResendNotifier } from "./resend-notifier";
import { shouldNotify } from "./should-notify";
import type { Notifier } from "./notifier";
import type { DbClient } from "@/lib/supabase/db-client";

/** The booking columns the send is gated on and built from. */
const CONFIRMATION_COLUMNS =
  "status, starts_at, ends_at, final_cents, profiles(email, full_name, unclaimed), services(name)";

const confirmationRowSchema = z.object({
  status: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  final_cents: z.number(),
  profiles: z
    .object({
      email: z.string().nullable(),
      full_name: z.string().nullable(),
      unclaimed: z.boolean().nullable(),
    })
    .nullable(),
  services: z.object({ name: z.string() }).nullable(),
});

/** The two refund settings the email quotes — read, never hardcoded. */
const confirmationSettingsSchema = z.object({
  cancellation_full_refund_hours: z.number(),
  late_cancel_refund_pct: z.number(),
});

/** Derived from the schema that parses the result, so the two cannot drift. */
const CONFIRMATION_SETTINGS_COLUMNS = Object.keys(
  confirmationSettingsSchema.shape,
).join(", ");

/**
 * Send the mail `bookingId`'s stored status calls for, to a client who takes
 * automated mail. `notifier` is injectable for tests; the default routes to
 * Resend.
 */
export async function sendBookingConfirmationFor(
  serviceClient: DbClient,
  bookingId: string,
  notifier: Notifier = new ResendNotifier(),
): Promise<void> {
  try {
    const { data, error } = await serviceClient
      .from("bookings")
      .select(CONFIRMATION_COLUMNS)
      .eq("id", bookingId)
      .single();

    if (error) {
      console.error(
        `sendBookingConfirmationFor: failed to load booking ${bookingId}: ${error.message}`,
      );
      return;
    }

    const parsed = confirmationRowSchema.safeParse(data);
    if (!parsed.success) {
      console.error(
        `sendBookingConfirmationFor: unexpected booking row for ${bookingId}: ${parsed.error.message}`,
      );
      return;
    }
    const row = parsed.data;

    // Only two statuses have an email of their own. Anything else — declined,
    // cancelled, completed — is announced by whatever path set it, if at all.
    if (row.status !== "confirmed" && row.status !== "pending_approval") return;

    // `profiles.email` is nullable in the database, so an address is something
    // to check for rather than something the row schema can promise.
    const client = row.profiles;
    if (!client?.email) {
      console.error(
        `sendBookingConfirmationFor: booking ${bookingId} has no client email address — skipping`,
      );
      return;
    }

    if (row.status === "pending_approval") {
      // Cal hears about the request whoever the client is: the suppression
      // below is about mail TO the client, not about Cal's own queue.
      await notifier.notify({
        type: "booking_requested",
        payload: {
          bookingId,
          clientName: client.full_name ?? client.email,
          clientEmail: client.email,
          serviceName: row.services?.name ?? "Booking",
          startsAt: new Date(row.starts_at),
          endsAt: new Date(row.ends_at),
          finalCents: row.final_cents,
        },
      });

      if (!shouldNotify(client)) return;

      await notifier.notify({
        type: "booking_received",
        payload: {
          to: client.email,
          serviceName: row.services?.name ?? "Booking",
          startsAt: new Date(row.starts_at),
          endsAt: new Date(row.ends_at),
          finalCents: row.final_cents,
        },
      });
      return;
    }

    // Unclaimed shadow accounts (Cal-created, not yet claimed) get no automated
    // mail — Cal handles their comms by hand until they claim.
    if (!shouldNotify(client)) return;

    const { data: rawSettings, error: settingsErr } = await serviceClient
      .from("settings")
      .select(CONFIRMATION_SETTINGS_COLUMNS)
      .limit(1)
      .single();

    const settings = confirmationSettingsSchema.safeParse(rawSettings);
    if (settingsErr || !settings.success) {
      console.error(
        `sendBookingConfirmationFor: failed to load settings for booking ${bookingId}: ${settingsErr?.message ?? "unexpected settings row"}`,
      );
      return;
    }

    await notifier.notify({
      type: "booking_confirmed",
      payload: {
        to: client.email,
        serviceName: row.services?.name ?? "Booking",
        startsAt: new Date(row.starts_at),
        endsAt: new Date(row.ends_at),
        finalCents: row.final_cents,
        cancellationFullRefundHours:
          settings.data.cancellation_full_refund_hours,
        lateCancelRefundPct: settings.data.late_cancel_refund_pct,
        paymentsEnabled: PAYMENTS_ENABLED,
      },
    });
  } catch (e: unknown) {
    console.error(
      `sendBookingConfirmationFor: error sending the confirmation for booking ${bookingId}:`,
      e,
    );
  }
}
