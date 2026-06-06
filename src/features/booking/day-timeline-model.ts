/** Pure model for the single-day booking timeline. Minutes since midnight. */
export type MinuteWindow = [openMinute: number, closeMinute: number];

/**
 * Granularity-aligned start minutes whose [start, start+duration] fits inside a
 * window. A block ending exactly at the window close is allowed. Result sorted.
 */
export function startOptions(args: {
  windows: MinuteWindow[];
  durationMin: number;
  granularityMin: number;
}): number[] {
  const { windows, durationMin, granularityMin } = args;
  // Set-dedup so overlapping/adjacent windows can't yield the same start twice
  // (which would collide as duplicate React keys in the timeline).
  const out = new Set<number>();
  for (const [open, close] of windows) {
    const first = Math.ceil(open / granularityMin) * granularityMin;
    for (let s = first; s + durationMin <= close; s += granularityMin) {
      if (s >= open) out.add(s);
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
