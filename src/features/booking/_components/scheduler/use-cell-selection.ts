"use client";

/**
 * useCellSelection — shared drag-plumbing hook for scheduler grid cells.
 *
 * Extracts the three pieces that are byte-identical across WeekGrid,
 * MonthGrid, and DayTimeline:
 *
 *   1. `dragEndHandlerRef`  — holds the active global pointerup/pointercancel
 *                             listener so it can be cleaned up.
 *   2. `installEndHandler`  — registers a one-shot end handler, removing any
 *                             stale listener from a previous drag first.
 *   3. unmount useEffect    — removes the listener if the component unmounts
 *                             while a drag is in progress.
 *
 * Each grid's pointer handlers (pointerdown/enter/leave) are NOT extracted
 * here because they differ across grids (rectangle-marquee vs contiguous-range
 * vs timeline-block semantics). Grids import this hook for the shared
 * plumbing only and inline their own handlers.
 */

import { useRef, useEffect, useCallback } from "react";

export interface UseCellSelectionReturn {
  /** Ref holding the current global end-handler (pointerup/pointercancel). */
  dragEndHandlerRef: React.MutableRefObject<(() => void) | null>;
  /**
   * Register `endHandler` as the one-shot global pointerup/pointercancel
   * listener. Removes any stale handler first so consecutive drags don't
   * accumulate listeners.
   */
  installEndHandler: (endHandler: () => void) => void;
}

export function useCellSelection(): UseCellSelectionReturn {
  const dragEndHandlerRef = useRef<(() => void) | null>(null);

  const installEndHandler = useCallback((endHandler: () => void) => {
    if (dragEndHandlerRef.current) {
      window.removeEventListener("pointerup", dragEndHandlerRef.current);
      window.removeEventListener("pointercancel", dragEndHandlerRef.current);
      dragEndHandlerRef.current = null;
    }
    dragEndHandlerRef.current = endHandler;
    window.addEventListener("pointerup", endHandler, { once: true });
    window.addEventListener("pointercancel", endHandler, { once: true });
  }, []);

  // Unmount cleanup — remove any dangling global listener.
  useEffect(() => {
    return () => {
      if (dragEndHandlerRef.current) {
        window.removeEventListener("pointerup", dragEndHandlerRef.current);
        window.removeEventListener("pointercancel", dragEndHandlerRef.current);
        dragEndHandlerRef.current = null;
      }
    };
  }, []);

  return { dragEndHandlerRef, installEndHandler };
}
