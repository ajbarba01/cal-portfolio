/**
 * Notifier — application-level notification seam.
 *
 * Defines the event vocabulary for all notifications sent by the app.
 * Only events that are actually sent today are modelled here (YAGNI).
 *
 * Future events (e.g. booking_cancelled) are intentionally omitted;
 * add them here and in ResendNotifier when the email exists.
 */

import type { BookingConfirmationDetails } from "./send-booking-emails";

// Re-export the payload type under the Notifier vocabulary name so
// callers do not need to import from send-booking-emails directly.
export type BookingConfirmedPayload = BookingConfirmationDetails;

export type NotificationEvent = {
  type: "booking_confirmed";
  payload: BookingConfirmedPayload;
};

export interface Notifier {
  notify(event: NotificationEvent): Promise<void>;
}
