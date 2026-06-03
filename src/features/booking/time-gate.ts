/**
 * Pure time-horizon approval gate.
 *
 * Parallel to the distance gate (`features/pricing/distance.ts#deriveApproval`):
 * a booking close in time auto-confirms, one further out pends for Cal's review
 * (not refused), and one absurdly far out is refused outright. No IO, no clock
 * reads — `now` is passed in (ENGINEERING #5).
 */

/** Time-approval decision returned by deriveTimeApproval. */
export type TimeApprovalDecision = "auto" | "pending" | "refuse";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Derives whether a booking's start time auto-confirms, pends for approval, or
 * is refused, based on how far ahead it is.
 *
 * Strict greater-than keeps each threshold in the lower tier (matching the
 * distance gate and the DESIGN ">" spec):
 *   - daysAhead > hardMaxAdvanceDays     → refuse
 *   - daysAhead > autoConfirmHorizonDays → pending
 *   - otherwise                          → auto
 *
 * A start in the past (negative daysAhead) returns "auto" here; the separate
 * lead-time guard owns rejecting too-soon bookings.
 */
export function deriveTimeApproval(
  startsAt: Date,
  now: Date,
  cfg: { autoConfirmHorizonDays: number; hardMaxAdvanceDays: number },
): TimeApprovalDecision {
  const daysAhead = (startsAt.getTime() - now.getTime()) / MS_PER_DAY;
  if (daysAhead > cfg.hardMaxAdvanceDays) return "refuse";
  if (daysAhead > cfg.autoConfirmHorizonDays) return "pending";
  return "auto";
}
