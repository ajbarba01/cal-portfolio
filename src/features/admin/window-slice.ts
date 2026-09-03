/**
 * The availability painter's cancel gate: which bookings a carve-out would
 * destroy. Pure — no IO, no React — so it can be tested on its own and stay in
 * step with the server, which refuses the same carve-out on instant overlap
 * (`setWindowUnavailableCore`).
 */

/** The instants a booking occupies, as the admin busy feed carries them. */
export interface BookedRange {
  /** ISO UTC. */
  startsAt: string;
  /** ISO UTC. */
  endsAt: string;
}

/**
 * The bookings overlapping `slice`, in input order.
 *
 * Overlap is on instants, not calendar days: a stay that began days earlier or
 * runs days later still occupies the slice, and matching on its start day would
 * hide it from the gate while the server refused the write.
 */
export function bookingsInWindowSlice<T extends BookedRange>(
  busy: readonly T[],
  slice: { startsAt: Date; endsAt: Date },
): T[] {
  const sliceStart = slice.startsAt.getTime();
  const sliceEnd = slice.endsAt.getTime();
  return busy.filter(
    (b) =>
      Date.parse(b.startsAt) < sliceEnd && Date.parse(b.endsAt) > sliceStart,
  );
}
