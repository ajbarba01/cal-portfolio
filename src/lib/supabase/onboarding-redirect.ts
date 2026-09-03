/**
 * The onboarding gate's decision rule, kept pure and separate from the
 * middleware that applies it (`proxy.ts`), so the branch that decides where a
 * signed-in user belongs is unit-testable without a request, a client, or a
 * session. It takes plain values — never a Supabase client or a feature module —
 * so `lib/` stays free of domain imports.
 */

/** The one profile field the gate reads. */
export type OnboardingProfile = { onboarding_status: string | null };

/**
 * `allow` is not the same as approved: a client who has not finished onboarding
 * is allowed to be on `/onboarding`. `error` means the status could not be read
 * at all, which is neither approved nor un-approved — the caller surfaces it
 * rather than guessing.
 */
export type OnboardingDecision =
  | { kind: "allow" }
  | { kind: "redirect"; to: string }
  | { kind: "error" };

const ONBOARDING_PATH = "/onboarding";
const ACCOUNT_PATH = "/account";

/**
 * The paths the gate governs: the onboarding wizard and the account area. The
 * exact-match plus `/`-prefixed test keeps look-alike paths (`/accountant`) out.
 * Callers use this to skip the profile read entirely on ungated paths.
 */
export function isGatedPath(pathname: string): boolean {
  return (
    pathname === ONBOARDING_PATH ||
    pathname === ACCOUNT_PATH ||
    pathname.startsWith(`${ACCOUNT_PATH}/`)
  );
}

/**
 * Decides where a signed-in user belongs, given the profile read for them.
 * A non-null `error` wins over everything: a failed read is reported, never
 * silently downgraded to "not approved" (which would bounce an approved client
 * to the wizard on a transient database failure).
 */
export function onboardingRedirect({
  profile,
  error,
  pathname,
}: {
  profile: OnboardingProfile | null;
  error: unknown;
  pathname: string;
}): OnboardingDecision {
  if (!isGatedPath(pathname)) return { kind: "allow" };
  if (error) return { kind: "error" };

  const isApproved = profile?.onboarding_status === "approved";
  const isOnboarding = pathname === ONBOARDING_PATH;

  // Un-onboarded users are confined to the wizard; approved users never see it.
  if (!isApproved && !isOnboarding) {
    return { kind: "redirect", to: ONBOARDING_PATH };
  }
  if (isApproved && isOnboarding) {
    return { kind: "redirect", to: ACCOUNT_PATH };
  }
  return { kind: "allow" };
}
