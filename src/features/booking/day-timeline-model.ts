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

/**
 * Merges overlapping AND adjacent (touching) minute-windows into their union.
 * `[540,600]` + `[600,660]` → `[540,660]`; `[540,600]` + `[630,690]` stay
 * separate. Sorted, non-overlapping output; zero/negative-width inputs dropped.
 *
 * Pure (#5 ENGINEERING). The availability painter stores windows as discrete DB
 * rows, but Cal reasons in spans ("open 9–11"), so the timeline renders the
 * MERGED union as one green block rather than one band per row.
 */
export function mergeWindows(windows: MinuteWindow[]): MinuteWindow[] {
  const sorted = windows.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const out: MinuteWindow[] = [];
  for (const [open, close] of sorted) {
    const last = out[out.length - 1];
    if (last && open <= last[1]) {
      // Overlap or touch — extend the running block's close.
      if (close > last[1]) last[1] = close;
    } else {
      out.push([open, close]);
    }
  }
  return out;
}

/**
 * Rounds a minute to the nearest `granularity` step, clamped to `[min, max]`.
 * The painter snaps every drag edge through here so created/resized windows
 * always land on a 15-minute boundary inside the visible track.
 */
export function snapMinute(
  minute: number,
  granularity: number,
  min: number,
  max: number,
): number {
  const snapped = Math.round(minute / granularity) * granularity;
  return Math.max(min, Math.min(max, snapped));
}

/**
 * Subtracts `blocked` minute-intervals from each open window, returning the
 * remaining FREE sub-intervals (sorted, non-overlapping, zero-width dropped).
 * Overlapping/adjacent blocked intervals are merged via a running cursor.
 *
 * Pure (#5 ENGINEERING). Lets the day timeline render availability as discrete
 * green blocks that split around bookings + their drive buffers, with plain
 * gaps where time is unavailable.
 */
export function subtractBlocked(
  windows: MinuteWindow[],
  blocked: MinuteWindow[],
): MinuteWindow[] {
  const out: MinuteWindow[] = [];
  for (const [open, close] of windows) {
    const cuts = blocked
      .map(
        ([bs, be]) => [Math.max(bs, open), Math.min(be, close)] as MinuteWindow,
      )
      .filter(([bs, be]) => be > bs)
      .sort((a, b) => a[0] - b[0]);

    let cursor = open;
    for (const [bs, be] of cuts) {
      if (bs > cursor) out.push([cursor, bs]);
      cursor = Math.max(cursor, be);
    }
    if (cursor < close) out.push([cursor, close]);
  }
  return out.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
}
