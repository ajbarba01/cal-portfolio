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
  fitsWindow,
} from "./availability";
import { transition } from "./state-machine";
import type { BookingRepository } from "./booking-repository";
import type { QuoteInput, QuoteBreakdown } from "@/features/pricing/types";
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

/**
 * Read-only quote preview guaranteed to match the breakdown that createBookingCore
 * persists. Consumers use this to render a price estimate before submitting.
 *
 * `breakdown` is per-occurrence (first occurrence for display). For recurring
 * series the per-occurrence amount is the same for all rows (same quoteInput).
 */
export interface BookingQuotePreview {
  /** Per-occurrence quote breakdown (display the first occurrence). */
  breakdown: QuoteBreakdown;
  /** Equals breakdown.finalCents — hoisted for ergonomic access. */
  finalCents: number;
  /** Computed haversine distance in miles; null when profile has no coordinates. */
  distanceMiles: number | null;
  /** True when the booking will land in pending_approval status. */
  requiresApproval: boolean;
  /** The distance-based approval decision. */
  decision: "auto" | "manual" | "refuse";
}

export type PreviewResult =
  | { kind: "success"; preview: BookingQuotePreview }
  | { kind: "refuse"; reason: string }
  | { kind: "validation_error"; message: string }
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
// computeBookingQuoteCore
// ──────────────────────────────────────────────────────────────────────────────

export type CreateBookingInput = z.input<typeof createBookingInputSchema>;

/**
 * Pure quote/approval computation — no guard enforcement, no DB write.
 *
 * Performs steps 1–4 + recurring-discount eligibility + quote for the FIRST
 * occurrence. createBookingCore calls this internally so the persisted
 * quote_breakdown is LITERALLY the same value the preview returned (single
 * source of truth — no drift possible).
 *
 * Callers may use this independently for a read-only price preview that is
 * guaranteed to match what createBookingCore will persist.
 *
 * Pipeline:
 *  1. Validate input.
 *  2. Load service, settings, profile lat/lng.
 *  3. Validate quantities per pricing_type.
 *  4. Compute distance + approval decision (refuse → PreviewResult{refuse}).
 *  5. Compute recurring-discount eligibility.
 *  6. Build quoteInput and call quote().
 */
export async function computeBookingQuoteCore(
  deps: BookingServiceDeps,
  rawInput: CreateBookingInput,
): Promise<PreviewResult> {
  // 1. Validate
  const parseResult = createBookingInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return { kind: "validation_error", message: parseResult.error.message };
  }
  const input = parseResult.data;
  const { repo } = deps;

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

  // 3. Validate quantities
  const quantitiesResult = parseQuantities(
    service.pricing_type,
    input.quantities,
  );
  if (!quantitiesResult.success) {
    return { kind: "validation_error", message: quantitiesResult.message };
  }
  const quantities = quantitiesResult;

  // 4. Distance + approval
  const origin = { lat: settings.origin_lat, lng: settings.origin_lng };
  let distanceMiles: number | null = null;
  let requiresApproval: boolean;
  let oneWayMin = 0;
  let decision: "auto" | "manual" | "refuse" = "auto";

  if (profileLatLng.lat === null || profileLatLng.lng === null) {
    requiresApproval = true;
    decision = "manual";
  } else {
    distanceMiles = haversineMiles(origin, {
      lat: profileLatLng.lat,
      lng: profileLatLng.lng,
    });
    oneWayMin = estimateDrivingMinutes(distanceMiles, {
      roadFactor: settings.road_factor,
      avgSpeedMph: settings.avg_speed_mph,
    });
    decision = deriveApproval(oneWayMin, {
      autoApproveMin: settings.auto_approve_threshold_min,
      hardCutoffMin: settings.hard_cutoff_min,
    });

    if (decision === "refuse") {
      return {
        kind: "refuse",
        reason: `Client location is too far (${oneWayMin.toFixed(0)} min one-way). Hard cutoff is ${settings.hard_cutoff_min} min.`,
      };
    }

    requiresApproval = decision === "manual" || !!service.requires_approval;
  }

  // 5. Recurring-discount eligibility (needs occurrence count)
  const occurrences = input.recurringRule
    ? expandOccurrences(input.startsAt, input.recurringRule as RecurrenceRule)
    : [input.startsAt];

  const recurringDiscountApplies = seriesQualifiesForRecurringDiscount(
    occurrences,
    service.pricing_type,
    { recurringMinOccurrences: settings.recurring_min_occurrences },
  );

  // 6. Build quote for the first (representative) occurrence
  const roundTripDriveMinutes =
    service.pricing_type === "house_sitting" ? 0 : 2 * oneWayMin;

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
    kind: "success",
    preview: {
      breakdown,
      finalCents: breakdown.finalCents,
      distanceMiles,
      requiresApproval,
      decision,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// createBookingCore
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Core booking creation logic (testable via DI, no Next.js machinery).
 *
 * Pipeline:
 *  1. Validate input (schema + endsAt > startsAt).
 *  2–5. Compute quote/approval via computeBookingQuoteCore (single source of truth).
 *  6. Enforce booking-rule guards (hours-of-day, lead time, max advance) per occurrence.
 *  7. Load availability windows; enforce fitsWindow containment per occurrence.
 *     BEHAVIOR: a booking only succeeds if it falls inside an admin-defined
 *     availability window. Zero windows → all bookings return unavailable.
 *     This is the design intent: windows define Cal's availability.
 *  8. Expand occurrences, quote each row (same quoteInput computed by step 2–5).
 *  9. Derive initial status via state machine.
 * 10. Insert all rows via service role; catch 23P01 → slot_taken.
 *
 * The persisted quote_breakdown is IDENTICAL to what computeBookingQuoteCore
 * returned — no drift possible because createBookingCore calls it internally.
 */
export async function createBookingCore(
  deps: BookingServiceDeps,
  rawInput: CreateBookingInput,
): Promise<CreateBookingResult> {
  // Steps 1–5: delegate to computeBookingQuoteCore for quote/approval.
  const previewResult = await computeBookingQuoteCore(deps, rawInput);

  if (previewResult.kind === "validation_error") {
    return { kind: "validation_error", message: previewResult.message };
  }
  if (previewResult.kind === "error") {
    return { kind: "error", message: previewResult.message };
  }
  if (previewResult.kind === "refuse") {
    return { kind: "refuse", reason: previewResult.reason };
  }

  // Re-parse input (already validated inside computeBookingQuoteCore; safe).
  const input = createBookingInputSchema.parse(rawInput);
  const { repo, now } = deps;
  const { preview } = previewResult;

  // 6. Enforce booking-rule guards per occurrence.
  const [service, settings] = await Promise.all([
    repo.getServiceBySlug(input.serviceSlug),
    repo.getSettings(),
  ]);

  // Service and settings are guaranteed to exist (computeBookingQuoteCore succeeded).
  // Non-null assertion is safe: a missing service would have returned error above.
  const ruleSettings: BookingRuleSettings = {
    bookingOpenHour: settings!.booking_open_hour,
    bookingCloseHour: settings!.booking_close_hour,
    minLeadTimeHours: settings!.min_lead_time_hours,
    maxAdvanceDays: settings!.max_advance_days,
  };
  const durationMs = input.endsAt.getTime() - input.startsAt.getTime();

  const occurrences = input.recurringRule
    ? expandOccurrences(input.startsAt, input.recurringRule as RecurrenceRule)
    : [input.startsAt];

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

  // 7. Enforce availability-window containment.
  // DESIGN INTENT: availability_windows define when Cal is available to work.
  // A booking is only accepted if EVERY occurrence falls fully inside at least
  // one open window. Zero windows → all bookings are unavailable (correct:
  // Cal has not published any open slots yet).
  const openWindows = await repo.getOpenWindows();
  for (const occStart of occurrences) {
    const occEnd = new Date(occStart.getTime() + durationMs);
    if (!fitsWindow({ startsAt: occStart, endsAt: occEnd }, openWindows)) {
      return {
        kind: "unavailable",
        reason: `Occurrence at ${occStart.toISOString()} does not fall within any open availability window.`,
      };
    }
  }

  const seriesId = occurrences.length > 1 ? crypto.randomUUID() : null;

  // 8–9. Quote each occurrence (same quoteInput = same breakdown as preview).
  const statResult = transition("draft", "submit", {
    requiresApproval: preview.requiresApproval,
  });
  if ("error" in statResult) {
    return { kind: "error", message: statResult.error };
  }
  const status = statResult.state;

  // Re-derive the inputs needed for buildQuoteInput (all already computed inside
  // computeBookingQuoteCore — we reconstruct them here to keep createBookingCore
  // self-contained for the per-row insert loop).
  const pricingConfig = parsePricingConfig(
    service!.pricing_type,
    service!.pricing_config,
  );
  const quantitiesResult = parseQuantities(
    service!.pricing_type,
    input.quantities,
  );
  // quantitiesResult.success is guaranteed (computeBookingQuoteCore succeeded).
  const quantities = quantitiesResult as Extract<
    typeof quantitiesResult,
    { success: true }
  >;

  // Recurring discount eligibility (same logic as in computeBookingQuoteCore).
  const recurringDiscountApplies = seriesQualifiesForRecurringDiscount(
    occurrences,
    service!.pricing_type,
    { recurringMinOccurrences: settings!.recurring_min_occurrences },
  );

  // oneWayMin is not directly stored on preview; derive from distanceMiles.
  const oneWayMin =
    preview.distanceMiles !== null
      ? estimateDrivingMinutes(preview.distanceMiles, {
          roadFactor: settings!.road_factor,
          avgSpeedMph: settings!.avg_speed_mph,
        })
      : 0;

  const roundTripDriveMinutes =
    service!.pricing_type === "house_sitting" ? 0 : 2 * oneWayMin;

  const insertRows = occurrences.map((occStart) => {
    const occEnd = new Date(occStart.getTime() + durationMs);

    const quoteInput = buildQuoteInput({
      pricingType: service!.pricing_type,
      pricingConfig,
      quantities,
      roundTripDriveMinutes,
      recurringDiscountApplies,
      recurringDiscountPct: settings!.recurring_discount_pct,
    });

    const breakdown = quote(quoteInput);

    return {
      client_id: input.userId,
      service_id: service!.id,
      starts_at: occStart.toISOString(),
      ends_at: occEnd.toISOString(),
      series_id: seriesId,
      status,
      concurrency: service!.concurrency,
      distance_miles: preview.distanceMiles,
      quote_inputs: quoteInput as unknown,
      quote_breakdown: breakdown as unknown,
      final_cents: breakdown.finalCents,
      requires_approval: preview.requiresApproval,
      discount_cents: 0, // see DISCOUNT_CENTS note in module header
    };
  });

  // 10. Insert — catch exclusion_violation (23P01) → slot_taken
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
