/**
 * Deferred-auth `returnTo` round-trip — pure encode/decode + open-redirect guard.
 *
 * The customer book flow defers sign-in/onboarding to the Book action: a guest
 * who picks a service + slot is bounced to `/login?returnTo=…` (then possibly
 * `/onboarding?returnTo=…`) and, on success, returned to their exact selection.
 *
 * SECURITY — open-redirect guard. `returnTo` is attacker-controllable (it rides
 * in the URL). `safeReturnTo` accepts ONLY a same-origin relative path under
 * `/book/`: it must start with a single `/book/` (never `//` or `/\`, which
 * browsers treat as protocol-relative external URLs) and carry no scheme. Any
 * other value returns null and callers fall back to a safe default. No business
 * logic, no IO — unit-tested in return-to.test.ts.
 */

/** Allowed prefix: the per-service booking routes. */
const RETURN_TO_PREFIX = "/book/";

export interface BookingSelection {
  serviceSlug: string;
  /** ISO instant, present for week-slot services / the resolved house-sit start. */
  start?: string;
  /** ISO instant, present for the resolved house-sit end. */
  end?: string;
  /** Assigned pet ids. */
  petIds?: string[];
}

/**
 * Builds a relative `returnTo` path from a selection: slug in the path, the
 * instants + pets in the query. The slug is path-encoded; query values are
 * URL-encoded by `URLSearchParams`.
 */
export function buildReturnTo(selection: BookingSelection): string {
  const params = new URLSearchParams();
  if (selection.start) params.set("start", selection.start);
  if (selection.end) params.set("end", selection.end);
  if (selection.petIds && selection.petIds.length > 0) {
    params.set("pets", selection.petIds.join(","));
  }
  const query = params.toString();
  const path = `${RETURN_TO_PREFIX}${encodeURIComponent(selection.serviceSlug)}`;
  return query ? `${path}?${query}` : path;
}

/**
 * Validates an untrusted `returnTo`. Returns the path unchanged when it is a
 * same-origin relative path under `/book/`, else null. Rejects protocol-relative
 * (`//host`, `/\host`) and absolute/scheme URLs (open-redirect vectors).
 */
export function safeReturnTo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith(RETURN_TO_PREFIX)) return null;
  // `/book//…` or `/book/\…` could still be benign, but reject any backslash and
  // any `//` that would let the path be read as protocol-relative after `/book`.
  if (raw.includes("\\")) return null;
  if (raw.startsWith("//")) return null; // defensive — prefix check already covers it
  return raw;
}
