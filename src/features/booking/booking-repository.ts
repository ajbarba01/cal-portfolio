/**
 * Booking repository interface + Supabase-backed implementation.
 *
 * All domain logic lives in booking-service.ts. This module is the IO
 * adapter — it owns the DB read/write and exposes a typed interface so the
 * service can be tested with any implementation (ENGINEERING #4).
 *
 * The interface is intentionally minimal: only the operations the service
 * actually needs, typed with explicit interfaces rather than the generic
 * Supabase types. No `any`.
 */

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PricingType } from "@/features/pricing";

// ──────────────────────────────────────────────────────────────────────────────
// Row shapes (typed explicitly — no generated DB types to avoid coupling)
// ──────────────────────────────────────────────────────────────────────────────

export type ConcurrencyClass = "exclusive" | "resident";

/** Onboarding lifecycle status. Schema + type single-sourced so they stay in sync. */
export const onboardingStatusSchema = z.enum([
  "info_pending",
  "meet_greet_pending",
  "approved",
  "declined",
]);
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

export type BookingStatusDb =
  | "pending_approval"
  | "confirmed"
  | "completed"
  | "declined"
  | "cancelled"
  | "no_show";

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

export interface SettingsRow {
  origin_lat: number;
  origin_lng: number;
  road_factor: number;
  avg_speed_mph: number;
  auto_approve_threshold_miles: number;
  hard_cutoff_miles: number;
  gate_use_road_miles: boolean;
  booking_open_minute: number;
  booking_close_minute: number;
  min_lead_time_hours: number;
  auto_confirm_horizon_days: number;
  hard_max_advance_days: number;
  recurrence_generation_horizon_days: number;
  recurring_discount_pct: number;
  recurring_min_occurrences: number;
  cancellation_full_refund_hours: number;
  late_cancel_refund_pct: number;
  no_show_charge_pct: number;
  /** ISO "YYYY-MM-DD" day keys for premium (holiday) days. Empty when none set. */
  holiday_dates: string[];
  /** Per-day surcharge (cents) for bookings on premium days. Applied to all service types. */
  holiday_surcharge_cents: number;
  /** Percent of one-way drive time to reserve as a scheduling buffer (e.g. 120 = 1.2×). */
  drive_buffer_pct: number;
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
  /** jsonb column — typed as unknown at the DB boundary (honest about the json shape). */
  quote_inputs: unknown;
  /** jsonb column — typed as unknown at the DB boundary. */
  quote_breakdown: unknown;
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
  quote_inputs: unknown;
}

// ──────────────────────────────────────────────────────────────────────────────
// Zod schemas for DB rows (parse at the edge — ENGINEERING #11)
// ──────────────────────────────────────────────────────────────────────────────

/** Parsed and validated settings row. All numeric fields verified as numbers. */
const settingsRowSchema = z.object({
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
  holiday_dates: z.array(z.string()).default([]),
  holiday_surcharge_cents: z.number().int().nonnegative().default(0),
  drive_buffer_pct: z.number(),
});

/** Parsed and validated service row. pricing_type is the closed enum. */
const serviceRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  pricing_type: z.enum([
    "house_sitting",
    "check_in",
    "walk",
    "training",
    "meet_greet",
  ]),
  pricing_config: z.unknown(),
  concurrency: z.enum(["exclusive", "resident"]),
  requires_approval: z.boolean(),
  form_key: z.string().nullable(),
});

/** Parsed and validated booking_series row. */
const bookingSeriesRowSchema = z.object({
  id: z.string(),
  client_id: z.string(),
  service_id: z.string(),
  freq: z.literal("weekly"),
  step_interval: z.number(),
  count: z.number().nullable(),
  until: z.string().nullable(),
  open_ended: z.boolean(),
  template_starts_at: z.string(),
  duration_min: z.number(),
  quote_inputs: z.unknown(),
  active: z.boolean(),
  skipped_starts: z.array(z.string()).default([]),
});

/** Parsed and validated availability_windows row. */
const availabilityWindowRowSchema = z.object({
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
});

export interface BookingRow {
  id: string;
  client_id: string;
  status: BookingStatusDb;
}

/** A single payment txn attached to a booking (for refund + paid-amount math). */
export interface BookingPaymentTxn {
  status: "requires_payment" | "succeeded" | "refunded" | "failed";
  amountCents: number;
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

const bookingWithPaymentsRowSchema = z.object({
  id: z.string(),
  client_id: z.string(),
  status: z.string(),
  starts_at: z.string(),
  final_cents: z.number(),
  payments: z
    .array(
      z.object({
        status: z.enum(["requires_payment", "succeeded", "refunded", "failed"]),
        amount_cents: z.number(),
        stripe_payment_intent_id: z.string(),
      }),
    )
    .nullable(),
});

const bookingForKicheRowSchema = z.object({
  id: z.string(),
  client_id: z.string(),
  status: z.string(),
  quote_inputs: z.unknown(),
  kiche_welcome: z.boolean(),
  kiche_applied: z.boolean(),
  final_cents: z.number(),
  payments: z
    .array(
      z.object({
        status: z.enum(["requires_payment", "succeeded", "refunded", "failed"]),
        amount_cents: z.number(),
        stripe_payment_intent_id: z.string(),
      }),
    )
    .nullable(),
});

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
  quote_inputs: unknown;
  quote_breakdown: unknown;
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

export type PetSpeciesDb = "dog" | "cat";

/** A pet owned by the caller, used to derive server-trusted booking counts. */
export interface PetRef {
  id: string;
  species: PetSpeciesDb;
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

const publicBusyRowSchema = z.object({
  starts_at: z.string(),
  ends_at: z.string(),
  concurrency: z.enum(["exclusive", "resident"]),
  profiles: z
    .object({ lat: z.number().nullable(), lng: z.number().nullable() })
    .nullable(),
  booking_pets: z
    .array(
      z.object({
        pets: z
          .object({
            species: z.enum(["dog", "cat"]),
            photo_url: z.string().nullable(),
          })
          .nullable(),
      }),
    )
    .nullable(),
});

const adminBusyRowSchema = z.object({
  id: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  status: z.string(),
  client_id: z.string(),
  final_cents: z.number(),
  profiles: z.object({ full_name: z.string().nullable() }).nullable(),
  booking_pets: z
    .array(
      z.object({
        pets: z
          .object({
            id: z.string(),
            name: z.string(),
            species: z.enum(["dog", "cat"]),
            photo_url: z.string().nullable(),
          })
          .nullable(),
      }),
    )
    .nullable(),
});

/** Parsed and validated booking-for-edit row (join shape from getBookingForEdit). */
const bookingEditRowSchema = z.object({
  id: z.string(),
  client_id: z.string(),
  status: z.enum([
    "pending_approval",
    "confirmed",
    "completed",
    "declined",
    "cancelled",
    "no_show",
  ]),
  starts_at: z.string(),
  ends_at: z.string(),
  series_id: z.string().nullable(),
  comments: z.string().nullable(),
  quote_inputs: z.unknown(),
  kiche_applied: z.boolean(),
  // PostgREST may return a joined row as an object or a single-element array
  // depending on the client version and relationship cardinality hint.
  services: z
    .union([
      z.object({ slug: z.string() }),
      z.array(z.object({ slug: z.string() })),
    ])
    .nullable(),
  booking_pets: z.array(z.object({ pet_id: z.string() })).nullable(),
  payments: z
    .array(z.object({ status: z.string(), amount_cents: z.number() }))
    .nullable(),
});

const ACTIVE_BUSY_STATUSES = ["pending_approval", "confirmed"] as const;

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
   */
  getActiveBusyRanges(
    now: Date,
    concurrency: ConcurrencyClass | null,
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
   * True when the client has submitted the named form (any row in form_responses
   * matching client_id + form_key). Legacy single-form gate helper.
   */
  hasFormResponse(userId: string, formKey: string): Promise<boolean>;

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
  quote_inputs: unknown;
  quote_breakdown: unknown;
  final_cents: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Supabase implementation
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Creates a Supabase-backed BookingRepository.
 *
 * The client MUST be a service-role client for write operations — the column
 * grants block `status`, `final_cents`, `distance_miles`, etc. from
 * authenticated user sessions.
 */
export function createSupabaseBookingRepository(
  client: SupabaseClient,
): BookingRepository {
  return {
    async getServiceBySlug(slug) {
      const { data, error } = await client
        .from("services")
        .select(
          "id, slug, pricing_type, pricing_config, concurrency, requires_approval, form_key",
        )
        .eq("slug", slug)
        .eq("active", true)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // Not found
        throw new Error(`Failed to load service '${slug}': ${error.message}`);
      }

      // Parse at the edge: verify DB shape matches expected schema.
      const parsed = serviceRowSchema.safeParse(data);
      if (!parsed.success) {
        throw new Error(
          `Service '${slug}' has unexpected DB shape: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    },

    async getServiceById(id) {
      const { data, error } = await client
        .from("services")
        .select(
          "id, slug, pricing_type, pricing_config, concurrency, requires_approval, form_key",
        )
        .eq("id", id)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw new Error(`Failed to load service '${id}': ${error.message}`);
      }

      const parsed = serviceRowSchema.safeParse(data);
      if (!parsed.success) {
        throw new Error(
          `Service '${id}' has unexpected DB shape: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    },

    async getSettings() {
      const { data, error } = await client
        .from("settings")
        .select(
          "origin_lat, origin_lng, road_factor, avg_speed_mph, " +
            "auto_approve_threshold_miles, hard_cutoff_miles, gate_use_road_miles, " +
            "booking_open_minute, booking_close_minute, " +
            "min_lead_time_hours, auto_confirm_horizon_days, hard_max_advance_days, " +
            "recurrence_generation_horizon_days, " +
            "recurring_discount_pct, recurring_min_occurrences, " +
            "cancellation_full_refund_hours, late_cancel_refund_pct, no_show_charge_pct, " +
            "holiday_dates, holiday_surcharge_cents, drive_buffer_pct",
        )
        .limit(1)
        .single();

      if (error) {
        throw new Error(`Failed to load settings: ${error.message}`);
      }

      // Parse at the edge: all numeric fields verified as numbers (guards against
      // null/garbage values flowing into arithmetic as NaN — ENGINEERING #11).
      const parsed = settingsRowSchema.safeParse(data);
      if (!parsed.success) {
        throw new Error(
          `Settings row has unexpected DB shape: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    },

    async getProfileLatLng(userId) {
      const { data, error } = await client
        .from("profiles")
        .select("lat, lng")
        .eq("id", userId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // Profile row not found — return nulls (safe default: force manual approval).
          return { lat: null, lng: null };
        }
        // Any other DB error is unexpected; throw rather than silently returning nulls.
        throw new Error(
          `Failed to load profile lat/lng for user '${userId}': ${error.message}`,
        );
      }

      return { lat: data.lat ?? null, lng: data.lng ?? null };
    },

    async insertBookings(rows) {
      const { data, error } = await client
        .from("bookings")
        .insert(rows)
        .select("id");

      if (error) {
        // Re-throw with the DB error attached so callers can inspect `.code`.
        const err = new Error(
          `Booking insert failed: ${error.message}`,
        ) as Error & { code?: string };
        err.code = error.code;
        throw err;
      }

      if (!data) throw new Error("Booking insert returned no data");

      return data.map((r: { id: string }) => r.id);
    },

    async getBookingById(id) {
      const { data, error } = await client
        .from("bookings")
        .select("id, client_id, status")
        .eq("id", id)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw new Error(`Failed to load booking '${id}': ${error.message}`);
      }

      return data as BookingRow;
    },

    async updateBookingStatus(id, status) {
      const { error } = await client
        .from("bookings")
        .update({ status })
        .eq("id", id);

      if (error) {
        throw new Error(
          `Failed to update booking '${id}' status to '${status}': ${error.message}`,
        );
      }
    },

    async getBookingTimes(id) {
      const { data, error } = await client
        .from("bookings")
        .select("id, client_id, status, starts_at, ends_at")
        .eq("id", id)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw new Error(`Failed to load booking '${id}': ${error.message}`);
      }

      return {
        id: data.id as string,
        client_id: data.client_id as string,
        status: data.status as BookingStatusDb,
        startsAt: new Date(data.starts_at as string),
        endsAt: new Date(data.ends_at as string),
      };
    },

    async updateBookingTimes(id, startsAt, endsAt) {
      const { error } = await client
        .from("bookings")
        .update({
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
        })
        .eq("id", id);

      if (error) {
        // Propagate the Postgres SQLSTATE so the core can map 23P01 → slot_taken.
        const err = new Error(
          `Failed to reschedule booking '${id}': ${error.message}`,
        ) as Error & { code?: string };
        if (error.code) err.code = error.code;
        throw err;
      }
    },

    async getOpenWindows(now: Date) {
      const { data, error } = await client
        .from("availability_windows")
        .select("starts_at, ends_at")
        .gte("ends_at", now.toISOString());

      if (error) {
        throw new Error(
          `Failed to load availability windows: ${error.message}`,
        );
      }

      if (!data) return [];

      return data.map((row: unknown) => {
        const parsed = availabilityWindowRowSchema.safeParse(row);
        if (!parsed.success) {
          throw new Error(
            `availability_windows row has unexpected DB shape: ${parsed.error.message}`,
          );
        }
        return {
          startsAt: new Date(parsed.data.starts_at),
          endsAt: new Date(parsed.data.ends_at),
        };
      });
    },

    async insertSeries(row) {
      const { data, error } = await client
        .from("booking_series")
        .insert(row)
        .select("id")
        .single();

      if (error) {
        throw new Error(`Failed to insert booking_series: ${error.message}`);
      }
      if (!data) throw new Error("booking_series insert returned no data");
      return data.id as string;
    },

    async deleteSeries(id) {
      const { error } = await client
        .from("booking_series")
        .delete()
        .eq("id", id);

      if (error) {
        throw new Error(
          `Failed to delete booking_series '${id}': ${error.message}`,
        );
      }
    },

    async getActiveSeries() {
      const { data, error } = await client
        .from("booking_series")
        .select(
          "id, client_id, service_id, freq, step_interval, count, until, " +
            "open_ended, template_starts_at, duration_min, quote_inputs, active, skipped_starts",
        )
        .eq("active", true);

      if (error) {
        throw new Error(`Failed to load active series: ${error.message}`);
      }
      if (!data) return [];

      return data.map((row: unknown) => {
        const parsed = bookingSeriesRowSchema.safeParse(row);
        if (!parsed.success) {
          throw new Error(
            `booking_series row has unexpected DB shape: ${parsed.error.message}`,
          );
        }
        return parsed.data;
      });
    },

    async getMaterializedOccurrenceStarts(seriesId) {
      const { data, error } = await client
        .from("bookings")
        .select("starts_at")
        .eq("series_id", seriesId);

      if (error) {
        throw new Error(
          `Failed to load materialized occurrences for series '${seriesId}': ${error.message}`,
        );
      }
      if (!data) return [];

      return data.map((r: { starts_at: string }) =>
        new Date(r.starts_at).getTime(),
      );
    },

    async getBookingWithPayments(id) {
      const { data, error } = await client
        .from("bookings")
        .select(
          "id, client_id, status, starts_at, final_cents, " +
            "payments(status, amount_cents, stripe_payment_intent_id)",
        )
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new Error(
          `Failed to load booking with payments '${id}': ${error.message}`,
        );
      }
      if (!data) return null;

      const parsed = bookingWithPaymentsRowSchema.safeParse(data);
      if (!parsed.success) {
        throw new Error(
          `booking-with-payments row has unexpected DB shape: ${parsed.error.message}`,
        );
      }
      const row = parsed.data;
      return {
        id: row.id,
        client_id: row.client_id,
        status: row.status as BookingStatusDb,
        startsAt: new Date(row.starts_at),
        finalCents: row.final_cents,
        payments: (row.payments ?? []).map((p) => ({
          status: p.status,
          amountCents: p.amount_cents,
          paymentIntentId: p.stripe_payment_intent_id,
        })),
      };
    },

    async getOutstandingDebtCents(userId) {
      const { data, error } = await client
        .from("client_debits")
        .select("amount_cents")
        .eq("client_id", userId)
        .is("settled_at", null);

      if (error) {
        throw new Error(
          `Failed to load outstanding debt for '${userId}': ${error.message}`,
        );
      }
      return (data ?? []).reduce(
        (sum: number, r: { amount_cents: number }) => sum + r.amount_cents,
        0,
      );
    },

    async insertDebit(row) {
      const { error } = await client.from("client_debits").insert(row);
      if (error) {
        throw new Error(`Failed to insert client_debit: ${error.message}`);
      }
    },

    async settleDebit(debitId, now) {
      const { error } = await client
        .from("client_debits")
        .update({ settled_at: now.toISOString() })
        .eq("id", debitId);
      if (error) {
        throw new Error(
          `Failed to settle debit '${debitId}': ${error.message}`,
        );
      }
    },

    async getPetsByIds(userId, petIds) {
      if (petIds.length === 0) return [];
      const { data, error } = await client
        .from("pets")
        .select("id, species")
        .eq("client_id", userId)
        .in("id", petIds);

      if (error) {
        throw new Error(`Failed to load pets: ${error.message}`);
      }
      return (data ?? []).map((r: { id: string; species: string }) => ({
        id: r.id,
        species: r.species as PetSpeciesDb,
      }));
    },

    async insertBookingPets(bookingIds, petIds) {
      if (bookingIds.length === 0 || petIds.length === 0) return;
      const rows = bookingIds.flatMap((booking_id) =>
        petIds.map((pet_id) => ({ booking_id, pet_id })),
      );
      const { error } = await client.from("booking_pets").insert(rows);
      if (error) {
        throw new Error(`Failed to insert booking_pets: ${error.message}`);
      }
    },

    async getActiveBusyRanges(now, concurrency) {
      let query = client
        .from("bookings")
        .select(
          "starts_at, ends_at, concurrency, " +
            "profiles(lat, lng), " +
            "booking_pets(pets(species, photo_url))",
        )
        .in("status", ACTIVE_BUSY_STATUSES)
        .gte("ends_at", now.toISOString());
      if (concurrency) query = query.eq("concurrency", concurrency);

      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to load busy ranges: ${error.message}`);
      }

      return (data ?? []).map((row: unknown) => {
        const parsed = publicBusyRowSchema.safeParse(row);
        if (!parsed.success) {
          throw new Error(
            `busy-range row has unexpected DB shape: ${parsed.error.message}`,
          );
        }
        const r = parsed.data;
        return {
          startsAt: new Date(r.starts_at),
          endsAt: new Date(r.ends_at),
          concurrency: r.concurrency,
          clientLat: r.profiles?.lat ?? null,
          clientLng: r.profiles?.lng ?? null,
          pets: (r.booking_pets ?? [])
            .map((bp) => bp.pets)
            .filter((p): p is NonNullable<typeof p> => p !== null)
            .map((p) => ({ species: p.species, photoPath: p.photo_url })),
        };
      });
    },

    async getActiveBusyRangesEnriched(now) {
      const { data, error } = await client
        .from("bookings")
        .select(
          "id, starts_at, ends_at, status, client_id, final_cents, " +
            "profiles(full_name), " +
            "booking_pets(pets(id, name, species, photo_url))",
        )
        .in("status", ACTIVE_BUSY_STATUSES)
        .gte("ends_at", now.toISOString());

      if (error) {
        throw new Error(
          `Failed to load enriched busy ranges: ${error.message}`,
        );
      }

      return (data ?? []).map((row: unknown) => {
        const parsed = adminBusyRowSchema.safeParse(row);
        if (!parsed.success) {
          throw new Error(
            `admin busy-range row has unexpected DB shape: ${parsed.error.message}`,
          );
        }
        const r = parsed.data;
        return {
          bookingId: r.id,
          startsAt: new Date(r.starts_at),
          endsAt: new Date(r.ends_at),
          status: r.status as BookingStatusDb,
          clientId: r.client_id,
          clientName: r.profiles?.full_name ?? null,
          finalCents: r.final_cents,
          pets: (r.booking_pets ?? [])
            .map((bp) => bp.pets)
            .filter((p): p is NonNullable<typeof p> => p !== null)
            .map((p) => ({
              id: p.id,
              name: p.name,
              species: p.species,
              photoPath: p.photo_url,
            })),
        };
      });
    },

    async getOnboardingStatus(userId) {
      const { data, error } = await client
        .from("profiles")
        .select("onboarding_status")
        .eq("id", userId)
        .single();
      if (error) {
        if (error.code === "PGRST116") return "info_pending";
        throw new Error(
          `Failed to load onboarding_status for '${userId}': ${error.message}`,
        );
      }
      // Parse at the edge (ENGINEERING #11): the column is a Postgres enum, but a
      // future enum value the app doesn't model must not flow through silently and
      // be misread by gate logic as a non-gating status.
      const parsed = onboardingStatusSchema.safeParse(data.onboarding_status);
      if (!parsed.success) {
        throw new Error(
          `Unexpected onboarding_status '${String(data.onboarding_status)}' for '${userId}'`,
        );
      }
      return parsed.data;
    },

    async hasActiveBookingForServiceSlug(userId, slug) {
      const { data, error } = await client
        .from("bookings")
        .select("id, services!inner(slug)")
        .eq("client_id", userId)
        .eq("services.slug", slug)
        .in("status", [...ACTIVE_BUSY_STATUSES])
        .limit(1);
      if (error) {
        throw new Error(
          `Failed to check active '${slug}' booking for '${userId}': ${error.message}`,
        );
      }
      return (data ?? []).length > 0;
    },

    async getBookingForEdit(id) {
      const { data, error } = await client
        .from("bookings")
        .select(
          "id, client_id, status, starts_at, ends_at, series_id, comments, " +
            "quote_inputs, kiche_applied, services(slug), booking_pets(pet_id), " +
            "payments(status, amount_cents)",
        )
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new Error(
          `Failed to load booking for edit '${id}': ${error.message}`,
        );
      }
      if (!data) return null;

      const parsed = bookingEditRowSchema.safeParse(data);
      if (!parsed.success) {
        throw new Error(
          `booking-for-edit row has unexpected DB shape: ${parsed.error.message}`,
        );
      }
      const row = parsed.data;

      const service = Array.isArray(row.services)
        ? row.services[0]
        : row.services;
      if (!service) {
        throw new Error(`Booking '${id}' has no service`);
      }

      const paidCents = (row.payments ?? [])
        .filter((p) => p.status === "succeeded")
        .reduce((sum, p) => sum + p.amount_cents, 0);

      return {
        id: row.id,
        client_id: row.client_id,
        service_slug: service.slug,
        status: row.status,
        startsAt: new Date(row.starts_at),
        endsAt: new Date(row.ends_at),
        series_id: row.series_id,
        comments: row.comments,
        quote_inputs: row.quote_inputs,
        petIds: (row.booking_pets ?? []).map((bp) => bp.pet_id),
        paidCents,
        kiche_applied: row.kiche_applied,
      };
    },

    async updateBookingEdited(id, fields) {
      const { error } = await client
        .from("bookings")
        .update({
          starts_at: fields.starts_at,
          ends_at: fields.ends_at,
          status: fields.status,
          quote_inputs: fields.quote_inputs,
          quote_breakdown: fields.quote_breakdown,
          final_cents: fields.final_cents,
          requires_approval: fields.requires_approval,
          comments: fields.comments,
          series_id: fields.series_id,
        })
        .eq("id", id);

      if (error) {
        const err = new Error(
          `Failed to update edited booking '${id}': ${error.message}`,
        ) as Error & { code?: string };
        if (error.code) err.code = error.code;
        throw err;
      }
    },

    async swapBookingPets(bookingId, petIds) {
      const { error: delError } = await client
        .from("booking_pets")
        .delete()
        .eq("booking_id", bookingId);
      if (delError) {
        throw new Error(
          `Failed to clear booking_pets for '${bookingId}': ${delError.message}`,
        );
      }
      if (petIds.length === 0) return;
      const rows = petIds.map((pet_id) => ({ booking_id: bookingId, pet_id }));
      const { error: insError } = await client
        .from("booking_pets")
        .insert(rows);
      if (insError) {
        throw new Error(
          `Failed to set booking_pets for '${bookingId}': ${insError.message}`,
        );
      }
    },

    async appendSeriesSkip(seriesId, startIso) {
      // Read-modify-write the array under the service role (single writer).
      const { data, error } = await client
        .from("booking_series")
        .select("skipped_starts")
        .eq("id", seriesId)
        .single();
      if (error) {
        throw new Error(
          `Failed to load series '${seriesId}': ${error.message}`,
        );
      }
      const current = (data?.skipped_starts as string[] | null) ?? [];
      // Normalize to epoch ms before comparing: the DB returns timestamptz values
      // in "+00:00" notation but startIso is always a JS ".000Z" string — a plain
      // string includes() would never match and would silently duplicate the entry.
      const inputMs = new Date(startIso).getTime();
      const next = current.some((s) => new Date(s).getTime() === inputMs)
        ? current
        : [...current, startIso];
      const { error: upError } = await client
        .from("booking_series")
        .update({ skipped_starts: next })
        .eq("id", seriesId);
      if (upError) {
        throw new Error(
          `Failed to append series skip for '${seriesId}': ${upError.message}`,
        );
      }
    },

    async hasFormResponse(userId, formKey) {
      const { data, error } = await client
        .from("form_responses")
        .select("id")
        .eq("client_id", userId)
        .eq("form_key", formKey)
        .limit(1);

      if (error) {
        throw new Error(
          `Failed to check form response for '${userId}' / '${formKey}': ${error.message}`,
        );
      }
      return (data ?? []).length > 0;
    },

    async getFormStatuses(userId) {
      const { data, error } = await client
        .from("form_responses")
        .select("form_key, pet_id, submitted_at")
        .eq("client_id", userId);

      if (error) {
        throw new Error(
          `Failed to load form statuses for '${userId}': ${error.message}`,
        );
      }
      return (data ?? []).map(
        (r: {
          form_key: string;
          pet_id: string | null;
          submitted_at: string;
        }) => ({
          formKey: r.form_key,
          petId: r.pet_id,
          submittedAt: r.submitted_at,
        }),
      );
    },

    async getBookingForKiche(id) {
      const { data, error } = await client
        .from("bookings")
        .select(
          "id, client_id, status, quote_inputs, kiche_welcome, kiche_applied, final_cents, " +
            "payments(status, amount_cents, stripe_payment_intent_id)",
        )
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new Error(
          `Failed to load booking for kiche '${id}': ${error.message}`,
        );
      }
      if (!data) return null;

      const parsed = bookingForKicheRowSchema.safeParse(data);
      if (!parsed.success) {
        throw new Error(
          `booking-for-kiche row has unexpected DB shape: ${parsed.error.message}`,
        );
      }
      const row = parsed.data;
      return {
        id: row.id,
        client_id: row.client_id,
        status: row.status as BookingStatusDb,
        quote_inputs: row.quote_inputs,
        kiche_welcome: row.kiche_welcome,
        kiche_applied: row.kiche_applied,
        finalCents: row.final_cents,
        payments: (row.payments ?? []).map((p) => ({
          status: p.status,
          amountCents: p.amount_cents,
          paymentIntentId: p.stripe_payment_intent_id,
        })),
      };
    },

    async updateBookingKiche(id, fields) {
      const { error } = await client
        .from("bookings")
        .update({
          kiche_applied: fields.kiche_applied,
          quote_inputs: fields.quote_inputs,
          quote_breakdown: fields.quote_breakdown,
          final_cents: fields.final_cents,
        })
        .eq("id", id);

      if (error) {
        throw new Error(
          `Failed to update kiche for booking '${id}': ${error.message}`,
        );
      }
    },
  };
}
