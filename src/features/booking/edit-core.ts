/**
 * editBookingCore / previewEditCore — in-place edit (time / pets / quantities / comments).
 */

import type { BookingStatusDb, BookingEditRow } from "./booking-repository";
import type { MutationPolicy } from "./mutation-policy";
import { transition } from "./state-machine";
import {
  computeBookingArtifacts,
  toRuleSettings,
  passesGuards,
  fitsWindow,
  type BookingServiceDeps,
  type CreateBookingInput,
} from "./booking-service-shared";
import type { BookingQuotePreview } from "./quote-core";
import {
  requirementsSatisfied,
  type RequirementItem,
} from "./required-profiles";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type EditBookingResult =
  | { kind: "success"; warnings: string[] }
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

  // Preserve a Cal-granted Kiche discount across the re-quote (a date/pet edit
  // must not silently drop it).
  const artifacts = await computeBookingArtifacts(deps, mergedInput, policy, {
    applyKiche: booking.kiche_applied,
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
    settings: s,
    quoteInput,
    breakdown,
    requiresApprovalByOccurrence,
    requirements,
  } = artifacts.artifacts;

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
  const artifacts = await computeBookingArtifacts(deps, mergedInput, policy, {
    applyKiche: booking.kiche_applied,
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
    settings: s,
    breakdown,
    distanceMiles,
    requiresApproval,
    decision,
    approvalReasons,
    warnings,
    requirements,
  } = artifacts.artifacts;

  // Slot/window validation — mirrors editBookingCore (Fix 3). Read-only: no
  // persistence; admin-skip branches are silent (no warnings array to surface).
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
    approvalReasons,
    warnings,
    requirements,
  };
  // hoisted for callers that need approval without drilling into preview
  return { kind: "preview", preview, requiresApproval };
}
