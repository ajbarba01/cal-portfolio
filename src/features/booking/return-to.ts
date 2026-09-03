/**
 * Booking half of the deferred-auth `returnTo` round-trip — encoding a booking
 * selection as a relative path.
 *
 * The customer book flow defers sign-in/onboarding to the Book action: a guest
 * who picks a service + slot is bounced to `/login?returnTo=…` (then possibly
 * `/onboarding?returnTo=…`) and, on success, returned to their exact selection.
 * This module owns the shape of that path, because the shape is booking domain
 * (the `/book/` prefix, the service slug, the pet ids).
 *
 * The guard that validates an untrusted `returnTo` on the way back is
 * business-agnostic and lives in `@/lib/return-to`.
 */

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
