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
export type BookingStatusDb =
  | "pending_approval"
  | "confirmed"
  | "completed"
  | "declined"
  | "cancelled";

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
  booking_open_hour: number;
  booking_close_hour: number;
  min_lead_time_hours: number;
  max_advance_days: number;
  recurring_discount_pct: number;
  recurring_min_occurrences: number;
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
  booking_open_hour: z.number(),
  booking_close_hour: z.number(),
  min_lead_time_hours: z.number(),
  max_advance_days: z.number(),
  recurring_discount_pct: z.number(),
  recurring_min_occurrences: z.number(),
});

/** Parsed and validated service row. pricing_type is the closed enum. */
const serviceRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  pricing_type: z.enum(["house_sitting", "check_in", "walk", "training"]),
  pricing_config: z.unknown(),
  concurrency: z.enum(["exclusive", "resident"]),
  requires_approval: z.boolean(),
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

// ──────────────────────────────────────────────────────────────────────────────
// Repository interface
// ──────────────────────────────────────────────────────────────────────────────

export interface BookingRepository {
  /** Fetch a service by slug. Returns null if not found. */
  getServiceBySlug(slug: string): Promise<ServiceRow | null>;

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

    async getSettings() {
      const { data, error } = await client
        .from("settings")
        .select(
          "origin_lat, origin_lng, road_factor, avg_speed_mph, " +
            "auto_approve_threshold_miles, hard_cutoff_miles, gate_use_road_miles, " +
            "booking_open_hour, booking_close_hour, " +
            "min_lead_time_hours, max_advance_days, " +
            "recurring_discount_pct, recurring_min_occurrences",
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
  };
}
