"use client";

/**
 * useDayPainterDrag — the DayPainter's interaction layer.
 *
 * Owns every gesture on the timeline (sweep the empty track to create, drag a
 * handle to resize, grab a block to slide it, arrow keys to nudge an edge) and
 * the mutation commits behind them. Split out of the painter so that file is
 * layout and JSX while the subtle half — drag refs, one-shot global listeners,
 * focus recovery, commit ordering — lives here. The bounds arithmetic itself is
 * pure and lives in window-math (`boundsEdits`).
 *
 * DRAG MECHANICS — matches DayTimeline/WeekGrid: no setPointerCapture; a global
 * window pointermove plus a one-shot pointerup via useCellSelection; the caller
 * puts touch-action:none on the track.
 *
 * MUTATIONS go straight into the scheduler context callbacks, which own the
 * optimistic flip, its transition, and the cancel-and-refund confirm. This hook
 * deliberately does NOT wrap them in a transition: the confirm dialog awaits
 * user input, and a transition around it would hang pending (and dispatching
 * the optimistic update from the dialog's click — outside that scope — would
 * throw). Callers that do not need the outcome discard the promise with `void`.
 *
 * Creates fan out to EVERY selected day; removes only ever run against a
 * single-day selection, because carving time back out is per-day (each removal
 * can strand a booking and pop its own confirm).
 */

import { useState, useRef, useCallback, useMemo } from "react";
import type React from "react";
import { useScheduler } from "@/features/booking/scheduler-context";
import { snapMinute } from "@/features/booking/day-timeline-model";
import type { MinuteWindow } from "@/features/booking/day-timeline-model";
import { denverMidnight } from "@/features/booking/availability";
import { boundsEdits, daysMissingWindow } from "./window-math";
import { useCellSelection } from "./use-cell-selection";

export type ResizeEdge = "top" | "bottom";

export interface DayPainterDragArgs {
  /** The timeline track the gestures measure against — owned by the painter. */
  trackRef: React.RefObject<HTMLDivElement | null>;
  /** Every selected day-key, in calendar order. */
  dayKeys: string[];
  /** Snap step for every edge, in minutes. */
  granularity: number;
  /** Visible track bounds, minutes since midnight. */
  lo: number;
  hi: number;
  /** Vertical pixels the track draws per minute — the painter's layout scale. */
  pxPerMin: number;
  /** Eraser mode: a track drag carves time out instead of opening it. */
  blockMode: boolean;
}

export interface DayPainterDrag {
  /** The gesture in flight, drawn as a preview band; null when idle. */
  draft: MinuteWindow | null;
  /** The draft is an eraser carve-out, so it reads destructive rather than clay. */
  isCarving: boolean;
  /** Open minute of the block showing its handles, or null. */
  selectedOpen: number | null;
  selectBlock: (open: number | null) => void;
  handleRefs: Record<ResizeEdge, (el: HTMLButtonElement | null) => void>;
  onTrackPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onBlockPointerDown: (
    e: React.PointerEvent,
    open: number,
    close: number,
  ) => void;
  onHandlePointerDown: (
    e: React.PointerEvent,
    edge: ResizeEdge,
    open: number,
    close: number,
  ) => void;
  onHandleKeyDown: (
    e: React.KeyboardEvent<HTMLButtonElement>,
    edge: ResizeEdge,
    open: number,
    close: number,
  ) => void;
  /** Open [fromMinute, toMinute) on every selected day. */
  createWindow: (fromMinute: number, toMinute: number) => void;
  /** Remove a whole block, then put focus back on the track it came out of. */
  removeBlock: (open: number, close: number) => void;
}

export function useDayPainterDrag({
  trackRef,
  dayKeys,
  granularity,
  lo,
  hi,
  pxPerMin,
  blockMode,
}: DayPainterDragArgs): DayPainterDrag {
  const { callbacks, data } = useScheduler();

  const [selectedOpen, setSelectedOpen] = useState<number | null>(null);
  const [createDraft, setCreateDraft] = useState<MinuteWindow | null>(null);
  const [resizeDraft, setResizeDraft] = useState<MinuteWindow | null>(null);
  const [moveDraft, setMoveDraft] = useState<MinuteWindow | null>(null);

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
  const { installEndHandler } = useCellSelection();

  // Moving a block's START re-keys it (`key={open}`) and unselects it while the
  // optimistic update is in flight, which unmounts the handle the key press came
  // from and drops focus to the document body. The handle that asked for that
  // resize claims focus back as it mounts again, so a keyboard user can keep
  // pressing an arrow and stay on the handle. Only ever armed for a start-edge
  // move — anything else leaves the handle mounted, so an armed ref would linger
  // and steal focus off the next block a keyboard user selects.
  const refocusEdgeRef = useRef<ResizeEdge | null>(null);
  // One keyboard resize commit at a time (see onHandleKeyDown).
  const keyResizePendingRef = useRef(false);
  const handleRefs = useMemo(() => {
    const claimFocus = (edge: ResizeEdge) => (el: HTMLButtonElement | null) => {
      if (!el || refocusEdgeRef.current !== edge) return;
      refocusEdgeRef.current = null;
      el.focus();
    };
    return { top: claimFocus("top"), bottom: claimFocus("bottom") };
  }, []);

  const selectBlock = useCallback((open: number | null) => {
    // Drop a refocus a start-edge step left armed because its commit never
    // produced the block it expected (a declined confirm, or a grow that merged
    // into an earlier window), so it cannot pull focus off this block onto the
    // handles this selection is about to mount.
    refocusEdgeRef.current = null;
    setSelectedOpen(open);
  }, []);

  const minuteAtY = useCallback(
    (clientY: number): number | null => {
      const el = trackRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const raw = (clientY - rect.top) / pxPerMin + lo;
      return snapMinute(raw, granularity, lo, hi);
    },
    [trackRef, lo, hi, pxPerMin, granularity],
  );

  // ── Mutation commits ──────────────────────────────────────────────────────

  /**
   * Resolves once the create has landed, so a caller can serialize commits.
   * Days that already hold the span are dropped first: the batch action inserts
   * a row per day without checking, so re-applying the same hours to a selection
   * would otherwise pile up duplicates.
   */
  const runCreate = useCallback(
    async (fromMinute: number, toMinute: number): Promise<void> => {
      if (!callbacks.createWindowsBatch || toMinute <= fromMinute) return;
      const targets = daysMissingWindow({
        windows: data.windows,
        dayKeys,
        midnightOf: (dayKey) => denverMidnight(dayKey).getTime(),
        openMinute: fromMinute,
        closeMinute: toMinute,
      });
      // Every selected day already holds these hours. Returning silently is the
      // intended end of this path, not a dropped mutation: the timeline is
      // already drawing exactly what was asked for, so there is nothing to
      // write and nothing to report.
      if (targets.length === 0) return;
      await callbacks.createWindowsBatch({
        dayKeys: targets,
        openMinute: fromMinute,
        closeMinute: toMinute,
      });
    },
    [callbacks, data.windows, dayKeys],
  );

  /**
   * Resolves true once the removal is APPLIED, false if the user declined the
   * cancel-and-refund confirm — so a combined edit (move) can skip its paired
   * create and snap the window back to its pre-drag shape.
   */
  const runRemove = useCallback(
    async (fromMinute: number, toMinute: number): Promise<boolean> => {
      const dayKey = dayKeys[0];
      if (!callbacks.setWindowUnavailable || !dayKey || toMinute <= fromMinute)
        return false;
      const res = await callbacks.setWindowUnavailable({
        dayKey,
        fromMinute,
        toMinute,
      });
      return res.kind === "success";
    },
    [callbacks, dayKeys],
  );

  /**
   * Commit a window whose bounds changed (resize or move). ATOMIC w.r.t. the
   * cancel confirm — removals run first and the creates only fire if none was
   * declined, so cancelling restores the window to its pre-drag shape rather
   * than leaving a half-applied move. Resolves once every part has landed.
   */
  const commitBounds = useCallback(
    async (oOpen: number, oClose: number, nOpen: number, nClose: number) => {
      const { creates, removes } = boundsEdits(oOpen, oClose, nOpen, nClose);
      let allApplied = true;
      for (const [a, b] of removes) {
        if (!(await runRemove(a, b))) allApplied = false;
      }
      if (allApplied) {
        for (const [a, b] of creates) await runCreate(a, b);
      }
    },
    [runCreate, runRemove],
  );

  // ── Track drag — create (add mode) or carve-out (block mode) ──────────────

  const onTrackPointerDown = useCallback(
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
      selectBlock(null); // pressing the track deselects any block
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
          if (blockMode) void runRemove(from, to);
          else void runCreate(from, to);
        }
      });
    },
    [
      blockMode,
      callbacks.createWindowsBatch,
      callbacks.setWindowUnavailable,
      minuteAtY,
      selectBlock,
      installEndHandler,
      granularity,
      runCreate,
      runRemove,
    ],
  );

  // ── Resize drag (press-drag on a handle) ──────────────────────────────────

  const onHandlePointerDown = useCallback(
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

  // ── Keyboard resize (arrow keys on a focused handle) ──────────────────────
  // The pointer path's commit, one granularity step at a time: same clamps, same
  // commitBounds, and the selection follows the edge so the block stays selected.
  // One commit at a time: key auto-repeat outruns the round trip, and a second
  // press still reading the pre-step render would recommit the same step — which
  // createWindowsBatch inserts as a duplicate row rather than deduplicating.

  const onHandleKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLButtonElement>,
      edge: ResizeEdge,
      open: number,
      close: number,
    ) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      if (keyResizePendingRef.current) return;
      const step = e.key === "ArrowUp" ? -granularity : granularity;
      const [nOpen, nClose]: [number, number] =
        edge === "top"
          ? [
              Math.min(
                snapMinute(open + step, granularity, lo, hi),
                close - granularity,
              ),
              close,
            ]
          : [
              open,
              Math.max(
                snapMinute(close + step, granularity, lo, hi),
                open + granularity,
              ),
            ];
      if (nOpen === open && nClose === close) return; // already at the limit
      // Only a moved start edge re-keys the block and takes the handle down with
      // it; an end-edge step leaves the same handle focused and must not arm.
      if (nOpen !== open) refocusEdgeRef.current = edge;
      keyResizePendingRef.current = true;
      void commitBounds(open, close, nOpen, nClose).finally(() => {
        keyResizePendingRef.current = false;
      });
      setSelectedOpen(nOpen);
    },
    [granularity, lo, hi, commitBounds],
  );

  // ── Move drag (grab a block body and slide it, keeping its duration) ───────

  const onBlockPointerDown = useCallback(
    (e: React.PointerEvent, open: number, close: number) => {
      e.stopPropagation();
      const grab = minuteAtY(e.clientY);
      // A pointer selection must not inherit a refocus a declined resize left set.
      selectBlock(open);
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
        const nClose = mv.newOpen + (mv.close - mv.open);
        void commitBounds(mv.open, mv.close, mv.newOpen, nClose);
        setSelectedOpen(mv.newOpen);
      });
    },
    [minuteAtY, selectBlock, installEndHandler, lo, hi, commitBounds],
  );

  const createWindow = useCallback(
    (fromMinute: number, toMinute: number) => {
      void runCreate(fromMinute, toMinute);
    },
    [runCreate],
  );

  const removeBlock = useCallback(
    (open: number, close: number) => {
      setSelectedOpen(null);
      // The Remove button lives inside the block it deletes, so committing from
      // the keyboard unmounts the focused element. Land focus back on the track
      // rather than the document body, which would restart the tab order at the
      // top of the page. Deferred to the settle so the cancel confirm — which
      // restores focus to its opener as it closes — cannot land after us.
      void runRemove(open, close).finally(() => trackRef.current?.focus());
    },
    [runRemove, trackRef],
  );

  return {
    draft: createDraft ?? resizeDraft ?? moveDraft,
    isCarving: createDraft !== null && blockMode,
    selectedOpen,
    selectBlock,
    handleRefs,
    onTrackPointerDown,
    onBlockPointerDown,
    onHandlePointerDown,
    onHandleKeyDown,
    createWindow,
    removeBlock,
  };
}
