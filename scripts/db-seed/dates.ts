import { TZDate } from "@date-fns/tz";

export const SEED_TZ = "America/Denver";

/** Monday 00:00 in Denver of the week containing `now`. */
export function weekAnchor(now: Date): TZDate {
  const local = new TZDate(now.getTime(), SEED_TZ);
  const daysSinceMonday = (local.getDay() + 6) % 7;
  return new TZDate(
    local.getFullYear(),
    local.getMonth(),
    local.getDate() - daysSinceMonday,
    0,
    0,
    0,
    SEED_TZ,
  );
}

/** Instant for `anchor + dayOffset days` at the given Denver wall-clock time. */
export function slot(
  anchor: TZDate,
  dayOffset: number,
  hour: number,
  minute = 0,
): Date {
  return new Date(
    new TZDate(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate() + dayOffset,
      hour,
      minute,
      0,
      SEED_TZ,
    ).getTime(),
  );
}

/** Deterministic status for timetable bookings: past → completed, else confirmed. */
export function statusFor(
  startsAt: Date,
  now: Date,
): "completed" | "confirmed" {
  return startsAt.getTime() < now.getTime() ? "completed" : "confirmed";
}
