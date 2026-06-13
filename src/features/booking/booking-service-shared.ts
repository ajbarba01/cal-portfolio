/**
 * Shared types, schemas, and helpers used by ≥2 booking-service core files.
 *
 * SECURITY MODEL — see booking-service.ts (barrel) module header for full notes.
 */

import { z } from "zod";
import { haversineMiles } from "@/lib/haversine";
import { estimateDrivingMinutes, deriveApproval } from "@/features/pricing";
import { deriveTimeApproval } from "./time-gate";
import { quote } from "@/features/pricing";
import { parsePricingConfig } from "@/features/pricing";
import { expandOccurrences } from "./recurrence";
import {
  seriesQualifiesForRecurringDiscount,
  passesGuards,
  fitsWindow,
  denverDayKey,
  denverMidnight,
} from "./availability";
import type {
  BookingRepository,
  ServiceRow,
  SettingsRow,
} from "./booking-repository";
import type { MutationPolicy } from "./mutation-policy";
import { CLIENT_POLICY } from "./mutation-policy";
import type { QuoteInput, QuoteBreakdown } from "@/features/pricing";
import type { RecurrenceRule } from "./recurrence";
import type { BookingRuleSettings } from "./availability";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Slug of the meet-and-greet service — the only service a meet_greet_pending client may book. */
export const MEET_GREET_SLUG = "meet-greet";

/** Max length of a client's freeform "Notes for Cal". Enforced server-side (schema) and surfaced to the UI counter. */
export const BOOKING_COMMENTS_MAX = 2000;

// ──────────────────────────────────────────────────────────────────────────────
// deriveHolidayDays — server-trusted premium-day count
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Derives the number of premium (holiday) days covered by a booking from the
 * admin-configured `holiday_dates` list. Overrides any client-supplied value.
 *
 * Derivation rule (per-type):
 *
 *   house_sitting — count calendar days in the HALF-OPEN stay range [checkIn,
 *   checkOut) that appear in `holidayDates`. The checkout day itself is
 *   EXCLUDED because the guest has departed; only nights-that-are-days matter.
 *   Iterates DST-safely using `denverDayKey` + `denverMidnight` (same pattern
 *   as `validateStayRange`). Result aligns with `walkDays = Math.ceil(nights)`
 *   in `quote.ts` — both are "days in the stay window".
 *
 *   Hourly (walk, check_in, training) — the booking covers exactly one Denver
 *   calendar day (service is sub-24h). Returns 1 if `startsAt`'s Denver day
 *   key is in `holidayDates`, otherwise 0. NOTE: walk/check_in/training
 *   `QuoteInput` types do not carry a `holidayDays` field; this function
 *   returns the count for completeness / future use, but `buildQuoteInput`
 *   only applies it to house_sitting.
 *
 *   meet_greet — always 0 (free service, no surcharge applies).
 *
 * Pure — no IO, no clock read, DST-correct. (#5 ENGINEERING)
 */
export function deriveHolidayDays(
  pricingType: string,
  startsAt: Date,
  endsAt: Date,
  holidayDates: string[],
): number {
  if (holidayDates.length === 0) return 0;
  if (pricingType === "meet_greet") return 0;

  const premiumSet = new Set(holidayDates);

  if (pricingType === "house_sitting") {
    // Count calendar days in [startsAt, endsAt) that are premium.
    // Iterate DST-safely: same pattern as validateStayRange in calendar-model.ts.
    let count = 0;
    let cursor = startsAt;
    while (cursor.getTime() < endsAt.getTime()) {
      const dayKey = denverDayKey(cursor);
      if (premiumSet.has(dayKey)) count++;
      // Advance to next Denver midnight — DST-correct via denverMidnight.
      const [y, m, d] = dayKey.split("-").map((n) => parseInt(n, 10));
      cursor = denverMidnight(
        `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`,
      );
    }
    return count;
  }

  // Hourly / training: service is sub-24h, covers exactly one Denver calendar day.
  return premiumSet.has(denverDayKey(startsAt)) ? 1 : 0;
}

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
export const createBookingInputSchema = z
  .object({
    userId: z.string().uuid(),
    serviceSlug: z.string().min(1),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    quantities: z.record(z.string(), z.unknown()),
    /**
     * Assigned pet ids (pet-aware services only). When present, the dog/cat
     * COUNTS are derived server-side from these (overriding any client-supplied
     * counts, like money) and the pets are linked via booking_pets. Optional for
     * backward compatibility — count-only submits still quote correctly.
     */
    petIds: z.array(z.string().uuid()).optional(),
    /** Weekly recurrence rule. MVP UI exposes weekly only; daily/monthly accepted for future use. */
    recurringRule: recurrenceRuleSchema.nullable(),
    /** Optional freeform note from the client, surfaced to Cal. */
    comments: z.string().trim().max(BOOKING_COMMENTS_MAX).optional(),
  })
  .refine((d) => d.endsAt > d.startsAt, {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

export const cancelBookingInputSchema = z.object({
  userId: z.string().uuid(),
  bookingId: z.string().uuid(),
  /**
   * When true, override timing policy and refund 100% of what was paid.
   * Set by the admin cancel path (DESIGN: decision 14). Default false.
   */
  fullRefund: z.boolean().optional(),
});

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
// CreateBookingInput (derived from schema — shared across quote/create/edit)
// ──────────────────────────────────────────────────────────────────────────────

export type CreateBookingInput = z.input<typeof createBookingInputSchema>;

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers shared by computeBookingArtifacts
// ──────────────────────────────────────────────────────────────────────────────

// ── Per-type quantity Zod schemas ────────────────────────────────────────────
// Parsed AFTER the service is loaded (pricing_type known), BEFORE quoting.
// Constraints: amounts that multiply into money must be non-negative and sane.

const houseSittingQuantitiesSchema = z.object({
  // Cat-only stays are valid (pricing supports 0 dogs); the ≥1-pet rule is
  // enforced at the booking layer (petsOk), not here.
  dogs: z.number().int().min(0),
  cats: z.number().int().min(0),
  nights: z.number().positive(),
  cantBeLeftAloneDays: z.number().int().min(0).optional(),
  walkMinutesPerDay: z.number().min(0).optional(),
  holidayDays: z.number().int().min(0).optional(),
});

const checkInQuantitiesSchema = z.object({
  hours: z.number().positive(),
  // Server-injected after Zod parse — accepted here so buildQuoteInput can propagate them.
  holidayDays: z.number().int().min(0).optional(),
  holidaySurchargeCents: z.number().int().nonnegative().optional(),
});

const walkQuantitiesSchema = z.object({
  hours: z.number().positive(),
  dogs: z.number().int().min(1),
  // Server-injected after Zod parse — accepted here so buildQuoteInput can propagate them.
  holidayDays: z.number().int().min(0).optional(),
  holidaySurchargeCents: z.number().int().nonnegative().optional(),
});

const trainingQuantitiesSchema = z.object({
  hours: z.number().positive(),
  // Server-injected after Zod parse — accepted here so buildQuoteInput can propagate them.
  holidayDays: z.number().int().min(0).optional(),
  holidaySurchargeCents: z.number().int().nonnegative().optional(),
});

const meetGreetQuantitiesSchema = z.object({}).strict();
type MeetGreetQty = z.infer<typeof meetGreetQuantitiesSchema>;

type HouseSittingQty = z.infer<typeof houseSittingQuantitiesSchema>;
type CheckInQty = z.infer<typeof checkInQuantitiesSchema>;
type WalkQty = z.infer<typeof walkQuantitiesSchema>;
type TrainingQty = z.infer<typeof trainingQuantitiesSchema>;

type ParsedQuantities =
  | { pricingType: "house_sitting"; data: HouseSittingQty }
  | { pricingType: "check_in"; data: CheckInQty }
  | { pricingType: "walk"; data: WalkQty }
  | { pricingType: "training"; data: TrainingQty }
  | { pricingType: "meet_greet"; data: MeetGreetQty };

type ParseQuantitiesResult =
  | ({ success: true } & ParsedQuantities)
  | { success: false; message: string };

/**
 * Human-readable summary of a quantities Zod failure. This message reaches the
 * booking UI (feedback rule: never surface raw zod issue JSON to users).
 */
function quantitiesErrorMessage(error: z.ZodError): string {
  const fields = [
    ...new Set(
      error.issues.map((i) => (i.path.length ? i.path.join(".") : "value")),
    ),
  ];
  return `Some booking details are missing or invalid (${fields.join(", ")}). Adjust your selection and try again.`;
}

/**
 * Validates and parses the `quantities` record against the per-type Zod schema.
 * Called after the service's pricing_type is known, before any quoting.
 * Returns a typed discriminated result so `buildQuoteInput` receives validated values.
 */
export function parseQuantities(
  pricingType: string,
  raw: Record<string, unknown>,
): ParseQuantitiesResult {
  switch (pricingType) {
    case "house_sitting": {
      const r = houseSittingQuantitiesSchema.safeParse(raw);
      if (!r.success)
        return { success: false, message: quantitiesErrorMessage(r.error) };
      return { success: true, pricingType: "house_sitting", data: r.data };
    }
    case "check_in": {
      const r = checkInQuantitiesSchema.safeParse(raw);
      if (!r.success)
        return { success: false, message: quantitiesErrorMessage(r.error) };
      return { success: true, pricingType: "check_in", data: r.data };
    }
    case "walk": {
      const r = walkQuantitiesSchema.safeParse(raw);
      if (!r.success)
        return { success: false, message: quantitiesErrorMessage(r.error) };
      return { success: true, pricingType: "walk", data: r.data };
    }
    case "training": {
      const r = trainingQuantitiesSchema.safeParse(raw);
      if (!r.success)
        return { success: false, message: quantitiesErrorMessage(r.error) };
      return { success: true, pricingType: "training", data: r.data };
    }
    case "meet_greet": {
      const r = meetGreetQuantitiesSchema.safeParse(raw);
      if (!r.success)
        return { success: false, message: quantitiesErrorMessage(r.error) };
      return { success: true, pricingType: "meet_greet", data: r.data };
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
export function buildQuoteInput(opts: {
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
        holidayDays: q.data.holidayDays,
        holidaySurchargeCents: q.data.holidaySurchargeCents,
        ...shared,
      } as QuoteInput;

    case "walk":
      return {
        pricingType: "walk",
        pricingConfig: opts.pricingConfig as QuoteInput["pricingConfig"],
        hours: q.data.hours,
        dogs: q.data.dogs,
        holidayDays: q.data.holidayDays,
        holidaySurchargeCents: q.data.holidaySurchargeCents,
        ...shared,
      } as QuoteInput;

    case "training":
      return {
        pricingType: "training",
        pricingConfig: opts.pricingConfig as QuoteInput["pricingConfig"],
        hours: q.data.hours,
        holidayDays: q.data.holidayDays,
        holidaySurchargeCents: q.data.holidaySurchargeCents,
        ...shared,
      } as QuoteInput;

    case "meet_greet":
      return {
        pricingType: "meet_greet",
        pricingConfig: opts.pricingConfig as QuoteInput["pricingConfig"],
        ...shared,
      } as QuoteInput;

    default: {
      // Exhaustiveness check — TypeScript narrows q to never here.
      const _exhaustive: never = q;
      throw new Error(`Unknown pricingType: ${String(_exhaustive)}`);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// BookingQuoteArtifacts + computeBookingArtifacts (shared by quote/create/edit)
// ──────────────────────────────────────────────────────────────────────────────

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
export interface BookingQuoteArtifacts {
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
  /** Human-readable warnings for admin-skipped gates (empty under client policy). */
  warnings: string[];
  /**
   * The validated + coerced create input (schema output: startsAt/endsAt are
   * Dates). Surfaced so create-core reuses it instead of re-parsing (A16).
   */
  input: z.output<typeof createBookingInputSchema>;
}

export type ArtifactsResult =
  | { kind: "success"; artifacts: BookingQuoteArtifacts }
  | { kind: "refuse"; reason: string }
  | { kind: "blocked_debt"; owedCents: number }
  | { kind: "onboarding_incomplete" }
  | { kind: "forms_incomplete" }
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
export async function computeBookingArtifacts(
  deps: BookingServiceDeps,
  rawInput: CreateBookingInput,
  policy: MutationPolicy,
): Promise<ArtifactsResult> {
  // 1. Validate
  const parseResult = createBookingInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return { kind: "validation_error", message: parseResult.error.message };
  }
  const input = parseResult.data;
  const { repo } = deps;

  const warnings: string[] = [];

  // Debt gate (DESIGN: cancellation/refund). Any unsettled balance blocks BOTH
  // the quote preview and the create call — checked here in the shared path.
  const outstandingDebtCents = await repo.getOutstandingDebtCents(input.userId);
  if (outstandingDebtCents > 0) {
    if (policy.skipDebtGate) {
      warnings.push(`Client owes $${(outstandingDebtCents / 100).toFixed(2)}.`);
    } else {
      return { kind: "blocked_debt", owedCents: outstandingDebtCents };
    }
  }

  // Onboarding gate (DESIGN: meet-and-greet). A client may book paid services
  // only once approved; a meet_greet_pending client may book ONLY the
  // meet-and-greet, and only one at a time. info_pending / declined book nothing.
  const onboardingStatus = await repo.getOnboardingStatus(input.userId);
  if (onboardingStatus !== "approved") {
    const isMeetGreet = input.serviceSlug === MEET_GREET_SLUG;
    // A non-approved client is blocked unless they are meet_greet_pending AND
    // booking the meet-greet AND have no active meet-greet yet (one at a time).
    // The hasActiveBooking check short-circuits — it only runs for the allowed
    // meet_greet_pending + meet-greet combination.
    const meetGreetAllowed =
      onboardingStatus === "meet_greet_pending" &&
      isMeetGreet &&
      !(await repo.hasActiveBookingForServiceSlug(
        input.userId,
        MEET_GREET_SLUG,
      ));
    if (!meetGreetAllowed) {
      if (policy.skipOnboardingGate) {
        warnings.push(`Client onboarding status is '${onboardingStatus}'.`);
      } else {
        return { kind: "onboarding_incomplete" };
      }
    }
  }

  // 2. Load from DB (service + settings + profile in parallel per A15).
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

  // Forms gate: if the service requires a form (form_key is set), the client must
  // have submitted it. Check runs in parallel with parsePricingConfig (sync) by
  // firing the repo call immediately — no serial await before the gate check.
  const formResponsePromise =
    service.form_key !== null
      ? repo.hasFormResponse(input.userId, service.form_key)
      : Promise.resolve(true); // no required form → trivially satisfied

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

  // Await the form response check (fired above, overlaps with parsePricingConfig).
  const hasForm = await formResponsePromise;
  if (!hasForm) {
    if (policy.skipFormsGate) {
      warnings.push(
        `Client has not completed the required '${service.form_key}' form.`,
      );
    } else {
      return { kind: "forms_incomplete" };
    }
  }

  // 3. Derive pet-aware counts from assigned pets (server-trusted, like money),
  // then validate quantities. When petIds are supplied for a pet-aware service,
  // the dog/cat counts come from the OWNED pets — never the client payload.
  // Absent petIds → fall back to the client-supplied counts (legacy path).
  let quantitiesRaw = input.quantities;
  const petIds = input.petIds ?? [];
  const petAware =
    service.pricing_type === "house_sitting" || service.pricing_type === "walk";
  if (petAware && petIds.length > 0) {
    const ownedPets = await repo.getPetsByIds(input.userId, petIds);
    if (ownedPets.length !== petIds.length) {
      return {
        kind: "validation_error",
        message: "One or more selected pets were not found.",
      };
    }
    const dogs = ownedPets.filter((p) => p.species === "dog").length;
    const cats = ownedPets.filter((p) => p.species === "cat").length;
    quantitiesRaw =
      service.pricing_type === "house_sitting"
        ? { ...quantitiesRaw, dogs, cats }
        : { ...quantitiesRaw, dogs };
  }

  const quantitiesResult = parseQuantities(service.pricing_type, quantitiesRaw);
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
      if (policy.skipDistanceRefuse) {
        warnings.push(
          `Client is ${distanceMiles.toFixed(1)} mi away (beyond the ${settings.hard_cutoff_miles} mi cutoff).`,
        );
      } else {
        return {
          kind: "refuse",
          reason: `Client location is too far (${distanceMiles.toFixed(1)} mi). Hard cutoff is ${settings.hard_cutoff_miles} mi.`,
        };
      }
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
      if (policy.skipHorizonRefuse) {
        warnings.push(
          `Occurrence ${occStart.toISOString()} is beyond the ${settings.hard_max_advance_days}-day limit.`,
        );
        requiresApprovalByOccurrence.push(true); // out-of-horizon → always requires approval
        continue; // skip the normal push below for this occurrence
      }
      return {
        kind: "refuse",
        reason: `Requested start ${occStart.toISOString()} is beyond the ${settings.hard_max_advance_days}-day booking limit.`,
      };
    }
    requiresApprovalByOccurrence.push(
      baseRequiresApproval || timeDecision === "pending",
    );
  }

  // 6. Build quote for the first (representative) occurrence.
  //    holidayDays is SERVER-DERIVED from dates + settings.holiday_dates —
  //    any client-supplied value is overridden here (money invariant).
  const roundTripDriveMinutes =
    service.pricing_type === "house_sitting" ? 0 : 2 * oneWayMin;

  const derivedHolidayDays = deriveHolidayDays(
    service.pricing_type,
    input.startsAt,
    input.endsAt,
    settings.holiday_dates,
  );

  // Inject the server-derived count into the quantities record before building
  // the QuoteInput. For house_sitting this overrides any client-supplied
  // holidayDays. For hourly types (walk, check_in, training), we inject both
  // holidayDays and holidaySurchargeCents (from settings) so the quote core
  // can add the premium-day line — the client cannot supply these values.
  let quantitiesWithHoliday: typeof quantities;
  if (quantities.pricingType === "house_sitting") {
    quantitiesWithHoliday = {
      success: true as const,
      pricingType: "house_sitting" as const,
      data: { ...quantities.data, holidayDays: derivedHolidayDays },
    };
  } else if (
    quantities.pricingType === "walk" ||
    quantities.pricingType === "check_in" ||
    quantities.pricingType === "training"
  ) {
    quantitiesWithHoliday = {
      success: true as const,
      pricingType: quantities.pricingType,
      data: {
        ...quantities.data,
        holidayDays: derivedHolidayDays,
        holidaySurchargeCents: settings.holiday_surcharge_cents,
      },
    } as typeof quantities;
  } else {
    quantitiesWithHoliday = quantities;
  }

  const quoteInput = buildQuoteInput({
    pricingType: service.pricing_type,
    pricingConfig,
    quantities: quantitiesWithHoliday,
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
      warnings,
      input,
    },
  };
}

// Re-export CLIENT_POLICY so cores can default to it without a direct import.
export { CLIENT_POLICY };
// Re-export fitsWindow / passesGuards / BookingRuleSettings consumed by multiple cores.
export { fitsWindow, passesGuards };
export type { BookingRuleSettings };

// ──────────────────────────────────────────────────────────────────────────────
// Slot-validation helper (A14)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Maps a settings row to the BookingRuleSettings the guard checks consume.
 * Single source of truth — previously rebuilt inline in 4 cores (A14). The
 * guard/window *pairing* is deliberately NOT shared: each core gates the two
 * checks behind its own policy flags (skipHoursLeadGuards / skipWindowFit),
 * short-circuits between them, fetches openWindows lazily, and diverges on
 * warning-vs-silent admin-skip behavior — a combined runner would change those.
 */
export function toRuleSettings(settings: SettingsRow): BookingRuleSettings {
  return {
    bookingOpenMinute: settings.booking_open_minute,
    bookingCloseMinute: settings.booking_close_minute,
    minLeadTimeHours: settings.min_lead_time_hours,
    hardMaxAdvanceDays: settings.hard_max_advance_days,
  };
}
