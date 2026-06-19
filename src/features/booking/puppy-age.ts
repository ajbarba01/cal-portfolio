/**
 * True when `birthdate` (an ISO `YYYY-MM-DD` date) is strictly less than six
 * calendar months before `asOf`. Null / empty / unparseable input → false: a pet
 * with no recorded birthdate receives no puppy benefit.
 *
 * "Under 6 months" holds until the day-of-month six months after birth; on and
 * after that mark the pet is no longer under 6mo. Compared at month granularity
 * via UTC, which is sufficient for a pricing threshold (no DST sensitivity).
 * Pure: `asOf` is injected.
 */
export function isUnderSixMonths(
  birthdate: string | null | undefined,
  asOf: Date,
): boolean {
  if (!birthdate) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthdate);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const sixMonthMark = new Date(Date.UTC(year, month - 1 + 6, day));
  if (Number.isNaN(sixMonthMark.getTime())) return false;
  return asOf.getTime() < sixMonthMark.getTime();
}
