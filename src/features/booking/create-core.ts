/**
 * createBookingCore — core booking creation logic.
 */

import { asJson } from "./booking-repository-types";
import type { BookingStatusDb } from "./booking-repository-types";
import type { MutationPolicy } from "./mutation-policy";
import { CLIENT_POLICY } from "./mutation-policy";
import { transition } from "./state-machine";
import {
  requirementsSatisfied,
  type RequirementItem,
} from "./required-profiles";
import {
  computeBookingArtifacts,
  toRuleSettings,
  passesGuards,
  fitsWindow,
  fitsOvernightNights,
  type BookingServiceDeps,
  type CreateBookingInput,
} from "./booking-service-shared";
import { findDriveBufferConflicts } from "./drive-buffer-guard";

// ──────────────────────────────────────────────────────────────────────────────
// Result type
// ──────────────────────────────────────────────────────────────────────────────

export type CreateBookingResult =
  | { kind: "success"; bookingIds: string[]; warnings: string[] }
  | { kind: "refuse"; reason: string }
  | { kind: "slot_taken" }
  | { kind: "unavailable"; reason: string }
  | { kind: "blocked_debt"; owedCents: number }
  | { kind: "onboarding_incomplete" }
  | { kind: "profiles_incomplete"; requirements: RequirementItem[] }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

// Re-export CreateBookingInput so existing importers from booking-service work.
export type { CreateBookingInput };

/** The one message an unexpected create failure shows; details go to the log. */
const CREATE_ERROR_MESSAGE = "Something went wrong. Please try again.";

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
 *  7. Enforce availability containment per occurrence, gated by service type:
 *     time-based services must fit an open availability_window; house_sitting
 *     (a multi-day stay that can't fit an intraday window) must have every
 *     covered night in overnight_nights. Either empty → unavailable. This is the
 *     design intent: windows/nights define Cal's availability.
 *  8–9. Derive initial status via state machine.
 * 10. Insert all rows (reusing the one quoteInput/breakdown) via service role;
 *     catch 23P01 → slot_taken, any other insert failure → error.
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
    requirements,
  } = result.artifacts;

  // Required-profiles gate — enforced on COMMIT only (the quote/receipt computes
  // regardless; see computeBookingArtifacts). A client may not actually book
  // until every required profile is complete and fresh; admin (skipFormsGate) is
  // warn-don't-block (the warning is already folded into artifacts.warnings).
  if (!requirementsSatisfied(requirements) && !policy.skipFormsGate) {
    return { kind: "profiles_incomplete", requirements };
  }
  // userId / startsAt / endsAt come from the already-validated parsed input (A16).
  const { input } = result.artifacts;
  const durationMs = input.endsAt.getTime() - input.startsAt.getTime();

  const warnings = [...result.artifacts.warnings];

  // 6. Booking-rule guards per occurrence (policy-aware).
  const ruleSettings = toRuleSettings(settings);
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

  // 7. Availability containment (policy-aware), gated by service type.
  // DESIGN INTENT: a booking is only accepted if EVERY occurrence is available.
  // - Time-based services: each occurrence must fall fully inside an open
  //   intraday availability_window. Zero windows → unavailable.
  // - house_sitting: a stay is ONE multi-day occurrence and can never fit an
  //   intraday window. Overnight availability is the per-night overnight_nights
  //   set — the sole source of truth (migration 20260603140000). Every covered
  //   night must be published, or the occurrence is unavailable.
  //
  // Fetched once here, unconditionally — even when skipWindowFit is set — so the
  // per-occurrence loop can emit a warning for each skipped occurrence (pulling
  // the fetch inside the skipWindowFit branch would silently suppress them).
  const isHouseSitting = service.pricing_type === "house_sitting";
  const openWindows = isHouseSitting ? [] : await repo.getOpenWindows(now);
  const openNights = isHouseSitting
    ? await repo.getOpenNights(now)
    : new Set<string>();
  for (const occStart of occurrences) {
    const occEnd = new Date(occStart.getTime() + durationMs);
    const occ = { startsAt: occStart, endsAt: occEnd };
    const available = isHouseSitting
      ? fitsOvernightNights(occ, openNights)
      : fitsWindow(occ, openWindows);
    if (!available) {
      if (policy.skipWindowFit) {
        warnings.push(
          isHouseSitting
            ? `Occurrence at ${occStart.toISOString()} is outside Cal's published overnight availability.`
            : `Occurrence at ${occStart.toISOString()} is outside any published availability window.`,
        );
      } else {
        return {
          kind: "unavailable",
          reason: isHouseSitting
            ? `Occurrence at ${occStart.toISOString()} does not fall within Cal's overnight availability.`
            : `Occurrence at ${occStart.toISOString()} does not fall within any open availability window.`,
        };
      }
    }
  }

  // 7b. Drive-time spacing buffer guard (policy-aware).
  // Ensures each occurrence has enough travel time before/after relative to
  // all same-class active bookings. House-sitting (resident) is excluded —
  // it is a stay, not a round-trip visit, so no drive-time buffer applies.
  //
  // The guard runs for every time-based service regardless of the candidate's
  // own buffer: an existing exclusive booking has its OWN buffer that can reach
  // into the candidate's raw slot even when the candidate has no coordinates.
  if (service.pricing_type !== "house_sitting") {
    const conflicts = findDriveBufferConflicts({
      candidates: occurrences.map((occStart) => ({
        startsAt: occStart,
        endsAt: new Date(occStart.getTime() + durationMs),
      })),
      candidateDistanceMiles: result.artifacts.distanceMiles,
      existing: await repo.getActiveBusyRanges(now, service.concurrency),
      openWindows,
      settings,
    });

    for (const conflict of conflicts) {
      if (policy.skipBufferGuard) {
        warnings.push(
          `Occurrence at ${conflict.startsAt.toISOString()} conflicts with drive-time spacing.`,
        );
      } else {
        return {
          kind: "unavailable",
          reason:
            "That time doesn't leave enough travel time around another booking. Please pick another slot.",
        };
      }
    }
  }

  // 8–9. Derive initial status PER OCCURRENCE (a series can straddle the time
  // horizon: near occurrences confirm, far ones pend — requires_approval is
  // computed per occurrence in computeBookingArtifacts).
  const scheduled: Array<{
    startsAt: Date;
    status: BookingStatusDb;
    requiresApproval: boolean;
  }> = [];
  for (const [idx, occStart] of occurrences.entries()) {
    // computeBookingArtifacts pushes exactly one flag per occurrence, so a gap
    // here would mean the two are out of step — a broken invariant, not a case
    // to paper over with a default.
    const occRequiresApproval = requiresApprovalByOccurrence[idx];
    if (occRequiresApproval === undefined) {
      return { kind: "error", message: CREATE_ERROR_MESSAGE };
    }
    if (policy.forceStatus) {
      scheduled.push({
        startsAt: occStart,
        status: policy.forceStatus,
        requiresApproval: occRequiresApproval,
      });
      continue;
    }
    const statResult = transition("draft", "submit", {
      requiresApproval: occRequiresApproval,
    });
    if ("error" in statResult) {
      return { kind: "error", message: statResult.error };
    }
    scheduled.push({
      startsAt: occStart,
      status: statResult.state,
      requiresApproval: occRequiresApproval,
    });
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
      quote_inputs: asJson(quoteInput),
    });
  }

  // 10. Build insert rows. The quote is identical for every occurrence (it
  // depends only on quantities/config/modifiers, never on the date), so all
  // rows reuse the single quoteInput + breakdown computed above. Status and
  // requires_approval, however, are per-occurrence (time horizon).
  const insertRows = scheduled.map(({ startsAt, status, requiresApproval }) => {
    const occEnd = new Date(startsAt.getTime() + durationMs);
    return {
      client_id: input.userId,
      service_id: service.id,
      starts_at: startsAt.toISOString(),
      ends_at: occEnd.toISOString(),
      series_id: seriesId,
      status,
      concurrency: service.concurrency,
      distance_miles: result.artifacts.distanceMiles,
      quote_inputs: asJson(quoteInput),
      quote_breakdown: asJson(breakdown),
      final_cents: breakdown.finalCents,
      requires_approval: requiresApproval,
      discount_cents: 0, // see DISCOUNT_CENTS note in module header
      comments: input.comments ?? null,
      kiche_welcome: input.kicheWelcome,
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
    if (seriesId) await repo.deleteSeries(seriesId);
    if ((e as { code?: string }).code === "23P01") {
      return { kind: "slot_taken" };
    }
    // Anything else is a real insert failure. Rethrowing would escape
    // CreateBookingResult into the error boundary and lose the booking form;
    // the caller renders `error` as a message the client can retry from.
    console.error("createBookingCore: booking insert failed", e);
    return { kind: "error", message: CREATE_ERROR_MESSAGE };
  }
}
