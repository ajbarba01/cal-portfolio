"use client";

/**
 * Scheduler.MonthGrid — multiselect month calendar panel (Layer 1 UI).
 *
 * Reads all state from SchedulerContext (via useScheduler) and dispatches back
 * into it. Owns NO selection logic — the gesture layer is use-month-grid-drag,
 * day classification is calendar-model.ts, run-edge math is grid-runs.ts. Owns
 * NO colours — token-only (status fills + clay (brand) outline + muted; no hex).
 *
 * DAY-KEY BRIDGE
 * The Calendar (react-day-picker v9) yields local-midnight Date objects for
 * each cell. We key them with format(date, "yyyy-MM-dd") (date-fns, layout
 * only) so they match the Denver day-keys built via denverMidnight.
 *
 * VISUAL LANGUAGE (token-only, no bespoke colors)
 * The cell composes three INDEPENDENT layers so state and selection no longer
 * fight (selection used to be a solid fill that hid the day's state):
 *
 *   1. STATE FILL (background of the day, from byKey classification):
 *        available     → bg-status-available  / text-status-available-foreground
 *        busy (booked) → bg-status-booked     / text-status-booked-foreground
 *        out-of-window → bg-status-unavailable / text-status-unavailable-foreground
 *        past          → text-muted-foreground opacity-40 (no loud fill)
 *        no-data       → disabled / faint (rdp default)
 *   2. BOOKING MERGE: busy days of the SAME bookingId merge horizontally within
 *        a week row into one rounded blue pill (runFillRounding). Hovering any
 *        cell of a booking lifts ALL its cells lighter (bg-status-booked/70) via
 *        transient hoveredBookingId state (CSS :hover can't span sibling cells).
 *   3. SELECTION OUTLINE: three tiers of clay outline — dotted on hover ("this
 *        will select"), dashed while a gesture previews, solid once committed. A
 *        committed day that the gesture in flight is about to drop goes dashed
 *        and faded, so a drag shows what it takes away as well as what it adds.
 *   State fill and selection outline COMPOSE — a day can be available-green AND
 *   selection-outlined at once.
 *
 * INTERACTION — see use-month-grid-drag for the whole selection model (multi
 * paint/extend/toggle, the two-click range, single). This file only classifies
 * cells, draws them, and routes the keyboard: the arrows move focus a day
 * sideways or a week up/down and Home/End reach the live ends of the week,
 * Space or Enter toggles the focused day into the selection, Shift+Arrow
 * extends the run from the anchor onto the day focus lands on, and Escape
 * clears the selection.
 *
 * KEYBOARD FOCUS is a two-party job. rdp keeps the focused day in its own state
 * and rolls the tabindex onto it, but applying DOM focus is the DayButton's —
 * its stock one focuses itself on the `focused` modifier and ours has to do the
 * same or the caret never leaves the first cell. Two moves rdp cannot make are
 * claimed here and routed through `focusDayKey`, which navigates the month when
 * it has to and focuses the day once it renders:
 *   • A step over a month edge onto a day this grid will render LIVE. The days
 *     either side of the edge sit in rdp's grid as hidden outside cells, so its
 *     own move lands on one that renders no button. A step onto a day we would
 *     render dead is left to rdp, which rightly declines it: rdp softens
 *     `disabled` to `aria-disabled` only on the day IT has focused, so going
 *     there would unmount the cell holding focus and then fail to focus a truly
 *     disabled one — the caret lands on <body>, and an all-past month is left
 *     with nothing tabbable to get back in by.
 *   • Home and End, always. rdp recomputes the same week edge on every retry,
 *     so a dead edge (the past Sunday of the half-spent week being worked in)
 *     exhausts its attempts and moves nowhere. Ours walks inward from the edge
 *     to the first day of that week which can take focus.
 *
 * MONTH SYNC
 * `userMonth` tracks the month on screen: the optional `month` prop whenever it
 * names a different month, and otherwise the prev/next arrows and keyboard focus
 * crossing a month edge. Hosts that mirror the month into their own state or the
 * URL pass `onMonthChange` and feed it back through `month` — the grid moves on
 * its own in the meantime, so the round trip never stutters. The focused-week
 * band is a SUBTLE underline on the day number (low priority) so it never
 * overrides the status fills.
 */

import {
  createContext,
  useContext,
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import type React from "react";
import { format, getDaysInMonth, isSameMonth, startOfMonth } from "date-fns";
import { Star } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useScheduler } from "@/features/booking/scheduler-context";
import { deriveBookableDays } from "@/features/booking/calendar-model";
import type { DayAvailability } from "@/features/booking/calendar-model";
import { denverMidnight } from "@/features/booking/availability";
import {
  weekDays,
  sundayWeekStart,
} from "@/features/booking/schedule-selection";
import { runEdges } from "@/features/booking/grid-runs";
import type { DayButtonProps } from "react-day-picker";
import { useMonthGridDrag, stepDayKey } from "./use-month-grid-drag";
import type { CellKind } from "./use-month-grid-drag";

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

/** Local first-of-month Date for a day-key, matching how `userMonth` is read. */
function monthOfKey(dayKey: string): Date {
  // A key with missing parts parses to NaN, which carries through to an Invalid
  // Date exactly as an unparseable part always has.
  const [y = NaN, m = NaN] = dayKey.split("-").map((s) => parseInt(s, 10));
  return new Date(y, m - 1, 1);
}

/** How far an arrow moves focus (and a Shift+Arrow the selection edge). */
const ARROW_STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

/**
 * The day a navigation key moves focus to, or null for any other key (and for a
 * week whose every day is dead). Home and End reach the ends of the focused
 * day's week as rdp's own bindings do, but walk inward past days that cannot
 * take focus rather than stopping dead on them.
 */
function navTarget(
  dayKey: string,
  key: string,
  isSelectable: (dayKey: string) => boolean,
): string | null {
  const step = ARROW_STEPS[key];
  if (step !== undefined) return stepDayKey(dayKey, step);
  if (key !== "Home" && key !== "End") return null;
  const weekStart = sundayWeekStart(dayKey);
  const inward = key === "Home" ? 1 : -1;
  let candidate = key === "Home" ? weekStart : stepDayKey(weekStart, 6);
  for (let i = 0; i < 7; i++) {
    if (isSelectable(candidate)) return candidate;
    candidate = stepDayKey(candidate, inward);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Custom DayButton — owns ALL per-cell visuals (state fill + booking merge +
// selection outline + hover) because per-cell rounding/outline depends on
// row-neighbor computation that rdp's static modifiersClassNames can't express.
// ---------------------------------------------------------------------------

interface SchedulerDayButtonProps extends DayButtonProps {
  dayKey: string;
  /** Classification of this cell for fill + pointer routing. */
  availability: DayAvailability | undefined;
  kind: CellKind;
  /** Status-fill + fill-run rounding, applied to the button itself. */
  fillClassName: string;
  /**
   * Selection / preview OUTLINE, rendered on a separate inset overlay span so it
   * never shares the button's fill corner-radius. This is what removes the notch
   * when a selection is a strict subset of a contiguous fill run: fill rounding
   * (button) and outline rounding (overlay) are now fully independent layers.
   */
  outlineClassName: string;
  onCellPointerDown: (
    dayKey: string,
    kind: CellKind,
    modifiers: { shiftKey: boolean; toggleKey: boolean },
    bookingId?: string,
  ) => void;
  onCellPointerEnter: (
    dayKey: string,
    kind: CellKind,
    bookingId?: string,
  ) => void;
  onCellPointerLeave: (kind: CellKind) => void;
  /** Returns true once it has handled the key, so rdp never sees it. */
  onCellKeyDown: (
    dayKey: string,
    e: React.KeyboardEvent<HTMLButtonElement>,
  ) => boolean;
}

function SchedulerDayButton({
  // `day` is part of DayButtonProps (required by rdp) but we only need dayKey,
  // which is pre-computed from day.date by the parent.
  day: _day,
  modifiers,
  dayKey,
  availability,
  kind,
  fillClassName,
  outlineClassName,
  onCellPointerDown,
  onCellPointerEnter,
  onCellPointerLeave,
  onCellKeyDown,
  className,
  // `children` is the rdp-rendered day number — pull it out so our explicit JSX
  // children (the outline overlay) don't clobber it via the spread below.
  children,
  ...buttonProps
}: SchedulerDayButtonProps) {
  const isSelected = modifiers.selected === true;
  const bookingId = availability?.bookingId;
  const { data } = useScheduler();
  const hasMyBooking = data.myBookings?.has(dayKey) ?? false;
  const isPremium = data.premiumDays?.has(dayKey) ?? false;
  // Search-greys context (admin Bookings hub): de-emphasize non-matching days.
  // Undefined `dimmedDays` (public booking, availability) → never dimmed.
  const isDimmed = data.dimmedDays?.has(dayKey) ?? false;

  // Hover affordance (selectable cells only): a dotted clay (brand) outline signalling
  // "this will select". Outline (not border) so it never shifts layout or fights
  // the selection border; inset so it sits inside the cell. Dotted = hover,
  // dashed = drag-preview, solid = committed — the three-tier outline language.
  const hoverClass =
    kind === "selectable"
      ? "hover:outline-2 hover:outline-dotted hover:outline-brand/60 hover:-outline-offset-2"
      : "";

  // Do NOT call setPointerCapture — that redirects all pointer events to this
  // element and prevents onPointerEnter from firing on sibling buttons.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return; // a secondary button never paints
      onCellPointerDown(
        dayKey,
        kind,
        { shiftKey: e.shiftKey, toggleKey: e.ctrlKey || e.metaKey },
        bookingId,
      );
    },
    [dayKey, kind, bookingId, onCellPointerDown],
  );

  const handlePointerEnter = useCallback(() => {
    onCellPointerEnter(dayKey, kind, bookingId);
  }, [dayKey, kind, bookingId, onCellPointerEnter]);

  const handlePointerLeave = useCallback(() => {
    onCellPointerLeave(kind);
  }, [kind, onCellPointerLeave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (onCellKeyDown(dayKey, e)) return;
      buttonProps.onKeyDown?.(e);
    },
    // buttonProps.onKeyDown is rdp's own arrow/page focus mover.
    [dayKey, onCellKeyDown, buttonProps],
  );

  // rdp hands the focused day the tabindex but leaves applying DOM focus to the
  // DayButton (its stock one does exactly this). Without it every arrow key
  // moves the roving tabindex while the caret stays on the first cell, which is
  // the whole grid being unwalkable by keyboard.
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const isFocused = modifiers.focused === true;
  useEffect(() => {
    if (isFocused) buttonRef.current?.focus();
  }, [isFocused]);

  return (
    <button
      {...buttonProps}
      ref={buttonRef}
      className={cn(
        className,
        fillClassName,
        hoverClass,
        isSelected && "text-brand-strong font-bold",
      )}
      // The keyboard's extend step focuses its target by day-key; rdp offers no
      // handle on the rendered cell for that.
      data-day-key={dayKey}
      aria-pressed={kind === "selectable" ? isSelected : undefined}
      title={kind === "booked" ? "Booked" : undefined}
      // Token-derived hatch overlay for non-matching days (see globals.css).
      // Attribute is omitted entirely unless dimmed, so non-hub views are inert.
      data-dimmed={isDimmed ? "true" : undefined}
      style={{ touchAction: "none", userSelect: "none" }}
      // Suppress the browser's native drag (the "moving a picture/file" ghost)
      // so a pointer-drag selection isn't hijacked into an HTML5 drag op.
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleKeyDown}
    >
      {children}
      {isPremium && (
        <Star
          aria-hidden="true"
          size={10}
          className="text-warning-foreground pointer-events-none absolute top-1 right-1 fill-current"
        />
      )}
      {hasMyBooking && (
        <span
          aria-hidden="true"
          className="bg-brand absolute bottom-2 left-1/2 size-1.5 -translate-x-1/2 rounded-full"
        />
      )}
      {outlineClassName !== "" && (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0",
            outlineClassName,
          )}
        />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// MonthGrid-local cell context
// ---------------------------------------------------------------------------
//
// IDENTITY-STABILITY CONTRACT (do not break — this is the second-click fix):
// react-day-picker remounts EVERY day cell whenever the `components.DayButton`
// REFERENCE changes. The grid's volatile hover/preview state (previewDays,
// previewMode, hoveredBookingId) updates on every pointer move during the
// two-click range flow. If the DayButton closure read that volatile state
// directly, its identity would churn on each hover → rdp would remount the grid
// → a second click whose pointerdown/pointerup straddle a remount never fires a
// synthesized `click`, so onDayClick is lost ("takes a few clicks").
//
// FIX: the DayButton passed to rdp (`ContextDayButton`) is a MODULE-LEVEL
// component with a permanently stable reference. It reads ALL per-render data
// (fill/outline classes, availability, kind, pointer handlers) from this
// context. MonthGrid rebuilds the context VALUE every render — that re-renders
// the cells (cheap) WITHOUT remounting them, because the component TYPE at the
// DayButton slot never changes. Never pass an inline/`useCallback` DayButton to
// <Calendar> again, or the remount bug returns.

interface MonthGridCellValue {
  /** "YYYY-MM-DD" availability classification lookup for a cell. */
  byKey: Map<string, DayAvailability>;
  /** Pointer routing kind for a day-key. */
  cellKind: (dayKey: string) => CellKind;
  /** Composed status fill + selection/preview outline for a day-key. */
  cellClasses: (dayKey: string) => { fill: string; outline: string };
  /** Shared base layout classes for the button. */
  dayButtonBase: string;
  onCellPointerDown: (
    dayKey: string,
    kind: CellKind,
    modifiers: { shiftKey: boolean; toggleKey: boolean },
    bookingId?: string,
  ) => void;
  onCellPointerEnter: (
    dayKey: string,
    kind: CellKind,
    bookingId?: string,
  ) => void;
  onCellPointerLeave: (kind: CellKind) => void;
  onCellKeyDown: (
    dayKey: string,
    e: React.KeyboardEvent<HTMLButtonElement>,
  ) => boolean;
}

const MonthGridCellContext = createContext<MonthGridCellValue | null>(null);

/**
 * Stable (module-level) DayButton handed to react-day-picker. Its identity NEVER
 * changes, so hover/preview re-renders re-render cells without remounting them
 * (see IDENTITY-STABILITY CONTRACT above). All volatile per-render data is read
 * from MonthGridCellContext; rdp passes `day.date` via props.
 */
function ContextDayButton(props: DayButtonProps) {
  const ctx = useContext(MonthGridCellContext);
  if (ctx === null) {
    throw new Error("ContextDayButton must be rendered inside MonthGrid");
  }
  const k = format(props.day.date, "yyyy-MM-dd");
  const availability = ctx.byKey.get(k);
  const kind = ctx.cellKind(k);
  const { fill, outline } = ctx.cellClasses(k);
  return (
    <SchedulerDayButton
      {...props}
      className={ctx.dayButtonBase}
      dayKey={k}
      availability={availability}
      kind={kind}
      fillClassName={fill}
      outlineClassName={outline}
      onCellPointerDown={ctx.onCellPointerDown}
      onCellPointerEnter={ctx.onCellPointerEnter}
      onCellPointerLeave={ctx.onCellPointerLeave}
      onCellKeyDown={ctx.onCellKeyDown}
    />
  );
}

// ---------------------------------------------------------------------------
// MonthGrid
// ---------------------------------------------------------------------------

export interface MonthGridProps {
  className?: string;
  /** Month to show. Read on mount and whenever it names a different month. */
  month?: Date;
  /** Fires whenever the grid moves to another month (arrows, keyboard focus). */
  onMonthChange?: (month: Date) => void;
}

export function MonthGrid({ className, month, onMonthChange }: MonthGridProps) {
  const { selection, capabilities, data } = useScheduler();
  const { state, clearDays, focusedWeekDays } = selection;

  const isMulti = capabilities.daySelection === "multi";

  // ── Visible month ─────────────────────────────────────────────────────────
  // Seeded from `month` (else today), then user-controlled via the calendar's
  // prev/next arrows and keyboard focus. The focused-week band is applied via
  // the `focusedWeek` modifier per in-view day; the visible month is NOT slaved
  // to the focused week.
  const [userMonth, setUserMonth] = useState<Date>(month ?? data.now);

  // Follow a LATER `month`, so a host mirroring the month into the URL stays in
  // step through browser back/forward. The comparison is against the PREVIOUS
  // prop, not against `userMonth`: the grid's own navigation leaves the prop
  // alone, so it is never undone while the host's round trip catches up. (The
  // host is told about that navigation through `onMonthChange`.)
  const [propMonth, setPropMonth] = useState<Date | undefined>(month);
  if (month && (!propMonth || !isSameMonth(month, propMonth))) {
    setPropMonth(month);
    setUserMonth(month);
  }

  const goToMonth = useCallback(
    (next: Date) => {
      setUserMonth(next);
      onMonthChange?.(next);
    },
    [onMonthChange],
  );

  // ── Classification ────────────────────────────────────────────────────────
  const days = useMemo(() => {
    const keys = monthDayKeys(userMonth);
    const derived = deriveBookableDays({
      days: keys.map((k) => denverMidnight(k)),
      overnightNights: data.overnightNights,
      busyResident: data.busyResident,
      rules: data.rules,
      now: data.now,
    });
    // windowDays (admin availability): a day with open walk hours reads green
    // too, not just overnight nights. Only upgrades days that are otherwise
    // out-of-window — past/too-far/busy precedence is preserved.
    const windowDays = data.windowDays;
    if (!windowDays || windowDays.size === 0) return derived;
    return derived.map((d) =>
      d.state === "out-of-window" && windowDays.has(d.dayKey)
        ? { ...d, state: "available" as const }
        : d,
    );
  }, [
    userMonth,
    data.overnightNights,
    data.busyResident,
    data.rules,
    data.now,
    data.windowDays,
  ]);

  const byKey = useMemo(() => new Map(days.map((d) => [d.dayKey, d])), [days]);

  // ── Visible week rows ─────────────────────────────────────────────────────
  // Distinct Sunday-week-start rows covering the visible grid, derived from the
  // first day of userMonth. 6 rows always cover any month layout; extra rows are
  // harmless (byKey.get returns undefined for non-month days). Used to compute
  // run-edge maps ONCE per render instead of per-cell.
  const visibleWeeks = useMemo(() => {
    const firstKey = format(startOfMonth(userMonth), "yyyy-MM-dd");
    const firstSunday = sundayWeekStart(firstKey);
    return Array.from({ length: 6 }, (_, i) =>
      weekDays(stepDayKey(firstSunday, i * 7)),
    );
  }, [userMonth]);

  // ── Run-edge maps (computed once per render, not per-cell) ──────────────────
  // Edges are computed over the WHOLE visible month flattened into calendar
  // reading order (Sun→Sat, row after row) — NOT per week row. This is what makes
  // a contiguous selection that wraps across a row boundary round only at its
  // TRUE ends: the last cell of a row whose run continues onto the next row is
  // interior (no cap border, no rounding → flat edge), and likewise the first
  // cell of the continuation. Per-row edges used to round every row's ends,
  // which read as separate pills. Booking fills get the same treatment.
  //
  // Selection + booking maps MUST NOT depend on previewDays/hoveredBookingId so
  // hover/preview re-renders don't rebuild them (the drag hot path).
  const orderedDays = useMemo(() => visibleWeeks.flat(), [visibleWeeks]);

  // ── Disabled predicate ────────────────────────────────────────────────────
  const isDisabledKey = useCallback(
    (dayKey: string): boolean => {
      const da = byKey.get(dayKey);
      if (!da) return true; // adjacent month cell — no data
      if (da.state === "past") return true;
      // Busy (booked) days: enabled when the view can edit OR inspect so the
      // cell's pointerdown can fire inspectBooking. Public booking presets have
      // neither flag set, so busy stays disabled there (unchanged behaviour).
      if (da.state === "busy")
        return !(capabilities.editable || capabilities.inspectable);
      if (!capabilities.editable && da.state !== "available") return true;
      return false;
    },
    [byKey, capabilities.editable, capabilities.inspectable],
  );

  const isDisabled = useCallback(
    (date: Date): boolean => isDisabledKey(format(date, "yyyy-MM-dd")),
    [isDisabledKey],
  );

  // ── Cell kind (pointer routing) ───────────────────────────────────────────
  // selectable: paintable / range-eligible (available or out-of-window, not past)
  // booked:     busy day → inspect, never select
  // inert:      past / no-data
  const cellKind = useCallback(
    (dayKey: string): CellKind => {
      const da = byKey.get(dayKey);
      if (!da) return "inert";
      if (da.state === "busy") {
        // Availability painter (editable, NOT inspect): a booked day is a normal
        // selectable day — selecting it loads the day into the painter with the
        // booking drawn for awareness; blocking time it overlaps fires the
        // cancel-and-refund confirm. Inspect contexts (Bookings hub / account)
        // keep booked → inspect; public booking presets leave it disabled.
        return capabilities.editable && !capabilities.inspectable
          ? "selectable"
          : "booked";
      }
      if (da.state === "past") return "inert";
      // available + out-of-window are selectable (admin may book out-of-window);
      // for non-editable views isDisabled gates non-available cells already.
      if (!capabilities.editable && da.state !== "available") return "inert";
      return "selectable";
    },
    [byKey, capabilities.editable, capabilities.inspectable],
  );

  /**
   * Whether a day may join a multi run. `byKey` only classifies the month on
   * screen, but a shift-extend can reach past its edges, so a day outside it
   * falls back to the rule an editable view applies to every day it CAN
   * classify: anything not in the past is selectable.
   */
  const isSelectableKey = useCallback(
    (dayKey: string): boolean =>
      byKey.has(dayKey)
        ? cellKind(dayKey) === "selectable"
        : capabilities.editable && !selection.isPast(dayKey),
    [byKey, cellKind, capabilities.editable, selection],
  );

  const drag = useMonthGridDrag({
    byKey,
    cellKind,
    isDisabledKey,
    isSelectableKey,
  });

  const previewEdgeMap = useMemo(
    () => runEdges(orderedDays, (k) => (drag.previewDays.has(k) ? "p" : null)),
    [orderedDays, drag.previewDays],
  );

  // ── Keyboard ──────────────────────────────────────────────────────────────
  // rdp owns the plain arrows and Page Up/Down while they stay inside the month
  // on screen, and owns the steps off its edge it is right to refuse. Three
  // cases are claimed here: Shift+Arrow, which extends the run instead of rdp's
  // own shift binding (jump a month/year — redundant next to the arrows it
  // already navigates with), Home/End, and a step that leaves the visible month
  // for a day this grid will render live (see the header note).
  const gridRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusRef = useRef<string | null>(null);

  const focusDayKey = useCallback(
    (dayKey: string) => {
      const cell = gridRef.current?.querySelector<HTMLButtonElement>(
        `[data-day-key="${dayKey}"]`,
      );
      if (cell) {
        cell.focus();
        return;
      }
      // The day is in another month: navigate, then focus it once it renders.
      pendingFocusRef.current = dayKey;
      goToMonth(monthOfKey(dayKey));
    },
    [goToMonth],
  );

  useEffect(() => {
    const dayKey = pendingFocusRef.current;
    if (dayKey === null) return;
    pendingFocusRef.current = null;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-day-key="${dayKey}"]`)
      ?.focus();
  });

  const onCellKeyDown = useCallback(
    (dayKey: string, e: React.KeyboardEvent<HTMLButtonElement>): boolean => {
      const target = navTarget(dayKey, e.key, isSelectableKey);
      if (target === null) return false;
      const isExtend =
        isMulti && e.shiftKey && ARROW_STEPS[e.key] !== undefined;
      const isWeekEdge = e.key === "Home" || e.key === "End";
      // Everything rdp can still land on itself stays rdp's — and so does a step
      // off the edge onto a day we would render dead, which rdp refuses to make
      // and we must not make either (see the header note).
      if (
        !isExtend &&
        !isWeekEdge &&
        (isSameMonth(monthOfKey(target), userMonth) || !isSelectableKey(target))
      ) {
        return false;
      }
      e.preventDefault();
      e.stopPropagation();
      if (isExtend) drag.extendTo(target);
      focusDayKey(target);
      return true;
    },
    [isMulti, drag, focusDayKey, userMonth, isSelectableKey],
  );

  const onGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isMulti || e.key !== "Escape" || state.selectedDays.size === 0)
        return;
      e.preventDefault();
      clearDays();
    },
    [isMulti, state.selectedDays, clearDays],
  );

  // ── Per-cell composed visuals ─────────────────────────────────────────────
  // Returns TWO independent layers:
  //   fill    → status colour + fill-run rounding, applied to the button. Its
  //             corner radius follows the STATUS run (contiguous available pill…).
  //   outline → selection / preview border, applied to a separate inset overlay.
  //             Its corner radius follows the SELECTION run, independent of fill,
  //             so a subset selection no longer notches the fill underneath.
  const cellClasses = useCallback(
    (dayKey: string): { fill: string; outline: string } => {
      const da = byKey.get(dayKey);
      if (!da) return { fill: "", outline: "" }; // no-data cell → rdp defaults

      // 1. Status fill colour
      let fill = "";
      switch (da.state) {
        case "available":
          fill = "bg-status-available text-status-available-foreground";
          break;
        case "busy": {
          // Own bookings (account calendar) render in muted clay so the client
          // can recognise their days at a glance without competing with admin
          // "booked by someone else" blue fills.
          const isOwn = data.myBookings?.has(dayKey) ?? false;
          if (isOwn) {
            fill = "bg-sidebar-active text-brand-strong";
          } else {
            const lifted =
              drag.hoveredBookingId != null &&
              da.bookingId === drag.hoveredBookingId;
            fill = cn(
              lifted ? "bg-status-booked/70" : "bg-status-booked",
              "text-status-booked-foreground",
            );
          }
          break;
        }
        case "out-of-window":
          fill = "bg-status-unavailable text-status-unavailable-foreground";
          break;
        case "past":
          fill = "text-muted-foreground opacity-40";
          break;
        default:
          // too-far (not produced in current month windows) → neutral
          fill = "bg-status-unavailable text-status-unavailable-foreground";
      }

      // 2. Selection outline (committed) — each selected day gets its own closed
      //    clay box, independent of neighbors. A gesture in flight marks the days
      //    it is about to DROP with a faded dashed variant: the ones it paints
      //    over in remove mode, or — for a plain/extend sweep, which replaces the
      //    whole selection — every committed day the sweep does not cover.
      let outline = "";
      const isSelected = state.selectedDays.has(dayKey);
      const inPreview = drag.previewDays.has(dayKey);
      const pendingRemove =
        drag.previewMode === "remove"
          ? inPreview
          : drag.previewMode === "replace" && !inPreview;
      if (isSelected) {
        outline = pendingRemove
          ? "border-[3px] border-dashed border-brand/50 rounded-lg"
          : "border-[3px] border-brand rounded-lg";
      } else if (drag.previewMode !== "remove" && drag.previewDays.size > 0) {
        // 3. Live ADD preview outline — dashed/half variant for cells not yet
        //    committed-selected (only reached when there is no committed outline).
        const prevEdge = previewEdgeMap.get(dayKey);
        if (prevEdge)
          outline = "border-[3px] border-dashed border-brand/60 rounded-lg";
      }

      return { fill, outline };
    },
    [
      byKey,
      previewEdgeMap,
      state.selectedDays,
      drag.previewDays,
      drag.previewMode,
      drag.hoveredBookingId,
      data.myBookings,
    ],
  );

  // ── Modifiers (selected + focusedWeek only — fills moved into DayButton) ───
  const modifiers = useMemo(
    () => ({
      focusedWeek: (date: Date) =>
        focusedWeekDays.includes(format(date, "yyyy-MM-dd")),
      selected: (date: Date) =>
        state.selectedDays.has(format(date, "yyyy-MM-dd")),
    }),
    [state.selectedDays, focusedWeekDays],
  );

  // focusedWeek: SUBTLE band — a muted underline on the day number, low visual
  // priority, so it never overrides the status fills behind the button.
  const modifiersClassNames = {
    focusedWeek:
      "[&>button]:underline [&>button]:decoration-muted-foreground/60 [&>button]:underline-offset-4",
  };

  // Base layout for the custom DayButton (re-include needed utilities from the
  // calendar.tsx primitive MINUS hover:bg-muted, which would wash the fills).
  // The status fill / outline is composed on top via visualClassName.
  const dayButtonBase = useMemo(
    () =>
      cn(
        "relative inline-flex aspect-square w-full items-center justify-center rounded-lg text-lg outline-none",
        "focus-visible:ring-ring/50 focus-visible:ring-3",
        "disabled:pointer-events-none disabled:opacity-40 aria-selected:opacity-100",
      ),
    [],
  );

  const handleDayClick = useCallback(
    (date: Date, _modifiers: unknown, e: React.MouseEvent) => {
      drag.onDayClick(format(date, "yyyy-MM-dd"), e.detail);
    },
    [drag],
  );

  // ── Cell context value ────────────────────────────────────────────────────
  // Carries the per-render volatile data each cell needs to render its visuals
  // and wire its handlers. This value MAY change every render (cellClasses churns
  // on hover/preview) — that's intentional and cheap: it re-renders the cells
  // WITHOUT remounting them, because the DayButton component handed to rdp
  // (ContextDayButton) is a stable module-level reference. See the
  // IDENTITY-STABILITY CONTRACT note above.
  const cellContextValue = useMemo<MonthGridCellValue>(
    () => ({
      byKey,
      cellKind,
      cellClasses,
      dayButtonBase,
      onCellPointerDown: drag.onCellPointerDown,
      onCellPointerEnter: drag.onCellPointerEnter,
      onCellPointerLeave: drag.onCellPointerLeave,
      onCellKeyDown,
    }),
    [
      byKey,
      cellKind,
      cellClasses,
      dayButtonBase,
      drag.onCellPointerDown,
      drag.onCellPointerEnter,
      drag.onCellPointerLeave,
      onCellKeyDown,
    ],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={gridRef}
      className={cn("flex flex-col gap-4 select-none", className)}
      // Subtree-level guard: cancel any native dragstart (the day number text or
      // the cell) so a pointer-drag selection is never hijacked into an HTML5
      // image/file drag. The per-button guard misses drags that begin on the
      // text node itself.
      onDragStart={(e) => e.preventDefault()}
      onKeyDown={onGridKeyDown}
    >
      <MonthGridCellContext.Provider value={cellContextValue}>
        <Calendar
          mode="single"
          month={userMonth}
          onMonthChange={goToMonth}
          selected={undefined}
          onDayClick={handleDayClick}
          disabled={isDisabled}
          modifiers={modifiers}
          modifiersClassNames={modifiersClassNames}
          className="w-full"
          // Slot overrides:
          //  selected — neutralize rdp's default bg-primary (solid black on commit);
          //    our selection is the overlay outline, modifier kept only for aria.
          //  today    — the primitive's default puts a 1px BORDER on the cell, which
          //    both shifts that one button ~1px AND reads as a stray outline. Drop
          //    the box entirely; mark today with a bold number only (no layout cost,
          //    no stray border).
          classNames={{
            selected: "",
            today: "[&>button]:font-extrabold",
          }}
          // STABLE module-level reference — never swap for an inline/useCallback
          // component or rdp will remount the grid on every hover (see the
          // IDENTITY-STABILITY CONTRACT note above).
          components={{ DayButton: ContextDayButton }}
        />
      </MonthGridCellContext.Provider>
    </div>
  );
}
