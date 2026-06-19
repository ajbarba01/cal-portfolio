"use client";

/**
 * Scheduler.DayPainter — single-day availability EDITOR (admin only).
 *
 * Sibling to DayTimeline (which is the read/book-mode start picker). Same
 * "handwritten appointment book" instrument — Fraunces hour gutter, ruled hour
 * lines + 15-min tick dots, parchment track, status-available green bands — but
 * in edit mode: Cal paints when she's free at 15-min granularity.
 *
 * INTERACTION (direct manipulation, Google-Calendar-like)
 *   • Drag empty track  → sweep a new available block (snaps to 15 min) →
 *       release commits createWindowsBatch for the selected day.
 *   • Tap a green block  → selects it: top/bottom resize handles + Remove button.
 *       Resize/Remove map to createWindowsBatch (grow) / setWindowUnavailable
 *       (shrink/remove). Removing time a booking overlaps fires the consumer's
 *       cancel-and-refund confirm (wired in availability-client).
 *   • Booked blocks render as non-interactive blue bands (awareness only); a
 *       booking lives INSIDE an availability window, so it draws on top.
 *   • Accessible fallback: an "Add hours" disclosure (two time inputs) is the
 *       keyboard/SR path for creating a window; green blocks are real buttons
 *       so Remove is reachable by keyboard.
 *
 * DRAG MECHANICS — matches DayTimeline/WeekGrid: no setPointerCapture; a global
 * window pointermove + one-shot pointerup via useCellSelection; suppressNextClick
 * swallows the click after a drag; touch-action:none on the track.
 *
 * Owns NO availability logic — pure range math lives in day-timeline-model.ts;
 * mutations go through context callbacks (which own optimistic + cancel-gate).
 */

import React, { useState, useMemo, useRef, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScheduler } from "@/features/booking/scheduler-context";
import { denverMidnight } from "@/features/booking/availability";
import {
  clampRangesToDayMinutes,
  mergeWindows,
  snapMinute,
} from "@/features/booking/day-timeline-model";
import type { MinuteWindow } from "@/features/booking/day-timeline-model";
import { Button } from "@/components/ui/button";
import { useCellSelection } from "./use-cell-selection";

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
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      timeZone: "America/Denver",
      month: "short",
      day: "numeric",
    });
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

type ResizeEdge = "top" | "bottom";

export function DayPainter({ className }: { className?: string }) {
  const { capabilities, data, selection, callbacks } = useScheduler();
  const granularity = capabilities.startGranularityMin ?? 15;

  const dayKey = useMemo<string | null>(() => {
    if (selection.state.selectedDays.size === 0) return null;
    return [...selection.state.selectedDays][0];
  }, [selection.state.selectedDays]);

  // ── Derived day data ───────────────────────────────────────────────────────
  const midnight = useMemo(
    () => (dayKey ? denverMidnight(dayKey).getTime() : 0),
    [dayKey],
  );

  /** Visible green blocks: the MERGED union of window rows on this day. */
  const mergedWindows = useMemo<MinuteWindow[]>(() => {
    if (!dayKey) return [];
    return mergeWindows(clampRangesToDayMinutes(data.windows, midnight));
  }, [dayKey, data.windows, midnight]);

  // Split this day's bookings into INTRADAY walks (rendered as bands on the
  // timeline) and OVERNIGHT stays (rendered in their own section below). A stay
  // is "overnight" when it extends beyond the selected Denver day — a whole-day
  // house-sit otherwise paints a full-height band that swamps the timeline.
  const dayEndMs = midnight + 24 * 60 * 60 * 1000;
  const { intradayBands, overnightStays } = useMemo(() => {
    const intraday: { open: number; close: number; label?: string }[] = [];
    const overnight: { label?: string; rangeLabel: string }[] = [];
    if (!dayKey) return { intradayBands: intraday, overnightStays: overnight };
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
  }, [dayKey, data.busy, midnight, dayEndMs]);

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
  const [paintMode, setPaintMode] = useState<"add" | "block">("add");
  const blockMode = paintMode === "block";

  const [selectedOpen, setSelectedOpen] = useState<number | null>(null);
  const [createDraft, setCreateDraft] = useState<MinuteWindow | null>(null);
  const [resizeDraft, setResizeDraft] = useState<MinuteWindow | null>(null);
  const [moveDraft, setMoveDraft] = useState<MinuteWindow | null>(null);
  const [fromTime, setFromTime] = useState("09:00");
  const [toTime, setToTime] = useState("17:00");

  const trackRef = useRef<HTMLDivElement | null>(null);
  const createRef = useRef<{ anchor: number; current: number } | null>(null);
  const resizeRef = useRef<{
    edge: ResizeEdge;
    open: number;
    close: number;
    current: number;
  } | null>(null);
  const moveRef = useRef<{
    open: number;
    close: number;
    grabMin: number;
    newOpen: number;
    moved: boolean;
  } | null>(null);
  const suppressNextClick = useRef(false);
  const { installEndHandler } = useCellSelection();

  const minuteAtY = useCallback(
    (clientY: number): number | null => {
      const el = trackRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const raw = (clientY - rect.top) / PX_PER_MIN + lo;
      return snapMinute(raw, granularity, lo, hi);
    },
    [lo, hi, granularity],
  );

  // ── Mutation commits ─────────────────────────────────────────────────────────
  // Fire-and-forget into the context callbacks, which own the optimistic flip +
  // its transition + the cancel-and-refund confirm. The painter deliberately
  // does NOT wrap these in a transition: the confirm dialog awaits user input,
  // and a transition around it would hang pending (and dispatching the optimistic
  // update from the dialog's click — outside this scope — would throw).
  const runCreate = useCallback(
    (fromMinute: number, toMinute: number) => {
      if (!callbacks.createWindowsBatch || !dayKey || toMinute <= fromMinute)
        return;
      void callbacks.createWindowsBatch({
        dayKeys: [dayKey],
        openMinute: fromMinute,
        closeMinute: toMinute,
      });
    },
    [callbacks, dayKey],
  );

  // Resolves true once the removal is APPLIED, false if the user declined the
  // cancel-and-refund confirm — so a combined edit (move) can skip its paired
  // create and snap the window back to its pre-drag shape.
  const runRemove = useCallback(
    async (fromMinute: number, toMinute: number): Promise<boolean> => {
      if (!callbacks.setWindowUnavailable || !dayKey || toMinute <= fromMinute)
        return false;
      const res = await callbacks.setWindowUnavailable({
        dayKey,
        fromMinute,
        toMinute,
      });
      return res.kind === "success";
    },
    [callbacks, dayKey],
  );

  /**
   * Commit a window whose bounds changed from [oOpen,oClose] to [nOpen,nClose]
   * (resize or move): each end that grew is a create, each that shrank is a
   * remove. ATOMIC w.r.t. the cancel confirm — removals run first, and the
   * creates only fire if no removal was declined, so cancelling restores the
   * window to its pre-drag shape rather than leaving a half-applied move.
   */
  const commitBounds = useCallback(
    async (oOpen: number, oClose: number, nOpen: number, nClose: number) => {
      const creates: MinuteWindow[] = [];
      const removes: MinuteWindow[] = [];
      if (nOpen < oOpen) creates.push([nOpen, oOpen]);
      else if (nOpen > oOpen) removes.push([oOpen, nOpen]);
      if (nClose > oClose) creates.push([oClose, nClose]);
      else if (nClose < oClose) removes.push([nClose, oClose]);

      let allApplied = true;
      for (const [a, b] of removes) {
        if (!(await runRemove(a, b))) allApplied = false;
      }
      if (allApplied) {
        for (const [a, b] of creates) runCreate(a, b);
      }
    },
    [runCreate, runRemove],
  );

  // ── Track drag — create (add mode) or carve-out (block mode) ────────────────
  const handleTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (
        blockMode
          ? !callbacks.setWindowUnavailable
          : !callbacks.createWindowsBatch
      )
        return;
      const m = minuteAtY(e.clientY);
      if (m === null) return;
      e.preventDefault();
      setSelectedOpen(null); // pressing the track deselects any block
      createRef.current = { anchor: m, current: m };
      setCreateDraft([m, m]);

      const onMove = (me: PointerEvent) => {
        const cur = minuteAtY(me.clientY);
        if (cur === null || !createRef.current) return;
        createRef.current.current = cur;
        const a = createRef.current.anchor;
        setCreateDraft([Math.min(a, cur), Math.max(a, cur)]);
      };
      window.addEventListener("pointermove", onMove);

      installEndHandler(() => {
        window.removeEventListener("pointermove", onMove);
        const drag = createRef.current;
        createRef.current = null;
        setCreateDraft(null);
        if (!drag) return;
        const from = Math.min(drag.anchor, drag.current);
        const to = Math.max(drag.anchor, drag.current);
        if (to - from >= granularity) {
          suppressNextClick.current = true;
          if (blockMode) void runRemove(from, to);
          else runCreate(from, to);
        }
      });
    },
    [
      blockMode,
      callbacks.createWindowsBatch,
      callbacks.setWindowUnavailable,
      minuteAtY,
      installEndHandler,
      granularity,
      runCreate,
      runRemove,
    ],
  );

  // ── Resize drag (press-drag on a handle) ────────────────────────────────────
  const handleHandlePointerDown = useCallback(
    (e: React.PointerEvent, edge: ResizeEdge, open: number, close: number) => {
      e.stopPropagation();
      e.preventDefault();
      resizeRef.current = {
        edge,
        open,
        close,
        current: edge === "top" ? open : close,
      };
      setResizeDraft([open, close]);

      const onMove = (me: PointerEvent) => {
        const m = minuteAtY(me.clientY);
        if (m === null || !resizeRef.current) return;
        resizeRef.current.current = m;
        if (edge === "top") {
          setResizeDraft([Math.min(m, close - granularity), close]);
        } else {
          setResizeDraft([open, Math.max(m, open + granularity)]);
        }
      };
      window.addEventListener("pointermove", onMove);

      installEndHandler(() => {
        window.removeEventListener("pointermove", onMove);
        const r = resizeRef.current;
        resizeRef.current = null;
        setResizeDraft(null);
        if (!r) return;
        suppressNextClick.current = true;
        const snapped = snapMinute(r.current, granularity, lo, hi);
        if (r.edge === "top") {
          const newOpen = Math.min(snapped, r.close - granularity);
          void commitBounds(r.open, r.close, newOpen, r.close);
          setSelectedOpen(newOpen);
        } else {
          const newClose = Math.max(snapped, r.open + granularity);
          void commitBounds(r.open, r.close, r.open, newClose);
          setSelectedOpen(r.open);
        }
      });
    },
    [minuteAtY, installEndHandler, granularity, lo, hi, commitBounds],
  );

  // ── Move drag (grab a block body and slide it, keeping its duration) ─────────
  const handleBlockPointerDown = useCallback(
    (e: React.PointerEvent, open: number, close: number) => {
      e.stopPropagation();
      const grab = minuteAtY(e.clientY);
      setSelectedOpen(open);
      if (grab === null) return;
      moveRef.current = {
        open,
        close,
        grabMin: grab,
        newOpen: open,
        moved: false,
      };

      const dur = close - open;
      const onMove = (me: PointerEvent) => {
        const m = minuteAtY(me.clientY);
        if (m === null || !moveRef.current) return;
        const delta = m - moveRef.current.grabMin;
        const nOpen = Math.max(lo, Math.min(hi - dur, open + delta));
        moveRef.current.newOpen = nOpen;
        moveRef.current.moved = nOpen !== open;
        setMoveDraft([nOpen, nOpen + dur]);
      };
      window.addEventListener("pointermove", onMove);

      installEndHandler(() => {
        window.removeEventListener("pointermove", onMove);
        const mv = moveRef.current;
        moveRef.current = null;
        setMoveDraft(null);
        if (!mv || !mv.moved) return; // a tap (no slide) just selects
        suppressNextClick.current = true;
        const nClose = mv.newOpen + (mv.close - mv.open);
        void commitBounds(mv.open, mv.close, mv.newOpen, nClose);
        setSelectedOpen(mv.newOpen);
      });
    },
    [minuteAtY, installEndHandler, lo, hi, commitBounds],
  );

  const handleAddWindow = useCallback(() => {
    const from = parseTimeToMinutes(fromTime);
    const to = parseTimeToMinutes(toTime);
    if (isNaN(from) || isNaN(to) || from >= to) return;
    runCreate(from, to);
  }, [fromTime, toTime, runCreate]);

  // ── Empty: no day selected ──────────────────────────────────────────────────
  if (!dayKey) {
    return (
      <div
        className={cn(
          "flex min-h-32 items-center justify-center py-8",
          className,
        )}
      >
        <p className="text-muted-foreground font-sans text-sm">
          Pick a day on the calendar to edit its availability.
        </p>
      </div>
    );
  }

  const hasWindows = mergedWindows.length > 0;

  return (
    <div className={cn("flex flex-col gap-4 select-none", className)}>
      {/* Brush / eraser toggle */}
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
                setSelectedOpen(null);
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

        {/* Track */}
        <div
          ref={trackRef}
          className={cn(
            "border-border bg-card relative flex-1 overflow-hidden rounded-md border",
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
          onPointerDown={handleTrackPointerDown}
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
          {!hasWindows && !blockMode && createDraft === null && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="text-muted-foreground font-sans text-sm">
                Drag to open availability
              </p>
            </div>
          )}

          {/* Available (merged) blocks — interactive */}
          {mergedWindows.map(([open, close]) => {
            const selected = selectedOpen === open;
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
                  disabled={blockMode}
                  onPointerDown={(e) => handleBlockPointerDown(e, open, close)}
                  onDragStart={(e) => e.preventDefault()}
                  aria-label={`Available ${formatRange(open, close)}. Drag to move; activate to edit.`}
                  className={cn(
                    "bg-status-available/60 focus-visible:ring-ring h-full w-full rounded-lg px-2.5 py-1 text-left focus-visible:ring-2 focus-visible:outline-none",
                    // In block mode the block is inert so the carve drag passes
                    // through to the track underneath.
                    blockMode
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
                    {/* Top resize handle */}
                    <button
                      type="button"
                      aria-label="Move start time"
                      onPointerDown={(e) =>
                        handleHandlePointerDown(e, "top", open, close)
                      }
                      className="focus-visible:ring-ring absolute -top-2 left-1/2 flex h-4 w-12 -translate-x-1/2 cursor-ns-resize items-center justify-center focus-visible:ring-2 focus-visible:outline-none"
                      style={{ touchAction: "none" }}
                    >
                      <span className="bg-brand h-1 w-10 rounded-full" />
                    </button>
                    {/* Bottom resize handle */}
                    <button
                      type="button"
                      aria-label="Move end time"
                      onPointerDown={(e) =>
                        handleHandlePointerDown(e, "bottom", open, close)
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
                      onClick={() => {
                        void runRemove(open, close);
                        setSelectedOpen(null);
                      }}
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
          {(createDraft ?? resizeDraft ?? moveDraft) &&
            (() => {
              const [from, to] = (createDraft ?? resizeDraft ?? moveDraft)!;
              const top = (from - lo) * PX_PER_MIN;
              const height = Math.max((to - from) * PX_PER_MIN, 2);
              const carve = createDraft !== null && blockMode;
              return (
                <div
                  className={cn(
                    "pointer-events-none absolute inset-x-1 flex items-start rounded-lg border px-2.5 py-1",
                    carve
                      ? "bg-destructive/15 border-destructive/60"
                      : "bg-brand/20 border-brand/60",
                  )}
                  style={{ top, height }}
                >
                  {to > from && (
                    <span
                      className={cn(
                        "font-sans text-xs font-semibold",
                        carve ? "text-destructive" : "text-brand-strong",
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
        {blockMode
          ? "Drag across the timeline to block out (remove) time."
          : "Or drag the track to open hours; tap a block to move, resize, or remove it."}
      </p>

      {/* Overnight section — house-sitting stays span whole days, so they live
          here rather than as a full-height band on the walk timeline. */}
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
    </div>
  );
}
