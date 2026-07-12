import { z } from "zod";
import { profileSchema, type ProfileInput } from "./profile-schema";
import {
  emergencySchema,
  type EmergencyInput,
} from "@/features/accounts/emergency-schema";

export interface OnboardingInput {
  profile: ProfileInput;
  emergency: EmergencyInput;
}

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
 * The onboarding form as the client sees it: one flat object (RHF field names
 * are flat), validated with the exact profile + emergency schemas the server
 * re-parses. Client and server cannot drift — same zod objects.
 */
export const onboardingClientSchema = z.object({
  ...profileSchema.shape,
  ...emergencySchema.shape,
});

export type OnboardingClientInput = z.infer<typeof onboardingClientSchema>;

/** Regroup the flat client values into the { profile, emergency } shape runOnboarding takes. */
export function splitOnboardingInput(
  flat: OnboardingClientInput,
): OnboardingInput {
  const { full_name, phone, address, zip, ...emergency } = flat;
  return {
    profile: { full_name, phone, address, zip } satisfies ProfileInput,
    emergency: emergency satisfies EmergencyInput,
  };
}
