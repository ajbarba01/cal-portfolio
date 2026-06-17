/**
 * createBookingCore — core booking creation logic.
 */

import type { BookingStatusDb } from "./booking-repository";
import type { MutationPolicy } from "./mutation-policy";
import { CLIENT_POLICY } from "./mutation-policy";
import { transition } from "./state-machine";
import type { RequirementItem } from "./required-profiles";
import {
  computeBookingArtifacts,
  toRuleSettings,
  passesGuards,
  fitsWindow,
  type BookingServiceDeps,
  type CreateBookingInput,
} from "./booking-service-shared";
import {
  driveBufferMinutes,
  driveBufferMinutesFromMiles,
} from "./drive-buffer";
import { overlapsHalfOpen } from "./calendar-model";

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
  if (result.kind === "profiles_incomplete") {
    return { kind: "profiles_incomplete", requirements: result.requirements };
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

  // 7b. Drive-time spacing buffer guard (policy-aware).
  // Ensures each occurrence has enough travel time before/after relative to
  // all same-class active bookings. House-sitting (resident) is excluded —
  // it is a stay, not a round-trip visit, so no drive-time buffer applies.
  //
  // Candidate buffer: 0 for house_sitting, else derived from distanceMiles.
  // Existing buffers: each existing booking widens by ITS own buffer
  // (resident existing → 0, exclusive → computed from client coords).
  const driveCfg = {
    roadFactor: settings.road_factor,
    avgSpeedMph: settings.avg_speed_mph,
    pct: settings.drive_buffer_pct,
  };
  const origin = { lat: settings.origin_lat, lng: settings.origin_lng };
  const candBufMin =
    service.pricing_type === "house_sitting"
      ? 0
      : driveBufferMinutesFromMiles(result.artifacts.distanceMiles, driveCfg);

  if (service.pricing_type !== "house_sitting") {
    // Run the guard for every time-based (non-house_sitting) service, regardless
    // of the candidate's own buffer. An existing exclusive booking has its OWN
    // buffer that can reach into the candidate's raw slot even when the candidate's
    // buffer is 0 (e.g. candidate client has no coords → distanceMiles null →
    // candBufMin 0, but an existing booking 10 min away widens its end by 10 min
    // which overlaps the candidate's raw start). house_sitting is excluded: it is
    // a resident stay with no drive-time semantics.
    const existing = await repo.getActiveBusyRanges(now, service.concurrency);
    const widenedExisting = existing.map((e) => {
      const eBufMin =
        e.concurrency === "resident"
          ? 0
          : driveBufferMinutes(
              origin,
              { lat: e.clientLat, lng: e.clientLng },
              driveCfg,
            );
      const eBufMs = eBufMin * 60_000;
      return {
        startsAt: new Date(e.startsAt.getTime() - eBufMs),
        endsAt: new Date(e.endsAt.getTime() + eBufMs),
      };
    });

    const bufMs = candBufMin * 60_000;
    for (const occStart of occurrences) {
      const occEnd = new Date(occStart.getTime() + durationMs);
      const bufferedCandidate = {
        startsAt: new Date(occStart.getTime() - bufMs),
        endsAt: new Date(occEnd.getTime() + bufMs),
      };

      const windowOk = fitsWindow(bufferedCandidate, openWindows);
      const overlapOk = !widenedExisting.some((we) =>
        overlapsHalfOpen(bufferedCandidate, we),
      );

      if (!windowOk || !overlapOk) {
        if (policy.skipBufferGuard) {
          warnings.push(
            `Occurrence at ${occStart.toISOString()} conflicts with drive-time spacing.`,
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
    const code = (e as { code?: string }).code;
    if (code === "23P01") {
      if (seriesId) await repo.deleteSeries(seriesId);
      return { kind: "slot_taken" };
    }
    if (seriesId) await repo.deleteSeries(seriesId);
    throw e;
  }
}
