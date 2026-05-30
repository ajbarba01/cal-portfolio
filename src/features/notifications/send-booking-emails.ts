/**
 * Helper that wires the pure email builder to the Mailer interface.
 *
 * Returns SendResult — never throws. Callers wrap in try/catch for
 * best-effort logging if even this returns ok:false.
 */

import { buildBookingConfirmationEmail } from "./emails";
import type { Mailer, SendResult } from "./types";

export interface BookingConfirmationDetails {
  to: string;
  serviceName: string;
  startsAt: Date;
  endsAt: Date;
  finalCents: number;
}

export async function sendBookingConfirmation(
  mailer: Mailer,
  details: BookingConfirmationDetails,
): Promise<SendResult> {
  const msg = buildBookingConfirmationEmail(details);
  return mailer.send(msg);
}
