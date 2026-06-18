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

// ---------------------------------------------------------------------------
// Typed approval reasons
// ---------------------------------------------------------------------------

/** Typed reason codes explaining why a booking was not auto-approved. */
export type ApprovalReasonCode =
  | "service_manual_only" // service.requiresApproval (e.g. all house-sits)
  | "location_unknown" // no client coordinates → can't gate distance
  | "distance_manual" // gatedMiles > autoApproveMiles
  | "distance_unlikely" // gatedMiles > softDistanceWarnMiles (warn, not block)
  | "distance_refuse"; // gatedMiles > hardCutoffMiles

/** A single human-readable reason attached to an approval decision. */
export interface ApprovalReason {
  code: ApprovalReasonCode;
  message: string;
  severity: "info" | "warn" | "block";
}

/** Args for {@link deriveApprovalWithReasons}. */
export interface DeriveApprovalWithReasonsArgs {
  /** Straight-line distance to the client in miles. */
  miles: number;
  autoApproveMiles: number;
  hardCutoffMiles: number;
  useRoadMiles: boolean;
  roadFactor: number;
  /** Whether the service always requires manual approval (e.g. house-sits). */
  requiresApproval: boolean;
  /** Whether the client has known coordinates. When false, distance gating is skipped. */
  locationKnown: boolean;
  /** Optional soft warn threshold; triggers distance_unlikely (warn) when exceeded. */
  softDistanceWarnMiles?: number;
}

/**
 * Returns an {@link ApprovalDecision} together with typed {@link ApprovalReason}s
 * explaining why the booking needs attention.
 *
 * Decision precedence: block reason → refuse; manual reason → manual; else auto.
 * `distance_unlikely` (warn) is additive — it does not force refuse on its own.
 *
 * Reuses {@link deriveApproval} for the distance gate so threshold logic stays DRY.
 */
export function deriveApprovalWithReasons(
  args: DeriveApprovalWithReasonsArgs,
): { decision: ApprovalDecision; reasons: ApprovalReason[] } {
  const {
    miles,
    autoApproveMiles,
    hardCutoffMiles,
    useRoadMiles,
    roadFactor,
    requiresApproval,
    locationKnown,
    softDistanceWarnMiles,
  } = args;

  const reasons: ApprovalReason[] = [];

  // Service-level manual gate
  if (requiresApproval) {
    reasons.push({
      code: "service_manual_only",
      message:
        "Cal personally confirms this type of service before it's booked.",
      severity: "info",
    });
  }

  if (!locationKnown) {
    reasons.push({
      code: "location_unknown",
      message:
        "Your location isn't on file — Cal will reach out to confirm distance before approving.",
      severity: "warn",
    });
    // Cannot compute distance reasons without coordinates
    const decision: ApprovalDecision = "manual";
    return { decision, reasons };
  }

  // Distance gating (location known)
  const gatedMiles = useRoadMiles ? miles * roadFactor : miles;
  const rounded = Math.round(gatedMiles);

  const distanceDecision = deriveApproval(miles, {
    autoApproveMiles,
    hardCutoffMiles,
    useRoadMiles,
    roadFactor,
  });

  if (distanceDecision === "refuse") {
    reasons.push({
      code: "distance_refuse",
      message: `This booking is ~${rounded} mi away — beyond the ${hardCutoffMiles} mi service area Cal currently accepts.`,
      severity: "block",
    });
  } else if (distanceDecision === "manual") {
    reasons.push({
      code: "distance_manual",
      message: `This booking is ~${rounded} mi away; Cal reviews requests beyond ${autoApproveMiles} mi before confirming.`,
      severity: "info",
    });
  }

  // Soft warn (additive — can stack alongside distance_manual or after a refuse)
  if (
    softDistanceWarnMiles !== undefined &&
    gatedMiles > softDistanceWarnMiles
  ) {
    reasons.push({
      code: "distance_unlikely",
      message: `This stay is ~${rounded} mi away; Cal personally confirms house-sits and is unlikely to accept bookings beyond ${softDistanceWarnMiles} mi.`,
      severity: "warn",
    });
  }

  // Derive decision from collected reasons
  if (reasons.some((r) => r.severity === "block")) {
    return { decision: "refuse", reasons };
  }
  if (
    reasons.some(
      (r) => r.code === "service_manual_only" || r.code === "distance_manual",
    )
  ) {
    return { decision: "manual", reasons };
  }
  return { decision: "auto", reasons };
}
