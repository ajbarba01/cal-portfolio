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
import { computeRefund, computeCancellationDebtCents } from "./cancellation";
import type { PaymentGateway } from "@/features/payments/types";
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
  BookingEditRow,
  ServiceRow,
  SettingsRow,
} from "./booking-repository";
import type { MutationPolicy } from "./mutation-policy";
import { CLIENT_POLICY } from "./mutation-policy";
import type { QuoteInput, QuoteBreakdown } from "@/features/pricing/types";
import type { RecurrenceRule } from "./recurrence";
import type { BookingRuleSettings } from "./availability";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Slug of the meet-and-greet service — the only service a meet_greet_pending client may book. */
const MEET_GREET_SLUG = "meet-greet";

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
    /**
     * Assigned pet ids (pet-aware services only). When present, the dog/cat
     * COUNTS are derived server-side from these (overriding any client-supplied
     * counts, like money) and the pets are linked via booking_pets. Optional for
     * backward compatibility — count-only submits still quote correctly.
     */
    petIds: z.array(z.string().uuid()).optional(),
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
  | { kind: "success"; bookingIds: string[]; warnings: string[] }
  | { kind: "refuse"; reason: string }
  | { kind: "slot_taken" }
  | { kind: "unavailable"; reason: string }
  | { kind: "blocked_debt"; owedCents: number }
  | { kind: "onboarding_incomplete" }
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
  /** Warnings for admin-skipped gates (empty under client policy). */
  warnings: string[];
}

export type PreviewResult =
  | { kind: "success"; preview: BookingQuotePreview }
  | { kind: "refuse"; reason: string }
  | { kind: "blocked_debt"; owedCents: number }
  | { kind: "onboarding_incomplete" }
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
  /** Human-readable warnings for admin-skipped gates (empty under client policy). */
  warnings: string[];
}

type ArtifactsResult =
  | { kind: "success"; artifacts: BookingQuoteArtifacts }
  | { kind: "refuse"; reason: string }
  | { kind: "blocked_debt"; owedCents: number }
  | { kind: "onboarding_incomplete" }
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
      warnings,
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
  policy: MutationPolicy = CLIENT_POLICY,
): Promise<PreviewResult> {
  const result = await computeBookingArtifacts(deps, rawInput, policy);
  if (result.kind !== "success") return result;
  const { breakdown, distanceMiles, requiresApproval, decision, warnings } =
    result.artifacts;
  return {
    kind: "success",
    preview: {
      breakdown,
      finalCents: breakdown.finalCents,
      distanceMiles,
      requiresApproval,
      decision,
      warnings,
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
  policy: MutationPolicy = CLIENT_POLICY,
): Promise<CreateBookingResult> {
  // 1–5. Load artifacts + quote/approval (shared with the preview path).
  const result = await computeBookingArtifacts(deps, rawInput, policy);
  if (result.kind === "validation_error") {
    return { kind: "validation_error", message: result.message };
  }
  if (result.kind === "error") {
    return { kind: "error", message: result.message };
  }
  if (result.kind === "refuse") {
    return { kind: "refuse", reason: result.reason };
  }
  if (result.kind === "blocked_debt") {
    return { kind: "blocked_debt", owedCents: result.owedCents };
  }
  if (result.kind === "onboarding_incomplete") {
    return { kind: "onboarding_incomplete" };
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

  const warnings = [...result.artifacts.warnings];

  // 6. Booking-rule guards per occurrence (policy-aware).
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
      if (policy.skipHoursLeadGuards) {
        warnings.push(
          `Occurrence at ${occStart.toISOString()} is outside normal booking rules (hours / lead time).`,
        );
      } else {
        return {
          kind: "unavailable",
          reason: `Occurrence at ${occStart.toISOString()} does not meet booking rules (hours-of-day, lead time, or max advance).`,
        };
      }
    }
  }

  // 7. Availability-window containment (policy-aware).
  // DESIGN INTENT: availability_windows define when Cal is available to work.
  // A booking is only accepted if EVERY occurrence falls fully inside at least
  // one open window. Zero windows → all bookings are unavailable (correct:
  // Cal has not published any open slots yet).
  //
  // Fetched once here, unconditionally — even when skipWindowFit is set.
  // The per-occurrence loop below needs the window list to emit a warning
  // for each skipped occurrence; pulling it inside the skipWindowFit branch
  // would silently suppress those warnings.
  const openWindows = await repo.getOpenWindows(now);
  for (const occStart of occurrences) {
    const occEnd = new Date(occStart.getTime() + durationMs);
    if (!fitsWindow({ startsAt: occStart, endsAt: occEnd }, openWindows)) {
      if (policy.skipWindowFit) {
        warnings.push(
          `Occurrence at ${occStart.toISOString()} is outside any published availability window.`,
        );
      } else {
        return {
          kind: "unavailable",
          reason: `Occurrence at ${occStart.toISOString()} does not fall within any open availability window.`,
        };
      }
    }
  }

  // 8–9. Derive initial status PER OCCURRENCE (a series can straddle the time
  // horizon: near occurrences confirm, far ones pend — requires_approval is
  // computed per occurrence in computeBookingArtifacts).
  const statuses: BookingStatusDb[] = [];
  for (const occRequiresApproval of requiresApprovalByOccurrence) {
    if (policy.forceStatus) {
      statuses.push(policy.forceStatus);
      continue;
    }
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
    // Link assigned pets to every occurrence (pet-aware services only).
    const petIds = input.petIds ?? [];
    if (petIds.length > 0) {
      await repo.insertBookingPets(ids, petIds);
    }
    return { kind: "success", bookingIds: ids, warnings };
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
// rescheduleBookingCore — move a booking's time in place
// ──────────────────────────────────────────────────────────────────────────────

export type RescheduleBookingResult =
  | { kind: "success" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "invalid_status" }
  | { kind: "refuse"; reason: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "slot_taken" }
  | { kind: "error"; message: string };

export interface RescheduleBookingInput {
  bookingId: string;
  /** Verified session user id — ownership is checked against the booking row. */
  userId: string;
  /** New start instant; the booking's existing duration is preserved. */
  startsAt: Date;
}

/** Statuses a client may reschedule from (terminal/past states are rejected). */
const RESCHEDULABLE_STATUSES: BookingStatusDb[] = [
  "pending_approval",
  "confirmed",
];

/**
 * Generalized reschedule: validates the new slot the same way createBookingCore
 * validates a new booking (rule guards, availability-window containment, the
 * time-horizon hard cap), then UPDATEs the row's time IN PLACE. The booking's
 * duration, status, and price are preserved — only the start/end move. The DB
 * exclusion constraint is the overlap arbiter (and naturally excludes the row's
 * own old time), so this sidesteps the create-path's one-at-a-time gate.
 *
 * This is the shared primitive for rescheduling ANY future booking; the
 * meet-greet onboarding flow is its first consumer.
 */
export async function rescheduleBookingCore(
  deps: BookingServiceDeps,
  input: RescheduleBookingInput,
): Promise<RescheduleBookingResult> {
  const { repo, now } = deps;

  const booking = await repo.getBookingTimes(input.bookingId);
  if (!booking) return { kind: "not_found" };
  if (booking.client_id !== input.userId) return { kind: "forbidden" };
  if (!RESCHEDULABLE_STATUSES.includes(booking.status)) {
    return { kind: "invalid_status" };
  }

  // Preserve the booking's duration; only the start moves.
  const durationMs = booking.endsAt.getTime() - booking.startsAt.getTime();
  const startsAt = input.startsAt;
  const endsAt = new Date(startsAt.getTime() + durationMs);

  const settings = await repo.getSettings();
  const ruleSettings: BookingRuleSettings = {
    bookingOpenMinute: settings.booking_open_minute,
    bookingCloseMinute: settings.booking_close_minute,
    minLeadTimeHours: settings.min_lead_time_hours,
    hardMaxAdvanceDays: settings.hard_max_advance_days,
  };

  // Mirror createBookingCore validation for the new slot.
  const timeDecision = deriveTimeApproval(startsAt, now, {
    autoConfirmHorizonDays: settings.auto_confirm_horizon_days,
    hardMaxAdvanceDays: settings.hard_max_advance_days,
  });
  if (timeDecision === "refuse") {
    return {
      kind: "refuse",
      reason: `Requested start ${startsAt.toISOString()} is beyond the ${settings.hard_max_advance_days}-day booking limit.`,
    };
  }
  if (!passesGuards({ startsAt, endsAt }, ruleSettings, now)) {
    return {
      kind: "unavailable",
      reason:
        "The selected time does not meet booking rules (hours-of-day, lead time, or max advance).",
    };
  }
  const openWindows = await repo.getOpenWindows(now);
  if (!fitsWindow({ startsAt, endsAt }, openWindows)) {
    return {
      kind: "unavailable",
      reason: "The selected time is not within an open availability window.",
    };
  }

  try {
    await repo.updateBookingTimes(input.bookingId, startsAt, endsAt);
    return { kind: "success" };
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "23P01") {
      return { kind: "slot_taken" };
    }
    return {
      kind: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// cancelBookingCore
// ──────────────────────────────────────────────────────────────────────────────

export type CancelBookingInput = z.input<typeof cancelBookingInputSchema>;

/** Deps for the cancel + refund/no-show paths: a gateway is required to refund. */
export interface CancelDeps extends BookingServiceDeps {
  gateway: PaymentGateway;
}

/**
 * Core booking cancellation (testable via DI, no Next.js machinery).
 *
 * Applies the cancellation/refund policy (DESIGN): a refund is INITIATED via the
 * payment gateway (the Stripe `charge.refunded` webhook stays the sole writer of
 * `payment_status` — this path never writes it). An unpaid cancel inside the
 * cutoff writes a `client_debits` row for the forfeited amount.
 *
 * Ownership is checked here; the admin-override path passes the booking's own
 * client_id (see actions.ts).
 */
export async function cancelBookingCore(
  deps: CancelDeps,
  rawInput: CancelBookingInput,
): Promise<CancelBookingResult> {
  const parseResult = cancelBookingInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return { kind: "error", message: parseResult.error.message };
  }
  const input = parseResult.data;
  const { repo, now, gateway } = deps;

  const booking = await repo.getBookingWithPayments(input.bookingId);
  if (!booking) {
    return { kind: "not_found" };
  }
  if (booking.client_id !== input.userId) {
    return { kind: "forbidden" };
  }

  const transitionResult = transition(booking.status, "cancel", {
    requiresApproval: false, // context not needed for cancel
  });
  if ("error" in transitionResult) {
    return { kind: "error", message: transitionResult.error };
  }

  const settings = await repo.getSettings();
  const paidCents = booking.payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + p.amountCents, 0);

  const refund = computeRefund({
    finalCents: booking.finalCents,
    paidCents,
    startsAt: booking.startsAt,
    now,
    fullRefundHours: settings.cancellation_full_refund_hours,
    lateRefundPct: settings.late_cancel_refund_pct,
  });

  // Initiate the default-tier refund (webhook re-projects payment_status).
  if (refund.refundCents > 0) {
    const succeeded = booking.payments.find((p) => p.status === "succeeded");
    if (succeeded) {
      await gateway.refund(succeeded.paymentIntentId, refund.refundCents);
    }
  }

  // Unpaid late cancel → debt for the forfeited amount.
  if (refund.tier === "none") {
    const debtCents = computeCancellationDebtCents({
      finalCents: booking.finalCents,
      reason: "late_cancel",
      lateRefundPct: settings.late_cancel_refund_pct,
      noShowChargePct: settings.no_show_charge_pct,
    });
    if (debtCents > 0) {
      await repo.insertDebit({
        client_id: booking.client_id,
        booking_id: booking.id,
        amount_cents: debtCents,
        reason: "late_cancel",
      });
    }
  }

  await repo.updateBookingStatus(input.bookingId, transitionResult.state);
  return { kind: "success" };
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin operations: grant-full-refund, mark-no-show, settle-debt
// ──────────────────────────────────────────────────────────────────────────────

export type AdminBookingResult =
  | { kind: "success" }
  | { kind: "not_found" }
  | { kind: "invalid_state"; message: string }
  | { kind: "error"; message: string };

/**
 * Admin grants the remaining (full) refund beyond the default late-cancel tier:
 * refunds whatever paid amount has not yet been refunded. Authorization is the
 * caller's responsibility (admin-gated action wrapper).
 */
export async function grantFullRefundCore(
  deps: CancelDeps,
  bookingId: string,
): Promise<AdminBookingResult> {
  const { repo, gateway } = deps;
  const booking = await repo.getBookingWithPayments(bookingId);
  if (!booking) return { kind: "not_found" };

  const paidCents = booking.payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + p.amountCents, 0);
  const refundedCents = booking.payments
    .filter((p) => p.status === "refunded")
    .reduce((sum, p) => sum + p.amountCents, 0);
  const remaining = paidCents - refundedCents;
  if (remaining <= 0) return { kind: "success" }; // nothing left to refund

  const intent =
    booking.payments.find((p) => p.status === "succeeded")?.paymentIntentId ??
    booking.payments[0]?.paymentIntentId;
  if (!intent) return { kind: "success" };

  await gateway.refund(intent, remaining);
  return { kind: "success" };
}

/**
 * Admin marks a confirmed booking a no-show: transitions to the terminal
 * `no_show` state and writes a `client_debits` row for `no_show_charge_pct` of
 * the final amount. Authorization is the caller's responsibility.
 */
export async function markNoShowCore(
  deps: BookingServiceDeps,
  bookingId: string,
): Promise<AdminBookingResult> {
  const { repo } = deps;
  const booking = await repo.getBookingWithPayments(bookingId);
  if (!booking) return { kind: "not_found" };

  const transitionResult = transition(booking.status, "no_show", {
    requiresApproval: false,
  });
  if ("error" in transitionResult) {
    return { kind: "invalid_state", message: transitionResult.error };
  }

  await repo.updateBookingStatus(bookingId, transitionResult.state);

  const settings = await repo.getSettings();
  const debtCents = computeCancellationDebtCents({
    finalCents: booking.finalCents,
    reason: "no_show",
    lateRefundPct: settings.late_cancel_refund_pct,
    noShowChargePct: settings.no_show_charge_pct,
  });
  if (debtCents > 0) {
    await repo.insertDebit({
      client_id: booking.client_id,
      booking_id: booking.id,
      amount_cents: debtCents,
      reason: "no_show",
    });
  }

  return { kind: "success" };
}

/** Admin marks a debit settled (Cal collected offline or the client paid). */
export async function settleDebtCore(
  deps: BookingServiceDeps,
  debitId: string,
): Promise<AdminBookingResult> {
  await deps.repo.settleDebit(debitId, deps.now);
  return { kind: "success" };
}

// ──────────────────────────────────────────────────────────────────────────────
// editBookingCore — in-place edit (time / pets / quantities / comments)
// ──────────────────────────────────────────────────────────────────────────────

export type EditBookingResult =
  | { kind: "success"; warnings: string[] }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "invalid_status" }
  | { kind: "price_locked" }
  | { kind: "blocked_debt"; owedCents: number }
  | { kind: "onboarding_incomplete" }
  | { kind: "refuse"; reason: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "slot_taken" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

export interface EditBookingPatch {
  startsAt?: Date;
  endsAt?: Date;
  petIds?: string[];
  quantities?: Record<string, unknown>;
  comments?: string;
}

export interface EditBookingInput {
  bookingId: string;
  /** Verified session id. Ownership enforced unless the policy skips it (admin). */
  actorUserId: string;
  policy: MutationPolicy;
  patch: EditBookingPatch;
}

/** Statuses a booking may be edited from (terminal/completed rejected). */
const EDITABLE_STATUSES: BookingStatusDb[] = ["pending_approval", "confirmed"];

/** Extract the raw quantity record from a stored QuoteInput jsonb. */
function quantitiesFromQuoteInputs(qi: unknown): Record<string, unknown> {
  const q = (qi ?? {}) as Record<string, unknown>;
  const keys = [
    "dogs",
    "cats",
    "nights",
    "hours",
    "cantBeLeftAloneDays",
    "walkMinutesPerDay",
    "holidayDays",
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) if (q[k] !== undefined) out[k] = q[k];
  return out;
}

export interface EditQuoteInput {
  merged: CreateBookingInput;
  startsAt: Date;
  endsAt: Date;
}

/** Merge an edit patch over a booking's current shape into a re-quote input. */
export function buildEditQuoteInput(
  booking: BookingEditRow,
  patch: EditBookingPatch,
): EditQuoteInput {
  const startsAt = patch.startsAt ?? booking.startsAt;
  const durationMs = booking.endsAt.getTime() - booking.startsAt.getTime();
  const endsAt = patch.endsAt ?? new Date(startsAt.getTime() + durationMs);
  const merged: CreateBookingInput = {
    userId: booking.client_id,
    serviceSlug: booking.service_slug,
    startsAt,
    endsAt,
    quantities: {
      ...quantitiesFromQuoteInputs(booking.quote_inputs),
      ...(patch.quantities ?? {}),
    },
    petIds: patch.petIds ?? booking.petIds,
    recurringRule: null,
  };
  return { merged, startsAt, endsAt };
}

export async function editBookingCore(
  deps: BookingServiceDeps,
  input: EditBookingInput,
): Promise<EditBookingResult> {
  const { repo, now } = deps;
  const { policy, patch } = input;

  const booking = await repo.getBookingForEdit(input.bookingId);
  if (!booking) return { kind: "not_found" };

  // Ownership — enforced unless an admin policy.
  // isAdminActor keys off skipOnboardingGate (true only in ADMIN_POLICY);
  // CLIENT_POLICY sets it false. If a future policy needs admin context without
  // skipping onboarding, replace with an explicit policy.bypassOwnership flag.
  const isAdminActor = policy.skipOnboardingGate;
  if (!isAdminActor && booking.client_id !== input.actorUserId) {
    return { kind: "forbidden" };
  }

  if (!EDITABLE_STATUSES.includes(booking.status)) {
    return { kind: "invalid_status" };
  }

  // Paid-lock: a price-affecting patch (pets/quantities) is rejected once paid.
  const priceAffecting =
    patch.petIds !== undefined || patch.quantities !== undefined;
  if (booking.paidCents > 0 && priceAffecting) {
    return { kind: "price_locked" };
  }

  // Client cancellation-cutoff gate (uses the CURRENT start).
  if (!policy.skipCancellationCutoff) {
    const settings = await repo.getSettings();
    const cutoffMs =
      booking.startsAt.getTime() -
      settings.cancellation_full_refund_hours * 60 * 60 * 1000;
    if (now.getTime() > cutoffMs) {
      return {
        kind: "unavailable",
        reason:
          "This booking is inside the cancellation window and can no longer be changed online.",
      };
    }
  }

  // Build the merged shape and re-quote via the shared pipeline.
  const {
    merged: mergedInput,
    startsAt,
    endsAt,
  } = buildEditQuoteInput(booking, patch);

  const artifacts = await computeBookingArtifacts(deps, mergedInput, policy);
  if (artifacts.kind === "validation_error")
    return { kind: "validation_error", message: artifacts.message };
  if (artifacts.kind === "error")
    return { kind: "error", message: artifacts.message };
  if (artifacts.kind === "refuse")
    return { kind: "refuse", reason: artifacts.reason };
  if (artifacts.kind === "blocked_debt")
    return { kind: "blocked_debt", owedCents: artifacts.owedCents };
  if (artifacts.kind === "onboarding_incomplete")
    return { kind: "onboarding_incomplete" };

  const warnings = [...artifacts.artifacts.warnings];
  const {
    settings: s,
    quoteInput,
    breakdown,
    requiresApprovalByOccurrence,
  } = artifacts.artifacts;

  // Slot validation (hours/lead/horizon + window-fit), policy-aware.
  const ruleSettings: BookingRuleSettings = {
    bookingOpenMinute: s.booking_open_minute,
    bookingCloseMinute: s.booking_close_minute,
    minLeadTimeHours: s.min_lead_time_hours,
    hardMaxAdvanceDays: s.hard_max_advance_days,
  };
  if (!policy.skipHoursLeadGuards) {
    if (!passesGuards({ startsAt, endsAt }, ruleSettings, now)) {
      return {
        kind: "unavailable",
        reason:
          "The selected time does not meet booking rules (hours, lead time, or max advance).",
      };
    }
  } else if (!passesGuards({ startsAt, endsAt }, ruleSettings, now)) {
    warnings.push(
      "Selected time is outside normal booking rules (hours / lead time).",
    );
  }

  if (!policy.skipWindowFit) {
    const openWindows = await repo.getOpenWindows(now);
    if (!fitsWindow({ startsAt, endsAt }, openWindows)) {
      return {
        kind: "unavailable",
        reason: "The selected time is not within an open availability window.",
      };
    }
  } else {
    const openWindows = await repo.getOpenWindows(now);
    if (!fitsWindow({ startsAt, endsAt }, openWindows)) {
      warnings.push(
        "Selected time is outside any published availability window.",
      );
    }
  }

  // Re-derive status (per-occurrence array has exactly one element for an edit).
  const requiresApproval = requiresApprovalByOccurrence[0];
  let status: BookingStatusDb;
  if (policy.forceStatus) {
    status = policy.forceStatus;
  } else {
    const stat = transition("draft", "submit", { requiresApproval });
    if ("error" in stat) return { kind: "error", message: stat.error };
    status = stat.state;
  }

  // Detach from a series (records the skip on the parent), if linked.
  let seriesId: string | null = booking.series_id;
  if (booking.series_id) {
    await repo.appendSeriesSkip(
      booking.series_id,
      booking.startsAt.toISOString(),
    );
    seriesId = null;
  }

  // Persist. booking_pets swap only when pets were patched.
  try {
    await repo.updateBookingEdited(input.bookingId, {
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status,
      quote_inputs: quoteInput as unknown,
      quote_breakdown: breakdown as unknown,
      final_cents: breakdown.finalCents,
      requires_approval: requiresApproval,
      comments: patch.comments ?? booking.comments,
      series_id: seriesId,
    });
    if (patch.petIds !== undefined) {
      await repo.swapBookingPets(input.bookingId, patch.petIds);
    }
    return { kind: "success", warnings };
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "23P01")
      return { kind: "slot_taken" };
    return {
      kind: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export type PreviewEditResult =
  | { kind: "preview"; preview: BookingQuotePreview; requiresApproval: boolean }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "invalid_status" }
  | { kind: "price_locked" }
  | { kind: "blocked_debt"; owedCents: number }
  | { kind: "onboarding_incomplete" }
  | { kind: "refuse"; reason: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

/**
 * Read-only twin of editBookingCore: same load + ownership + status + paid-lock
 * + merge (buildEditQuoteInput) + re-quote pipeline, but it NEVER persists. The
 * UI calls this for the live preview so "what you see" equals what Save commits.
 */
export async function previewEditCore(
  deps: BookingServiceDeps,
  input: EditBookingInput,
): Promise<PreviewEditResult> {
  const { repo } = deps;
  const { policy, patch } = input;

  const booking = await repo.getBookingForEdit(input.bookingId);
  if (!booking) return { kind: "not_found" };

  const isAdminActor = policy.skipOnboardingGate;
  if (!isAdminActor && booking.client_id !== input.actorUserId) {
    return { kind: "forbidden" };
  }
  if (!EDITABLE_STATUSES.includes(booking.status)) {
    return { kind: "invalid_status" };
  }
  const priceAffecting =
    patch.petIds !== undefined || patch.quantities !== undefined;
  if (booking.paidCents > 0 && priceAffecting) {
    return { kind: "price_locked" };
  }

  const {
    merged: mergedInput,
    startsAt,
    endsAt,
  } = buildEditQuoteInput(booking, patch);
  const artifacts = await computeBookingArtifacts(deps, mergedInput, policy);
  if (artifacts.kind === "validation_error")
    return { kind: "validation_error", message: artifacts.message };
  if (artifacts.kind === "error")
    return { kind: "error", message: artifacts.message };
  if (artifacts.kind === "refuse")
    return { kind: "refuse", reason: artifacts.reason };
  if (artifacts.kind === "blocked_debt")
    return { kind: "blocked_debt", owedCents: artifacts.owedCents };
  if (artifacts.kind === "onboarding_incomplete")
    return { kind: "onboarding_incomplete" };

  const {
    settings: s,
    breakdown,
    distanceMiles,
    requiresApproval,
    decision,
    warnings,
  } = artifacts.artifacts;

  // Slot/window validation — mirrors editBookingCore (Fix 3). Read-only: no
  // persistence; admin-skip branches are silent (no warnings array to surface).
  const ruleSettings: BookingRuleSettings = {
    bookingOpenMinute: s.booking_open_minute,
    bookingCloseMinute: s.booking_close_minute,
    minLeadTimeHours: s.min_lead_time_hours,
    hardMaxAdvanceDays: s.hard_max_advance_days,
  };
  if (!policy.skipHoursLeadGuards) {
    if (!passesGuards({ startsAt, endsAt }, ruleSettings, deps.now)) {
      return {
        kind: "unavailable",
        reason:
          "The selected time does not meet booking rules (hours, lead time, or max advance).",
      };
    }
  }
  if (!policy.skipWindowFit) {
    const openWindows = await repo.getOpenWindows(deps.now);
    if (!fitsWindow({ startsAt, endsAt }, openWindows)) {
      return {
        kind: "unavailable",
        reason: "The selected time is not within an open availability window.",
      };
    }
  }

  const preview: BookingQuotePreview = {
    breakdown,
    finalCents: breakdown.finalCents,
    distanceMiles: distanceMiles ?? null,
    requiresApproval,
    decision,
    warnings,
  };
  // hoisted for callers that need approval without drilling into preview
  return { kind: "preview", preview, requiresApproval };
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
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
});

const walkQuantitiesSchema = z.object({
  hours: z.number().positive(),
  dogs: z.number().int().min(1),
});

const trainingQuantitiesSchema = z.object({
  hours: z.number().positive(),
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
    case "meet_greet": {
      const r = meetGreetQuantitiesSchema.safeParse(raw);
      if (!r.success) return { success: false, message: r.error.message };
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
