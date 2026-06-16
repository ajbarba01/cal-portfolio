/**
 * Click-to-accept e-signature for the Owner form's Emergency Expense
 * Authorization. The accepted TEXT is versioned: each acceptance appends an
 * immutable row to `authorizations` (kind + version + typed legal name +
 * timestamp). The booking gate re-prompts only when EXPENSE_AUTH_VERSION is
 * newer than the client's latest accepted row for that kind.
 *
 * Bump EXPENSE_AUTH_VERSION whenever EXPENSE_AUTH_TEXT changes materially so
 * existing clients are asked to re-accept the new terms.
 */
export const EXPENSE_AUTH_KIND = "expense_auth" as const;

/** Increment (e.g. "2026-06-16") when EXPENSE_AUTH_TEXT changes. */
export const EXPENSE_AUTH_VERSION = "2026-06-16" as const;

export const EXPENSE_AUTH_TEXT = `In the event that I cannot be reached and my pet requires urgent veterinary care, I authorize Cal to seek veterinary treatment on my behalf.

I understand that I am financially responsible for all veterinary expenses incurred during the care of my pet, including emergency examinations, diagnostics, medications, treatments, hospitalization, transportation, and any other related costs.`;

export interface AcceptedAuthorization {
  version: string;
  acceptedName: string;
  acceptedAt: string;
}

/**
 * Pure: does the latest accepted authorization satisfy the current version?
 * Re-prompt when there is no acceptance, or the accepted version differs from
 * the current one.
 */
export function authorizationCurrent(
  latest: AcceptedAuthorization | null,
  currentVersion: string = EXPENSE_AUTH_VERSION,
): boolean {
  return latest !== null && latest.version === currentVersion;
}
