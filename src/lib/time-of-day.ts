/**
 * Time-of-day conversions and the app's display timezone.
 *
 * The app runs in a single timezone, so every rendered date and time is
 * formatted against {@link DENVER_TZ}. Formatting is derived purely from the
 * passed `Date` via `Intl.DateTimeFormat` with the IANA identifier: no offset
 * arithmetic, no clock reads, and MST/MDT transitions are handled by the tz
 * database in the JS runtime.
 *
 * Every `Intl.DateTimeFormat` below is constructed once at module scope.
 * Constructing one costs far more than formatting with it, and callers here
 * format hundreds of days in a single pass.
 */

export type Meridiem = "AM" | "PM";
export interface Clock {
  hour12: number;
  minute: number;
  meridiem: Meridiem;
}

/** Converts minutes-since-midnight (0–1439) to 12-hour clock parts. */
export function minutesToClock(total: number): Clock {
  const h24 = Math.floor(total / 60);
  const minute = total % 60;
  const meridiem: Meridiem = h24 < 12 ? "AM" : "PM";
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour12, minute, meridiem };
}

/** Converts 12-hour clock parts back to minutes-since-midnight (0–1439). */
export function clockToMinutes(
  hour12: number,
  minute: number,
  meridiem: Meridiem,
): number {
  const base = hour12 % 12; // 12 -> 0
  const h24 = meridiem === "PM" ? base + 12 : base;
  return h24 * 60 + minute;
}

// ---------------------------------------------------------------------------
// Denver display formatters
// ---------------------------------------------------------------------------

/** IANA identifier for the single timezone the app displays times in. */
export const DENVER_TZ = "America/Denver";

/** Options shared by the formatters that can render with or without the year. */
export interface DenverYearOption {
  /** Include the calendar year. Defaults to true. */
  year?: boolean;
}

// en-CA renders ISO-ordered "YYYY-MM-DD".
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: DENVER_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: DENVER_TZ,
  hour: "numeric",
  minute: "2-digit",
});

const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: DENVER_TZ,
  month: "short",
  day: "numeric",
  year: "numeric",
});

const dateFormatNoYear = new Intl.DateTimeFormat("en-US", {
  timeZone: DENVER_TZ,
  month: "short",
  day: "numeric",
});

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: DENVER_TZ,
  dateStyle: "medium",
  timeStyle: "short",
});

const dayLabelFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: DENVER_TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const dayLabelFormatNoYear = new Intl.DateTimeFormat("en-US", {
  timeZone: DENVER_TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
});

/**
 * The calendar day of `date` in Denver as an ISO "YYYY-MM-DD" string.
 *
 * Two instants on the same Denver day share a key whatever the UTC offset, so
 * this is the key to group, compare and index days by.
 */
export function denverDayKey(date: Date): string {
  return dayKeyFormat.format(date);
}

/** The Denver wall clock of `date`, e.g. "9:00 AM". */
export function denverTime(date: Date): string {
  return timeFormat.format(date);
}

/** The Denver calendar date of `date`, e.g. "Jun 7, 2025" — or "Jun 7". */
export function denverDate(date: Date, options?: DenverYearOption): string {
  return options?.year === false
    ? dateFormatNoYear.format(date)
    : dateFormat.format(date);
}

/** The Denver date and wall clock of `date`, e.g. "Jun 7, 2025, 9:00 AM". */
export function denverDateTime(date: Date): string {
  return dateTimeFormat.format(date);
}

/**
 * The Denver calendar day of `date` with its weekday, e.g. "Sat, Jun 7, 2025"
 * — or "Sat, Jun 7". This is the heading a list of days is grouped under.
 *
 * Takes an instant, so a caller holding a "YYYY-MM-DD" key converts it to that
 * day's Denver-midnight instant first.
 */
export function denverDayLabel(date: Date, options?: DenverYearOption): string {
  return options?.year === false
    ? dayLabelFormatNoYear.format(date)
    : dayLabelFormat.format(date);
}

// ---------------------------------------------------------------------------
// Denver timezone arithmetic
//
// Timezone math over an instant and a day-key — business-agnostic, and kept
// here rather than in a feature module so a client component that needs only
// the arithmetic does not drag a feature's whole client graph along with it.
// ---------------------------------------------------------------------------

const clockFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: DENVER_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const wallClockFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: DENVER_TZ,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * Returns the local time-of-day of `date` as minutes since midnight (0–1439)
 * in America/Denver.
 *
 * Uses `Intl.DateTimeFormat` with `hour12: false`. The IANA tz database in the
 * JS runtime handles MST (UTC-7) and MDT (UTC-6) transparently — no manual
 * offset math.
 */
export function denverMinutesSinceMidnight(date: Date): number {
  const parts = clockFormat.formatToParts(date);
  const hourRaw = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minuteRaw = parts.find((p) => p.type === "minute")?.value ?? "0";
  // hour12:false can render midnight as "24" in some environments; normalise.
  const hour = parseInt(hourRaw, 10) % 24;
  const minute = parseInt(minuteRaw, 10);
  return hour * 60 + minute;
}

/**
 * America/Denver UTC offset in minutes east of UTC for the given instant
 * (negative: -420 in MST, -360 in MDT). Derived from `Intl` — DST-correct, no
 * hardcoded offsets.
 */
function denverOffsetMinutes(date: Date): number {
  const parts = wallClockFormat.formatToParts(date);
  const get = (t: string) =>
    parseInt(parts.find((p) => p.type === t)!.value, 10);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return (asUtc - date.getTime()) / 60000;
}

/**
 * Inverse of {@link denverDayKey}: returns the UTC instant of 00:00 America/Denver
 * for the calendar day "YYYY-MM-DD". DST-correct (probes the offset at local
 * midday, after any 2am transition). Pure — no clock read.
 *
 * Calendar grids (month-range mode) select whole calendar days; the booking core
 * works in concrete instants. This bridges the two so `deriveBookableDays` /
 * `validateStayRange` receive true Denver-midnight instants.
 */
export function denverMidnight(dayKey: string): Date {
  // A key with missing parts parses to NaN, which carries through to an Invalid
  // Date exactly as an unparseable part always has.
  const [y = NaN, m = NaN, d = NaN] = dayKey
    .split("-")
    .map((n) => parseInt(n, 10));
  const utc = Date.UTC(y, m - 1, d, 0, 0, 0);
  // Two-step solve: the offset at the first candidate can differ from the offset
  // at the UTC anchor across a DST transition (spring-forward midnight is still
  // standard time). Re-probe at the candidate and adopt that offset if it moved.
  const off1 = denverOffsetMinutes(new Date(utc));
  const candidate = utc - off1 * 60000;
  const off2 = denverOffsetMinutes(new Date(candidate));
  return new Date(off2 === off1 ? candidate : utc - off2 * 60000);
}
