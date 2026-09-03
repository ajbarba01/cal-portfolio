// Server-side public API of the booking feature.
//
// Server code imports this barrel; `"use client"` files import index.client.ts
// (see docs/adr/0002-client-server-entry-points.md). The two entries share the
// pure surface and are sourced from the same modules, so a name means the same
// thing on both sides.
//
// This entry deliberately carries NO client components, hooks or server
// actions: they have no server caller, and re-exporting them here put
// react-day-picker, Stripe and Resend in the import graph of every server
// module that reached the barrel.

// booking-service
export { cancelBookingCore, EDITABLE_STATUSES } from "./booking-service";
export type {
  BookingQuotePreview,
  EditBookingPatch,
  CreateBookingResult,
} from "./booking-service";

// manual discounts (pure helper — server-safe; the rest of the module is
// feature-internal, imported directly by the cores that re-price a booking)
export { manualDiscountRows } from "./manual-discounts";
export type { ManualDiscountRow } from "./manual-discounts";

// booking-repository
export { createSupabaseBookingRepository } from "./booking-repository";
export { onboardingStatusSchema } from "./booking-repository-types";
export type {
  OnboardingStatus,
  BookingStatusDb,
} from "./booking-repository-types";

// availability
export {
  denverMidnight,
  denverDayKey,
  denverMinutesSinceMidnight,
  fitsWindow,
} from "./availability";
export type { BookingRuleSettings, TimeRange } from "./availability";

// state-machine
export { bookingStatusPill, transition } from "./state-machine";
export type {
  BookingEvent,
  BookingStatus,
  BookingStatusPill,
  BookingStatusPillVariant,
} from "./state-machine";

// scheduler data
export { hourlySchedulerData } from "./hourly-scheduler-data";

// schedule-capabilities
export {
  BOOK_WALK_CAPABILITIES,
  BOOK_HOUSE_SITTING_CAPABILITIES,
  ADMIN_CAPABILITIES,
  INSPECT_CAPABILITIES,
} from "./schedule-capabilities";
export type { SchedulerCapabilities } from "./schedule-capabilities";

// schedule-selection
export type { ScheduleSelectionState } from "./schedule-selection";

// busy-ranges
export type { PublicBusyRange } from "./busy-ranges";

// quantities (pure state shapes + wire conversion; the form is client-only)
export { defaultQuantities, quantitiesToRecord } from "./quantities";
export type { QuantityState } from "./quantities";

// meet-greet-upcoming
export { deriveMeetGreetUpcoming } from "./meet-greet-upcoming";
export type { MeetGreetBookingRow } from "./meet-greet-upcoming";

// booking-form-data
export { loadBookingFormData } from "./booking-form-data";
export type { BookingFormData } from "./booking-form-data";

// client-can-edit
export { clientCanEditBooking, editLockCopy } from "./client-can-edit";
export type { EditabilityInput } from "./client-can-edit";

// client-can-cancel
export { clientCanCancelBooking, cancelLockCopy } from "./client-can-cancel";
export type {
  CancellabilityInput,
  CancelBlockReason,
} from "./client-can-cancel";

// calendar-model
export { validateStayRange } from "./calendar-model";

// quantity-state-from-quote-inputs
export { quantityStateFromQuoteInputs } from "./quantity-state-from-quote-inputs";

// service-detail
export type { ServiceDetail } from "./service-detail";
export {
  DEFAULT_CONSTRAINTS,
  SERVICE_DETAIL_COLUMNS,
  toServiceDetail,
} from "./service-detail";

// load-service-booking-page
export { loadServiceBookingPage } from "./load-service-booking-page";
export type {
  AuthState,
  LoadServiceBookingPageResult,
  ServiceBookingPageData,
  ServiceBookingViewer,
  StoredFormResponse,
} from "./load-service-booking-page";

// booking-edit-view
export { getBookingEditView } from "./booking-edit-view";
export type {
  BookingEditSeed,
  BookingEditView,
  BookingEditViewResult,
} from "./booking-edit-view";

// services-repo
export { listActiveServices } from "./services-repo";
export type { PublicService } from "./services-repo";

// service-card-display
export {
  serviceCardDescription,
  serviceCardDurationLabel,
  serviceDetailLedeCopyId,
  serviceDetailBodyCopyId,
  serviceIncludedCopyIds,
} from "./service-card-display";

// quote-action (the action itself is client-called — index.client.ts)
export type { PreviewActionResult } from "./quote-action";

// diff-booking-patch
export { diffBookingPatch } from "./diff-booking-patch";

// crons
export { runSeriesRollCron } from "./series-cron";
export { runCompletionCron } from "./completion-cron";

// drive-buffer
export { driveBufferMinutes } from "./drive-buffer";
export type { DriveBufferConfig } from "./drive-buffer";
