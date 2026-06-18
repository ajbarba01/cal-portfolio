/** Pure model for the single-day booking timeline. Minutes since midnight. */
export type MinuteWindow = [openMinute: number, closeMinute: number];

/**
 * Granularity-aligned start minutes whose [start - bufferMin, start + duration + bufferMin]
 * fits inside a window. A block ending exactly at the window close is allowed. Result sorted.
 */
export function startOptions(args: {
  windows: MinuteWindow[];
  durationMin: number;
  granularityMin: number;
  bufferMin?: number;
}): number[] {
  const { windows, durationMin, granularityMin, bufferMin = 0 } = args;
  // Set-dedup so overlapping/adjacent windows can't yield the same start twice
  // (which would collide as duplicate React keys in the timeline).
  const out = new Set<number>();
  for (const [open, close] of windows) {
    const earliest = open + bufferMin;
    const first = Math.ceil(earliest / granularityMin) * granularityMin;
    for (
      let s = first;
      s + durationMin + bufferMin <= close;
      s += granularityMin
    ) {
      if (s >= earliest) out.add(s);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** Start + duration → {startMin, endMin}. */
export function blockSpan(
  startMin: number,
  durationMin: number,
): { startMin: number; endMin: number } {
  return { startMin, endMin: startMin + durationMin };
}

/**
 * Clamps absolute-instant time ranges to a single calendar day and converts
 * them to minutes-since-day-start `[startMin, endMin]` windows. Ranges that do
 * not intersect `[dayStartMs, dayStartMs + 24h)` are dropped; partial overlaps
 * are clamped to the day. Zero/negative-width results are dropped.
 *
 * Pure (#5 ENGINEERING). Shared by the day timeline to derive BOTH the
 * open-availability bands (from windows) and the booked blocks (from busy
 * ranges) off the same absolute-instant → day-minute mapping.
 */
export function clampRangesToDayMinutes(
  ranges: { startsAt: Date; endsAt: Date }[],
  dayStartMs: number,
): MinuteWindow[] {
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
  return ranges
    .filter(
      (r) => r.startsAt.getTime() < dayEndMs && r.endsAt.getTime() > dayStartMs,
    )
    .map((r) => {
      const sMs = Math.max(r.startsAt.getTime(), dayStartMs);
      const eMs = Math.min(r.endsAt.getTime(), dayEndMs);
      return [
        Math.round((sMs - dayStartMs) / 60_000),
        Math.round((eMs - dayStartMs) / 60_000),
      ] as MinuteWindow;
    })
    .filter(([s, e]) => e > s);
}
