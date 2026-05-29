/**
 * Booking orchestration: createBookingCore / cancelBookingCore.
 *
 * "Pure-ish" orchestration layer: accepts injected deps (repo) so it is
 * integration-testable without Next.js machinery. Mirrors the DI split in
 * src/features/accounts/onboarding-action.ts.
 *
 * SECURITY MODEL
 * --------------
 * - The repo passed in MUST be backed by a service-role client (enforced by
 *   the `"use server"` actions.ts entry point). Never call these functions
 *   with a user-session-backed repo — the protected columns would be blocked
 *   by the column-grant guard.
 * - `client_id` is ALWAYS taken from `input.userId` (verified session ID
 *   supplied by the action), never from the client payload.
 * - Money (`final_cents`), `status`, `distance_miles`, `quote_breakdown`,
 *   and `requires_approval` are ALL recomputed server-side from DB-trusted
 *   data. None of these are accepted from the client.
 * - The DB exclusion constraint `no_same_class_overlap` is the final arbiter
 *   of double-booking. Postgres error `23P01` (exclusion_violation) is caught
 *   on insert and surfaced as a `slot_taken` result (ENGINEERING #11).
 *
 * PROFILE WITH NO LAT/LNG
 * -----------------------
 * When the caller's profile has no geocoded coordinates (null lat/lng —
 * possible if onboarding geocoding failed or the ZIP was unknown), we cannot
 * compute a distance. Rather than auto-approving (which could send Cal 200
 * miles away), we force manual approval and store distance_miles = null.
 * This is the safe default: Cal reviews and decides.
 *
 * DISCOUNT_CENTS
 * --------------
 * The `discount_cents` column is set to 0 for all bookings created here.
 * The recurring discount and any future Kiche discount are already reflected
 * in `final_cents` via the quote lines. A separate `discount_cents` snapshot
 * column could be populated from the discount lines in a future pass; for now
 * it is documented but left at 0. Kiche is Cal-applied post-booking.
 */

import { z } from "zod";
import { haversineMiles } from "@/lib/haversine";
import {
  estimateDrivingMinutes,
  deriveApproval,
} from "@/features/pricing/distance";
import { quote } from "@/features/pricing/quote";
import { parsePricingConfig } from "@/features/pricing/config-schemas";
import { expandOccurrences } from "./recurrence";
import {
  seriesQualifiesForRecurringDiscount,
  passesGuards,
} from "./availability";
import { transition } from "./state-machine";
import type { BookingRepository } from "./booking-repository";
import type { QuoteInput } from "@/features/pricing/types";
import type { RecurrenceRule } from "./recurrence";
import type { BookingRuleSettings } from "./availability";

// ──────────────────────────────────────────────────────────────────────────────
// Input Zod schemas (validate at the boundary — ENGINEERING #11)
// ──────────────────────────────────────────────────────────────────────────────

const recurrenceRuleSchema = z.object({
  freq: z.enum(["daily", "weekly", "monthly"]),
  interval: z.number().int().min(1),
  count: z.number().int().positive().optional(),
  until: z.coerce.date().optional(),
});

/**
 * Booking request input schema.
 *
 * The client supplies ONLY: which service, time window, quantities, and an
 * optional recurrence rule. All money, status, distance, and approval fields
 * are recomputed server-side.
 *
 * Quantities are accepted as a loose record here; per-type Zod validation
 * happens AFTER the service is loaded (so the pricing_type is known), before
 * any quoting occurs (fix #1).
 */
const createBookingInputSchema = z
  .object({
    userId: z.string().uuid(),
    serviceSlug: z.string().min(1),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    quantities: z.record(z.string(), z.unknown()),
    /** Weekly recurrence rule. MVP UI exposes weekly only; daily/monthly accepted for future use. */
    recurringRule: recurrenceRuleSchema.nullable(),
  })
  .refine((d) => d.endsAt > d.startsAt, {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

const cancelBookingInputSchema = z.object({
  userId: z.string().uuid(),
  bookingId: z.string().uuid(),
});

// ──────────────────────────────────────────────────────────────────────────────
// Result types (discriminated union — no throwing across the boundary)
// ──────────────────────────────────────────────────────────────────────────────

export type CreateBookingResult =
  | { kind: "success"; bookingIds: string[] }
  | { kind: "refuse"; reason: string }
  | { kind: "slot_taken" }
  | { kind: "unavailable"; reason: string }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

export type CancelBookingResult =
  | { kind: "success" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

// ──────────────────────────────────────────────────────────────────────────────
// Deps
// ──────────────────────────────────────────────────────────────────────────────

export interface BookingServiceDeps {
  repo: BookingRepository;
  /**
   * Current time, injected by the caller so the core stays pure (no clock reads
   * inside the core — ENGINEERING #5). Pass `new Date()` from the action layer.
   */
  now: Date;
}

// ──────────────────────────────────────────────────────────────────────────────
// createBookingCore
// ──────────────────────────────────────────────────────────────────────────────

export type CreateBookingInput = z.input<typeof createBookingInputSchema>;

/**
 * Core booking creation logic (testable via DI, no Next.js machinery).
 *
 * Pipeline:
 *  1. Validate input (schema + endsAt > startsAt).
 *  2. Load service, settings, profile lat/lng from DB.
 *  3. Validate quantities per pricing_type (money-input integrity).
 *  4. Compute distance + approval decision.
 *  5. Enforce booking-rule guards (hours-of-day, lead time, max advance) for
 *     each occurrence. fitsWindow (availability-window containment) is NOT
 *     enforced here — see TODO below.
 *  6. Expand occurrences (1 or N for recurring).
 *  7. Quote each occurrence.
 *  8. Derive initial status via state machine.
 *  9. Insert all rows via service role; catch 23P01 → slot_taken.
 *
 * TODO(Phase 9): enforce fitsWindow (availability-window containment) here.
 * This is intentionally deferred: `availability_windows` is empty until Phase 8
 * builds the admin CRUD, so enforcing it now would reject every booking.
 * Once Phase 8 ships, add a fitsWindow check after step 5 and remove this note.
 */
export async function createBookingCore(
  deps: BookingServiceDeps,
  rawInput: CreateBookingInput,
): Promise<CreateBookingResult> {
  // 1. Validate
  const parseResult = createBookingInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return {
      kind: "validation_error",
      message: parseResult.error.message,
    };
  }
  const input = parseResult.data;
  const { repo, now } = deps;

  // 2. Load from DB
  const [service, settings, profileLatLng] = await Promise.all([
    repo.getServiceBySlug(input.serviceSlug),
    repo.getSettings(),
    repo.getProfileLatLng(input.userId),
  ]);

  if (!service) {
    return {
      kind: "error",
      message: `Service '${input.serviceSlug}' not found`,
    };
  }

  // Validate pricing_config before any quoting.
  let pricingConfig: ReturnType<typeof parsePricingConfig>;
  try {
    pricingConfig = parsePricingConfig(
      service.pricing_type,
      service.pricing_config,
    );
  } catch (e) {
    return {
      kind: "error",
      message: `Invalid pricing_config for service '${input.serviceSlug}': ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // 3. Validate quantities per pricing_type (money-input integrity — fix #1).
  // Parsed after the service is known so the schema is selected by pricing_type.
  const quantitiesResult = parseQuantities(
    service.pricing_type,
    input.quantities,
  );
  if (!quantitiesResult.success) {
    return { kind: "validation_error", message: quantitiesResult.message };
  }
  // Narrowed to { success: true } & ParsedQuantities; the extra `success` flag is
  // structurally assignable to the ParsedQuantities param buildQuoteInput expects.
  const quantities = quantitiesResult;

  // 4. Distance + approval
  const origin = { lat: settings.origin_lat, lng: settings.origin_lng };
  let distanceMiles: number | null = null;
  let requiresApproval: boolean;
  // oneWayMin hoisted here so it's computed once and reused for both the
  // approval decision and roundTripDriveMinutes (eliminates duplicate call).
  let oneWayMin = 0;

  if (profileLatLng.lat === null || profileLatLng.lng === null) {
    // Unknown coordinates → force manual approval (safe default; documented above).
    requiresApproval = true;
  } else {
    distanceMiles = haversineMiles(origin, {
      lat: profileLatLng.lat,
      lng: profileLatLng.lng,
    });
    oneWayMin = estimateDrivingMinutes(distanceMiles, {
      roadFactor: settings.road_factor,
      avgSpeedMph: settings.avg_speed_mph,
    });
    const decision = deriveApproval(oneWayMin, {
      autoApproveMin: settings.auto_approve_threshold_min,
      hardCutoffMin: settings.hard_cutoff_min,
    });

    if (decision === "refuse") {
      return {
        kind: "refuse",
        reason: `Client location is too far (${oneWayMin.toFixed(0)} min one-way). Hard cutoff is ${settings.hard_cutoff_min} min.`,
      };
    }

    // requiresApproval: true if decision is manual OR the service always requires it.
    requiresApproval = decision === "manual" || !!service.requires_approval;
  }

  // 5. Enforce booking-rule guards server-side for each occurrence.
  // passesGuards checks hours-of-day (America/Denver), lead time, and max advance.
  // A UI-bypassing client cannot skip these checks.
  //
  // TODO(Phase 9): also enforce fitsWindow here once availability_windows is populated.
  // Deferred because availability_windows is empty until Phase 8 admin CRUD ships —
  // enforcing it now would reject every booking. This is intentional sequencing.
  const ruleSettings: BookingRuleSettings = {
    bookingOpenHour: settings.booking_open_hour,
    bookingCloseHour: settings.booking_close_hour,
    minLeadTimeHours: settings.min_lead_time_hours,
    maxAdvanceDays: settings.max_advance_days,
  };
  const durationMs = input.endsAt.getTime() - input.startsAt.getTime();

  // 6. Recurrence
  const occurrences = input.recurringRule
    ? expandOccurrences(input.startsAt, input.recurringRule as RecurrenceRule)
    : [input.startsAt];

  // Guard each occurrence before inserting any rows.
  for (const occStart of occurrences) {
    const occEnd = new Date(occStart.getTime() + durationMs);
    if (
      !passesGuards({ startsAt: occStart, endsAt: occEnd }, ruleSettings, now)
    ) {
      return {
        kind: "unavailable",
        reason: `Occurrence at ${occStart.toISOString()} does not meet booking rules (hours-of-day, lead time, or max advance).`,
      };
    }
  }

  const seriesId = occurrences.length > 1 ? crypto.randomUUID() : null;

  // Check recurring discount eligibility.
  const recurringDiscountApplies = seriesQualifiesForRecurringDiscount(
    occurrences,
    service.pricing_type,
    { recurringMinOccurrences: settings.recurring_min_occurrences },
  );

  // 7–8. Quote each occurrence + derive status
  const statResult = transition("draft", "submit", { requiresApproval });
  if ("error" in statResult) {
    return { kind: "error", message: statResult.error };
  }
  const status = statResult.state;

  // Round-trip drive minutes: hourly services only;
  // house_sitting passes 0 — travel is off by default per DESIGN.
  // oneWayMin was computed once in step 4 (no duplicate call).
  const roundTripDriveMinutes =
    service.pricing_type === "house_sitting" ? 0 : 2 * oneWayMin;

  const insertRows = occurrences.map((occStart) => {
    const occEnd = new Date(occStart.getTime() + durationMs);

    const quoteInput = buildQuoteInput({
      pricingType: service.pricing_type,
      pricingConfig,
      quantities,
      roundTripDriveMinutes,
      recurringDiscountApplies,
      recurringDiscountPct: settings.recurring_discount_pct,
    });

    const breakdown = quote(quoteInput);

    return {
      client_id: input.userId,
      service_id: service.id,
      starts_at: occStart.toISOString(),
      ends_at: occEnd.toISOString(),
      series_id: seriesId,
      status,
      concurrency: service.concurrency,
      distance_miles: distanceMiles,
      quote_inputs: quoteInput as unknown,
      quote_breakdown: breakdown as unknown,
      final_cents: breakdown.finalCents,
      requires_approval: requiresApproval,
      discount_cents: 0, // see DISCOUNT_CENTS note in module header
    };
  });

  // 9. Insert — catch exclusion_violation (23P01) → slot_taken
  try {
    const ids = await repo.insertBookings(insertRows);
    return { kind: "success", bookingIds: ids };
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === "23P01") {
      return { kind: "slot_taken" };
    }
    throw e;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// cancelBookingCore
// ──────────────────────────────────────────────────────────────────────────────

export type CancelBookingInput = z.input<typeof cancelBookingInputSchema>;

/**
 * Core booking cancellation logic (testable via DI, no Next.js machinery).
 *
 * Authenticates ownership (client_id === userId OR admin check in actions.ts).
 * Refunds are MANUAL by Cal — no automatic refund logic here.
 *
 * @see actions.ts for admin-override path.
 */
export async function cancelBookingCore(
  deps: BookingServiceDeps,
  rawInput: CancelBookingInput,
): Promise<CancelBookingResult> {
  const parseResult = cancelBookingInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return { kind: "error", message: parseResult.error.message };
  }
  const input = parseResult.data;
  const { repo } = deps;

  const booking = await repo.getBookingById(input.bookingId);
  if (!booking) {
    return { kind: "not_found" };
  }

  // Ownership check. Admin bypass happens in the "use server" action wrapper.
  if (booking.client_id !== input.userId) {
    return { kind: "forbidden" };
  }

  const result = transition(booking.status, "cancel", {
    requiresApproval: false, // context not needed for cancel
  });

  if ("error" in result) {
    return { kind: "error", message: result.error };
  }

  await repo.updateBookingStatus(input.bookingId, result.state);
  return { kind: "success" };
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

// ── Per-type quantity Zod schemas ────────────────────────────────────────────
// Parsed AFTER the service is loaded (pricing_type known), BEFORE quoting.
// Constraints: amounts that multiply into money must be non-negative and sane.

const houseSittingQuantitiesSchema = z.object({
  dogs: z.number().int().min(1),
  cats: z.number().int().min(0),
  nights: z.number().positive(),
  cantBeLeftAloneDays: z.number().int().min(0).optional(),
  walkMinutesPerDay: z.number().min(0).optional(),
  holidayDays: z.number().int().min(0).optional(),
});

const checkInQuantitiesSchema = z.object({
  hours: z.number().positive(),
});

const walkQuantitiesSchema = z.object({
  hours: z.number().positive(),
  dogs: z.number().int().min(1),
});

const trainingQuantitiesSchema = z.object({
  hours: z.number().positive(),
});

type HouseSittingQty = z.infer<typeof houseSittingQuantitiesSchema>;
type CheckInQty = z.infer<typeof checkInQuantitiesSchema>;
type WalkQty = z.infer<typeof walkQuantitiesSchema>;
type TrainingQty = z.infer<typeof trainingQuantitiesSchema>;

type ParsedQuantities =
  | { pricingType: "house_sitting"; data: HouseSittingQty }
  | { pricingType: "check_in"; data: CheckInQty }
  | { pricingType: "walk"; data: WalkQty }
  | { pricingType: "training"; data: TrainingQty };

type ParseQuantitiesResult =
  | ({ success: true } & ParsedQuantities)
  | { success: false; message: string };

/**
 * Validates and parses the `quantities` record against the per-type Zod schema.
 * Called after the service's pricing_type is known, before any quoting.
 * Returns a typed discriminated result so `buildQuoteInput` receives validated values.
 */
function parseQuantities(
  pricingType: string,
  raw: Record<string, unknown>,
): ParseQuantitiesResult {
  switch (pricingType) {
    case "house_sitting": {
      const r = houseSittingQuantitiesSchema.safeParse(raw);
      if (!r.success) return { success: false, message: r.error.message };
      return { success: true, pricingType: "house_sitting", data: r.data };
    }
    case "check_in": {
      const r = checkInQuantitiesSchema.safeParse(raw);
      if (!r.success) return { success: false, message: r.error.message };
      return { success: true, pricingType: "check_in", data: r.data };
    }
    case "walk": {
      const r = walkQuantitiesSchema.safeParse(raw);
      if (!r.success) return { success: false, message: r.error.message };
      return { success: true, pricingType: "walk", data: r.data };
    }
    case "training": {
      const r = trainingQuantitiesSchema.safeParse(raw);
      if (!r.success) return { success: false, message: r.error.message };
      return { success: true, pricingType: "training", data: r.data };
    }
    default:
      return { success: false, message: `Unknown pricingType: ${pricingType}` };
  }
}

/**
 * Assembles a `QuoteInput` discriminated union from the service's pricing type,
 * validated config, and the already-parsed quantities.
 *
 * `quantities` is typed (output of `parseQuantities`) — no `as number` casts needed.
 * Guarantee: `final_cents` is always a non-negative integer for valid input.
 */
function buildQuoteInput(opts: {
  pricingType: string;
  pricingConfig: unknown;
  quantities: ParsedQuantities;
  roundTripDriveMinutes: number;
  recurringDiscountApplies: boolean;
  recurringDiscountPct: number;
}): QuoteInput {
  const shared = {
    roundTripDriveMinutes: opts.roundTripDriveMinutes,
    recurringDiscountApplies: opts.recurringDiscountApplies,
    recurringDiscountPct: opts.recurringDiscountPct,
    applyKiche: false, // Kiche is Cal-applied post-booking; never auto-applied at submit
  };

  const q = opts.quantities;

  switch (q.pricingType) {
    case "house_sitting":
      return {
        pricingType: "house_sitting",
        pricingConfig: opts.pricingConfig as QuoteInput["pricingConfig"],
        dogs: q.data.dogs,
        cats: q.data.cats,
        nights: q.data.nights,
        cantBeLeftAloneDays: q.data.cantBeLeftAloneDays,
        walkMinutesPerDay: q.data.walkMinutesPerDay,
        holidayDays: q.data.holidayDays,
        ...shared,
      } as QuoteInput;

    case "check_in":
      return {
        pricingType: "check_in",
        pricingConfig: opts.pricingConfig as QuoteInput["pricingConfig"],
        hours: q.data.hours,
        ...shared,
      } as QuoteInput;

    case "walk":
      return {
        pricingType: "walk",
        pricingConfig: opts.pricingConfig as QuoteInput["pricingConfig"],
        hours: q.data.hours,
        dogs: q.data.dogs,
        ...shared,
      } as QuoteInput;

    case "training":
      return {
        pricingType: "training",
        pricingConfig: opts.pricingConfig as QuoteInput["pricingConfig"],
        hours: q.data.hours,
        ...shared,
      } as QuoteInput;

    default: {
      // Exhaustiveness check — TypeScript narrows q to never here.
      const _exhaustive: never = q;
      throw new Error(`Unknown pricingType: ${String(_exhaustive)}`);
    }
  }
}
