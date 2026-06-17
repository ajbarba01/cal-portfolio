// Public API of the booking feature.

// actions
export {
  createBooking,
  rescheduleBooking,
  cancelBooking,
  markNoShow,
  editBooking,
  createBookingForClient,
  setKicheApplied,
} from "./actions";

// booking-service
export { cancelBookingCore, EDITABLE_STATUSES } from "./booking-service";
export type {
  BookingQuotePreview,
  EditBookingPatch,
  CreateBookingResult,
} from "./booking-service";

// kiche discount (pure helpers — server-safe)
export {
  serviceSupportsKiche,
  requoteWithKiche,
  kicheOverpayRefundCents,
  kichePreview,
} from "./kiche";
export type { KichePreview } from "./kiche";

// booking-repository
export {
  createSupabaseBookingRepository,
  onboardingStatusSchema,
} from "./booking-repository";
export type { OnboardingStatus, BookingStatusDb } from "./booking-repository";

// availability
export {
  denverMidnight,
  denverDayKey,
  denverMinutesSinceMidnight,
  fitsWindow,
} from "./availability";
export type { BookingRuleSettings, TimeRange } from "./availability";

// state-machine
export { transition } from "./state-machine";
export type { BookingEvent, BookingStatus } from "./state-machine";

// hooks
export { useAvailability } from "./use-availability";
export { useBusyRanges } from "./use-busy-ranges";
export { useOvernightNights } from "./use-overnight-nights";

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

// return-to
export { safeReturnTo, buildReturnTo } from "./return-to";

// Scheduler component
export { Scheduler } from "./_components/scheduler";
export type {
  SchedulerData,
  SchedulerCallbacks,
  BusyBlock,
} from "./_components/scheduler";

// Other components
export { PetAssignment } from "./_components/pet-assignment";
export type { AssignablePet } from "./_components/pet-assignment";
export type { PetSpecies } from "./_components/pet-avatar";
export { PetAvatar } from "./_components/pet-avatar";
export {
  QuantityForm,
  defaultQuantities,
  quantitiesToRecord,
} from "./_components/quantity-forms";
export type { QuantityState } from "./_components/quantity-forms";
export { QuotePanel } from "./_components/quote-panel";

// meet-greet-upcoming
export * from "./meet-greet-upcoming";

// booking-form-data
export { loadBookingFormData } from "./booking-form-data";
export type { BookingFormData } from "./booking-form-data";

// client-can-edit
export { clientCanEditBooking, editLockCopy } from "./client-can-edit";
export type { EditabilityInput } from "./client-can-edit";

// calendar-model
export { validateStayRange } from "./calendar-model";

// quantity-state-from-quote-inputs
export { quantityStateFromQuoteInputs } from "./quantity-state-from-quote-inputs";

// service-detail
export type { ServiceDetail } from "./service-detail";

// services-repo
export { listActiveServices } from "./services-repo";
export type { PublicService } from "./services-repo";

// service-card-display
export {
  serviceCardDescription,
  serviceCardDurationLabel,
  serviceCategoryCopyId,
  serviceDetailLedeCopyId,
  serviceDetailBodyCopyId,
  serviceIncludedCopyIds,
} from "./service-card-display";

// preview-edit
export { previewEdit } from "./preview-edit";

// preview-quote-for-client
export { previewQuoteForClient } from "./preview-quote-for-client";

// quote-action
export { previewQuote } from "./quote-action";
export type { PreviewActionResult } from "./quote-action";

// diff-booking-patch
export { diffBookingPatch } from "./diff-booking-patch";

// series-cron
export { runSeriesRollCron } from "./series-cron";

// scheduler-context
export { useScheduler } from "./scheduler-context";
