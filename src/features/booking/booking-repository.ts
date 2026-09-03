/**
 * Supabase-backed implementation of the booking repository.
 *
 * All domain logic lives in booking-service.ts. This module is the IO
 * adapter — it owns the DB read/write and implements the typed interface so the
 * service can be tested with any implementation (ENGINEERING #4).
 *
 * The contract itself — the row shapes, the settings schema and the
 * `BookingRepository` interface — lives in booking-repository-types.ts and is
 * re-exported below, so importing a type from either path is equivalent.
 */

import { cache } from "react";
import { z } from "zod";
import type { DbClient } from "@/lib/supabase/db-client";
import { speciesEnum } from "@/features/pets";
import { netPaid } from "@/features/payments";
import { denverDayKey } from "./availability";
import {
  bookingStatusDbSchema,
  onboardingStatusSchema,
  settingsRowSchema,
} from "./booking-repository-types";
import type {
  BookingRepository,
  SettingsRow,
} from "./booking-repository-types";

export {
  asJson,
  bookingStatusDbSchema,
  onboardingStatusSchema,
} from "./booking-repository-types";
export type {
  AdminBusyRange,
  BookingEditRow,
  BookingEditUpdate,
  BookingForKiche,
  BookingInsert,
  BookingKicheUpdate,
  BookingPaymentTxn,
  BookingRepository,
  BookingRow,
  BookingSeriesInsert,
  BookingSeriesRow,
  BookingStatusDb,
  BookingWithPayments,
  BusyRange,
  ClientDebitInsert,
  ConcurrencyClass,
  DebitReason,
  FormStatusRow,
  OnboardingStatus,
  PetRef,
  PetSpeciesDb,
  ProfileLatLng,
  ServiceRow,
  SettingsRow,
} from "./booking-repository-types";

// ──────────────────────────────────────────────────────────────────────────────
// Zod schemas for DB rows (parse at the edge — ENGINEERING #11)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Derived from the schema that parses the result, so the two cannot drift.
 *
 * Being built at runtime, it is not a string literal, so PostgREST's generated
 * types cannot resolve it and the read below comes back untyped. The zod parse
 * is therefore the only check that the columns still exist — which is what it
 * was written to be. Inlining the list to regain the static check would
 * reintroduce the drift this constant exists to prevent.
 */
const SETTINGS_COLUMNS = Object.keys(settingsRowSchema.shape).join(", ");

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

/** Parsed and validated overnight_nights row (Denver day-key "YYYY-MM-DD"). */
const overnightNightRowSchema = z.object({
  night: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const bookingWithPaymentsRowSchema = z.object({
  id: z.string(),
  client_id: z.string(),
  status: bookingStatusDbSchema,
  starts_at: z.string(),
  final_cents: z.number(),
  payments: z
    .array(
      z.object({
        status: z.enum(["requires_payment", "succeeded", "refunded", "failed"]),
        amount_cents: z.number(),
        refunded_cents: z.number(),
        stripe_payment_intent_id: z.string(),
      }),
    )
    .nullable(),
});

const bookingForKicheRowSchema = z.object({
  id: z.string(),
  client_id: z.string(),
  status: bookingStatusDbSchema,
  quote_inputs: z.unknown(),
  kiche_welcome: z.boolean(),
  kiche_applied: z.boolean(),
  final_cents: z.number(),
  payments: z
    .array(
      z.object({
        status: z.enum(["requires_payment", "succeeded", "refunded", "failed"]),
        amount_cents: z.number(),
        refunded_cents: z.number(),
        stripe_payment_intent_id: z.string(),
      }),
    )
    .nullable(),
});

const publicBusyRowSchema = z.object({
  // Optional only because fixtures written before the column was selected omit
  // it; the live select always asks for it and the column is NOT NULL.
  id: z.string().optional(),
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
            species: speciesEnum,
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
  status: bookingStatusDbSchema,
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
            species: speciesEnum,
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
  status: bookingStatusDbSchema,
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
    .array(
      z.object({
        status: z.enum(["requires_payment", "succeeded", "refunded", "failed"]),
        amount_cents: z.number(),
        refunded_cents: z.number(),
      }),
    )
    .nullable(),
});

const ACTIVE_BUSY_STATUSES = ["pending_approval", "confirmed"] as const;

/**
 * Row ceiling for the list reads that are filtered by time or a flag rather
 * than by key. Each is ordered nearest-first, so the cap can only ever drop the
 * furthest-future rows — years past anything a booking flow can select — while
 * keeping a runaway table from being read into a request's memory.
 */
const MAX_LIST_ROWS = 2000;

/**
 * Surface a capped read. A result sitting exactly on the ceiling is almost
 * certainly truncated, and these lists are not display-only: the busy ranges
 * and windows feed the overlap and drive-time guards, and the active series
 * feed the recurrence cron, so a dropped row silently weakens a check or skips
 * a series. Logged rather than thrown — refusing to serve the page is worse
 * than serving it with a loud server-side trace.
 */
function warnIfCapped(label: string, rows: readonly unknown[]): void {
  if (rows.length === MAX_LIST_ROWS) {
    console.warn(
      `${label}: read hit the ${MAX_LIST_ROWS}-row cap — results are probably truncated`,
    );
  }
}

/**
 * The settings read, memoized per request by the client it is given (React
 * `cache()` keys on the argument, and `createServiceClient` is itself
 * per-request). Three call sites read this single row on one `/book` request —
 * the form loader, the public busy ranges and the quote pipeline — and this
 * collapses them into one query. Outside a request it calls straight through.
 */
const readSettings = cache(async (client: DbClient): Promise<SettingsRow> => {
  const { data, error } = await client
    .from("settings")
    .select(SETTINGS_COLUMNS)
    .limit(1)
    .single();

  if (error) {
    throw new Error(`Failed to load settings: ${error.message}`);
  }

  // Parse at the edge: every column verified, so a dropped or nulled one
  // fails here instead of becoming NaN in the arithmetic downstream
  // (ENGINEERING #11).
  const parsed = settingsRowSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Settings row has unexpected DB shape: ${parsed.error.message}`,
    );
  }
  return parsed.data;
});

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
  client: DbClient,
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

    getSettings: () => readSettings(client),

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

      return data.map((r) => r.id);
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

      return data;
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
        .select(
          "id, client_id, status, starts_at, ends_at, concurrency, profiles(lat, lng), services(pricing_type)",
        )
        .eq("id", id)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw new Error(`Failed to load booking '${id}': ${error.message}`);
      }

      // PostgREST returns the joined service as an object or single-element array
      // depending on cardinality hint — normalize (mirrors getBookingForEdit).
      const svc = Array.isArray(data.services)
        ? data.services[0]
        : data.services;
      if (!svc) throw new Error(`Booking '${id}' has no service`);

      return {
        id: data.id,
        client_id: data.client_id,
        status: data.status,
        startsAt: new Date(data.starts_at),
        endsAt: new Date(data.ends_at),
        pricingType: svc.pricing_type,
        concurrency: data.concurrency,
        clientLat: data.profiles?.lat ?? null,
        clientLng: data.profiles?.lng ?? null,
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
        .gte("ends_at", now.toISOString())
        .order("starts_at", { ascending: true })
        .limit(MAX_LIST_ROWS);

      if (error) {
        throw new Error(
          `Failed to load availability windows: ${error.message}`,
        );
      }

      if (!data) return [];
      warnIfCapped("getOpenWindows", data);

      return data.map((row) => {
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

    async getOpenNights(now: Date) {
      // Today (Denver) or later — a past night can't host a future stay. The
      // `night` column is a DATE; Postgres compares "YYYY-MM-DD" lexically,
      // which matches chronological order for ISO dates.
      const todayKey = denverDayKey(now);
      const { data, error } = await client
        .from("overnight_nights")
        .select("night")
        .gte("night", todayKey)
        .order("night", { ascending: true })
        .limit(MAX_LIST_ROWS);

      if (error) {
        throw new Error(`Failed to load overnight nights: ${error.message}`);
      }

      const out = new Set<string>();
      if (!data) return out;
      warnIfCapped("getOpenNights", data);
      for (const row of data) {
        const parsed = overnightNightRowSchema.safeParse(row);
        if (!parsed.success) {
          throw new Error(
            `overnight_nights row has unexpected DB shape: ${parsed.error.message}`,
          );
        }
        out.add(parsed.data.night);
      }
      return out;
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
      return data.id;
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
        .eq("active", true)
        .order("template_starts_at", { ascending: true })
        .limit(MAX_LIST_ROWS);

      if (error) {
        throw new Error(`Failed to load active series: ${error.message}`);
      }
      if (!data) return [];
      warnIfCapped("getActiveSeries", data);

      return data.map((row) => {
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

      return data.map((r) => new Date(r.starts_at).getTime());
    },

    async getBookingWithPayments(id) {
      const { data, error } = await client
        .from("bookings")
        .select(
          "id, client_id, status, starts_at, final_cents, " +
            "payments(status, amount_cents, refunded_cents, stripe_payment_intent_id)",
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
        status: row.status,
        startsAt: new Date(row.starts_at),
        finalCents: row.final_cents,
        payments: (row.payments ?? []).map((p) => ({
          status: p.status,
          amountCents: p.amount_cents,
          refundedCents: p.refunded_cents,
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
      return (data ?? []).reduce((sum, r) => sum + r.amount_cents, 0);
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
        .select("id, species, birthdate")
        .eq("client_id", userId)
        .in("id", petIds);

      if (error) {
        throw new Error(`Failed to load pets: ${error.message}`);
      }
      return (data ?? []).map((r) => ({
        id: r.id,
        species: r.species,
        birthdate: r.birthdate,
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

    async getActiveBusyRanges(now, concurrency, excludeBookingId) {
      let query = client
        .from("bookings")
        .select(
          "id, starts_at, ends_at, concurrency, " +
            "profiles(lat, lng), " +
            "booking_pets(pets(species, photo_url))",
        )
        .in("status", ACTIVE_BUSY_STATUSES)
        .gte("ends_at", now.toISOString())
        .order("starts_at", { ascending: true })
        .limit(MAX_LIST_ROWS);
      if (concurrency) query = query.eq("concurrency", concurrency);
      if (excludeBookingId) query = query.neq("id", excludeBookingId);

      const { data, error } = await query;
      if (error) {
        // The public calendar renders whatever comes back; without this log a
        // failed read is invisible on the server as well as in the browser.
        console.error("getActiveBusyRanges: query failed", error);
        throw new Error(`Failed to load busy ranges: ${error.message}`);
      }

      warnIfCapped("getActiveBusyRanges", data ?? []);

      return (data ?? []).map((row) => {
        const parsed = publicBusyRowSchema.safeParse(row);
        if (!parsed.success) {
          throw new Error(
            `busy-range row has unexpected DB shape: ${parsed.error.message}`,
          );
        }
        const r = parsed.data;
        return {
          id: r.id,
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
        .gte("ends_at", now.toISOString())
        .order("starts_at", { ascending: true })
        .limit(MAX_LIST_ROWS);

      if (error) {
        throw new Error(
          `Failed to load enriched busy ranges: ${error.message}`,
        );
      }

      warnIfCapped("getActiveBusyRangesEnriched", data ?? []);

      return (data ?? []).map((row) => {
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
          status: r.status,
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
            "payments(status, amount_cents, refunded_cents)",
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

      const paidCents = netPaid(
        (row.payments ?? []).map((p) => ({
          status: p.status,
          amountCents: p.amount_cents,
          refundedCents: p.refunded_cents,
        })),
      );

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
      const current = data.skipped_starts;
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
      return (data ?? []).map((r) => ({
        formKey: r.form_key,
        petId: r.pet_id,
        submittedAt: r.submitted_at,
      }));
    },

    async getBookingForKiche(id) {
      const { data, error } = await client
        .from("bookings")
        .select(
          "id, client_id, status, quote_inputs, kiche_welcome, kiche_applied, final_cents, " +
            "payments(status, amount_cents, refunded_cents, stripe_payment_intent_id)",
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
        status: row.status,
        quote_inputs: row.quote_inputs,
        kiche_welcome: row.kiche_welcome,
        kiche_applied: row.kiche_applied,
        finalCents: row.final_cents,
        payments: (row.payments ?? []).map((p) => ({
          status: p.status,
          amountCents: p.amount_cents,
          refundedCents: p.refunded_cents,
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
