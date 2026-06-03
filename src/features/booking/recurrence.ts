/**
 * Pure recurrence engine (RRULE subset).
 *
 * Deterministic, no IO, no clock reads. All time inputs are passed in as
 * arguments. (#5 ENGINEERING)
 *
 * MONTH OVERFLOW CONTRACT
 * -----------------------
 * Monthly steps use `Date.prototype.setUTCMonth` (UTC calendar math). When a
 * start day does not exist in the target month (e.g. Jan 31 + 1 month), the
 * JavaScript Date engine overflows into the next month (e.g. → Mar 2 or Mar 3
 * in a leap year). This is consistent, deterministic, and documented here.
 * Callers that need last-day clamping must pre-clamp the start date.
 *
 * UNBOUNDED RULE CONTRACT
 * -----------------------
 * A rule with NEITHER `count` NOR `until` is unbounded. `expandOccurrences`
 * throws a descriptive `Error` in that case UNLESS the caller supplies an
 * external `materializeUntil` cap (how an open-ended series is expanded safely
 * up to the generation horizon). Whichever of `count` / `until` /
 * `materializeUntil` is reached first stops iteration.
 *
 * INTERVAL VALIDATION
 * -------------------
 * `interval` must be >= 1. Values < 1 throw a descriptive `Error`.
 */

/** Supported recurrence frequencies (MVP exposes only weekly in the UI). */
export type RecurrenceFreq = "daily" | "weekly" | "monthly";

/** A recurrence rule describing how to expand a series of occurrences. */
export interface RecurrenceRule {
  freq: RecurrenceFreq;
  /** Step multiplier, >= 1. E.g. 2 = every other period. */
  interval: number;
  /** Maximum number of occurrences (inclusive of start). */
  count?: number;
  /** Inclusive upper bound on occurrence start timestamps. */
  until?: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Advances a UTC Date by `n` calendar months using UTC date math.
 * Month overflow (e.g. Jan 31 + 1 month) follows JS Date overflow semantics
 * (documented above).
 */
function addUTCMonths(d: Date, n: number): Date {
  const result = new Date(d.getTime());
  result.setUTCMonth(result.getUTCMonth() + n);
  return result;
}

/**
 * Expands a recurrence rule from a given start date into an array of
 * occurrence start times.
 *
 * @param start - First occurrence start (UTC). Included in the result.
 * @param rule  - Recurrence rule; must have `count` and/or `until`, unless
 *                `opts.materializeUntil` is supplied as an external cap.
 * @param opts.materializeUntil - Inclusive external cap (e.g. the generation
 *                horizon). Bounds an otherwise-unbounded rule so open-ended
 *                series expand safely.
 * @returns Array of occurrence start `Date`s (UTC), beginning with `start`.
 *
 * @throws `Error` if `interval < 1`.
 * @throws `Error` if no bound at all (no `count`, no `until`, no `materializeUntil`).
 */
export function expandOccurrences(
  start: Date,
  rule: RecurrenceRule,
  opts: { materializeUntil?: Date } = {},
): Date[] {
  if (rule.interval < 1) {
    throw new Error(
      `RecurrenceRule.interval must be >= 1, got ${rule.interval}.`,
    );
  }
  if (
    rule.count === undefined &&
    rule.until === undefined &&
    opts.materializeUntil === undefined
  ) {
    throw new Error(
      "RecurrenceRule must specify at least one bound: count, until, or an external materializeUntil. Unbounded rules are not supported.",
    );
  }

  const occurrences: Date[] = [];
  let current = new Date(start.getTime());

  while (true) {
    // Check until bound (inclusive)
    if (rule.until !== undefined && current.getTime() > rule.until.getTime()) {
      break;
    }
    // Check external materialize cap (inclusive)
    if (
      opts.materializeUntil !== undefined &&
      current.getTime() > opts.materializeUntil.getTime()
    ) {
      break;
    }
    occurrences.push(new Date(current.getTime()));

    // Check count bound
    if (rule.count !== undefined && occurrences.length >= rule.count) {
      break;
    }

    // Advance to next occurrence
    switch (rule.freq) {
      case "daily":
        current = new Date(current.getTime() + rule.interval * MS_PER_DAY);
        break;
      case "weekly":
        current = new Date(current.getTime() + rule.interval * 7 * MS_PER_DAY);
        break;
      case "monthly":
        current = addUTCMonths(current, rule.interval);
        break;
      default: {
        const _exhaustive: never = rule.freq;
        throw new Error(
          `Unknown recurrence frequency: '${String(_exhaustive)}'.`,
        );
      }
    }
  }

  return occurrences;
}
