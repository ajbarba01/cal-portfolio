/**
 * The booking repository's type surface: the DB row shapes, the settings-row
 * schema that defines them, and the `BookingRepository` interface itself.
 *
 * Split out of booking-repository.ts so the contract can be imported without
 * the Supabase adapter that implements it (ENGINEERING #4). Nothing here
 * performs IO; booking-repository.ts re-exports every name below, so importing
 * from either path is equivalent.
 */

import { z } from "zod";
import type { PetSpecies } from "@/features/pets";
import type { PricingType } from "@/features/pricing";
import type { Json } from "@/lib/supabase/database.types";

// ──────────────────────────────────────────────────────────────────────────────
// Row shapes
// ──────────────────────────────────────────────────────────────────────────────

export type ConcurrencyClass = "exclusive" | "resident";

/**
 * Widens an app-produced object to the `Json` a jsonb column takes. The values
 * written to those columns are domain interfaces (`QuoteInput`,
 * `QuoteBreakdown`), and TypeScript does not assign an interface to `Json`'s
 * index signature, so the single cast that bridges the two lives here rather
 * than at each write site.
 */
export function asJson(value: object): Json {
  return value as unknown as Json;
}

/** Onboarding lifecycle status. Schema + type single-sourced so they stay in sync. */
export const onboardingStatusSchema = z.enum([
  "info_pending",
  "meet_greet_pending",
  "approved",
  "declined",
]);
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

/**
 * The `booking_status` Postgres enum. Schema + type single-sourced so a row
 * parse and the domain type cannot drift, and so no read has to cast the
 * column back to the union after validating it.
 */
export const bookingStatusDbSchema = z.enum([
  "pending_approval",
  "confirmed",
  "completed",
  "declined",
  "cancelled",
  "no_show",
]);
export type BookingStatusDb = z.infer<typeof bookingStatusDbSchema>;

export interface ServiceRow {
  id: string;
  slug: string;
  pricing_type: PricingType;
  pricing_config: unknown; // validated by parsePricingConfig before use
  concurrency: ConcurrencyClass;
  requires_approval: boolean;
  /** Null when the service has no required form. */
  form_key: string | null;
}

export interface ProfileLatLng {
  lat: number | null;
  lng: number | null;
}

export interface BookingInsert {
  client_id: string;
  service_id: string;
  starts_at: string; // ISO UTC
  ends_at: string; // ISO UTC
  series_id: string | null;
  status: BookingStatusDb;
  concurrency: ConcurrencyClass;
  distance_miles: number | null;
  /** jsonb column — widen the domain object with {@link asJson}. */
  quote_inputs: Json;
  /** jsonb column — widen the domain object with {@link asJson}. */
  quote_breakdown: Json;
  final_cents: number;
  requires_approval: boolean;
  discount_cents: number;
  /** Freeform client note for Cal. Null when not provided. */
  comments: string | null;
  /** Client consent that Kiche may tag along (default true). Never affects price. */
  kiche_welcome: boolean;
}

/**
 * A durable weekly-recurrence rule. `step_interval` is the DB column for the
 * rule's interval (the literal word `interval` is a Postgres type keyword).
 * `quote_inputs` is frozen at submit so every occurrence re-quotes identically.
 */
export interface BookingSeriesRow {
  id: string;
  client_id: string;
  service_id: string;
  freq: "weekly";
  step_interval: number;
  count: number | null;
  until: string | null; // ISO UTC
  open_ended: boolean;
  template_starts_at: string; // ISO UTC
  duration_min: number;
  quote_inputs: unknown;
  active: boolean;
  /** RFC 5545 EXDATE cadence starts (ISO UTC) removed by occurrence edits. */
  skipped_starts: string[];
}

/** Insert shape for a booking_series row (id/active/created_at are DB-defaulted). */
export interface BookingSeriesInsert {
  client_id: string;
  service_id: string;
  freq: "weekly";
  step_interval: number;
  count: number | null;
  until: string | null;
  open_ended: boolean;
  template_starts_at: string;
  duration_min: number;
  /** jsonb column — widen the domain object with {@link asJson}. */
  quote_inputs: Json;
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings row (schema + type — the select list is built from it by the adapter)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The settings columns the booking domain reads. One declaration: the row type,
 * the `select()` list and the parse all come from it, so adding a column is a
 * one-line change and the three can never disagree. The admin editor owns the
 * whole-row schema (`features/admin/settings-schema`); this is the booking
 * feature's own narrower copy because a feature may not import another
 * feature's internals.
 */
export const settingsRowSchema = z.object({
  origin_lat: z.number(),
  origin_lng: z.number(),
  road_factor: z.number(),
  avg_speed_mph: z.number(),
  auto_approve_threshold_miles: z.number(),
  hard_cutoff_miles: z.number(),
  gate_use_road_miles: z.boolean(),
  booking_open_minute: z.number(),
  booking_close_minute: z.number(),
  min_lead_time_hours: z.number(),
  auto_confirm_horizon_days: z.number(),
  hard_max_advance_days: z.number(),
  recurrence_generation_horizon_days: z.number(),
  recurring_discount_pct: z.number(),
  recurring_min_occurrences: z.number(),
  cancellation_full_refund_hours: z.number(),
  late_cancel_refund_pct: z.number(),
  no_show_charge_pct: z.number(),
  /** ISO "YYYY-MM-DD" day keys for premium (holiday) days. */
  holiday_dates: z.array(z.string()),
  /** Per-day surcharge (cents) for premium days. Applies to every service type. */
  holiday_surcharge_cents: z.number().int().nonnegative(),
  /** Percent of one-way drive time reserved as a scheduling buffer (120 = 1.2×). */
  drive_buffer_pct: z.number(),
});

/** The settings row as the booking domain sees it, all columns NOT NULL. */
export type SettingsRow = z.output<typeof settingsRowSchema>;

export interface BookingRow {
  id: string;
  client_id: string;
  status: BookingStatusDb;
}

/**
 * A single payment txn attached to a booking (for refund + paid-amount math).
 * Structurally a `PaymentTxn`, so the payments projections apply directly.
 */
export interface BookingPaymentTxn {
  status: "requires_payment" | "succeeded" | "refunded" | "failed";
  amountCents: number;
  /**
   * Cumulative cents already refunded against this txn. Without it every
   * "how much has been paid" sum reads gross, and the next refund over-requests.
   */
  refundedCents: number;
  paymentIntentId: string;
}

/** A booking joined with its payments — used by the cancel / refund path. */
export interface BookingWithPayments {
  id: string;
  client_id: string;
  status: BookingStatusDb;
  startsAt: Date;
  finalCents: number;
  payments: BookingPaymentTxn[];
}

/** Full shape needed to edit a booking in place. */
export interface BookingEditRow {
  id: string;
  client_id: string;
  service_slug: string;
  status: BookingStatusDb;
  startsAt: Date;
  endsAt: Date;
  series_id: string | null;
  comments: string | null;
  /** Stored QuoteInput (jsonb) — source of current quantities for re-quote. */
  quote_inputs: unknown;
  /** Currently-assigned pet ids (from booking_pets). */
  petIds: string[];
  /** Sum of succeeded payment cents (0 or final_cents under prepay-full). */
  paidCents: number;
  /** Whether Cal applied the Kiche discount — preserved across a re-quote. */
  kiche_applied: boolean;
}

/** Fields an edit may update on the bookings row. */
export interface BookingEditUpdate {
  starts_at: string; // ISO UTC
  ends_at: string; // ISO UTC
  status: BookingStatusDb;
  /** jsonb column — widen the domain object with {@link asJson}. */
  quote_inputs: Json;
  /** jsonb column — widen the domain object with {@link asJson}. */
  quote_breakdown: Json;
  final_cents: number;
  requires_approval: boolean;
  comments: string | null;
  /** Set to null to detach from a series. */
  series_id: string | null;
}

/** Debit reason, mirrors the client_debits CHECK constraint. */
export type DebitReason = "late_cancel" | "no_show";

export interface ClientDebitInsert {
  client_id: string;
  booking_id: string | null;
  amount_cents: number;
  reason: DebitReason;
}

/**
 * Species as stored in the `pets` table. The DB enum carries every value in
 * {@link PetSpecies}, so this is that type — narrowing it here made any pet
 * outside dog/cat unparseable and took both calendars down.
 */
export type PetSpeciesDb = PetSpecies;

/** A pet owned by the caller, used to derive server-trusted booking counts. */
export interface PetRef {
  id: string;
  species: PetSpeciesDb;
  birthdate: string | null;
}

/** One form_responses row reduced to what the requirement gate needs. */
export interface FormStatusRow {
  formKey: string;
  petId: string | null;
  submittedAt: string;
}

/**
 * Identity-free busy range for the PUBLIC calendar. Carries pet thumbnails
 * (species + storage path) but NEVER an owner name or id — privacy by
 * construction (the projection cannot select identity columns).
 *
 * The repo-internal fields `concurrency`, `clientLat`, `clientLng` are used
 * server-side to compute a drive-time buffer; they are never forwarded to the
 * client (PublicBusyRange has no such fields).
 */
export interface BusyRange {
  /**
   * Repo-internal: the booking's own id, so a mutation can exclude the booking
   * it is moving from its own spacing check. Optional only because existing
   * fixtures predate it — the Supabase implementation always populates it.
   */
  id?: string;
  startsAt: Date;
  endsAt: Date;
  pets: { species: PetSpeciesDb; photoPath: string | null }[];
  /** Repo-internal: used to decide whether to apply drive-time buffer. */
  concurrency: ConcurrencyClass;
  /** Repo-internal: booking owner's lat (ZIP centroid). Null when profile missing. */
  clientLat: number | null;
  /** Repo-internal: booking owner's lng (ZIP centroid). Null when profile missing. */
  clientLng: number | null;
}

/** Enriched busy range for the ADMIN calendar — adds booking id, owner, status. */
export interface AdminBusyRange {
  bookingId: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatusDb;
  clientId: string;
  clientName: string | null;
  /** Booking total (cents). Under prepay-full this is what a Cal-cancel refunds. */
  finalCents: number;
  pets: {
    id: string;
    name: string;
    species: PetSpeciesDb;
    photoPath: string | null;
  }[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Repository interface
// ──────────────────────────────────────────────────────────────────────────────

export interface BookingRepository {
  /** Fetch a service by slug. Returns null if not found. */
  getServiceBySlug(slug: string): Promise<ServiceRow | null>;

  /** Fetch a service by id (no active filter — used to materialize an existing series). */
  getServiceById(id: string): Promise<ServiceRow | null>;

  /** Fetch the singleton settings row. Throws if missing. */
  getSettings(): Promise<SettingsRow>;

  /** Fetch profile lat/lng for a user. Returns { lat: null, lng: null } if profile missing. */
  getProfileLatLng(userId: string): Promise<ProfileLatLng>;

  /**
   * Insert one or more booking rows. Returns the generated IDs.
   * Throws on DB error. Callers catch error code `23P01` (exclusion_violation)
   * and surface it as a slot_taken result.
   */
  insertBookings(rows: BookingInsert[]): Promise<string[]>;

  /** Fetch a single booking by ID. Returns null if not found. */
  getBookingById(id: string): Promise<BookingRow | null>;

  /** Update a booking's status. */
  updateBookingStatus(id: string, status: BookingStatusDb): Promise<void>;

  /**
   * Fetch ownership + status + current time range for a reschedule. The range is
   * needed to preserve the booking's duration (only the start moves). Null if
   * not found.
   */
  getBookingTimes(id: string): Promise<{
    id: string;
    client_id: string;
    status: BookingStatusDb;
    startsAt: Date;
    endsAt: Date;
    /** Service pricing type — drives which availability model gates the new slot. */
    pricingType: PricingType;
    /** Concurrency class — selects the busy ranges the drive-time guard checks against. */
    concurrency: ConcurrencyClass;
    /** Client coordinates, for the candidate's own drive-time buffer. Null when unknown. */
    clientLat: number | null;
    clientLng: number | null;
  } | null>;

  /**
   * Move a booking to a new time range in place (status/price unchanged). Throws
   * on the `no_same_class_overlap` exclusion violation with `code = '23P01'` so
   * the core can surface it as `slot_taken` — the same arbiter as insert.
   */
  updateBookingTimes(id: string, startsAt: Date, endsAt: Date): Promise<void>;

  /**
   * Fetch all open availability windows (ends_at >= now).
   * `now` is injected (no clock read inside the repo) for testability and to
   * match the booking core's "inject now" contract.
   * Returns an empty array when no windows are defined.
   */
  getOpenWindows(now: Date): Promise<{ startsAt: Date; endsAt: Date }[]>;

  /**
   * Fetch the set of overnight-bookable nights (Denver day-keys "YYYY-MM-DD")
   * from `overnight_nights` whose night is today (Denver) or later. Sole source
   * of truth for house_sitting availability (see migration 20260603140000).
   * `now` is injected (no clock read inside the repo). Empty set when none.
   */
  getOpenNights(now: Date): Promise<Set<string>>;

  /** Insert a booking_series rule. Returns the generated id. */
  insertSeries(row: BookingSeriesInsert): Promise<string>;

  /** Delete a booking_series rule by id (cleanup when the first insert conflicts). */
  deleteSeries(id: string): Promise<void>;

  /** Fetch all active series rules (the series-roll cron materializes these forward). */
  getActiveSeries(): Promise<BookingSeriesRow[]>;

  /**
   * Fetch the already-materialized occurrence start times (epoch ms) for a
   * series, used to dedupe before materializing newly-in-horizon occurrences.
   */
  getMaterializedOccurrenceStarts(seriesId: string): Promise<number[]>;

  /** Fetch a booking joined with its payments. Returns null if not found. */
  getBookingWithPayments(id: string): Promise<BookingWithPayments | null>;

  /** Sum of unsettled debit amounts (cents) for a user. 0 when none outstanding. */
  getOutstandingDebtCents(userId: string): Promise<number>;

  /** Insert a client_debits row. */
  insertDebit(row: ClientDebitInsert): Promise<void>;

  /** Mark a debit settled at `now`. */
  settleDebit(debitId: string, now: Date): Promise<void>;

  /**
   * Fetch the caller's pets among the given ids (client_id-filtered — never
   * trusts the payload's ownership claim). Used to derive server-trusted
   * dog/cat counts. Returns only ids the caller actually owns.
   */
  getPetsByIds(userId: string, petIds: string[]): Promise<PetRef[]>;

  /** Attach pets to bookings (cartesian of bookingIds × petIds). */
  insertBookingPets(bookingIds: string[], petIds: string[]): Promise<void>;

  /**
   * Active busy ranges for the PUBLIC calendar — identity-free, filtered to the
   * given concurrency class (null = all classes). Includes pet thumbnails only.
   *
   * `excludeBookingId` drops one booking from the result so an edit or
   * reschedule is not blocked by the slot it is vacating.
   */
  getActiveBusyRanges(
    now: Date,
    concurrency: ConcurrencyClass | null,
    excludeBookingId?: string,
  ): Promise<BusyRange[]>;

  /** Active busy ranges for the ADMIN calendar — enriched with owner + status. */
  getActiveBusyRangesEnriched(now: Date): Promise<AdminBusyRange[]>;

  /** The caller's onboarding lifecycle status (gate input). */
  getOnboardingStatus(userId: string): Promise<OnboardingStatus>;

  /**
   * True when the user already has a NON-TERMINAL booking (pending_approval |
   * confirmed) for the given service slug — used to enforce one meet-and-greet
   * at a time.
   */
  hasActiveBookingForServiceSlug(
    userId: string,
    slug: string,
  ): Promise<boolean>;

  /** Load the full edit shape (service slug, times, quote, pets, paid total). */
  getBookingForEdit(id: string): Promise<BookingEditRow | null>;

  /** Update an edited booking's mutable fields in one UPDATE. Propagates 23P01. */
  updateBookingEdited(id: string, fields: BookingEditUpdate): Promise<void>;

  /** Replace a booking's pet assignment (delete all, then insert the given ids). */
  swapBookingPets(bookingId: string, petIds: string[]): Promise<void>;

  /** Append a cadence start (ISO UTC) to a series' skipped_starts. */
  appendSeriesSkip(seriesId: string, startIso: string): Promise<void>;

  /**
   * All of the client's form responses as (form_key, pet_id, submitted_at) tuples.
   * Feeds the requirement-manifest gate in computeBookingArtifacts: account-scoped
   * rows have pet_id null; pet-scoped rows ('pet') carry the pet's id.
   */
  getFormStatuses(userId: string): Promise<FormStatusRow[]>;

  /** Load the data the Kiche apply action needs (frozen quote + consent + payments). Null if not found. */
  getBookingForKiche(id: string): Promise<BookingForKiche | null>;

  /** Persist a Kiche apply/remove: the flag plus the re-quoted price + breakdown. */
  updateBookingKiche(id: string, fields: BookingKicheUpdate): Promise<void>;
}

/** Everything setKicheAppliedCore needs about a booking. */
export interface BookingForKiche {
  id: string;
  client_id: string;
  status: BookingStatusDb;
  /** Frozen server-written QuoteInput (jsonb) — re-quoted with applyKiche flipped. */
  quote_inputs: unknown;
  /** Client consent that Kiche may come (gate: cannot apply without it). */
  kiche_welcome: boolean;
  /** Current applied state (idempotency + un-apply). */
  kiche_applied: boolean;
  /** Current stored total (cents). */
  finalCents: number;
  payments: BookingPaymentTxn[];
}

/** Fields the Kiche apply action updates on a booking. */
export interface BookingKicheUpdate {
  kiche_applied: boolean;
  /** jsonb column — widen the domain object with {@link asJson}. */
  quote_inputs: Json;
  /** jsonb column — widen the domain object with {@link asJson}. */
  quote_breakdown: Json;
  final_cents: number;
}
