/** Approval decision returned by deriveApproval. */
export type ApprovalDecision = "auto" | "manual" | "refuse";

/**
 * Estimates one-way driving time in minutes given a straight-line distance.
 *
 * Applies a road factor (straight-line → road distance multiplier) then
 * divides by average speed. All constants are Cal-tunable via settings.
 *
 * @returns One-way driving minutes (not round-trip).
 */
export function estimateDrivingMinutes(
  miles: number,
  cfg: { roadFactor: number; avgSpeedMph: number },
): number {
  return ((miles * cfg.roadFactor) / cfg.avgSpeedMph) * 60;
}

/**
 * Derives whether a booking at a given driving distance requires manual
 * approval, should be refused outright, or can be auto-approved.
 *
 * Gate logic (strict greater-than so thresholds themselves stay in the
 * lower tier — matching the DESIGN ">" specification):
 *   - oneWayMinutes > hardCutoffMin → refuse
 *   - oneWayMinutes > autoApproveMin → manual
 *   - otherwise → auto
 */
export function deriveApproval(
  oneWayMinutes: number,
  cfg: { autoApproveMin: number; hardCutoffMin: number },
): ApprovalDecision {
  if (oneWayMinutes > cfg.hardCutoffMin) return "refuse";
  if (oneWayMinutes > cfg.autoApproveMin) return "manual";
  return "auto";
}
