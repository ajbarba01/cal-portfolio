/** Approval decision returned by deriveApproval. */
export type ApprovalDecision = "auto" | "manual" | "refuse";

/**
 * Estimates one-way driving time in minutes given a straight-line distance.
 *
 * Applies a road factor (straight-line → road distance multiplier) then
 * divides by average speed. All constants are Cal-tunable via settings.
 *
 * Used ONLY for the travel-**cost** line (driving time billed at the hourly
 * rate); the approval gate reasons in miles — see {@link deriveApproval}.
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
 * Derives whether a booking at a given straight-line distance requires manual
 * approval, should be refused outright, or can be auto-approved.
 *
 * The gate reasons in **miles** (Cal's mental model), distinct from the
 * driving-minutes travel cost. When `useRoadMiles` is set, straight-line miles
 * are scaled by `roadFactor` to approximate real driving distance before
 * gating; otherwise straight-line miles gate directly.
 *
 * Gate logic (strict greater-than so thresholds themselves stay in the lower
 * tier — matching the DESIGN ">" specification):
 *   - gatedMiles > hardCutoffMiles  → refuse
 *   - gatedMiles > autoApproveMiles → manual
 *   - otherwise                     → auto
 */
export function deriveApproval(
  miles: number,
  cfg: {
    autoApproveMiles: number;
    hardCutoffMiles: number;
    useRoadMiles: boolean;
    roadFactor: number;
  },
): ApprovalDecision {
  const gatedMiles = cfg.useRoadMiles ? miles * cfg.roadFactor : miles;
  if (gatedMiles > cfg.hardCutoffMiles) return "refuse";
  if (gatedMiles > cfg.autoApproveMiles) return "manual";
  return "auto";
}
