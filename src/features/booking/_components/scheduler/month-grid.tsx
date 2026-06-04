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
 * Progressive enhancement for both "multi" and "range" capabilities. Transient
 * drag state lives in refs to avoid re-renders during drag. previewDays is a
 * React state Set<string> that drives a live range-preview highlight during
 * drag (before pointer-up commits to model). The drag forms a CONTIGUOUS DATE
 * RANGE from dragAnchorKey to the current cell — not an arbitrary accumulated
 * set. Model is committed only on pointerup. Click + keyboard remain the
 * canonical interaction paths.
 *
 * VISUAL LANGUAGE (token-only, no bespoke colors)
 * - ringed (ring-1 ring-inset ring-primary/60)  = overnight-available night
 * - solid fill (bg-primary)                     = selected day
 * - destructive bg                              = busy / already booked
 * - muted / low opacity                         = past / unavailable
 * - preview (bg-primary/30)                     = live drag range before commit
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

const MS_PER_DAY = 86_400_000;

/** Parse "YYYY-MM-DD" to UTC ordinal (ms). */
function keyToUtc(dayKey: string): number {
  const [y, mo, d] = dayKey.split("-").map((s) => parseInt(s, 10));
  return Date.UTC(y, mo - 1, d);
}

/** UTC ordinal → "YYYY-MM-DD". */
function utcToKey(utc: number): string {
  const dt = new Date(utc);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/**
 * Enumerate all day-keys in the inclusive contiguous range [a, b].
 * Handles a > b gracefully.
 */
function daysInRange(a: string, b: string): string[] {
  const minUtc = Math.min(keyToUtc(a), keyToUtc(b));
  const maxUtc = Math.max(keyToUtc(a), keyToUtc(b));
  const keys: string[] = [];
  for (let utc = minUtc; utc <= maxUtc; utc += MS_PER_DAY) {
    keys.push(utcToKey(utc));
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Custom DayButton for pointer-drag (multi + range capabilities)
// ---------------------------------------------------------------------------

interface DragState {
  active: boolean;
  anchorKey: string;
  currentKey: string;
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
  const { state, toggleDay, setRange, clearDays, focusedWeekDays, isPast } =
    selection;

  // ── Visible month ─────────────────────────────────────────────────────────
  // User-controlled via the calendar's prev/next arrows; defaults to today's
  // month. The focused-week highlight band is applied via the `focusedWeek`
  // modifier (per in-view day) — the visible month is NOT slaved to the focused
  // week, because today's week can start in the prior month and would otherwise
  // pin the view to a fully-past month. (Auto-advancing the month on cross-month
  // week-nav is a deferred enhancement.)
  const [userMonth, setUserMonth] = useState<Date>(data.now);

  // Live drag range preview (populated during pointer-drag, cleared on commit).
  const [previewDays, setPreviewDays] = useState<Set<string>>(
    () => new Set<string>(),
  );

  // ── Classification ────────────────────────────────────────────────────────
  const days = useMemo(() => {
    const keys = monthDayKeys(userMonth);
    return deriveBookableDays({
      days: keys.map((k) => denverMidnight(k)),
      overnightNights: data.overnightNights,
      busyResident: data.busyResident,
      rules: data.rules,
      now: data.now,
    });
  }, [
    userMonth,
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
  // Precedence (last wins in rdp modifier merging):
  //   focusedWeek < available < selected < preview < busy < past
  const modifiers = useMemo(
    () => ({
      focusedWeek: (date: Date) =>
        focusedWeekDays.includes(format(date, "yyyy-MM-dd")),
      // available: overnight-available nights that are NOT yet selected
      available: (date: Date) => {
        const k = format(date, "yyyy-MM-dd");
        return (
          byKey.get(k)?.state === "available" && !state.selectedDays.has(k)
        );
      },
      selected: (date: Date) =>
        state.selectedDays.has(format(date, "yyyy-MM-dd")),
      // preview: live drag range highlight (before commit)
      preview: (date: Date) => previewDays.has(format(date, "yyyy-MM-dd")),
      busy: (date: Date) =>
        byKey.get(format(date, "yyyy-MM-dd"))?.state === "busy",
      past: (date: Date) => {
        const k = format(date, "yyyy-MM-dd");
        return isPast(k) || byKey.get(k)?.state === "past";
      },
    }),
    [state.selectedDays, focusedWeekDays, byKey, isPast, previewDays],
  );

  // Visual language:
  //   ringed  (ring-1 ring-inset ring-primary/60) = overnight-available night
  //   solid   (bg-primary)                        = selected
  //   preview (bg-primary/30)                     = live drag before commit
  //   destructive                                 = busy
  //   muted                                       = past / unavailable
  const modifiersClassNames = {
    focusedWeek: "bg-secondary text-secondary-foreground",
    // available: outline ring so it reads "selectable overnight", dominated by selected fill
    available:
      "[&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-primary/60",
    // selected fill must survive hover — use explicit hover override to beat base hover:bg-muted
    selected:
      "bg-primary text-primary-foreground [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary/80",
    // preview: semi-transparent fill for live drag range, visually distinct from committed selected
    preview:
      "[&>button]:bg-primary/30 [&>button]:text-primary-foreground [&>button]:hover:bg-primary/40",
    busy: "text-destructive",
    past: "text-muted-foreground opacity-40",
  };

  // Override the base Calendar day_button classNames to:
  //   1. Remove hover:bg-muted which washes over selected bg-primary fill
  //   2. Add ring-hover affordance for non-disabled interactive days
  //   3. Re-include all other base utilities (size, layout, focus-visible, disabled)
  // NOTE: passing classNames to <Calendar> spreads over the primitive's computed
  // classNames map — the day_button key is fully replaced, so we must re-include
  // the needed base utilities from calendar.tsx minus hover:bg-muted.
  const calendarClassNames = {
    day_button: cn(
      // Base layout + size (from calendar.tsx primitive — minus hover:bg-muted)
      "inline-flex size-9 items-center justify-center rounded-lg outline-none",
      // Focus ring
      "focus-visible:ring-ring/50 focus-visible:ring-3",
      // Disabled
      "disabled:pointer-events-none disabled:opacity-40 aria-selected:opacity-100",
      // Hover: ring affordance for interactive cells; selected fill override is
      // handled by modifiersClassNames.selected ([&>button]:hover:bg-primary/80)
      "hover:ring-2 hover:ring-inset hover:ring-ring",
    ),
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

  // ── Pointer-drag (multi + range, progressive enhancement) ─────────────────
  const dragRef = useRef<DragState | null>(null);
  // Suppresses the click event that fires after pointerUp when drag occurred.
  const suppressNextClick = useRef(false);
  // Holds the current global end handler so we can remove it on unmount.
  const dragEndHandlerRef = useRef<(() => void) | null>(null);

  const handlePointerDragStart = useCallback(
    (key: string) => {
      dragRef.current = {
        active: true,
        anchorKey: key,
        currentKey: key,
        didDrag: false,
      };
      suppressNextClick.current = false;
      setPreviewDays(new Set([key]));

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
        setPreviewDays(new Set<string>());
        if (drag.didDrag) {
          suppressNextClick.current = true;
          const anchor = drag.anchorKey;
          const current = drag.currentKey;
          if (capabilities.daySelection === "range") {
            // Range mode: clear then set the contiguous range
            clearDays();
            setRange(anchor, current);
          } else {
            // Multi mode: additive range paint
            setRange(anchor, current);
          }
        }
        dragRef.current = null;
      };

      dragEndHandlerRef.current = endHandler;
      window.addEventListener("pointerup", endHandler, { once: true });
      window.addEventListener("pointercancel", endHandler, { once: true });
    },
    [capabilities.daySelection, clearDays, setRange],
  );

  const handlePointerDragEnter = useCallback((key: string) => {
    const drag = dragRef.current;
    if (!drag?.active) return;
    if (key === drag.currentKey) return;
    drag.currentKey = key;
    drag.didDrag = true;
    // Build the inclusive contiguous range from anchor to current cell
    const rangeKeys = daysInRange(drag.anchorKey, key);
    // Exclude disabled days from preview (disabled days excluded from commit too)
    setPreviewDays(new Set(rangeKeys));
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

  // ── Custom DayButton (drag enhancement, multi + range) ────────────────────
  const isDragCapable =
    capabilities.daySelection === "multi" ||
    capabilities.daySelection === "range";

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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <Calendar
        mode="single"
        month={userMonth}
        onMonthChange={setUserMonth}
        selected={undefined}
        onDayClick={handleDayClickWithDragGuard}
        disabled={isDisabled}
        modifiers={modifiers}
        modifiersClassNames={modifiersClassNames}
        classNames={calendarClassNames}
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
