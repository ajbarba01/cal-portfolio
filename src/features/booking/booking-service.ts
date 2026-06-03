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
import { deriveTimeApproval } from "./time-gate";
import { quote } from "@/features/pricing/quote";
import { parsePricingConfig } from "@/features/pricing/config-schemas";
import { expandOccurrences } from "./recurrence";
import {
  seriesQualifiesForRecurringDiscount,
  passesGuards,
  fitsWindow,
} from "./availability";
import { transition } from "./state-machine";
import type {
  BookingRepository,
  BookingStatusDb,
  ServiceRow,
  SettingsRow,
} from "./booking-repository";
import type { QuoteInput, QuoteBreakdown } from "@/features/pricing/types";
import type { RecurrenceRule } from "./recurrence";
import type { BookingRuleSettings } from "./availability";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
// computeBookingArtifacts (internal) + computeBookingQuoteCore (public preview)
// ──────────────────────────────────────────────────────────────────────────────

export type CreateBookingInput = z.input<typeof createBookingInputSchema>;

/**
 * Everything the quote computation loads/derives from DB-trusted data, returned
 * as one bundle so BOTH the preview and createBookingCore consume identical
 * values — no re-loading, no recompute, no drift. The persisted quote_breakdown
 * is byte-identical to the previewed one because it IS the same object.
 *
 * `quoteInput` / `breakdown` are per-occurrence and identical across a recurring
 * series (the quote depends only on quantities + config + modifiers, never on
 * the specific occurrence date), so every inserted row reuses them.
 */
interface BookingQuoteArtifacts {
  service: ServiceRow;
  settings: SettingsRow;
  quoteInput: QuoteInput;
  breakdown: QuoteBreakdown;
  /** Expanded occurrence start times (1 element when not recurring). */
  occurrences: Date[];
  distanceMiles: number | null;
  /**
   * Per-occurrence approval flag, aligned with `occurrences`. Each is the OR of
   * the distance/service-flag signal and that occurrence's time-gate pend.
   */
  requiresApprovalByOccurrence: boolean[];
  /** Representative flag for the preview (first occurrence). */
  requiresApproval: boolean;
  /** The distance-based approval decision (for preview display). */
  decision: "auto" | "manual" | "refuse";
}

type ArtifactsResult =
  | { kind: "success"; artifacts: BookingQuoteArtifacts }
  | { kind: "refuse"; reason: string }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

/**
 * Pure quote/approval computation — no guard/window enforcement, no DB write.
 *
 * Pipeline:
 *  1. Validate input.
 *  2. Load service, settings, profile lat/lng.
 *  3. Validate quantities per pricing_type.
 *  4. Compute distance + approval decision (distance refuse → {refuse}).
 *  5. Expand occurrences + recurring-discount eligibility.
 * 5b. Time-horizon gate per occurrence (time refuse → {refuse}); fold into
 *     per-occurrence requires_approval.
 *  6. Build quoteInput and call quote().
 *
 * Returns the full artifact bundle so callers reuse the loaded rows + computed
 * quote rather than redoing the work.
 */
async function computeBookingArtifacts(
  deps: BookingServiceDeps,
  rawInput: CreateBookingInput,
): Promise<ArtifactsResult> {
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

  // 4. Distance + approval. `baseRequiresApproval` is the distance/service-flag
  // contribution; the per-occurrence time gate is OR-ed in at step 5b.
  const origin = { lat: settings.origin_lat, lng: settings.origin_lng };
  let distanceMiles: number | null = null;
  let baseRequiresApproval: boolean;
  let oneWayMin = 0;
  let decision: "auto" | "manual" | "refuse" = "auto";

  if (profileLatLng.lat === null || profileLatLng.lng === null) {
    baseRequiresApproval = true;
    decision = "manual";
  } else {
    distanceMiles = haversineMiles(origin, {
      lat: profileLatLng.lat,
      lng: profileLatLng.lng,
    });
    // Gate on miles (Cal's mental model). Driving minutes are still computed
    // below for the travel-cost line, but no longer gate approval.
    oneWayMin = estimateDrivingMinutes(distanceMiles, {
      roadFactor: settings.road_factor,
      avgSpeedMph: settings.avg_speed_mph,
    });
    decision = deriveApproval(distanceMiles, {
      autoApproveMiles: settings.auto_approve_threshold_miles,
      hardCutoffMiles: settings.hard_cutoff_miles,
      useRoadMiles: settings.gate_use_road_miles,
      roadFactor: settings.road_factor,
    });

    if (decision === "refuse") {
      return {
        kind: "refuse",
        reason: `Client location is too far (${distanceMiles.toFixed(1)} mi). Hard cutoff is ${settings.hard_cutoff_miles} mi.`,
      };
    }

    baseRequiresApproval = decision === "manual" || !!service.requires_approval;
  }

  // 5. Expand occurrences, capping at the generation horizon (DESIGN: never
  // materialize past ~1 month out; the series-roll cron extends the rest). The
  // materializeUntil cap lets an open-ended rule (no count/until) expand safely.
  const occurrences = input.recurringRule
    ? expandOccurrences(input.startsAt, input.recurringRule as RecurrenceRule, {
        materializeUntil: new Date(
          deps.now.getTime() +
            settings.recurrence_generation_horizon_days * MS_PER_DAY,
        ),
      })
    : [input.startsAt];

  const recurringDiscountApplies = seriesQualifiesForRecurringDiscount(
    occurrences,
    service.pricing_type,
    { recurringMinOccurrences: settings.recurring_min_occurrences },
  );

  // 5b. Time-horizon gate, PER OCCURRENCE. A series can straddle the horizon —
  // near occurrences auto-confirm, far ones pend. A start beyond the hard cap
  // refuses the whole submit (single far occurrence short-circuits).
  const timeCfg = {
    autoConfirmHorizonDays: settings.auto_confirm_horizon_days,
    hardMaxAdvanceDays: settings.hard_max_advance_days,
  };
  const requiresApprovalByOccurrence: boolean[] = [];
  for (const occStart of occurrences) {
    const timeDecision = deriveTimeApproval(occStart, deps.now, timeCfg);
    if (timeDecision === "refuse") {
      return {
        kind: "refuse",
        reason: `Requested start ${occStart.toISOString()} is beyond the ${settings.hard_max_advance_days}-day booking limit.`,
      };
    }
    requiresApprovalByOccurrence.push(
      baseRequiresApproval || timeDecision === "pending",
    );
  }

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
    artifacts: {
      service,
      settings,
      quoteInput,
      breakdown,
      occurrences,
      distanceMiles,
      requiresApprovalByOccurrence,
      requiresApproval: requiresApprovalByOccurrence[0],
      decision,
    },
  };
}

/**
 * Read-only price preview. Thin wrapper over computeBookingArtifacts that
 * projects the artifact bundle to the public {@link BookingQuotePreview}.
 * Guaranteed to match the breakdown createBookingCore persists for the same
 * input — they call the same computation.
 */
export async function computeBookingQuoteCore(
  deps: BookingServiceDeps,
  rawInput: CreateBookingInput,
): Promise<PreviewResult> {
  const result = await computeBookingArtifacts(deps, rawInput);
  if (result.kind !== "success") return result;
  const { breakdown, distanceMiles, requiresApproval, decision } =
    result.artifacts;
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
 *  1–5. Compute quote/approval + load artifacts via computeBookingArtifacts
 *       (single source of truth — service/settings/quoteInput/breakdown are the
 *       SAME objects the preview returned; no re-load, no recompute, no drift).
 *  6. Enforce booking-rule guards (hours-of-day, lead time, max advance) per occurrence.
 *  7. Enforce fitsWindow (availability-window containment) per occurrence.
 *     BEHAVIOR: a booking only succeeds if it falls inside an admin-defined
 *     availability window. Zero windows → all bookings return unavailable.
 *     This is the design intent: windows define Cal's availability.
 *  8–9. Derive initial status via state machine.
 * 10. Insert all rows (reusing the one quoteInput/breakdown) via service role;
 *     catch 23P01 → slot_taken.
 */
export async function createBookingCore(
  deps: BookingServiceDeps,
  rawInput: CreateBookingInput,
): Promise<CreateBookingResult> {
  // 1–5. Load artifacts + quote/approval (shared with the preview path).
  const result = await computeBookingArtifacts(deps, rawInput);
  if (result.kind === "validation_error") {
    return { kind: "validation_error", message: result.message };
  }
  if (result.kind === "error") {
    return { kind: "error", message: result.message };
  }
  if (result.kind === "refuse") {
    return { kind: "refuse", reason: result.reason };
  }

  const { repo, now } = deps;
  const {
    service,
    settings,
    quoteInput,
    breakdown,
    occurrences,
    requiresApprovalByOccurrence,
  } = result.artifacts;
  // userId / startsAt / endsAt come from the (already-validated) parsed input.
  const input = createBookingInputSchema.parse(rawInput);
  const durationMs = input.endsAt.getTime() - input.startsAt.getTime();

  // 6. Enforce booking-rule guards per occurrence (no DB re-load: artifacts.settings).
  const ruleSettings: BookingRuleSettings = {
    bookingOpenMinute: settings.booking_open_minute,
    bookingCloseMinute: settings.booking_close_minute,
    minLeadTimeHours: settings.min_lead_time_hours,
    hardMaxAdvanceDays: settings.hard_max_advance_days,
  };
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
  const openWindows = await repo.getOpenWindows(now);
  for (const occStart of occurrences) {
    const occEnd = new Date(occStart.getTime() + durationMs);
    if (!fitsWindow({ startsAt: occStart, endsAt: occEnd }, openWindows)) {
      return {
        kind: "unavailable",
        reason: `Occurrence at ${occStart.toISOString()} does not fall within any open availability window.`,
      };
    }
  }

  // 8–9. Derive initial status PER OCCURRENCE (a series can straddle the time
  // horizon: near occurrences confirm, far ones pend — requires_approval is
  // computed per occurrence in computeBookingArtifacts).
  const statuses: BookingStatusDb[] = [];
  for (const occRequiresApproval of requiresApprovalByOccurrence) {
    const statResult = transition("draft", "submit", {
      requiresApproval: occRequiresApproval,
    });
    if ("error" in statResult) {
      return { kind: "error", message: statResult.error };
    }
    statuses.push(statResult.state);
  }

  // A recurring submit writes a durable booking_series rule (frozen quote_inputs)
  // so the series-roll cron can materialize occurrences forward. MVP supports
  // weekly only — the booking_series table enforces it; reject other freqs here.
  let seriesId: string | null = null;
  if (input.recurringRule) {
    if (input.recurringRule.freq !== "weekly") {
      return {
        kind: "validation_error",
        message: "Only weekly recurrence is supported.",
      };
    }
    const rule = input.recurringRule;
    const openEnded = rule.count === undefined && rule.until === undefined;
    seriesId = await repo.insertSeries({
      client_id: input.userId,
      service_id: service.id,
      freq: "weekly",
      step_interval: rule.interval,
      count: rule.count ?? null,
      until: rule.until ? new Date(rule.until).toISOString() : null,
      open_ended: openEnded,
      template_starts_at: input.startsAt.toISOString(),
      duration_min: Math.round(durationMs / 60_000),
      quote_inputs: quoteInput as unknown,
    });
  }

  // 10. Build insert rows. The quote is identical for every occurrence (it
  // depends only on quantities/config/modifiers, never on the date), so all
  // rows reuse the single quoteInput + breakdown computed above. Status and
  // requires_approval, however, are per-occurrence (time horizon).
  const insertRows = occurrences.map((occStart, idx) => {
    const occEnd = new Date(occStart.getTime() + durationMs);
    return {
      client_id: input.userId,
      service_id: service.id,
      starts_at: occStart.toISOString(),
      ends_at: occEnd.toISOString(),
      series_id: seriesId,
      status: statuses[idx],
      concurrency: service.concurrency,
      distance_miles: result.artifacts.distanceMiles,
      quote_inputs: quoteInput as unknown,
      quote_breakdown: breakdown as unknown,
      final_cents: breakdown.finalCents,
      requires_approval: requiresApprovalByOccurrence[idx],
      discount_cents: 0, // see DISCOUNT_CENTS note in module header
    };
  });

  // Insert — catch exclusion_violation (23P01) → slot_taken. If a series row was
  // written, delete it so the conflict doesn't orphan an empty rule.
  try {
    const ids = await repo.insertBookings(insertRows);
    return { kind: "success", bookingIds: ids };
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === "23P01") {
      if (seriesId) await repo.deleteSeries(seriesId);
      return { kind: "slot_taken" };
    }
    if (seriesId) await repo.deleteSeries(seriesId);
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
