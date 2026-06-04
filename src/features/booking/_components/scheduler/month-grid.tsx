"use client";

/**
 * Scheduler.MonthGrid — multiselect month calendar panel (Layer 1 UI).
 *
 * Reads all state from SchedulerContext (via useScheduler) and dispatches back
 * into it. Owns NO selection logic — all day-classification logic lives in
 * calendar-model.ts. Owns NO colours — token-only (bg-primary, bg-secondary,
 * bg-muted, text-muted-foreground, text-destructive, border-border, ring-ring).
 *
 * DAY-KEY BRIDGE
 * The Calendar (react-day-picker v9) yields local-midnight Date objects for
 * each cell. We key them with format(date, "yyyy-MM-dd") (date-fns, layout
 * only) so they match the Denver day-keys built via denverMidnight. This
 * matches the pattern in the old month-grid.tsx.
 *
 * POINTER-DRAG
 * Progressive enhancement only (multi capability). All transient drag state
 * lives in refs to avoid re-renders during drag. The model is committed only
 * on pointerup via dragDays(). Click + keyboard remain the canonical
 * interaction paths.
 *
 * MONTH SYNC
 * `userMonth` tracks the month the user last navigated to. `resolvedMonth` is
 * derived in useMemo: if focusedWeekStart lands outside userMonth, show the
 * focused month instead. This is a pure derived computation — no effects, no
 * refs in render (satisfies react-hooks/set-state-in-effect and refs rules).
 */

import React, {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from "react";
import { format, getDaysInMonth, startOfMonth } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useScheduler } from "@/features/booking/scheduler-context";
import { deriveBookableDays } from "@/features/booking/calendar-model";
import { denverMidnight } from "@/features/booking/availability";
import type { DayButtonProps } from "react-day-picker";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All "YYYY-MM-DD" day-keys for the real days in `month`. */
function monthDayKeys(month: Date): string[] {
  const y = month.getFullYear();
  const m = month.getMonth();
  const count = getDaysInMonth(startOfMonth(month));
  const keys: string[] = [];
  for (let d = 1; d <= count; d++) {
    const mm = String(m + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    keys.push(`${y}-${mm}-${dd}`);
  }
  return keys;
}

/** Whether two Dates represent the same year-month. */
function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

// ---------------------------------------------------------------------------
// Custom DayButton for pointer-drag (multi capability only)
// ---------------------------------------------------------------------------

interface DragState {
  active: boolean;
  startKey: string;
  accumulated: Set<string>;
  didDrag: boolean;
}

interface DragButtonProps extends DayButtonProps {
  dayKey: string;
  isDisabled: boolean;
  dragRef: React.MutableRefObject<DragState | null>;
  onPointerDragStart: (key: string) => void;
  onPointerDragEnter: (key: string) => void;
}

function DragDayButton({
  // `day` is part of DayButtonProps (required by rdp) but we only need dayKey
  // which is pre-computed from day.date by the parent.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  day: _day,
  modifiers,
  dayKey,
  isDisabled,
  dragRef,
  onPointerDragStart,
  onPointerDragEnter,
  ...buttonProps
}: DragButtonProps) {
  const isSelected = modifiers.selected === true;

  // Do NOT call setPointerCapture — that redirects all pointer events to this
  // element and prevents onPointerEnter from firing on sibling buttons.
  const handlePointerDown = useCallback(() => {
    if (isDisabled) return;
    onPointerDragStart(dayKey);
  }, [isDisabled, dayKey, onPointerDragStart]);

  const handlePointerEnter = useCallback(() => {
    if (!dragRef.current?.active) return;
    if (isDisabled) return;
    onPointerDragEnter(dayKey);
  }, [isDisabled, dayKey, dragRef, onPointerDragEnter]);

  return (
    <button
      {...buttonProps}
      aria-pressed={isSelected}
      style={{ touchAction: "none", userSelect: "none" }}
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerEnter}
    />
  );
}

// ---------------------------------------------------------------------------
// MonthGrid
// ---------------------------------------------------------------------------

export function MonthGrid({ className }: { className?: string }) {
  const { selection, capabilities, data } = useScheduler();
  const {
    state,
    toggleDay,
    setRange,
    dragDays,
    clearDays,
    focusedWeekDays,
    isPast,
  } = selection;

  // ── Visible month ─────────────────────────────────────────────────────────
  // `userMonth` = what the user last explicitly navigated to.
  // `resolvedMonth` = derived: focusedWeekStart's month when it falls outside
  // userMonth, otherwise userMonth. Pure useMemo — no effects, no refs in render.
  const [userMonth, setUserMonth] = useState<Date>(data.now);

  const resolvedMonth = useMemo(() => {
    const focusedDate = denverMidnight(state.focusedWeekStart);
    return sameMonth(focusedDate, userMonth) ? userMonth : focusedDate;
  }, [userMonth, state.focusedWeekStart]);

  // ── Classification ────────────────────────────────────────────────────────
  const days = useMemo(() => {
    const keys = monthDayKeys(resolvedMonth);
    return deriveBookableDays({
      days: keys.map((k) => denverMidnight(k)),
      overnightNights: data.overnightNights,
      busyResident: data.busyResident,
      rules: data.rules,
      now: data.now,
    });
  }, [
    resolvedMonth,
    data.overnightNights,
    data.busyResident,
    data.rules,
    data.now,
  ]);

  const byKey = useMemo(() => new Map(days.map((d) => [d.dayKey, d])), [days]);

  // ── Disabled predicate ────────────────────────────────────────────────────
  const isDisabled = useCallback(
    (date: Date): boolean => {
      const k = format(date, "yyyy-MM-dd");
      const da = byKey.get(k);
      if (!da) return true; // adjacent month cell — no data
      if (da.state === "past") return true;
      if (!capabilities.editable && da.state !== "available") return true;
      return false;
    },
    [byKey, capabilities.editable],
  );

  // ── Modifiers ─────────────────────────────────────────────────────────────
  // focusedWeek is applied first so `selected` overrides it via CSS cascade.
  const modifiers = useMemo(
    () => ({
      focusedWeek: (date: Date) =>
        focusedWeekDays.includes(format(date, "yyyy-MM-dd")),
      selected: (date: Date) =>
        state.selectedDays.has(format(date, "yyyy-MM-dd")),
      busy: (date: Date) =>
        byKey.get(format(date, "yyyy-MM-dd"))?.state === "busy",
      past: (date: Date) => {
        const k = format(date, "yyyy-MM-dd");
        return isPast(k) || byKey.get(k)?.state === "past";
      },
    }),
    [state.selectedDays, focusedWeekDays, byKey, isPast],
  );

  const modifiersClassNames = {
    focusedWeek: "bg-secondary text-secondary-foreground",
    selected:
      "bg-primary text-primary-foreground [&>button]:bg-primary [&>button]:text-primary-foreground",
    busy: "text-destructive",
    past: "text-muted-foreground opacity-40",
  };

  // ── Click handler ─────────────────────────────────────────────────────────
  const handleDayClick = useCallback(
    (date: Date, _modifiers: Record<string, boolean>, e: React.MouseEvent) => {
      const k = format(date, "yyyy-MM-dd");
      if (isDisabled(date)) return;

      switch (capabilities.daySelection) {
        case "none":
          return;

        case "single":
          clearDays();
          toggleDay(k);
          break;

        case "range":
          if (state.anchorDay == null || state.selectedDays.size !== 1) {
            clearDays();
            toggleDay(k);
          } else {
            setRange(state.anchorDay, k);
          }
          break;

        case "multi":
          if (e.shiftKey) {
            setRange(state.anchorDay ?? k, k);
          } else if (e.ctrlKey || e.metaKey) {
            toggleDay(k);
          } else {
            clearDays();
            toggleDay(k);
          }
          break;
      }
    },
    [
      capabilities.daySelection,
      state.anchorDay,
      state.selectedDays,
      isDisabled,
      clearDays,
      toggleDay,
      setRange,
    ],
  );

  // ── Pointer-drag (multi only, progressive enhancement) ───────────────────
  const dragRef = useRef<DragState | null>(null);
  // Suppresses the click event that fires after pointerUp when drag occurred.
  const suppressNextClick = useRef(false);
  // Holds the current global end handler so we can remove it on unmount.
  const dragEndHandlerRef = useRef<(() => void) | null>(null);

  const handlePointerDragStart = useCallback(
    (key: string) => {
      dragRef.current = {
        active: true,
        startKey: key,
        accumulated: new Set([key]),
        didDrag: false,
      };
      suppressNextClick.current = false;

      // Remove any stale listener from a previous drag that didn't fire.
      if (dragEndHandlerRef.current) {
        window.removeEventListener("pointerup", dragEndHandlerRef.current);
        window.removeEventListener("pointercancel", dragEndHandlerRef.current);
        dragEndHandlerRef.current = null;
      }

      // One-shot global listener: fires even when pointer is released outside
      // the grid, which per-button onPointerUp would miss.
      const endHandler = () => {
        dragEndHandlerRef.current = null;
        const drag = dragRef.current;
        if (!drag) return;
        if (drag.didDrag) {
          suppressNextClick.current = true;
          dragDays([...drag.accumulated]);
        }
        dragRef.current = null;
      };

      dragEndHandlerRef.current = endHandler;
      window.addEventListener("pointerup", endHandler, { once: true });
      window.addEventListener("pointercancel", endHandler, { once: true });
    },
    [dragDays],
  );

  const handlePointerDragEnter = useCallback((key: string) => {
    const drag = dragRef.current;
    if (!drag?.active) return;
    drag.accumulated.add(key);
    drag.didDrag = true;
  }, []);

  // Clean up any dangling global listener on unmount.
  useEffect(() => {
    return () => {
      if (dragEndHandlerRef.current) {
        window.removeEventListener("pointerup", dragEndHandlerRef.current);
        window.removeEventListener("pointercancel", dragEndHandlerRef.current);
        dragEndHandlerRef.current = null;
      }
    };
  }, []);

  // Wrap onDayClick to honour the drag-suppress flag.
  const handleDayClickWithDragGuard = useCallback(
    (date: Date, mods: Record<string, boolean>, e: React.MouseEvent) => {
      if (suppressNextClick.current) {
        suppressNextClick.current = false;
        return;
      }
      handleDayClick(date, mods, e);
    },
    [handleDayClick],
  );

  // ── Custom DayButton (drag enhancement, multi only) ───────────────────────
  const CustomDayButton = useCallback(
    (props: DayButtonProps) => {
      const k = format(props.day.date, "yyyy-MM-dd");
      const disabled = isDisabled(props.day.date);
      return (
        <DragDayButton
          {...props}
          dayKey={k}
          isDisabled={disabled}
          dragRef={dragRef}
          onPointerDragStart={handlePointerDragStart}
          onPointerDragEnter={handlePointerDragEnter}
        />
      );
    },
    [isDisabled, handlePointerDragStart, handlePointerDragEnter],
  );

  const isDragCapable = capabilities.daySelection === "multi";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <Calendar
        mode="single"
        month={resolvedMonth}
        onMonthChange={setUserMonth}
        selected={undefined}
        onDayClick={handleDayClickWithDragGuard}
        disabled={isDisabled}
        modifiers={modifiers}
        modifiersClassNames={modifiersClassNames}
        className="border-border rounded-lg border"
        {...(isDragCapable
          ? { components: { DayButton: CustomDayButton } }
          : {})}
      />

      {data.busyResident.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-muted-foreground text-xs font-medium">
            Already booked
          </h3>
          <ul className="flex flex-col gap-1.5">
            {data.busyResident.map((b, i) => (
              <li
                key={i}
                className="border-border bg-muted text-muted-foreground flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
              >
                <span>
                  {b.startsAt.toLocaleString("en-US", {
                    timeZone: "America/Denver",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  –{" "}
                  {b.endsAt.toLocaleString("en-US", {
                    timeZone: "America/Denver",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
