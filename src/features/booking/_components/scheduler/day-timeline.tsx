"use client";

/**
 * Scheduler.DayTimeline — single-day, duration-accurate time picker (Layer 3).
 *
 * Aesthetic: "handwritten appointment book" — warm ruled-line planner feel.
 * Hour labels in font-heading (Fraunces); ruled hour/quarter-tick marks;
 * open windows as parchment-washed bg-status-available/50 bands;
 * the selected block as a clay washi-tape strip (bg-brand, rounded-md).
 *
 * Reads state from SchedulerContext (via useScheduler); dispatches back into it
 * via beginGridDrag. Owns NO selection logic — model lives in day-timeline-model.ts.
 *
 * DRAG MECHANICS — matches WeekGrid convention
 *   No setPointerCapture. One-shot global window pointerup/pointercancel listener;
 *   unmount cleanup; suppressNextClick swallows the click after a drag.
 *   touch-action:none on the track.
 *
 * HOOKS — all declared unconditionally before any early return (WeekGrid pattern).
 */

import React, {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScheduler } from "@/features/booking/scheduler-context";
import { denverMidnight } from "@/features/booking/availability";
import { overlapsHalfOpen } from "@/features/booking/calendar-model";
import {
  startOptions,
  blockSpan,
  clampRangesToDayMinutes,
  subtractBlocked,
} from "@/features/booking/day-timeline-model";
import type { MinuteWindow } from "@/features/booking/day-timeline-model";
import { useCellSelection } from "./use-cell-selection";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

/** Vertical pixels per minute of wall-clock time. */
const PX_PER_MIN = 0.9;

/**
 * Floor for the SELECTED block's visible height (px). Above this the block scales
 * with the booking duration so a 30-min booking reads shorter than a 60-min one;
 * below it (very short durations) the block stays tall enough to show its time
 * label. The clickable start zones keep a separate 44px tap-target minimum.
 */
const MIN_BLOCK_PX = 22;

/** Width of the left hour-label gutter in px. */
const GUTTER_W = 52;

// ---------------------------------------------------------------------------
// Pure formatting helpers
// ---------------------------------------------------------------------------

/**
 * Minutes-since-midnight → "H:MM AM/PM" (e.g. "9:00 AM", "1:30 PM").
 * Uses 12-hour clock for the human-facing label.
 */
function formatMinutes12(m: number): string {
  const totalMin = ((m % 1440) + 1440) % 1440;
  const h24 = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${suffix}`;
}

/**
 * Minutes → compact range label, e.g. "9:00 – 10:15 AM".
 * Single suffix when both are in the same period, else each gets its own.
 */
function formatRange(startMin: number, endMin: number): string {
  const totalStart = ((startMin % 1440) + 1440) % 1440;
  const totalEnd = ((endMin % 1440) + 1440) % 1440;
  const hS = Math.floor(totalStart / 60);
  const hE = Math.floor(totalEnd / 60);
  const suffS = hS < 12 ? "AM" : "PM";
  const suffE = hE < 12 ? "AM" : "PM";
  const h12S = hS % 12 === 0 ? 12 : hS % 12;
  const h12E = hE % 12 === 0 ? 12 : hE % 12;
  const minS = String(totalStart % 60).padStart(2, "0");
  const minE = String(totalEnd % 60).padStart(2, "0");
  if (suffS === suffE) {
    return `${h12S}:${minS} – ${h12E}:${minE} ${suffE}`;
  }
  return `${h12S}:${minS} ${suffS} – ${h12E}:${minE} ${suffE}`;
}

/**
 * intervalMinutes → human label, e.g. 75 → "1h 15m", 60 → "1h", 45 → "45m".
 */
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Denver-formatted date header, e.g. "Wed, Jun 3".
 */
function formatDayHeader(dayKey: string): string {
  const d = denverMidnight(dayKey);
  return d.toLocaleDateString("en-US", {
    timeZone: "America/Denver",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// DayTimeline — all hooks declared unconditionally
// ---------------------------------------------------------------------------

export function DayTimeline({ className }: { className?: string }) {
  const { capabilities, data, selection } = useScheduler();
  const { state, beginGridDrag, clearDays } = selection;
  const intervalMinutes = capabilities.intervalMinutes ?? 60;
  const bufferMin = data.viewerDriveBufferMin ?? 0;

  // ── All hooks (unconditional — WeekGrid pattern) ──────────────────────────

  // Drag: which candidate is being dragged (startMin offset)
  const [dragPreviewStart, setDragPreviewStart] = useState<number | null>(null);
  // Hover: nearest candidate under the pointer (drives a single gliding ghost
  // preview instead of N overlapping per-start hover buttons, which jumped/
  // trailed as the pointer crossed the stacked zones).
  const [hoverStart, setHoverStart] = useState<number | null>(null);
  const suppressNextClick = useRef(false);
  // dragEndHandlerRef + installEndHandler + unmount cleanup from shared hook.
  const { dragEndHandlerRef, installEndHandler } = useCellSelection();
  // Y-coord where the drag block was grabbed (relative to block top), in px
  const dragGrabOffsetPx = useRef(0);
  // Latest drag-preview start, mirrored in a ref so the drag-end handler can read
  // it WITHOUT calling beginGridDrag inside a setState updater (which runs during
  // render → "Cannot update a component while rendering" — same fix as WeekGrid).
  const dragPreviewStartRef = useRef<number | null>(null);
  // Ref to track container for pointer-coord math
  const trackRef = useRef<HTMLDivElement | null>(null);

  // ── Derived values ─────────────────────────────────────────────────────────

  const dayKey: string | null = useMemo(() => {
    if (state.selectedDays.size === 0) return null;
    return [...state.selectedDays][0];
  }, [state.selectedDays]);

  const isPremiumDay = data.premiumDays?.has(dayKey ?? "") ?? false;

  /**
   * Minute-windows for the selected day: filter data.windows to those that
   * overlap the selected calendar day, then convert each to [openMin,closeMin]
   * minutes-since-Denver-midnight for that specific day (clamped to [0,1440]).
   */
  const minuteWindows = useMemo<MinuteWindow[]>(() => {
    if (!dayKey) return [];
    return clampRangesToDayMinutes(
      data.windows,
      denverMidnight(dayKey).getTime(),
    );
  }, [dayKey, data.windows]);

  /**
   * Busy ranges for the selected day: existing bookings (already widened by their
   * own drive-time buffers, server-side) intersected with the day, as
   * [startMin, endMin]. Rendered (further widened by the viewer's buffer at the
   * render site) as unavailable strips so occupied + travel time reads as
   * not-available instead of green. The candidate starts under these are already
   * filtered out of `candidateStarts`.
   */
  const busyBlocks = useMemo<MinuteWindow[]>(() => {
    if (!dayKey) return [];
    return clampRangesToDayMinutes(data.busy, denverMidnight(dayKey).getTime());
  }, [dayKey, data.busy]);

  /**
   * Free availability blocks: the open windows with the busy ranges removed.
   * Each busy range is widened by the viewer's own drive buffer so the gap also
   * reserves the travel time a new booking needs around an existing one. Rendered
   * as discrete green rounded blocks; the white track between them reads as
   * unavailable.
   */
  const freeBlocks = useMemo<MinuteWindow[]>(() => {
    const blocked = busyBlocks.map(
      ([s, e]) => [s - bufferMin, e + bufferMin] as MinuteWindow,
    );
    return subtractBlocked(minuteWindows, blocked);
  }, [minuteWindows, busyBlocks, bufferMin]);

  /**
   * Candidate starts from day-timeline-model, then busy-filtered:
   * remove any start whose [start, start+duration) as absolute Dates
   * overlaps any data.busy block.
   */
  const candidateStarts = useMemo<number[]>(() => {
    if (!dayKey) return [];
    const allStarts = startOptions({
      windows: minuteWindows,
      durationMin: intervalMinutes,
      granularityMin: capabilities.startGranularityMin ?? 15,
      bufferMin,
    });
    const midnight = denverMidnight(dayKey).getTime();
    return allStarts.filter((startMin) => {
      const { endMin } = blockSpan(startMin, intervalMinutes);
      const bufMs = bufferMin * 60_000;
      const candidateRange = {
        startsAt: new Date(midnight + startMin * 60_000 - bufMs),
        endsAt: new Date(midnight + endMin * 60_000 + bufMs),
      };
      return !data.busy.some((b) => overlapsHalfOpen(candidateRange, b));
    });
  }, [
    dayKey,
    minuteWindows,
    intervalMinutes,
    data.busy,
    bufferMin,
    capabilities,
  ]);

  // Track vertical span: min open → max close across all minute-windows
  const trackBounds = useMemo<{
    minOpen: number;
    maxClose: number;
  } | null>(() => {
    if (minuteWindows.length === 0) return null;
    const minOpen = Math.min(...minuteWindows.map(([o]) => o));
    const maxClose = Math.max(...minuteWindows.map(([, c]) => c));
    return { minOpen, maxClose };
  }, [minuteWindows]);

  // Hour labels to render in the gutter (whole hours within the track span)
  const hourLabels = useMemo<number[]>(() => {
    if (!trackBounds) return [];
    const first = Math.floor(trackBounds.minOpen / 60);
    const last = Math.ceil(trackBounds.maxClose / 60);
    const labels: number[] = [];
    for (let h = first; h <= last; h++) {
      labels.push(h * 60);
    }
    return labels;
  }, [trackBounds]);

  // Current gridDraft parsed back to { dayKey, startMin } if it's for today
  const draftForDay = useMemo<number | null>(() => {
    if (!dayKey || state.gridDraft.size === 0) return null;
    for (const cellId of state.gridDraft) {
      const [cDay, cMin] = cellId.split("@");
      if (cDay === dayKey && cMin !== undefined) {
        return parseInt(cMin, 10);
      }
    }
    return null;
  }, [dayKey, state.gridDraft]);

  // The "live" start displayed: drag preview overrides committed draft
  const liveStart: number | null = dragPreviewStart ?? draftForDay;

  // ── Keep the committed selection valid as duration changes ────────────────
  // When the booking duration grows, the committed start may no longer fit its
  // window. Snap back to the latest start that still fits; if nothing fits this
  // day, unselect the day entirely (it also drops out of the month's available
  // set, which is recomputed for the new duration upstream).
  // (beginGridDrag / clearDays are context dispatchers, not local setState.)
  useEffect(() => {
    if (dayKey === null) return;
    if (minuteWindows.length === 0) return; // "no availability" handled below
    if (candidateStarts.length === 0) {
      clearDays();
      return;
    }
    if (draftForDay === null || candidateStarts.includes(draftForDay)) return;
    const fit =
      [...candidateStarts].reverse().find((c) => c <= draftForDay) ??
      candidateStarts[candidateStarts.length - 1];
    beginGridDrag(`${dayKey}@${fit}`);
  }, [
    dayKey,
    minuteWindows.length,
    candidateStarts,
    draftForDay,
    beginGridDrag,
    clearDays,
  ]);

  // ── Pointer drag helpers ──────────────────────────────────────────────────
  // installEndHandler is provided by useCellSelection (imported above).

  /**
   * Given a pointer Y relative to track top, find the nearest candidate start.
   */
  const nearestCandidateFromY = useCallback(
    (trackYPx: number, bounds: { minOpen: number }): number | null => {
      if (candidateStarts.length === 0) return null;
      const minuteFromTop = trackYPx / PX_PER_MIN + bounds.minOpen;
      return candidateStarts.reduce((best, c) =>
        Math.abs(c - minuteFromTop) < Math.abs(best - minuteFromTop) ? c : best,
      );
    },
    [candidateStarts],
  );

  // ── Drag on the committed block (move it among candidates) ────────────────

  const handleBlockPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dayKey || !trackBounds || liveStart === null) return;
      e.preventDefault();
      suppressNextClick.current = false;

      const trackEl = trackRef.current;
      if (!trackEl) return;

      // Y relative to the block's top (so block doesn't jump on grab)
      const trackRect = trackEl.getBoundingClientRect();
      const blockTopPx = (liveStart - trackBounds.minOpen) * PX_PER_MIN;
      const pointerYInTrack = e.clientY - trackRect.top;
      dragGrabOffsetPx.current = pointerYInTrack - blockTopPx;

      const onMove = (me: PointerEvent) => {
        if (!trackRef.current || !trackBounds) return;
        const r = trackRef.current.getBoundingClientRect();
        const rawY = me.clientY - r.top - dragGrabOffsetPx.current;
        const nearest = nearestCandidateFromY(rawY, trackBounds);
        if (nearest !== null) {
          dragPreviewStartRef.current = nearest;
          setDragPreviewStart(nearest);
        }
      };

      window.addEventListener("pointermove", onMove);

      const endHandler = () => {
        window.removeEventListener("pointermove", onMove);
        dragEndHandlerRef.current = null;
        suppressNextClick.current = true;
        // Read the final start from the ref, clear the preview, THEN dispatch —
        // calling beginGridDrag inside a setState updater dispatches to the
        // Scheduler reducer during render (the "update a component while rendering"
        // error). Commit outside any updater instead (WeekGrid convention).
        const finalStart = dragPreviewStartRef.current ?? liveStart;
        dragPreviewStartRef.current = null;
        setDragPreviewStart(null);
        if (dayKey && finalStart !== null) {
          beginGridDrag(`${dayKey}@${finalStart}`);
        }
      };
      installEndHandler(endHandler);
    },
    [
      dayKey,
      trackBounds,
      liveStart,
      nearestCandidateFromY,
      beginGridDrag,
      installEndHandler,
    ],
  );

  // ── Click in the track (select nearest candidate) ────────────────────────

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (suppressNextClick.current) {
        suppressNextClick.current = false;
        return;
      }
      if (!dayKey || !trackBounds || candidateStarts.length === 0) return;
      const trackEl = trackRef.current;
      if (!trackEl) return;
      const rect = trackEl.getBoundingClientRect();
      const rawY = e.clientY - rect.top;
      const nearest = nearestCandidateFromY(rawY, trackBounds);
      if (nearest !== null) {
        beginGridDrag(`${dayKey}@${nearest}`);
      }
    },
    [
      dayKey,
      trackBounds,
      candidateStarts,
      nearestCandidateFromY,
      beginGridDrag,
    ],
  );

  // ── Hover preview (track pointer move → nearest candidate ghost) ──────────
  // One gliding ghost beats N overlapping hover buttons: no fade-trail as the
  // pointer crosses stacked zones. setHoverStart no-ops when nearest is
  // unchanged (React bails), so fast moves don't thrash renders.

  const handleTrackPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!trackBounds || candidateStarts.length === 0 || !trackRef.current) {
        return;
      }
      const rect = trackRef.current.getBoundingClientRect();
      const nearest = nearestCandidateFromY(e.clientY - rect.top, trackBounds);
      setHoverStart(nearest);
    },
    [trackBounds, candidateStarts, nearestCandidateFromY],
  );

  const handleTrackPointerLeave = useCallback(() => setHoverStart(null), []);

  // ── Keyboard: arrow up/down on the track moves selection ─────────────────

  const handleTrackKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!dayKey || candidateStarts.length === 0) return;
      const currentIdx =
        liveStart !== null ? candidateStarts.indexOf(liveStart) : -1;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next =
          candidateStarts[Math.min(candidateStarts.length - 1, currentIdx + 1)];
        if (next !== undefined) beginGridDrag(`${dayKey}@${next}`);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = candidateStarts[Math.max(0, currentIdx - 1)];
        if (prev !== undefined) beginGridDrag(`${dayKey}@${prev}`);
      }
    },
    [dayKey, candidateStarts, liveStart, beginGridDrag],
  );

  // ── Early return: no day selected ─────────────────────────────────────────
  if (!dayKey) {
    return (
      <div
        className={cn(
          "flex min-h-24 items-center justify-center py-8",
          className,
        )}
      >
        <p className="text-muted-foreground font-sans text-sm">
          Pick a day above to choose a time.
        </p>
      </div>
    );
  }

  // ── No availability this day ──────────────────────────────────────────────
  if (!trackBounds || minuteWindows.length === 0) {
    return (
      <div className={cn("flex flex-col gap-3 select-none", className)}>
        <DayHeader
          dayKey={dayKey}
          intervalMinutes={intervalMinutes}
          isPremiumDay={isPremiumDay}
        />
        <div className="flex min-h-20 items-center justify-center py-6">
          <p className="text-muted-foreground font-sans text-sm">
            No availability this day.
          </p>
        </div>
      </div>
    );
  }

  const { minOpen, maxClose } = trackBounds;
  const trackHeightPx = (maxClose - minOpen) * PX_PER_MIN;

  return (
    <div className={cn("flex flex-col gap-4 select-none", className)}>
      {/* Header: date on left, duration on right */}
      <DayHeader
        dayKey={dayKey}
        intervalMinutes={intervalMinutes}
        isPremiumDay={isPremiumDay}
      />

      {/* Timeline */}
      <div className="flex items-stretch gap-0">
        {/* Left gutter — hour labels */}
        <div
          className="relative shrink-0"
          style={{ width: GUTTER_W, height: trackHeightPx }}
          aria-hidden="true"
        >
          {hourLabels.map((minuteMark) => {
            const topPx = (minuteMark - minOpen) * PX_PER_MIN;
            // Clamp so first/last don't bleed outside track
            if (topPx < 0 || topPx > trackHeightPx) return null;
            const isHour = minuteMark % 60 === 0;
            return (
              <div
                key={minuteMark}
                className={cn(
                  "font-heading absolute right-3 -translate-y-1/2 text-right leading-none",
                  isHour
                    ? "text-muted-foreground text-xs font-medium"
                    : "text-muted-foreground/50 text-[10px]",
                )}
                style={{ top: topPx }}
              >
                {isHour ? formatMinutes12(minuteMark).replace(":00", "") : "·"}
              </div>
            );
          })}
        </div>

        {/* Track */}
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label={`Time selector for ${formatDayHeader(dayKey)}. Use arrow keys to move selection.`}
          aria-valuemin={candidateStarts[0] ?? minOpen}
          aria-valuemax={
            candidateStarts[candidateStarts.length - 1] ?? maxClose
          }
          aria-valuenow={liveStart ?? undefined}
          aria-valuetext={
            liveStart !== null
              ? formatRange(liveStart, liveStart + intervalMinutes)
              : "No time selected"
          }
          className={cn(
            "relative flex-1 rounded-md",
            "border-border border",
            "bg-card overflow-hidden",
            "cursor-pointer",
            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
            // No native drag
            "touch-action-none",
          )}
          style={{
            height: trackHeightPx,
            touchAction: "none",
            userSelect: "none",
          }}
          onClick={handleTrackClick}
          onKeyDown={handleTrackKeyDown}
          onPointerMove={handleTrackPointerMove}
          onPointerLeave={handleTrackPointerLeave}
          onDragStart={(e) => e.preventDefault()}
        >
          {/* Free availability blocks — open windows with bookings + their drive
              buffers removed. Rendered as discrete green rounded blocks; the white
              track showing between them reads as unavailable (Cal isn't free to
              start there). Candidate starts under a gap are already filtered out. */}
          {freeBlocks.map(([open, close], i) => (
            <div
              key={i}
              className="bg-status-available/60 pointer-events-none absolute inset-x-1 rounded-lg"
              style={{
                top: (open - minOpen) * PX_PER_MIN,
                height: (close - open) * PX_PER_MIN,
              }}
              aria-hidden="true"
            />
          ))}

          {/* Horizontal hour ruled lines */}
          {hourLabels.map((minuteMark) => {
            const topPx = (minuteMark - minOpen) * PX_PER_MIN;
            if (topPx <= 0 || topPx >= trackHeightPx) return null;
            const isHour = minuteMark % 60 === 0;
            return (
              <div
                key={minuteMark}
                className={cn(
                  "pointer-events-none absolute inset-x-0",
                  isHour
                    ? "border-border border-t"
                    : "border-border/40 border-t border-dashed",
                )}
                style={{ top: topPx }}
                aria-hidden="true"
              />
            );
          })}

          {/* 15-min tick dots in gutter */}
          {Array.from(
            { length: Math.ceil((maxClose - minOpen) / 15) },
            (_, i) => {
              const min = minOpen + i * 15;
              if (min % 60 === 0) return null; // hour lines already cover these
              const topPx = (min - minOpen) * PX_PER_MIN;
              if (topPx >= trackHeightPx) return null;
              return (
                <div
                  key={min}
                  className="bg-border/60 pointer-events-none absolute left-1 size-0.5 rounded-full"
                  style={{ top: topPx - 1 }}
                  aria-hidden="true"
                />
              );
            },
          )}

          {/* Hover ghost — a single preview block that glides (GPU transform) to
              the nearest candidate start under the pointer. Selecting is handled
              by the track's onClick (nearest candidate), so this stays purely
              visual. Stays live during a block drag; only hidden when it would sit
              exactly on the current block. */}
          {hoverStart !== null && hoverStart !== liveStart && (
            <div
              className="bg-brand/15 border-brand/40 pointer-events-none absolute inset-x-1 top-0 rounded-md border transition-transform duration-100 ease-out will-change-transform"
              style={{
                transform: `translateY(${(hoverStart - minOpen) * PX_PER_MIN}px)`,
                height: Math.max(intervalMinutes * PX_PER_MIN, MIN_BLOCK_PX),
              }}
              aria-hidden="true"
            />
          )}

          {/* Selected / drag-preview block */}
          {liveStart !== null &&
            (() => {
              const topPx = (liveStart - minOpen) * PX_PER_MIN;
              const heightPx = intervalMinutes * PX_PER_MIN;
              const endMin = liveStart + intervalMinutes;
              return (
                <div
                  className={cn(
                    "bg-brand text-brand-foreground absolute inset-x-1 top-0 rounded-md",
                    "flex flex-col justify-between overflow-hidden px-2.5 py-1",
                    "shadow-sm",
                    "cursor-grab active:cursor-grabbing",
                    // Position via GPU transform (composite-only, no per-frame
                    // layout) with a short glide so 15-min snaps feel smooth
                    // instead of teleporting.
                    "transition-[transform,box-shadow] duration-100 ease-out will-change-transform",
                    dragPreviewStart !== null && "shadow-md",
                  )}
                  style={{
                    transform: `translateY(${topPx}px)`,
                    height: Math.max(heightPx, MIN_BLOCK_PX),
                    touchAction: "none",
                    userSelect: "none",
                  }}
                  onPointerDown={handleBlockPointerDown}
                  onDragStart={(e) => e.preventDefault()}
                >
                  {/* Time label */}
                  <span className="font-sans text-xs leading-tight font-semibold tracking-wide">
                    {formatRange(liveStart, endMin)}
                  </span>

                  {/* Drag grip dots */}
                  {heightPx >= 40 && (
                    <div
                      className="flex items-center justify-center gap-0.5"
                      aria-hidden="true"
                    >
                      <span className="bg-brand-foreground/40 size-0.5 rounded-full" />
                      <span className="bg-brand-foreground/40 size-0.5 rounded-full" />
                      <span className="bg-brand-foreground/40 size-0.5 rounded-full" />
                    </div>
                  )}
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DayHeader — extracted sub-component (no hooks, no early return needed)
// ---------------------------------------------------------------------------

function DayHeader({
  dayKey,
  intervalMinutes,
  isPremiumDay,
}: {
  dayKey: string;
  intervalMinutes: number;
  isPremiumDay: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <div className="flex items-center gap-2">
        <span className="font-heading text-foreground text-sm font-medium">
          {formatDayHeader(dayKey)}
        </span>
        {isPremiumDay && (
          <span className="text-warning-foreground inline-flex items-center gap-1 text-xs font-medium">
            <Star aria-hidden="true" size={12} className="fill-current" />
            Premium day
          </span>
        )}
      </div>
      <span className="text-muted-foreground font-sans text-xs">
        {formatDuration(intervalMinutes)}
      </span>
    </div>
  );
}
