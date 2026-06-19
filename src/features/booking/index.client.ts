// Client-safe public API of the booking feature.
//
// Why this exists (see docs/adr/0002-client-server-entry-points.md):
// `index.ts` is the full server barrel. It statically re-exports non-action
// modules that `import "server-only"` (e.g. `booking-form-data`), which an
// un-tree-shakeable side-effect drags into the browser bundle when a
// `"use client"` file imports the barrel — breaking `npm run build`.
//
// This client entry re-exports ONLY the client-safe surface: client
// components, hooks, pure types/utils, and `"use server"` action functions
// (safe from client code — they become RPC references, never bundled).
// It deliberately EXCLUDES non-action server-only modules:
//   - `loadBookingFormData` / `booking-form-data` (imports "server-only")
//   - `createSupabaseBookingRepository` (server repo factory)
//   - `runSeriesRollCron` (server cron orchestration)
// `"use client"` files import from here; server code imports `index.ts`.

// actions ("use server" — RPC-safe from client)
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

// Requirement gate (pure types + reverse-map helper — all client-safe)
export type {
  RequirementItem,
  RequirementStatus,
  RequiredFormKey,
  AccountFormKey,
  PetFormKey,
} from "./required-profiles";
export { bookingRequirements, servicesRequiring } from "./required-profiles";

// booking-repository (types only — repo factory is server-only surface)
export { onboardingStatusSchema } from "./booking-repository";
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
export { usePremiumDays } from "./use-premium-days";

// scheduler data
export { hourlySchedulerData } from "./hourly-scheduler-data";

// inspect-scheduler — read-only SchedulerData builder for the admin Bookings hub
export { buildInspectSchedulerData, inspectDayKeys } from "./inspect-scheduler";

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

// busy-ranges (type only — loader uses supabase service)
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

// BookingFlow — shared stepped-booking layout for the three booking surfaces.
export {
  BookingFlow,
  BookingFlowStepHead,
  BookingSuccessPanel,
} from "./_components/booking-flow";
export type {
  BookingFlowState,
  BookingFlowProps,
  BookingSuccessPanelProps,
} from "./_components/booking-flow";

// NotesForCalSection — shared "Notes for Cal" step (bounded textarea + counter)
// used by all three booking surfaces.
export { NotesForCalSection } from "./_components/notes-for-cal-field";

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

// booking-form-data (type only — loader is server-only, EXCLUDED)
export type { BookingFormData } from "./booking-form-data";

// pet-step heading helper
export { petStepHeading } from "./pet-step-heading";

// client-can-edit
export { clientCanEditBooking, editLockCopy } from "./client-can-edit";
export type { EditabilityInput } from "./client-can-edit";

// calendar-model
export { validateStayRange } from "./calendar-model";

// quantity-state-from-quote-inputs
export { quantityStateFromQuoteInputs } from "./quantity-state-from-quote-inputs";

// service-detail
export type { ServiceDetail } from "./service-detail";

// services-repo (type only — loader uses supabase)
export type { PublicService } from "./services-repo";

// service-card-display
export {
  serviceCardDescription,
  serviceCardDurationLabel,
} from "./service-card-display";

// preview-edit ("use server")
export { previewEdit } from "./preview-edit";

// preview-quote-for-client ("use server")
export { previewQuoteForClient } from "./preview-quote-for-client";

// quote-action ("use server")
export { previewQuote } from "./quote-action";
export type { PreviewActionResult } from "./quote-action";

// diff-booking-patch
export { diffBookingPatch } from "./diff-booking-patch";

// scheduler-context
export { useScheduler } from "./scheduler-context";

// use-booking-scheduler — shared scheduler substrate for the three booking surfaces.
export { useBookingScheduler, localDateFromKey } from "./use-booking-scheduler";
export type {
  BookingMode,
  BookingSelectionInput,
  UseBookingSchedulerInput,
  UseBookingSchedulerReturn,
} from "./use-booking-scheduler";
