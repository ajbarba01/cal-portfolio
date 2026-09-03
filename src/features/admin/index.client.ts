// Client-safe public API of the admin feature.
//
// Why this exists (see docs/adr/0002-client-server-entry-points.md):
// `index.ts` is the full server barrel. It statically re-exports non-action
// modules that reach `import "server-only"` — `attention-counts-query`
// (→ `lib/admin-session` → `lib/supabase/server-cache`, and
// `lib/supabase/service`) — an un-tree-shakeable side effect that a
// `"use client"` importer of the barrel drags into the browser graph,
// breaking `npm run build`.
//
// This client entry re-exports ONLY the client-safe surface: the client
// component, pure predicates/helpers, types, and `"use server"` action
// functions (safe from client code — they become RPC references, never
// bundled). It deliberately EXCLUDES the non-action server-only modules:
//   - `getAttentionCounts` / `attention-counts-query` (server-only reads)
//   - the `*Core` dep-injected functions, which take a service-role client
// `"use client"` files import from here; server code imports `index.ts`.

// availability-actions ("use server" — RPC-safe from client)
export {
  createWindowsBatch,
  setWindowUnavailable,
} from "./availability-actions";
export type {
  AvailabilityWindow,
  AvailabilityResult,
  SetWindowUnavailableResult,
} from "./availability-actions";

// overnight-actions ("use server")
export { setOvernightNightsBatch } from "./overnight-actions";
export type { SetOvernightNightsResult } from "./overnight-actions";

// premium-days-actions ("use server")
export { setPremiumDaysBatch } from "./premium-days-actions";

// window-slice (pure predicate for the availability painter's cancel gate)
export { bookingsInWindowSlice } from "./window-slice";

// admin-busy (type only — the loader is server-only surface)
export type { AdminBusyRangeView } from "./admin-busy";

// bookings-calendar-actions (type only — the loader is server-only surface)
export type { BookingCalendarRow } from "./bookings-calendar-actions";

// approval-actions ("use server")
export { approveBooking, declineBooking } from "./approval-actions";

// clients-actions ("use server")
export { settleDebit, waiveDebit, adjustDebit } from "./clients-actions";
export type { ClientDetailView, ClientListRow } from "./clients-actions";

// create-client-actions ("use server")
export {
  createUnclaimedClient,
  generateClaimLink,
} from "./create-client-actions";

// client-search (pure)
export { matchesClientQuery } from "./client-search";

// reviews-actions ("use server")
export { moderateReview } from "./reviews-actions";
export type { ReviewRow, ReviewStatus } from "./reviews-actions";

// services-actions ("use server")
export { updateService } from "./services-actions";
export type { ServiceAdminRow, UpdateServiceInput } from "./services-actions";

// settings-actions ("use server")
export { updateSettings } from "./settings-actions";
export type { SettingsResult } from "./settings-actions";

// settings-schema (pure zod)
export type { SettingsRow } from "./settings-schema";

// components
export { BookingDayTimeline } from "./_components/booking-day-timeline";
export { OnboardingStatusSelect } from "./_components/onboarding-status-select";

// onbehalf-actions ("use server")
export {
  adminCreatePet,
  adminUpdatePet,
  adminSubmitForm,
  adminUploadPetPhoto,
} from "./onbehalf-actions";

// pricing-config-fields (pure helpers for the modifier-aware pricing editor)
export {
  deriveEditableFields,
  setLeaf,
  validateEditableFields,
} from "./pricing-config-fields";
export type { PricingEditField } from "./pricing-config-fields";

// nav-badges-action ("use server": counts for the client-resolved header)
export { fetchAttentionCounts } from "./nav-badges-action";

// header-role (the header's browser-side role read — display only)
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
