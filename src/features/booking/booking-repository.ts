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
import type { PricingType } from "@/features/pricing/types";

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

/**
 * Identity-free busy range for the PUBLIC calendar. Carries pet thumbnails
 * (species + storage path) but NEVER an owner name or id — privacy by
 * construction (the projection cannot select identity columns).
 */
export interface BusyRange {
  startsAt: Date;
  endsAt: Date;
  pets: { species: PetSpeciesDb; photoPath: string | null }[];
}

/** Enriched busy range for the ADMIN calendar — adds booking id, owner, status. */
export interface AdminBusyRange {
  bookingId: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatusDb;
  clientName: string | null;
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
          "id, slug, pricing_type, pricing_config, concurrency, requires_approval",
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
          "id, slug, pricing_type, pricing_config, concurrency, requires_approval",
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
            "cancellation_full_refund_hours, late_cancel_refund_pct, no_show_charge_pct",
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
            "open_ended, template_starts_at, duration_min, quote_inputs, active",
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
        .select("starts_at, ends_at, booking_pets(pets(species, photo_url))")
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
          "id, starts_at, ends_at, status, profiles(full_name), " +
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
          clientName: r.profiles?.full_name ?? null,
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
  };
}
