/**
 * Actor-aware policy for booking mutations (create / edit / reschedule).
 *
 * Each `skip*` flag, when true, suppresses a policy gate in the shared
 * computeBookingArtifacts / guard pipeline. A suppressed gate that WOULD have
 * blocked instead contributes a human-readable string to the mutation's
 * returned `warnings` array (warn-don't-block). The single hard stop that no
 * policy can bypass is the Postgres same-class no-overlap exclusion constraint
 * (surfaced as `slot_taken`).
 *
 * The actor -> policy mapping lives ONLY in the action layer, derived from the
 * verified session role. A client can never submit ADMIN_POLICY.
 */

import type { BookingStatusDb } from "./booking-repository";

export interface MutationPolicy {
  /** Bypass the outstanding-debt block. */
  skipDebtGate: boolean;
  /** Bypass the onboarding / meet-greet gate. */
  skipOnboardingGate: boolean;
  /** Bypass the distance hard-cutoff refuse. */
  skipDistanceRefuse: boolean;
  /** Bypass availability-window containment. */
  skipWindowFit: boolean;
  /** Bypass hours-of-day + lead-time + hard-max-advance guards. */
  skipHoursLeadGuards: boolean;
  /** Bypass the client cancellation-cutoff edit gate (edit-only). */
  skipCancellationCutoff: boolean;
  /** Bypass the time-horizon hard-cap refuse. */
  skipHorizonRefuse: boolean;
  /**
   * When set, force the resulting booking status instead of the state machine's
   * derived status (admin force-confirm). Validated against the state machine by
   * the caller.
   */
  forceStatus?: BookingStatusDb;
}

/** Client self-service: every gate enforced. */
export const CLIENT_POLICY: MutationPolicy = {
  skipDebtGate: false,
  skipOnboardingGate: false,
  skipDistanceRefuse: false,
  skipWindowFit: false,
  skipHoursLeadGuards: false,
  skipCancellationCutoff: false,
  skipHorizonRefuse: false,
};

/** Admin on-behalf: every gate skipped (warn-don't-block). */
export const ADMIN_POLICY: MutationPolicy = {
  skipDebtGate: true,
  skipOnboardingGate: true,
  skipDistanceRefuse: true,
  skipWindowFit: true,
  skipHoursLeadGuards: true,
  skipCancellationCutoff: true,
  skipHorizonRefuse: true,
};
