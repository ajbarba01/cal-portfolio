"use server";

/**
 * Read-only preview of what a client self-cancel would do RIGHT NOW. Computed
 * server-side with a fresh clock so the refund tier is correct at the cutoff
 * boundary. Performs no writes. Ownership is verified against the session user;
 * the id is never trusted from the payload for authorization.
 */

import { redirect } from "next/navigation";
import { netPaid } from "@/features/payments";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createSupabaseBookingRepository } from "./booking-repository";
import { previewCancellation, type CancellationOutcome } from "./cancellation";

export type PreviewCancellationResult =
  | { kind: "ok"; outcome: CancellationOutcome }
  | { kind: "not_found" }
  | { kind: "forbidden" };

export async function previewBookingCancellation(
  bookingId: string,
): Promise<PreviewCancellationResult> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) redirect("/login");

  const serviceClient = createServiceClient();
  const repo = createSupabaseBookingRepository(serviceClient);

  const booking = await repo.getBookingWithPayments(bookingId);
  if (!booking) return { kind: "not_found" };
  if (booking.client_id !== user.id) return { kind: "forbidden" };

  const settings = await repo.getSettings();
  const paidCents = netPaid(booking.payments);

  const outcome = previewCancellation({
    finalCents: booking.finalCents,
    paidCents,
    startsAt: booking.startsAt,
    now: new Date(),
    fullRefundHours: settings.cancellation_full_refund_hours,
    lateRefundPct: settings.late_cancel_refund_pct,
    noShowChargePct: settings.no_show_charge_pct,
  });

  return { kind: "ok", outcome };
}
