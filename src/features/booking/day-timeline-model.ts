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
