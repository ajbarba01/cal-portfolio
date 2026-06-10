/**
 * computeBookingQuoteCore — read-only price preview.
 */

import type { QuoteBreakdown } from "@/features/pricing";
import type { MutationPolicy } from "./mutation-policy";
import { CLIENT_POLICY } from "./mutation-policy";
import {
  computeBookingArtifacts,
  type BookingServiceDeps,
  type CreateBookingInput,
} from "./booking-service-shared";

// ──────────────────────────────────────────────────────────────────────────────
// Result types
// ──────────────────────────────────────────────────────────────────────────────

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
// computeBookingQuoteCore
// ──────────────────────────────────────────────────────────────────────────────

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
