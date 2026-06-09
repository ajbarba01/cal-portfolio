import type { OnboardingStatus } from "@/features/booking/booking-repository";

/** Human-readable label for each onboarding lifecycle status. */
export function onboardingStatusLabel(status: OnboardingStatus): string {
  const labels: Record<OnboardingStatus, string> = {
    info_pending: "Profile pending",
    meet_greet_pending: "Meet & greet pending",
    approved: "Approved",
    declined: "Declined",
  };
  return labels[status];
}

export type OnboardingBadgeVariant =
  | "default"
  | "pending"
  | "available"
  | "destructive";

/** Badge variant for each onboarding lifecycle status. */
export function onboardingStatusBadgeVariant(
  status: OnboardingStatus,
): OnboardingBadgeVariant {
  const variants: Record<OnboardingStatus, OnboardingBadgeVariant> = {
    info_pending: "default",
    meet_greet_pending: "pending",
    approved: "available",
    declined: "destructive",
  };
  return variants[status];
}
