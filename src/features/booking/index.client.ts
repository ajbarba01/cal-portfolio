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
  setManualApplied,
} from "./actions";

// booking-service
export { cancelBookingCore, EDITABLE_STATUSES } from "./booking-service";
export type {
  BookingQuotePreview,
  EditBookingPatch,
  CreateBookingResult,
} from "./booking-service";

// manual discounts (type only — the rows are computed on the server)
export type { ManualDiscountRow } from "./manual-discounts";

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
// The taxonomy itself belongs to the pets feature; re-exported here so the
// booking surfaces keep one import for the whole scheduler input.
export type { PetSpecies } from "@/features/pets";
export { QuantityForm } from "./_components/quantity-forms";
export { QuotePanel } from "./_components/quote-panel";
export { QuoteLines } from "./_components/quote-lines";
export type { StoredQuoteBreakdown } from "./_components/quote-lines";
export { RecurringControls } from "./_components/recurring-controls";
export { EditBookingClient } from "./_components/edit-booking-client";
export type { EditBookingInitial } from "./_components/edit-booking-client";

// quantities (pure state shapes + wire conversion)
export { defaultQuantities, quantitiesToRecord } from "./quantities";
export type { QuantityState } from "./quantities";

// meet-greet-upcoming
export { deriveMeetGreetUpcoming } from "./meet-greet-upcoming";
export type { MeetGreetBookingRow } from "./meet-greet-upcoming";

// booking-form-data (type only — loader is server-only, EXCLUDED)
export type { BookingFormData } from "./booking-form-data";

// pet-step heading helper
export { petStepHeading } from "./pet-step-heading";

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

// return-to (booking-selection → relative path; the guard is @/lib/return-to)
export { buildReturnTo } from "./return-to";
export type { BookingSelection } from "./return-to";

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

// preview-cancellation ("use server")
export { previewBookingCancellation } from "./preview-cancellation";
export type { PreviewCancellationResult } from "./preview-cancellation";

// cancellation (pure refund/debt math — client-safe types)
export type { CancellationOutcome } from "./cancellation";

// quote-action ("use server")
export { previewQuote } from "./quote-action";
export type { PreviewActionResult } from "./quote-action";

// diff-booking-patch
export { diffBookingPatch } from "./diff-booking-patch";

// scheduler-context
export { useScheduler } from "./scheduler-context";

// use-booking-scheduler — shared scheduler substrate for the three booking surfaces.
export {
  useBookingScheduler,
  localDateFromKey,
  RECURRING_UI_ENABLED,
} from "./use-booking-scheduler";
export type {
  BookingMode,
  BookingSelectionInput,
  UseBookingSchedulerInput,
  UseBookingSchedulerReturn,
} from "./use-booking-scheduler";
