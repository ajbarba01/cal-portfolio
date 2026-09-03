/**
 * Minute-window predicates the multi-day availability editor needs on top of
 * day-timeline-model's span math. Pure, no React, no IO.
 *
 * The window arguments are MERGED (sorted, non-overlapping — `mergeWindows`
 * output) except where a signature says otherwise.
 */

import {
  clampRangesToDayMinutes,
  mergeWindows,
} from "@/features/booking/day-timeline-model";
import type { MinuteWindow } from "@/features/booking/day-timeline-model";

/**
 * The minutes both sides hold open. Used to draw the painter when several days
 * are selected: reducing every selected day's merged windows through this
 * leaves the hours open on all of them, which is the only claim the timeline
 * can make honestly about a whole selection.
 */
export function intersectWindows(
  a: MinuteWindow[],
  b: MinuteWindow[],
): MinuteWindow[] {
  const out: MinuteWindow[] = [];
  let i = 0;
  let j = 0;
  let left = a[i];
  let right = b[j];
  while (left !== undefined && right !== undefined) {
    const open = Math.max(left[0], right[0]);
    const close = Math.min(left[1], right[1]);
    if (open < close) out.push([open, close]);
    // Retire whichever window ends first; the other may still meet the next one.
    if (left[1] < right[1]) left = a[++i];
    else right = b[++j];
  }
  return out;
}

/** Whether one window already holds the whole span, so creating it again is a no-op row. */
export function coversSpan(
  windows: MinuteWindow[],
  openMinute: number,
  closeMinute: number,
): boolean {
  return windows.some(
    ([open, close]) => open <= openMinute && close >= closeMinute,
  );
}

/**
 * The edits that turn a window's bounds from [oOpen, oClose) into
 * [nOpen, nClose): each end that grew is a create, each end that shrank is a
 * remove. The painter applies every remove first and skips the creates if one
 * was declined, so a resize or move is all-or-nothing against the
 * cancel-and-refund confirm rather than half-applied.
 *
 * Bounds that no longer overlap have no shared middle to leave alone, so they
 * are swapped wholesale instead: per-end deltas would remove up to the new
 * start and create from the old end, which opens the entire gap between the two
 * positions (dragging 9–10 down to 3–4 would leave 10–4 open).
 */
export function boundsEdits(
  oOpen: number,
  oClose: number,
  nOpen: number,
  nClose: number,
): { creates: MinuteWindow[]; removes: MinuteWindow[] } {
  if (nOpen >= oClose || nClose <= oOpen) {
    return { creates: [[nOpen, nClose]], removes: [[oOpen, oClose]] };
  }
  const creates: MinuteWindow[] = [];
  const removes: MinuteWindow[] = [];
  if (nOpen < oOpen) creates.push([nOpen, oOpen]);
  else if (nOpen > oOpen) removes.push([oOpen, nOpen]);
  if (nClose > oClose) creates.push([oClose, nClose]);
  else if (nClose < oClose) removes.push([nClose, oClose]);
  return { creates, removes };
}

/**
 * Which of `dayKeys` do NOT already hold [openMinute, closeMinute) open.
 *
 * `createWindowsBatchCore` inserts one row per day without looking, so applying
 * the same hours to a selection twice would leave Cal a duplicate row on every
 * day that already had them. Filtering here keeps the batch to the days the
 * create actually changes — and an empty result means there is nothing to send.
 *
 * Only days that hold the WHOLE span are dropped. A create that merely overlaps
 * an existing window (a day open 9–12, applying 10–17) still writes a row that
 * overlaps it, because the hours past the overlap have to land somewhere and
 * the batch action takes one span for every day it is given. Those rows read
 * correctly — every consumer merges before drawing or slicing — so this is row
 * bloat, not wrong availability; the durable fix is a server-side merge in
 * `createWindowsBatchCore`.
 */
export function daysMissingWindow(args: {
  /** Every availability window in scope, as absolute instants. */
  windows: { startsAt: Date; endsAt: Date }[];
  dayKeys: string[];
  /** Epoch ms of a day-key's local midnight. */
  midnightOf: (dayKey: string) => number;
  openMinute: number;
  closeMinute: number;
}): string[] {
  const { windows, dayKeys, midnightOf, openMinute, closeMinute } = args;
  return dayKeys.filter(
    (dayKey) =>
      !coversSpan(
        mergeWindows(clampRangesToDayMinutes(windows, midnightOf(dayKey))),
        openMinute,
        closeMinute,
      ),
  );
}
