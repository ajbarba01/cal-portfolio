/**
 * Deferred-auth `returnTo` round-trip — pure encode/decode + open-redirect guard.
 *
 * The customer book flow defers sign-in/onboarding to the Book action: a guest
 * who picks a service + slot is bounced to `/login?returnTo=…` (then possibly
 * `/onboarding?returnTo=…`) and, on success, returned to their exact selection.
 * Any signed-out page can participate: header "Sign in" links append
 * `returnTo=<current pathname>` so sign-in returns users to where they came from.
 *
 * SECURITY — open-redirect guard. `returnTo` is attacker-controllable (it rides
 * in the URL). `safeReturnTo` accepts ONLY same-origin relative paths: the value
 * must start with exactly one `/` (never `//` or `/\`, which browsers treat as
 * protocol-relative / external URLs), carry no scheme (`https:`, `javascript:`…),
 * contain no backslash (normalisation vector), and not be an auth-loop path
 * (`/login`, `/signup`, `/logout`). Any other value returns null and callers fall
 * back to a safe default. No business logic, no IO — unit-tested in
 * return-to.test.ts.
 */

/** Auth paths that would create a redirect loop if used as returnTo. */
const AUTH_LOOP_PREFIXES = ["/login", "/signup", "/logout"] as const;

/** Prefix for booking selection paths used by `buildReturnTo`. */
const BOOKING_PATH_PREFIX = "/book/";

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
  const path = `${BOOKING_PATH_PREFIX}${encodeURIComponent(selection.serviceSlug)}`;
  return query ? `${path}?${query}` : path;
}

/**
 * Validates an untrusted `returnTo`. Returns the path unchanged when it is a
 * safe same-origin relative path, else null.
 *
 * Rules (in order):
 * 1. Falsy → null.
 * 2. Must start with exactly one `/` (not `//`, not `/\`) — rejects
 *    protocol-relative and backslash-normalisation vectors.
 * 3. Must not contain a `:` before the first `/` after position 0 — rejects
 *    absolute URLs (`https:`, `javascript:`, etc.). A colon anywhere AFTER the
 *    leading slash is safe: the string already starts with `/`, so it cannot be
 *    parsed as a scheme by any conforming URL parser. This allows ISO timestamps
 *    in query values (e.g. `start=2026-07-01T16%3A00%3A00.000Z`) and literal
 *    colons in path segments.
 * 4. Must not contain a backslash — some browsers normalise `/\host` as `//host`.
 * 5. Must not be an auth path (`/login`, `/signup`, `/logout`) — avoids
 *    redirect loops when the sign-in page itself is the origin page.
 */
export function safeReturnTo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Rule 2: must start with exactly one slash (not // or /\)
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  // Rule 3: no scheme check needed for strings that start with "/".
  // A URL scheme must appear before the first "/", and we have already verified
  // this string starts with exactly one "/". Therefore any colon in the
  // remaining characters cannot form a scheme (`javascript:`, `https:`, etc.)
  // and is safe — e.g. ISO timestamps in query values or colons in path segments.
  // (Strings that do NOT start with "/" are rejected by Rule 2 above.)
  // Rule 4: reject backslash
  if (raw.includes("\\")) return null;
  // Rule 5: reject auth loop paths
  for (const prefix of AUTH_LOOP_PREFIXES) {
    // Match the path exactly or as a prefix followed by ? (query) — not a longer path
    // e.g. /login → reject, /login?next=x → reject, /loginother → allow
    if (
      raw === prefix ||
      raw.startsWith(prefix + "?") ||
      raw.startsWith(prefix + "/")
    ) {
      return null;
    }
  }
  return raw;
}
