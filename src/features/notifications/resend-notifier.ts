import "server-only";

/**
 * ResendNotifier — default Notifier implementation.
 *
 * A thin pass-through: routes NotificationEvents to the existing Resend
 * senders. Zero behavior change — same emails, same data, same best-effort
 * semantics as the inline sends it replaces.
 *
 * Constructor-injected deps enable unit tests to stub the sender without
 * touching the Resend SDK or env vars.
 */

import { ResendMailer } from "./resend-mailer";
import { sendBookingConfirmation } from "./send-booking-emails";
import type { Notifier, NotificationEvent } from "./notifier";
import type { Mailer } from "./types";

type SendBookingConfirmationFn = typeof sendBookingConfirmation;

export interface ResendNotifierDeps {
  sendBookingConfirmation?: SendBookingConfirmationFn;
  /**
   * Optional Mailer override. When omitted, a ResendMailer is constructed
   * lazily on first notify() call so tests that inject sendBookingConfirmation
   * never trigger ResendMailer's env-var assertions.
   */
  mailer?: Mailer;
}

export class ResendNotifier implements Notifier {
  private readonly _send: SendBookingConfirmationFn;
  private readonly _mailerOverride: Mailer | undefined;

  constructor(deps: ResendNotifierDeps = {}) {
    this._send = deps.sendBookingConfirmation ?? sendBookingConfirmation;
    this._mailerOverride = deps.mailer;
  }

  async notify(event: NotificationEvent): Promise<void> {
    if (event.type === "booking_confirmed") {
      const mailer = this._mailerOverride ?? new ResendMailer();
      try {
        const result = await this._send(mailer, event.payload);
        if (!result.ok) {
          console.error(
            "ResendNotifier: confirmation email failed:",
            result.error,
          );
        }
      } catch (e: unknown) {
        console.error("ResendNotifier: error sending confirmation email:", e);
      }
    }
  }
}
