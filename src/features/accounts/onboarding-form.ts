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

/** Result state returned to the onboarding form via useActionState. */
export type OnboardingFormState =
  | { status: "idle" }
  | { status: "error"; fieldErrors: Record<string, string> };

/**
 * Pure: read + validate the onboarding form fields. Returns either the parsed
 * OnboardingInput or per-field error messages (first message per field). No IO,
 * no auth — lives outside the "use server" action module so it can be a sync
 * export and unit-tested directly.
 */
export function parseOnboardingForm(
  formData: FormData,
):
  | { ok: true; input: OnboardingInput }
  | { ok: false; fieldErrors: Record<string, string> } {
  const str = (k: string) => String(formData.get(k) ?? "");

  const profile = profileSchema.safeParse({
    full_name: str("full_name"),
    phone: str("phone"),
    address: str("address"),
    zip: str("zip"),
  });
  const emergency = emergencySchema.safeParse({
    contact_name: str("contact_name"),
    contact_phone: str("contact_phone"),
    contact_relationship: str("contact_relationship"),
    vet_name: str("vet_name"),
    vet_phone: str("vet_phone"),
  });

  if (profile.success && emergency.success) {
    return {
      ok: true,
      input: { profile: profile.data, emergency: emergency.data },
    };
  }

  const fieldErrors: Record<string, string> = {};
  const collect = (errs: Record<string, string[] | undefined>) => {
    for (const [k, msgs] of Object.entries(errs)) {
      if (msgs && msgs[0]) fieldErrors[k] = msgs[0];
    }
  };
  if (!profile.success) collect(profile.error.flatten().fieldErrors);
  if (!emergency.success) collect(emergency.error.flatten().fieldErrors);
  return { ok: false, fieldErrors };
}
