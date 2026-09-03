/**
 * Notifier — application-level notification seam (ADR-0004).
 *
 * Defines the event vocabulary for every notification the app sends, in two
 * halves: the emails a client receives, and the alerts Cal receives. Only
 * events that are actually sent today are modelled here (YAGNI) — add a
 * variant when its template exists, not before.
 *
 * The admin half is inert until `ADMIN_NOTIFICATION_EMAIL` is set; the gate
 * lives in `notifyAdmin` (admin-alerts.ts), so emitting an admin event from a
 * call site is safe whether or not Cal's address is configured.
 */

import type {
  BookingCancelledAlertInput,
  BookingConfirmationInput,
  BookingReceivedInput,
  BookingRequestAlertInput,
  InquiryAlertInput,
} from "./emails";

/** What a client is told: their request landed, and later that it is confirmed. */
export type ClientNotificationEvent =
  | { type: "booking_confirmed"; payload: BookingConfirmationInput }
  | { type: "booking_received"; payload: BookingReceivedInput };

/** What Cal is told: the three things that need him to look at the admin side. */
export type AdminAlertEvent =
  | { type: "booking_requested"; payload: BookingRequestAlertInput }
  | { type: "inquiry_received"; payload: InquiryAlertInput }
  | { type: "booking_cancelled"; payload: BookingCancelledAlertInput };

export type NotificationEvent = ClientNotificationEvent | AdminAlertEvent;

/** Dispatches one admin alert. The shape `notifyAdmin` satisfies. */
export type AdminAlertDispatch = (event: AdminAlertEvent) => Promise<void>;

export interface Notifier {
  notify(event: NotificationEvent): Promise<void>;
}
