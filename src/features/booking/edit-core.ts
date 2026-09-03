/**
 * editBookingCore / previewEditCore — in-place edit (time / pets / quantities / comments).
 */

import { asJson } from "./booking-repository-types";
import type {
  BookingStatusDb,
  BookingEditRow,
} from "./booking-repository-types";
import type { MutationPolicy } from "./mutation-policy";
import { transition } from "./state-machine";
import { representativeHoursFromNeedyTier } from "./needy-tier";
import {
  computeBookingArtifacts,
  deriveHolidayDays,
  toRuleSettings,
  passesGuards,
  slotIsAvailable,
  fitsWindow,
  fitsOvernightNights,
  type BookingServiceDeps,
  type CreateBookingInput,
} from "./booking-service-shared";
import { findDriveBufferConflicts } from "./drive-buffer-guard";
import type { BookingQuotePreview } from "./quote-core";
import {
  requirementsSatisfied,
  type RequirementItem,
} from "./required-profiles";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type EditBookingResult =
  | {
      kind: "success";
      warnings: string[];
      /**
       * The edit moved the booking into `confirmed` from another status, so the
       * caller owes the client a confirmation email. False for an edit of a
       * booking that was already confirmed — that is not a new confirmation.
       */
      becameConfirmed: boolean;
    }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "invalid_status" }
  | { kind: "price_locked" }
  | { kind: "blocked_debt"; owedCents: number }
  | { kind: "onboarding_incomplete" }
  | { kind: "profiles_incomplete"; requirements: RequirementItem[] }
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
export const EDITABLE_STATUSES: BookingStatusDb[] = [
  "pending_approval",
  "confirmed",
];

export interface EditQuoteInput {
  merged: CreateBookingInput;
  startsAt: Date;
  endsAt: Date;
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

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Extract the raw quantity record from a stored QuoteInput jsonb. */
function quantitiesFromQuoteInputs(qi: unknown): Record<string, unknown> {
  const q = (qi ?? {}) as Record<string, unknown>;
  const keys = ["dogs", "cats", "nights", "hours", "holidayDays"];
  const out: Record<string, unknown> = {};
  for (const k of keys) if (q[k] !== undefined) out[k] = q[k];
  // needyTier (house-sit) is stored on the QuoteInput; re-express it as the
  // maxHoursAway the quantity schema understands (price-exact: re-quote yields
  // the same tier).
  if (typeof q.needyTier === "number")
    out.maxHoursAway = representativeHoursFromNeedyTier(q.needyTier);
  // Walk minutes (house-sit) are stored under the engine's name; without this
  // the merge drops the add-on and every re-quote silently lowers the price.
  if (typeof q.walkMinutesPerDay === "number")
    out.walkMinutesPerDay = q.walkMinutesPerDay;
  else if (typeof q.exerciseMinutesPerDay === "number")
    out.walkMinutesPerDay = q.exerciseMinutesPerDay;
  // leashManners (walk) round-trips directly.
  if (typeof q.leashManners === "boolean") out.leashManners = q.leashManners;
  return out;
}

/**
 * Whether an edit patch touches a priced input, and so may not be applied to a
 * booking the client has already paid for. Pets and quantities are priced
 * directly; the booked duration is priced through the nights/hours the re-quote
 * derives from it (see buildEditQuoteInput). Editing comments is never
 * price-affecting; a same-length move is caught by premiumDaysChanged, which
 * needs rows this check does not have.
 */
function patchAffectsPrice(
  booking: BookingEditRow,
  patch: EditBookingPatch,
  merged: { startsAt: Date; endsAt: Date },
): boolean {
  if (patch.petIds !== undefined || patch.quantities !== undefined) return true;
  return (
    merged.endsAt.getTime() - merged.startsAt.getTime() !==
    booking.endsAt.getTime() - booking.startsAt.getTime()
  );
}

/**
 * The date-derived half of the paid-lock: whether the merged range covers a
 * different number of premium (holiday) days than the booked one. Premium days
 * come from the dates plus the admin holiday list, so a same-length move can
 * re-price a booking even though the patch names no priced field. Needs the
 * loaded service and settings, so it runs after the re-quote rather than beside
 * patchAffectsPrice.
 */
function premiumDaysChanged(
  booking: BookingEditRow,
  merged: { startsAt: Date; endsAt: Date },
  pricingType: string,
  holidayDates: string[],
): boolean {
  return (
    deriveHolidayDays(
      pricingType,
      booking.startsAt,
      booking.endsAt,
      holidayDates,
    ) !==
    deriveHolidayDays(pricingType, merged.startsAt, merged.endsAt, holidayDates)
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// buildEditQuoteInput
// ──────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Merge an edit patch over a booking's current shape into a re-quote input. */
export function buildEditQuoteInput(
  booking: BookingEditRow,
  patch: EditBookingPatch,
): EditQuoteInput {
  const startsAt = patch.startsAt ?? booking.startsAt;
  const durationMs = booking.endsAt.getTime() - booking.startsAt.getTime();
  const endsAt = patch.endsAt ?? new Date(startsAt.getTime() + durationMs);
  const quantities: Record<string, unknown> = {
    ...quantitiesFromQuoteInputs(booking.quote_inputs),
    ...(patch.quantities ?? {}),
  };
  // U24: `nights` is DERIVED state — the whole-day count of the merged time
  // range — so recompute it here rather than trusting the stored/patched copy.
  // A date-only reschedule legitimately omits `quantities` from the patch
  // (nothing else changed), and stored `quote_inputs` may lack `nights`
  // (legacy/seeded rows) — without this, the merged input fails the
  // house_sitting quantity schema with `nights: undefined`. Rounding guards
  // sub-ms drift across DST; hourly services (sub-day spans → 0) are untouched.
  const nights = Math.round(
    (endsAt.getTime() - startsAt.getTime()) / MS_PER_DAY,
  );
  if (nights >= 1) quantities.nights = nights;
  // `hours` is the same kind of derived state for hourly services: the booked
  // span is authoritative (the edit UI recomputes endsAt from the duration
  // stepper, so timestamps always reflect the chosen duration). Stored/seeded
  // rows may carry empty quote_inputs, and a no-op or date-only patch omits
  // quantities — recompute so the hourly quantity schema never sees
  // `hours: undefined`.
  if (nights < 1) {
    const hours = (endsAt.getTime() - startsAt.getTime()) / (60 * 60 * 1000);
    if (hours > 0) quantities.hours = hours;
  }
  const merged: CreateBookingInput = {
    userId: booking.client_id,
    serviceSlug: booking.service_slug,
    startsAt,
    endsAt,
    quantities,
    petIds: patch.petIds ?? booking.petIds,
    recurringRule: null,
  };
  return { merged, startsAt, endsAt };
}

// ──────────────────────────────────────────────────────────────────────────────
// editBookingCore
// ──────────────────────────────────────────────────────────────────────────────

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

  // Build the merged shape up front — pure, and the paid-lock needs its range.
  const {
    merged: mergedInput,
    startsAt,
    endsAt,
  } = buildEditQuoteInput(booking, patch);

  // Whether the patch actually moves the booking. Compared by instant rather
  // than by patch key, so a patch that re-sends the current time counts as a
  // move of zero — see the drive-time guard below, the only thing that reads it.
  const timeChanged =
    startsAt.getTime() !== booking.startsAt.getTime() ||
    endsAt.getTime() !== booking.endsAt.getTime();

  // Paid-lock: a price-affecting patch is rejected once paid.
  if (
    booking.paidCents > 0 &&
    patchAffectsPrice(booking, patch, { startsAt, endsAt })
  ) {
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

  // Re-quote the merged shape via the shared pipeline.
  // Preserve every price Cal set by hand across the re-quote — the Kiche column
  // and the manual discounts and one-off adjustments carried in the frozen quote
  // inputs. A date/pet/comment edit must not silently drop them.
  const artifacts = await computeBookingArtifacts(deps, mergedInput, policy, {
    applyKiche: booking.kiche_applied,
    storedQuoteInputs: booking.quote_inputs,
  });
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
    service,
    settings: s,
    quoteInput,
    breakdown,
    distanceMiles,
    requiresApprovalByOccurrence,
    requirements,
  } = artifacts.artifacts;

  // Paid-lock, date half: a same-length move onto (or off) a premium day
  // re-prices the stay, and the persisted price is the re-quote's.
  if (
    booking.paidCents > 0 &&
    premiumDaysChanged(
      booking,
      { startsAt, endsAt },
      service.pricing_type,
      s.holiday_dates,
    )
  ) {
    return { kind: "price_locked" };
  }

  // Required-profiles gate — enforced on COMMIT only (previewEditCore renders the
  // quote regardless). A client may not save an edit until every required profile
  // is complete; admin (skipFormsGate) is warn-don't-block.
  if (!requirementsSatisfied(requirements) && !policy.skipFormsGate)
    return { kind: "profiles_incomplete", requirements };

  // Slot validation (hours/lead/horizon + window-fit), policy-aware.
  const ruleSettings = toRuleSettings(s);
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

  // Availability containment, gated by service type (window vs overnight
  // nights). The pair slotIsAvailable wraps is inlined here because the buffer
  // guard below needs the same window list — create-core inlines it for the
  // same reason rather than reading the windows twice.
  const slot = { startsAt, endsAt };
  const isHouseSitting = service.pricing_type === "house_sitting";
  const openWindows = isHouseSitting ? [] : await repo.getOpenWindows(now);
  const available = isHouseSitting
    ? fitsOvernightNights(slot, await repo.getOpenNights(now))
    : fitsWindow(slot, openWindows);
  if (!available) {
    if (!policy.skipWindowFit) {
      return {
        kind: "unavailable",
        reason: "The selected time is not within Cal's availability.",
      };
    }
    warnings.push("Selected time is outside Cal's published availability.");
  }

  // Drive-time spacing — the same guard create enforces, so an edit can never
  // land in a slot the client could not have booked in the first place.
  //
  // Skipped in two cases. House-sitting: a stay is resident, reserves no travel
  // time, and fits no intraday window, so a padded window check would refuse
  // every stay. An edit that does not move the booking: it places nothing new
  // on the calendar, and the guard pads the candidate by the client's own
  // buffer before checking window fit — a booking already sitting within its
  // buffer of a window edge would otherwise refuse every comment or pet edit.
  //
  // When the time does move, the booking being edited is dropped twice over —
  // from the query and again inside the guard — so its own range cannot block
  // its own move.
  if (!isHouseSitting && timeChanged) {
    const conflicts = findDriveBufferConflicts({
      candidates: [slot],
      candidateDistanceMiles: distanceMiles,
      existing: await repo.getActiveBusyRanges(
        now,
        service.concurrency,
        input.bookingId,
      ),
      openWindows,
      settings: s,
      excludeBookingId: input.bookingId,
    });
    if (conflicts.length > 0) {
      if (!policy.skipBufferGuard) {
        return {
          kind: "unavailable",
          reason:
            "That time doesn't leave enough travel time around another booking. Please pick another slot.",
        };
      }
      warnings.push(
        `Occurrence at ${startsAt.toISOString()} conflicts with drive-time spacing.`,
      );
    }
  }

  // Re-derive status (per-occurrence array has exactly one element for an edit;
  // the fallback only covers an empty array, which an edit cannot produce).
  const requiresApproval = requiresApprovalByOccurrence[0] ?? false;
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
      quote_inputs: asJson(quoteInput),
      quote_breakdown: asJson(breakdown),
      final_cents: breakdown.finalCents,
      requires_approval: requiresApproval,
      comments: patch.comments ?? booking.comments,
      series_id: seriesId,
    });
    if (patch.petIds !== undefined) {
      await repo.swapBookingPets(input.bookingId, patch.petIds);
    }
    return {
      kind: "success",
      warnings,
      becameConfirmed: status === "confirmed" && booking.status !== "confirmed",
    };
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "23P01")
      return { kind: "slot_taken" };
    return {
      kind: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// previewEditCore
// ──────────────────────────────────────────────────────────────────────────────

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

  const {
    merged: mergedInput,
    startsAt,
    endsAt,
  } = buildEditQuoteInput(booking, patch);
  if (
    booking.paidCents > 0 &&
    patchAffectsPrice(booking, patch, { startsAt, endsAt })
  ) {
    return { kind: "price_locked" };
  }

  // Same carry-through as the save above, so the preview quotes what Save writes.
  const artifacts = await computeBookingArtifacts(deps, mergedInput, policy, {
    applyKiche: booking.kiche_applied,
    storedQuoteInputs: booking.quote_inputs,
  });
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
    service,
    settings: s,
    breakdown,
    distanceMiles,
    requiresApproval,
    decision,
    approvalReasons,
    warnings,
    requirements,
  } = artifacts.artifacts;

  // Paid-lock, date half: a same-length move onto (or off) a premium day
  // re-prices the stay, and the persisted price is the re-quote's.
  if (
    booking.paidCents > 0 &&
    premiumDaysChanged(
      booking,
      { startsAt, endsAt },
      service.pricing_type,
      s.holiday_dates,
    )
  ) {
    return { kind: "price_locked" };
  }

  // Slot/window validation — the hours/lead and window-fit halves of
  // editBookingCore. Read-only: no persistence; admin-skip branches are silent
  // (no warnings array to surface).
  //
  // The drive-time guard is deliberately NOT run here. It needs the busy ranges
  // and the open windows, and this preview re-runs on every keystroke of an
  // edit, so the two extra reads would be paid per keystroke to re-state what
  // the picker already enforces: both edit pickers pad their candidate starts
  // by the same buffer, so a violating slot cannot be selected in the UI. A
  // direct call that skips the picker can therefore still be quoted a slot Save
  // refuses; the refusal is the authority, and it names the reason.
  const ruleSettings = toRuleSettings(s);
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
    const available = await slotIsAvailable(
      repo,
      deps.now,
      service.pricing_type,
      {
        startsAt,
        endsAt,
      },
    );
    if (!available) {
      return {
        kind: "unavailable",
        reason: "The selected time is not within Cal's availability.",
      };
    }
  }

  const preview: BookingQuotePreview = {
    breakdown,
    finalCents: breakdown.finalCents,
    distanceMiles: distanceMiles ?? null,
    requiresApproval,
    decision,
    approvalReasons,
    warnings,
    requirements,
  };
  // hoisted for callers that need approval without drilling into preview
  return { kind: "preview", preview, requiresApproval };
}
