// Public API of the admin feature.

// availability-actions
export {
  listWindows,
  listWindowsCore,
  createWindow,
  trimWindow,
  deleteWindow,
  createWindowsBatch,
  setWindowUnavailable,
} from "./availability-actions";
export type {
  AvailabilityWindow,
  AvailabilityResult,
  ListWindowsResult,
  SetWindowUnavailableResult,
  ConflictBooking,
} from "./availability-actions";

// overnight-actions
export {
  listOvernightNights,
  listOvernightNightsCore,
  setOvernightNightsBatch,
} from "./overnight-actions";
export type { SetOvernightNightsResult } from "./overnight-actions";

// admin-busy
export { getAdminBusyRanges } from "./admin-busy";
export type { AdminBusyRangeView, AdminBusyResult } from "./admin-busy";

// bookings-calendar-actions
export { listBookingsInRange } from "./bookings-calendar-actions";
export type { BookingCalendarRow } from "./bookings-calendar-actions";

// approval-actions
export {
  listPendingBookings,
  approveBooking,
  declineBooking,
} from "./approval-actions";
export type { PendingBookingRow, ApprovalResult } from "./approval-actions";

// clients-actions
export {
  listClients,
  getClientDetail,
  setKicheAllowed,
  settleDebit,
  setOnboardingStatus,
} from "./clients-actions";
export type {
  ClientListRow,
  ClientDetailView,
  GetClientDetailResult,
  ClientBookingRow,
  ClientDebitRow,
  ClientPet,
} from "./clients-actions";

// client-search
export { matchesClientQuery } from "./client-search";

// onboarding-badge
export {
  onboardingStatusLabel,
  onboardingStatusBadgeVariant,
} from "./onboarding-badge";
export type { OnboardingBadgeVariant } from "./onboarding-badge";

// reviews-actions
export {
  listReviews,
  listReviewsCore,
  moderateReview,
} from "./reviews-actions";
export type { ReviewRow, ReviewStatus } from "./reviews-actions";

// services-actions
export {
  listServices,
  listServicesCore,
  updateService,
} from "./services-actions";
export type { ServiceAdminRow } from "./services-actions";

// settings-actions
export {
  getSettings,
  getSettingsCore,
  updateSettings,
} from "./settings-actions";
export type { SettingsRow } from "./settings-actions";

// settings-schema
export type { SettingsUpdate } from "./settings-schema";

// components
export { OnboardingStatusSelect } from "./_components/onboarding-status-select";

// onbehalf-actions
export {
  adminCreatePet,
  adminCreatePetCore,
  adminUpdatePet,
  adminUpdatePetCore,
  adminSubmitForm,
  adminSubmitFormCore,
  adminUploadPetPhoto,
  adminUploadPetPhotoCore,
} from "./onbehalf-actions";
export type {
  AdminCreatePetResult,
  AdminActionResult,
} from "./onbehalf-actions";

// premium-days-actions
export {
  togglePremiumDate,
  setPremiumDayCore,
  setPremiumDay,
} from "./premium-days-actions";

// attention-counts (typed seam — SP5 wires real counts)
export type { AttentionCounts } from "./attention-counts";
export { emptyAttentionCounts } from "./attention-counts";
