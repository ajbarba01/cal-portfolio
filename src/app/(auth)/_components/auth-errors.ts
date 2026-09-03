/**
 * The auth zone's failure copy, and the one mapping that picks between the
 * sentences.
 *
 * Supabase's `AuthError.message` never reaches the screen: it is internal
 * English in a voice the site does not use ("Invalid login credentials",
 * "AuthApiError: ..."), it changes without notice, and it names which half of
 * a credential pair was wrong. Every failure resolves here instead, chosen by
 * the machine-readable code the SDK attaches.
 */

/** A sign-in attempt, or the callback behind one, did not go through. */
export const SIGN_IN_FAILED = "Sign-in failed. Please try again.";

/** The one-time link was consumed or timed out; retrying it cannot work. */
export const SIGN_IN_LINK_EXPIRED =
  "Your sign-in link has expired. Request a new one.";

/** The site-wide fallback for a failure with no more useful sentence. */
export const GENERIC_FAILURE = "Something went wrong. Please try again.";

/**
 * Codes meaning the link or invite itself is gone, rather than that the
 * request was wrong. `claim_expired` is the code /claim sends to /login when
 * it finds no invite session; the rest are Supabase's own, forwarded by the
 * auth callback route when the code exchange fails.
 */
const EXPIRED_LINK_CODES = new Set([
  "claim_expired",
  "flow_state_expired",
  "flow_state_not_found",
  "invite_not_found",
  "otp_expired",
]);

/**
 * The sentence for an auth failure. Only the expired-link case changes what
 * the visitor should do next — ask for a new link instead of trying again —
 * so it is the only distinction the mapping draws. Everything else (a wrong
 * password, an unconfirmed email, a rate limit, an unrecognised `?error=`
 * value, a code the SDK never set) resolves to the caller's `fallback`.
 */
export function authErrorMessage(
  code: string | null | undefined,
  fallback: string,
): string {
  return code && EXPIRED_LINK_CODES.has(code) ? SIGN_IN_LINK_EXPIRED : fallback;
}
