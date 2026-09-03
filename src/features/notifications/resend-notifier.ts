import "server-only";

/**
 * ResendNotifier — default Notifier implementation.
 *
 * Builds the message for the event and hands it to a Mailer: client emails go
 * to the address the event carries, admin alerts go through `notifyAdmin`,
 * which owns the address gate and sends nothing while it is unset.
 *
 * Best-effort by contract: every failure is logged and swallowed, so no
 * booking or approval fails because its email did not go out.
 *
 * The Mailer is constructor-injectable and constructed lazily, so tests never
 * trigger ResendMailer's env-var assertions.
 */

import { notifyAdmin } from "./admin-alerts";
import {
  buildBookingConfirmationEmail,
  buildBookingReceivedEmail,
} from "./emails";
import { ResendMailer } from "./resend-mailer";
import type {
  ClientNotificationEvent,
  NotificationEvent,
  Notifier,
} from "./notifier";
import type { Mailer } from "./types";

export interface ResendNotifierDeps {
  mailer?: Mailer;
}

export class ResendNotifier implements Notifier {
  private readonly _mailer: Mailer | undefined;

  constructor(deps: ResendNotifierDeps = {}) {
    this._mailer = deps.mailer;
  }

  async notify(event: NotificationEvent): Promise<void> {
    switch (event.type) {
      case "booking_confirmed":
      case "booking_received":
        return this.sendToClient(event);
      default:
        return notifyAdmin(event, this._mailer);
    }
  }

  private async sendToClient(event: ClientNotificationEvent): Promise<void> {
    try {
      const msg =
        event.type === "booking_confirmed"
          ? buildBookingConfirmationEmail(event.payload)
          : buildBookingReceivedEmail(event.payload);
      const result = await (this._mailer ?? new ResendMailer()).send(msg);
      if (!result.ok) {
        console.error(
          `ResendNotifier: ${event.type} email failed: ${result.error}`,
        );
      }
    } catch (e: unknown) {
      console.error(
        `ResendNotifier: error sending the ${event.type} email:`,
        e,
      );
    }
  }
}
