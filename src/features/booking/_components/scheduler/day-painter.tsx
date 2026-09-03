"use client";

/**
 * Scheduler.DayPainter — availability EDITOR for the selected day(s) (admin only).
 *
 * Sibling to DayTimeline (which is the read/book-mode start picker). Same
 * "handwritten appointment book" instrument — Fraunces hour gutter, ruled hour
 * lines + 15-min tick dots, parchment track, status-available green bands — but
 * in edit mode: Cal paints when she's free at 15-min granularity.
 *
 * ONE DAY — the full editor
 *   • Drag empty track  → sweep a new available block (snaps to 15 min) →
 *       release commits createWindowsBatch for the selected day.
 *   • Tap a green block  → selects it: top/bottom resize handles + Remove button.
 *       Resize/Remove map to createWindowsBatch (grow) / setWindowUnavailable
 *       (shrink/remove). Removing time a booking overlaps fires the consumer's
 *       cancel-and-refund confirm (wired in availability-client).
 *   • Booked blocks render as non-interactive blue bands (awareness only); a
 *       booking lives INSIDE an availability window, so it draws on top.
 *   • Keyboard path: the "Add hours" time inputs create a window; a green block
 *       is a real button that selects on Enter/Space, and once selected its two
 *       resize handles are sliders that move their edge one granularity step per
 *       Arrow Up/Down. Carving time back out from the keyboard means removing a
 *       selected block.
 *
 * SEVERAL DAYS — bulk open hours only
 *   The green bands show the hours open on EVERY selected day (their
 *   intersection), because that is the only claim a single timeline can make
 *   about a whole selection honestly. Both create paths — the track sweep and
 *   the "Add hours" inputs — apply to all of them. Everything single-day is
 *   withheld rather than disabled: no eraser, no block editing, no per-day
 *   bookings, no overnight list. Carving time back out stays a one-day job,
 *   since each removal can strand a booking and pop its own cancel confirm.
 *
 * Owns NO availability logic — pure range math lives in day-timeline-model.ts
 * and window-math.ts, gestures + commits in use-day-painter-drag.ts; mutations
 * go through context callbacks (which own optimistic + cancel-gate).
 */

import { useState, useMemo, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScheduler } from "@/features/booking/scheduler-context";
import { denverMidnight } from "@/features/booking/availability";
import {
  clampRangesToDayMinutes,
  mergeWindows,
} from "@/features/booking/day-timeline-model";
import type { MinuteWindow } from "@/features/booking/day-timeline-model";
import { Button } from "@/components/ui/button";
import { denverDate } from "@/lib/time-of-day";
import { intersectWindows } from "./window-math";
import { useDayPainterDrag } from "./use-day-painter-drag";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

/** Vertical pixels per minute of wall-clock time. */
const PX_PER_MIN = 0.8;
/** Width of the left hour-label gutter in px. */
const GUTTER_W = 52;
/** Default visible track bounds when settings give nothing (8:00–18:00). */
const DEFAULT_OPEN = 480;
const DEFAULT_CLOSE = 1080;
/** Padding above/below the business window so there's room to paint earlier/later. */
const TRACK_PAD_MIN = 60;

// ---------------------------------------------------------------------------
// Pure formatting helpers (local — small, mirror DayTimeline's private set)
// ---------------------------------------------------------------------------

function formatMinutes12(m: number): string {
  const t = ((m % 1440) + 1440) % 1440;
  const h24 = Math.floor(t / 60);
  const min = t % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${suffix}`;
}

function formatRange(startMin: number, endMin: number): string {
  const s = formatMinutes12(startMin);
  const e = formatMinutes12(endMin);
  // Drop the first suffix when both share AM/PM, e.g. "9:00 – 11:15 AM".
  const sameHalf = startMin % 1440 < 720 === endMin % 1440 < 720;
  return sameHalf ? `${s.replace(/ [AP]M$/, "")} – ${e}` : `${s} – ${e}`;
}

/** "Jun 3 – Jun 5" (Denver) for an overnight stay spanning multiple days. */
function formatStayRange(start: Date, end: Date): string {
  const fmt = (d: Date) => denverDate(d, { year: false });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Parse "HH:MM" → minutes since midnight, or NaN. */
function parseTimeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  if (h === undefined || m === undefined || isNaN(h) || isNaN(m)) return NaN;
  return h * 60 + m;
}

// ---------------------------------------------------------------------------
// DayPainter
// ---------------------------------------------------------------------------

export function DayPainter({ className }: { className?: string }) {
  const { capabilities, data, selection, callbacks } = useScheduler();
  const granularity = capabilities.startGranularityMin ?? 15;

  /** Every selected day in calendar order — creates apply to all of them. */
  const dayKeys = useMemo<string[]>(
    () => [...selection.state.selectedDays].sort(),
    [selection.state.selectedDays],
  );
  const dayKey = dayKeys[0] ?? null;
  const isBulk = dayKeys.length > 1;

  // ── Derived day data ───────────────────────────────────────────────────────
  const midnight = useMemo(
    () => (dayKey ? denverMidnight(dayKey).getTime() : 0),
    [dayKey],
  );

  /**
   * Visible green blocks. One day: the MERGED union of that day's window rows.
   * Several: their INTERSECTION, so a band only claims hours every selected day
   * actually holds open.
   */
  const mergedWindows = useMemo<MinuteWindow[]>(() => {
    if (dayKeys.length === 0) return [];
    return dayKeys
      .map((k) =>
        mergeWindows(
          clampRangesToDayMinutes(data.windows, denverMidnight(k).getTime()),
        ),
      )
      .reduce(intersectWindows);
  }, [dayKeys, data.windows]);

  // Split this day's bookings into INTRADAY walks (rendered as bands on the
  // timeline) and OVERNIGHT stays (rendered in their own section below). A stay
  // is "overnight" when it extends beyond the selected Denver day — a whole-day
  // house-sit otherwise paints a full-height band that swamps the timeline.
  // Bookings belong to one day, so a multi-day selection shows none.
  const dayEndMs = midnight + 24 * 60 * 60 * 1000;
  const { intradayBands, overnightStays } = useMemo(() => {
    const intraday: { open: number; close: number; label?: string }[] = [];
    const overnight: { label?: string; rangeLabel: string }[] = [];
    if (!dayKey || isBulk)
      return { intradayBands: intraday, overnightStays: overnight };
    for (const b of data.busy) {
      const s = b.startsAt.getTime();
      const e = b.endsAt.getTime();
      if (e <= midnight || s >= dayEndMs) continue; // not on this day
      if (s < midnight || e > dayEndMs) {
        overnight.push({
          label: b.label,
          rangeLabel: formatStayRange(b.startsAt, b.endsAt),
        });
      } else {
        const [clamped] = clampRangesToDayMinutes([b], midnight);
        if (clamped)
          intraday.push({
            open: clamped[0],
            close: clamped[1],
            label: b.label,
          });
      }
    }
    return { intradayBands: intraday, overnightStays: overnight };
  }, [dayKey, isBulk, data.busy, midnight, dayEndMs]);

  /**
   * Visible track span. Start from the business window, expand to cover any
   * content, THEN pad both ends — so a window/booking always has margin above
   * and below and never sits flush against the cutoff. All painting is clamped
   * to [lo, hi] (see snapMinute), so windows can't run off the timeline.
   */
  const [lo, hi] = useMemo<[number, number]>(() => {
    let low = data.rules.bookingOpenMinute ?? DEFAULT_OPEN;
    let high = data.rules.bookingCloseMinute ?? DEFAULT_CLOSE;
    for (const [o, c] of mergedWindows) {
      low = Math.min(low, o);
      high = Math.max(high, c);
    }
    for (const b of intradayBands) {
      low = Math.min(low, b.open);
      high = Math.max(high, b.close);
    }
    // Pad AROUND the content, then snap to whole hours and clamp to the day.
    low = Math.max(0, Math.floor((low - TRACK_PAD_MIN) / 60) * 60);
    high = Math.min(1440, Math.ceil((high + TRACK_PAD_MIN) / 60) * 60);
    return [low, high];
  }, [data.rules, mergedWindows, intradayBands]);

  const trackHeightPx = (hi - lo) * PX_PER_MIN;

  const hourLabels = useMemo<number[]>(() => {
    const labels: number[] = [];
    for (let m = Math.ceil(lo / 60) * 60; m <= hi; m += 60) labels.push(m);
    return labels;
  }, [lo, hi]);

  // ── Local interaction state ─────────────────────────────────────────────────
  // Brush vs eraser: "add" paints open hours (drag empty → create, plus the
  // block edit gestures); "block" carves time back out (drag anywhere → remove).
  // The eraser is single-day only, so a multi-day selection is always the brush.
  const [paintMode, setPaintMode] = useState<"add" | "block">("add");
  const blockMode = paintMode === "block" && !isBulk;

  const [fromTime, setFromTime] = useState("09:00");
  const [toTime, setToTime] = useState("17:00");

  const trackRef = useRef<HTMLDivElement | null>(null);
  const drag = useDayPainterDrag({
    trackRef,
    dayKeys,
    granularity,
    lo,
    hi,
    pxPerMin: PX_PER_MIN,
    blockMode,
  });

  function handleAddWindow() {
    const from = parseTimeToMinutes(fromTime);
    const to = parseTimeToMinutes(toTime);
    if (isNaN(from) || isNaN(to) || from >= to) return;
    drag.createWindow(from, to);
  }

  // ── Empty: no day selected ──────────────────────────────────────────────────
  // Nothing to paint and nothing to say — the host's heading above already
  // states the scope, and repeating it here put the same sentence twice in one
  // vertical stack.
  if (!dayKey) return null;

  const hasWindows = mergedWindows.length > 0;

  return (
    <div className={cn("flex flex-col gap-4 select-none", className)}>
      {/* Brush / eraser toggle — the eraser has no multi-day form, so a bulk
          selection simply doesn't offer it rather than showing it dead. */}
      {!isBulk && (
        <div
          role="group"
          aria-label="Paint mode"
          className="border-border inline-flex w-fit rounded-md border p-0.5"
        >
          {(
            [
              ["add", "Open hours"],
              ["block", "Block out"],
            ] as const
          ).map(([mode, label]) => {
            const active = paintMode === mode;
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setPaintMode(mode);
                  drag.selectBlock(null);
                }}
                className={cn(
                  "focus-visible:ring-ring rounded px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                  active
                    ? mode === "block"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      <div className="flex items-stretch gap-0">
        {/* Left gutter — hour labels */}
        <div
          className="relative shrink-0"
          style={{ width: GUTTER_W, height: trackHeightPx }}
          aria-hidden="true"
        >
          {hourLabels.map((m) => {
            const top = (m - lo) * PX_PER_MIN;
            if (top < 0 || top > trackHeightPx) return null;
            return (
              <div
                key={m}
                className="font-heading text-muted-foreground absolute right-3 -translate-y-1/2 text-right text-xs leading-none font-medium"
                style={{ top }}
              >
                {formatMinutes12(m).replace(":00", "")}
              </div>
            );
          })}
        </div>

        {/* Track. tabIndex -1 so removing a block from the keyboard has somewhere
            to land: the Remove button sits inside the block it deletes, and
            without this focus would fall to the document body and restart the
            tab order at the top of the page. */}
        <div
          ref={trackRef}
          tabIndex={-1}
          className={cn(
            "border-border bg-card focus-visible:ring-ring/50 relative flex-1 overflow-hidden rounded-md border outline-none focus-visible:ring-3",
            blockMode && "cursor-cell",
            !blockMode && callbacks.createWindowsBatch
              ? "cursor-crosshair"
              : !blockMode && "cursor-default",
          )}
          style={{
            height: trackHeightPx,
            touchAction: "none",
            userSelect: "none",
          }}
          onPointerDown={drag.onTrackPointerDown}
          onDragStart={(e) => e.preventDefault()}
        >
          {/* Hour ruled lines */}
          {hourLabels.map((m) => {
            const top = (m - lo) * PX_PER_MIN;
            if (top <= 0 || top >= trackHeightPx) return null;
            return (
              <div
                key={m}
                className="border-border pointer-events-none absolute inset-x-0 border-t"
                style={{ top }}
                aria-hidden="true"
              />
            );
          })}
          {/* 15-min tick dots */}
          {Array.from({ length: Math.ceil((hi - lo) / 15) }, (_, i) => {
            const m = lo + i * 15;
            if (m % 60 === 0) return null;
            const top = (m - lo) * PX_PER_MIN;
            if (top >= trackHeightPx) return null;
            return (
              <div
                key={m}
                className="bg-border/60 pointer-events-none absolute left-1 size-0.5 rounded-full"
                style={{ top: top - 1 }}
                aria-hidden="true"
              />
            );
          })}

          {/* Empty-track hint */}
          {!hasWindows && !blockMode && drag.draft === null && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="text-muted-foreground font-sans text-sm">
                Drag to open availability
              </p>
            </div>
          )}

          {/* Available (merged) blocks — interactive on a single day, a read-only
              reference band across several. */}
          {mergedWindows.map(([open, close]) => {
            const selected = drag.selectedOpen === open && !isBulk;
            const top = (open - lo) * PX_PER_MIN;
            const height = (close - open) * PX_PER_MIN;
            return (
              <div
                key={open}
                className="absolute inset-x-1"
                style={{ top, height }}
              >
                <button
                  type="button"
                  disabled={blockMode || isBulk}
                  onPointerDown={(e) => drag.onBlockPointerDown(e, open, close)}
                  onClick={(e) => {
                    // Keyboard activation only — a pointer already selected on
                    // pointerdown, and the click after a move drag carries the
                    // block's stale pre-drag bounds.
                    if (e.detail !== 0) return;
                    drag.selectBlock(open);
                  }}
                  onDragStart={(e) => e.preventDefault()}
                  aria-expanded={selected}
                  aria-label={
                    isBulk
                      ? `Available ${formatRange(open, close)}.`
                      : `Available ${formatRange(open, close)}. Drag to move; activate to edit.`
                  }
                  className={cn(
                    "bg-status-available/60 focus-visible:ring-ring h-full w-full rounded-lg px-2.5 py-1 text-left focus-visible:ring-2 focus-visible:outline-none",
                    // Inert while the eraser drag has to pass through to the
                    // track, and while several days share one band.
                    blockMode || isBulk
                      ? "pointer-events-none"
                      : "cursor-grab active:cursor-grabbing",
                    selected && "ring-brand ring-2",
                  )}
                  style={{ touchAction: "none" }}
                >
                  {height >= 26 && (
                    <span className="text-status-available-foreground font-sans text-xs font-semibold">
                      {formatRange(open, close)}
                    </span>
                  )}
                </button>

                {selected && !blockMode && (
                  <>
                    {/* Top resize handle. role=slider so a screen reader hears
                        the edge's current time and that arrows move it — as a
                        plain button it announced no value and no gesture. */}
                    <button
                      type="button"
                      ref={drag.handleRefs.top}
                      role="slider"
                      aria-label="Move start time"
                      aria-orientation="vertical"
                      aria-valuemin={lo}
                      aria-valuemax={close - granularity}
                      aria-valuenow={open}
                      aria-valuetext={formatMinutes12(open)}
                      onPointerDown={(e) =>
                        drag.onHandlePointerDown(e, "top", open, close)
                      }
                      onKeyDown={(e) =>
                        drag.onHandleKeyDown(e, "top", open, close)
                      }
                      className="focus-visible:ring-ring absolute -top-2 left-1/2 flex h-4 w-12 -translate-x-1/2 cursor-ns-resize items-center justify-center focus-visible:ring-2 focus-visible:outline-none"
                      style={{ touchAction: "none" }}
                    >
                      <span className="bg-brand h-1 w-10 rounded-full" />
                    </button>
                    {/* Bottom resize handle */}
                    <button
                      type="button"
                      ref={drag.handleRefs.bottom}
                      role="slider"
                      aria-label="Move end time"
                      aria-orientation="vertical"
                      aria-valuemin={open + granularity}
                      aria-valuemax={hi}
                      aria-valuenow={close}
                      aria-valuetext={formatMinutes12(close)}
                      onPointerDown={(e) =>
                        drag.onHandlePointerDown(e, "bottom", open, close)
                      }
                      onKeyDown={(e) =>
                        drag.onHandleKeyDown(e, "bottom", open, close)
                      }
                      className="focus-visible:ring-ring absolute -bottom-2 left-1/2 flex h-4 w-12 -translate-x-1/2 cursor-ns-resize items-center justify-center focus-visible:ring-2 focus-visible:outline-none"
                      style={{ touchAction: "none" }}
                    >
                      <span className="bg-brand h-1 w-10 rounded-full" />
                    </button>
                    {/* Remove */}
                    <button
                      type="button"
                      aria-label={`Remove availability ${formatRange(open, close)}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => drag.removeBlock(open, close)}
                      className="bg-card text-muted-foreground hover:text-foreground border-border focus-visible:ring-ring absolute top-1 right-1 inline-flex size-6 items-center justify-center rounded-full border focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            );
          })}

          {/* Booked bands — awareness only, drawn on top of green */}
          {intradayBands.map((b, i) => {
            const top = (b.open - lo) * PX_PER_MIN;
            const height = (b.close - b.open) * PX_PER_MIN;
            return (
              <div
                key={`busy-${i}`}
                className="bg-status-booked/85 text-status-booked-foreground pointer-events-none absolute inset-x-1.5 overflow-hidden rounded-md px-2 py-0.5"
                style={{ top, height }}
              >
                {height >= 22 && (
                  <span className="font-sans text-xs font-medium">
                    {b.label ?? "Booked"}
                  </span>
                )}
              </div>
            );
          })}

          {/* Create / carve / resize / move draft preview. A carve (block-mode
              track drag) reads destructive red; everything else reads clay. */}
          {drag.draft &&
            (() => {
              const [from, to] = drag.draft;
              const top = (from - lo) * PX_PER_MIN;
              const height = Math.max((to - from) * PX_PER_MIN, 2);
              return (
                <div
                  className={cn(
                    "pointer-events-none absolute inset-x-1 flex items-start rounded-lg border px-2.5 py-1",
                    drag.isCarving
                      ? "bg-destructive/15 border-destructive/60"
                      : "bg-brand/20 border-brand/60",
                  )}
                  style={{ top, height }}
                >
                  {to > from && (
                    <span
                      className={cn(
                        "font-sans text-xs font-semibold",
                        drag.isCarving
                          ? "text-destructive"
                          : "text-brand-strong",
                      )}
                    >
                      {formatRange(from, to)}
                    </span>
                  )}
                </div>
              );
            })()}
        </div>
      </div>

      {/* Add hours — always visible (drag is the shortcut; this is the precise
          + keyboard-accessible path). */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="painter-from"
            className="text-muted-foreground text-xs"
          >
            From
          </label>
          <input
            id="painter-from"
            type="time"
            step={granularity * 60}
            value={fromTime}
            onChange={(e) => setFromTime(e.target.value)}
            className="border-border bg-background text-foreground focus:ring-ring rounded border px-2 py-1 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="painter-to" className="text-muted-foreground text-xs">
            To
          </label>
          <input
            id="painter-to"
            type="time"
            step={granularity * 60}
            value={toTime}
            onChange={(e) => setToTime(e.target.value)}
            className="border-border bg-background text-foreground focus:ring-ring rounded border px-2 py-1 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
        <Button
          size="sm"
          onClick={handleAddWindow}
          disabled={!callbacks.createWindowsBatch}
        >
          {"Add hours"}
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">
        {isBulk
          ? "Applies to all selected days"
          : blockMode
            ? "Drag across the timeline to block out (remove) time."
            : "Or drag the track to open hours; tap a block to move, resize, or remove it."}
      </p>

      {/* Overnight section — house-sitting stays span whole days, so they live
          here rather than as a full-height band on the walk timeline. A stay
          belongs to one day, so a multi-day selection omits the section. */}
      {!isBulk && (
        <section
          aria-label="Overnight"
          className="border-border flex flex-col gap-2 border-t pt-4"
        >
          <h3 className="text-foreground text-xs font-semibold tracking-wide uppercase">
            Overnight
          </h3>
          {overnightStays.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No overnight booking this night.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {overnightStays.map((s, i) => (
                <li
                  key={i}
                  className="border-border flex items-center gap-2 rounded-md border px-3 py-2"
                >
                  <span
                    className="bg-status-booked size-2 shrink-0 rounded-full"
                    aria-hidden="true"
                  />
                  <span className="text-foreground text-sm font-medium">
                    {s.label ?? "Booked"}
                  </span>
                  <span className="text-muted-foreground ml-auto text-xs">
                    {s.rangeLabel}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
