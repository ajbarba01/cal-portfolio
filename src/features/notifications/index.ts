// Public API of the notifications feature.
export { ResendMailer } from "./resend-mailer";
export { ResendNotifier } from "./resend-notifier";
export { notifyAdmin, notifyAdminOfCancellation } from "./admin-alerts";
export { sendBookingConfirmationFor } from "./booking-confirmation";
export { runReminderCron } from "./reminder-cron";
export { shouldNotify } from "./should-notify";
export type { Mailer, SendResult, EmailMessage } from "./types";
export type {
  AdminAlertDispatch,
  AdminAlertEvent,
  ClientNotificationEvent,
  NotificationEvent,
  Notifier,
} from "./notifier";
