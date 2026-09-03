import { profileSchema } from "./profile-schema";

/**
 * Where a successful info-step submit lands. Always /onboarding (the wizard
 * re-reads onboarding_status and shows the meet-and-greet step) — never
 * /account, which middleware bounces for a meet_greet_pending user; the client
 * router then replays a stale cached payload of the empty info form, making
 * the submit look like it silently failed (U25). A validated returnTo rides
 * along on the URL so the deferred-auth round trip survives the wizard.
 */
export function onboardingSuccessPath(safeReturnTo: string | null): string {
  return safeReturnTo
    ? `/onboarding?returnTo=${encodeURIComponent(safeReturnTo)}`
    : "/onboarding";
}

/**
 * The onboarding form as the client sees it. Signup collects the profile and
 * nothing else: emergency and vet contact belong to the owner form, which the
 * booking gate requires before the first paid booking rather than before the
 * free meet & greet. Named separately from `profileSchema` so the wizard's
 * client and server halves have one import to keep in step.
 */
export const onboardingClientSchema = profileSchema;
