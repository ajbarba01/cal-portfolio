// Public API of the admin feature.

// availability-actions
export {
  listWindowsCore,
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
  listOvernightNightsCore,
  setOvernightNightsBatch,
} from "./overnight-actions";
export type { SetOvernightNightsResult } from "./overnight-actions";

// window-slice (pure predicate for the availability painter's cancel gate)
export { bookingsInWindowSlice } from "./window-slice";

// admin-busy
export { getAdminBusyRanges } from "./admin-busy";
export type { AdminBusyRangeView, AdminBusyResult } from "./admin-busy";

// bookings-calendar-actions
export { listBookingsInRange } from "./bookings-calendar-actions";
export type { BookingCalendarRow } from "./bookings-calendar-actions";

// approval-actions
export { approveBooking, declineBooking } from "./approval-actions";
export type { ApprovalResult } from "./approval-actions";

// clients-actions
export {
  listClients,
  getClientDetail,
  settleDebit,
  waiveDebit,
  adjustDebit,
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

// create-client-actions
export {
  createUnclaimedClient,
  generateClaimLink,
} from "./create-client-actions";
export type {
  CreateClientInput,
  CreateClientResult,
  GenerateClaimLinkResult,
} from "./create-client-actions";

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
export { listServicesCore, updateService } from "./services-actions";
export type { ServiceAdminRow, UpdateServiceInput } from "./services-actions";

// settings-actions
export {
  getSettings,
  getSettingsCore,
  updateSettings,
} from "./settings-actions";
export type { SettingsResult } from "./settings-actions";

// settings-schema
export { settingsRowSchema, settingsColumns } from "./settings-schema";
export type { SettingsRow, SettingsUpdate } from "./settings-schema";

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

// premium-days-pure (no "use server" — pure helper only)
export { togglePremiumDate } from "./premium-days-pure";

// premium-days-actions
export {
  setPremiumDayCore,
  setPremiumDaysBatchCore,
  setPremiumDaysBatch,
} from "./premium-days-actions";

// pricing-config-fields (pure helpers for the modifier-aware pricing editor)
export {
  deriveEditableFields,
  setLeaf,
  validateEditableFields,
} from "./pricing-config-fields";
export type {
  PricingEditField,
  PricingFieldKind,
} from "./pricing-config-fields";

// attention-counts (typed seam — SP5 wires real counts)
export type { AttentionCounts } from "./attention-counts";
export { emptyAttentionCounts } from "./attention-counts";

// attention-counts-query (server-only: fetches live counts for admin layout)
export { getAttentionCounts } from "./attention-counts-query";

// nav-badges-action (server action: counts for the client-resolved header)
export { fetchAttentionCounts } from "./nav-badges-action";

// header-role (the header's browser-side role read)
export { readHeaderRole } from "./header-role";
export type { HeaderRole } from "./header-role";

// bookings-view (pure predicates)
export { filterBookings, daysWithMatch, isolate } from "./bookings-view";
export type { BookingStatusFilter } from "./bookings-view";

// clients-view (pure predicates)
export {
  applyClientFilter,
  sortClients,
  MEET_GREET_SLUG,
} from "./clients-view";
export type { ClientFilter, ClientSortKey, SortDir } from "./clients-view";
