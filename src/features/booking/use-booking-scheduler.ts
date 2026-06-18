"use client";

/**
 * useBookingScheduler — the shared scheduler substrate behind the three booking
 * surfaces (service self-serve, client self-edit, admin on-behalf create).
 *
 * Extracted from the three near-identical wrapper hooks (SP3b A13). It owns the
 * parts that were byte-identical across all three: date/calendar plumbing, the
 * pricing-type → mode/petAware derivation, the controlled scheduling inputs that
 * affect the schedule (quantities / pets / recurring / occurrence count), the
 * selection state (selectedStart / range), duration, the availability + busy
 * wiring, the capabilities/schedulerData memos, the derived booking time
 * (stay / startsAt / endsAt / nights / hasSelection / petsOk), the debounced
 * live preview (400ms timer ref + PREVIEW useTransition), and the
 * Scheduler-selection bridge (onSelectionChange).
 *
 * Each wrapper keeps ONLY its deltas: its own quote-state shape, its own preview
 * body + result handling, its own quote GATE, its own "clear on idle" / "clear
 * on selection-change" bodies, and its own submit handler + return-shape extras.
 * The wrapper feeds those deltas to this hook via REFS (canQuoteRef /
 * runPreviewRef / clearOnSelectRef / clearOnIdleRef), so the shared
 * `onSelectionChange` / `requestQuote` keep STABLE identities (deps `[mode]`)
 * while still reading the wrapper's freshest logic at fire-time.
 *
 * Hard invariants preserved verbatim (SP3a regression history):
 *   1. `onSelectionChange` is a `useCallback` with deps `[mode]` — a stable
 *      identity across re-renders that don't change `mode`. An unstable identity
 *      re-fires the Scheduler's selection-subscription effect → render loop
 *      (the bug fixed in commit 99040d4).
 *   2. The live-preview debounce stays 400ms via the timer ref.
 *   3. The latest-input sync is REF-ONLY (no setState in that effect — the
 *      repo's eslint bans set-state-in-effect). The wrapper's ref-sync effect is
 *      likewise ref-only; this hook performs no setState in an effect.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MutableRefObject,
} from "react";
// IO hooks (useAvailability/useBusyRanges/useOvernightNights) are INJECTED by the
// wrapper (see UseBookingSchedulerInput.io) rather than imported here. Why:
//   - the wrapper imports them from the client barrel, where tests mock the
//     websocket/Supabase IO surface — injection lets that mock flow through;
//   - importing them from the barrel here would form a circular import
//     (index.client re-exports THIS hook), which defeats the barrel mock;
//   - importing the real sibling modules here would bypass the barrel mock and
//     hit Supabase in tests.
// They are still React hooks — called unconditionally, in fixed order, below.
import { validateStayRange } from "./calendar-model";
import { denverMidnight, denverDayKey } from "./availability";
import { hourlySchedulerData } from "./hourly-scheduler-data";
import {
  BOOK_HOUSE_SITTING_CAPABILITIES,
  BOOK_WALK_CAPABILITIES,
} from "./schedule-capabilities";
import { quantitiesToRecord } from "./_components/quantity-forms";
import type { QuantityState } from "./_components/quantity-forms";
import type { SchedulerData, BusyBlock } from "./_components/scheduler";
import type { ScheduleSelectionState } from "./schedule-selection";
import type { BookingRuleSettings } from "./availability";
import type { PublicBusyRange } from "./busy-ranges";
import type { PetSpecies } from "./_components/pet-avatar";
import type { ServiceDetail } from "./service-detail";
// Type-only imports are erased at runtime — no circular dependency forms.
import type { useAvailability } from "./use-availability";
import type { useBusyRanges } from "./use-busy-ranges";
import type { useOvernightNights } from "./use-overnight-nights";
import type { usePremiumDays } from "./use-premium-days";
import type { DateRange } from "@/components/ui/calendar";
import type { Constraints } from "@/features/pricing";

// ── Local date helpers (browser-local calendar keys; layout, not business rules) ──

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Exported so the wrappers' initial-range seeds reuse it (single definition). */
export function localDateFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d);
}

/** Pets are dog/cat by DB enum; narrow the config's species to that avatar set. */
export function allowedSpeciesOf(constraints: Constraints): PetSpecies[] {
  const set: PetSpecies[] = [];
  if (constraints.allowedSpecies.includes("dog")) set.push("dog");
  if (constraints.allowedSpecies.includes("cat")) set.push("cat");
  return set;
}

/** Cap on selected pets — the service's maxDogs, or null for unlimited. */
export function maxPetsOf(constraints: Constraints): number | null {
  return constraints.maxDogs ?? null;
}

/** Duration bounds derived from service constraints, expressed in hours. */
export function durationBoundsOf(constraints: Constraints): {
  minHours: number;
  maxHours?: number;
} {
  const minHours =
    constraints.minDurationMin !== undefined
      ? constraints.minDurationMin / 60
      : 0.25;
  return constraints.maxDurationMin !== undefined
    ? { minHours, maxHours: constraints.maxDurationMin / 60 }
    : { minHours };
}

// ── Mode = which calendar/capability set the pricing type uses ──────────────────

export type BookingMode = "week-slots" | "month-range";

// Internal helper to avoid inline ternary repetition (mirrors original logic exactly)
function buildCapabilities(
  mode: BookingMode,
  durationMin: number,
  startGranularityMin: number,
) {
  return mode === "month-range"
    ? BOOK_HOUSE_SITTING_CAPABILITIES
    : {
        ...BOOK_WALK_CAPABILITIES,
        weekNavigable: false,
        intervalMinutes: durationMin,
        startGranularityMin,
      };
}

// The COMMON live-preview input shape (service & admin buildInput are identical
// to this). Edit ignores it and builds its patch from the exposed startsAt/etc.
export interface BookingSelectionInput {
  serviceSlug: string;
  startsAt: Date;
  endsAt: Date;
  quantities: ReturnType<typeof quantitiesToRecord>;
  petIds: string[] | undefined;
  recurringRule: {
    freq: "weekly";
    interval: number;
    count: number;
  } | null;
}

// ── Hook input (config) ─────────────────────────────────────────────────────────

/**
 * The IO hooks the substrate calls. Injected (not imported) so the wrapper —
 * which imports them from the client barrel — controls the binding, letting test
 * mocks of the barrel's IO surface flow through and avoiding a circular import.
 */
export interface BookingSchedulerIo {
  useAvailability: typeof useAvailability;
  useBusyRanges: typeof useBusyRanges;
  useOvernightNights: typeof useOvernightNights;
  usePremiumDays: typeof usePremiumDays;
}

export interface UseBookingSchedulerInput {
  service: ServiceDetail;
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
  /** Server-seeded premium (holiday) day-keys; defaults to none. */
  initialPremiumDays?: string[];

  /** Availability/busy/overnight IO hooks (injected from the barrel). */
  io: BookingSchedulerIo;

  /** Existing-booking day-keys for the "your booking" dot (already resolved). */
  myBookings: Set<string>;

  // Initial scheduling-input values (differ per wrapper).
  initialQuantities: QuantityState;
  initialPetIds: string[];
  /** week-slots seed (Date) or null. */
  initialSelectedStart: Date | null;
  /** month-range seed (DateRange) or undefined. */
  initialRange: DateRange | undefined;

  /**
   * Minutes of drive buffer for the viewer's candidate (hourly only). Passed
   * into `hourlySchedulerData` so month-grid availability and the day-timeline
   * both see the buffer. Defaults to 0 (no behavior change). House-sitting
   * branch ignores this — overnight bookings are unbuffered.
   */
  viewerDriveBufferMin?: number;

  // Wrapper-owned deltas, read fresh at debounce fire-time.
  /** true when a preview should fire (wrapper's gate). */
  canQuoteRef: MutableRefObject<boolean>;
  /**
   * Runs the wrapper's async preview body. Returns the promise so the shared
   * PREVIEW `useTransition` tracks the server round-trip (isPreviewing stays true
   * for the duration) — matching the originals' `startPreviewing(async () => …)`.
   */
  runPreviewRef: MutableRefObject<() => Promise<void>>;
  /** clears the wrapper's quote-state on a selection change. */
  clearOnSelectRef: MutableRefObject<() => void>;
  /** clears the wrapper's quote-state when the gate is false at fire-time. */
  clearOnIdleRef: MutableRefObject<() => void>;
}

// ── Hook return ─────────────────────────────────────────────────────────────────

export interface UseBookingSchedulerReturn {
  // Derived flags
  mode: BookingMode;
  petAware: boolean;
  allowedSpecies: PetSpecies[];
  maxPets: number | null;
  supportsRecurring: boolean;
  durationBounds: { minHours: number; maxHours?: number };

  // Loading/error from availability
  windowsLoading: boolean;
  windowsError: string | null;

  // Scheduler inputs
  capabilities: ReturnType<typeof buildCapabilities>;
  schedulerData: SchedulerData;

  // Selection state
  range: DateRange | undefined;
  stay: ReturnType<typeof validateStayRange> | null;

  // Derived booking time
  startsAt: Date | null;
  endsAt: Date | null;
  nights: number | null;
  hasSelection: boolean;
  petsOk: boolean;

  // Controlled scheduling inputs
  quantities: QuantityState;
  selectedPetIds: string[];
  recurringOn: boolean;
  occurrenceCount: number;

  // Preview transition (shared)
  isPreviewing: boolean;

  // Refresh busy (service + admin use this after submit)
  refreshBusy: () => void;

  // The COMMON preview input builder (service + admin).
  buildSelectionInput: () => BookingSelectionInput;

  // Direct pet-state setter (wrappers' handlePetAdded appends + clears + refresh).
  setSelectedPetIds: React.Dispatch<React.SetStateAction<string[]>>;

  // Schedules a debounced preview (400ms). Wrappers with extra controlled
  // inputs that affect the preview (e.g. edit's `comments`) call this after their
  // own setState, matching the originals' `requestQuote()` / `requestPreview()`.
  requestQuote: () => void;

  /**
   * Resets all scheduling inputs to initial defaults. Used by "Book another"
   * to clear the calendar selection, quantities, and pets so the user can
   * start a fresh booking without a page reload.
   */
  resetScheduler: () => void;

  // Event handlers
  onSelectionChange: (state: ScheduleSelectionState) => void;
  onQuantitiesChange: (s: QuantityState) => void;
  onPetIdsChange: (ids: string[]) => void;
  onRecurringOnChange: (on: boolean) => void;
  onOccurrenceCountChange: (n: number) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useBookingScheduler({
  service,
  rules,
  initialBusy,
  initialPremiumDays = [],
  io,
  myBookings,
  initialQuantities,
  initialPetIds,
  initialSelectedStart,
  initialRange,
  viewerDriveBufferMin = 0,
  canQuoteRef,
  runPreviewRef,
  clearOnSelectRef,
  clearOnIdleRef,
}: UseBookingSchedulerInput): UseBookingSchedulerReturn {
  const { useAvailability, useBusyRanges, useOvernightNights, usePremiumDays } =
    io;
  const mode: BookingMode =
    service.pricingType === "house_sitting" ? "month-range" : "week-slots";
  const petAware =
    service.pricingType === "house_sitting" ||
    service.pricingType === "walk" ||
    service.pricingType === "check_in" ||
    service.pricingType === "training";
  const allowedSpecies: PetSpecies[] = allowedSpeciesOf(service.constraints);
  const maxPets: number | null = maxPetsOf(service.constraints);
  const durationBounds = durationBoundsOf(service.constraints);
  const supportsRecurring = mode === "week-slots";

  // Stable "now" for the component lifetime (page reload re-mounts).
  const now = useMemo(() => new Date(), []);

  // ── State (initial values seeded from config; differ per wrapper) ──────────
  const [quantities, setQuantities] = useState<QuantityState>(
    () => initialQuantities,
  );
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>(initialPetIds);
  const [recurringOn, setRecurringOn] = useState(false);
  const [occurrenceCount, setOccurrenceCount] = useState(4);

  // Hourly selection is just a start instant; the end is always start + the
  // currently-chosen duration, so changing duration re-derives the end live.
  const [selectedStart, setSelectedStart] = useState<Date | null>(
    () => initialSelectedStart,
  );
  const [range, setRange] = useState<DateRange | undefined>(() => initialRange);

  // PREVIEW transition (shared; wrapper keeps its own SUBMIT transition).
  const [isPreviewing, startPreviewing] = useTransition();

  // ── Booking duration (single source of truth for hourly) ───────────────────
  // For hourly services the user-chosen "hours" IS the booking duration; it
  // drives the live quote, the day-timeline block height + candidate starts,
  // AND which month days read as available. House-sitting uses the service default.
  const durationMin = useMemo(() => {
    if (mode !== "week-slots") return service.defaultDurationMin ?? 60;
    if (quantities.type === "meet_greet") {
      // Use the service's own default_duration_min (30 min for meet-greet), not a
      // hardcoded 1-hour fallback.
      return service.defaultDurationMin ?? 30;
    }
    const hours =
      quantities.type === "house_sitting" ? 1 : quantities.qty.hours;
    return Math.max(15, Math.round(hours * 60));
  }, [mode, service.defaultDurationMin, quantities]);
  const durationMs = durationMin * 60_000;

  // ── Debounce timer ref for live preview ────────────────────────────────────
  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer on unmount (no setState — allowed cleanup-only effect)
  useEffect(() => {
    return () => {
      if (quoteTimerRef.current !== null) {
        clearTimeout(quoteTimerRef.current);
      }
    };
  }, []);

  // ── Availability + busy sources ────────────────────────────────────────────
  const {
    openWindows,
    loading: windowsLoading,
    error: windowsError,
  } = useAvailability({ durationMs, rules });
  const { overnightNights } = useOvernightNights();
  const { premiumDays } = usePremiumDays(initialPremiumDays);
  const { busy, refresh: refreshBusy } = useBusyRanges(
    service.slug,
    initialBusy,
  );

  const busyRanges = useMemo<BusyBlock[]>(
    () =>
      busy.map((b) => ({
        startsAt: new Date(b.startsAt),
        endsAt: new Date(b.endsAt),
        // Public source is identity-free; synthesize a stable, deterministic id
        // from the range so the grid can group cells without leaking client identity.
        id: `pub-${b.startsAt}-${b.endsAt}`,
      })),
    [busy],
  );

  // ── Scheduler capabilities + data ────────────────────────────────────────────
  const capabilities = useMemo(
    () => buildCapabilities(mode, durationMin, service.constraints.intervalMin),
    [mode, durationMin, service.constraints.intervalMin],
  );

  // Hourly month availability: a day is "available" only if it has ≥1 open start
  // for the chosen duration (busy-filtered) — so changing duration re-derives it.
  // Fed to deriveBookableDays via overnightNights (which keys "available").
  const schedulerData = useMemo<SchedulerData>(() => {
    if (mode === "week-slots") {
      return hourlySchedulerData({
        now,
        openWindows,
        busy: busyRanges,
        durationMin,
        granularityMin: service.constraints.intervalMin,
        rules,
        myBookings,
        premiumDays,
        bufferMin: viewerDriveBufferMin,
      });
    }
    return {
      overnightNights,
      windows: openWindows,
      busy: busyRanges,
      busyResident: busyRanges,
      myBookings,
      rules,
      now,
      premiumDays,
    };
  }, [
    mode,
    overnightNights,
    premiumDays,
    openWindows,
    busyRanges,
    durationMin,
    rules,
    myBookings,
    now,
    viewerDriveBufferMin,
    service.constraints.intervalMin,
  ]);

  // ── Derived booking time ─────────────────────────────────────────────────────
  const stay = useMemo(() => {
    if (mode !== "month-range" || !range?.from || !range?.to) return null;
    return validateStayRange({
      checkIn: denverMidnight(localDayKey(range.from)),
      checkOut: denverMidnight(localDayKey(range.to)),
      overnightNights,
      busyResident: busyRanges,
      rules,
      now,
    });
  }, [mode, range, overnightNights, busyRanges, rules, now]);

  let startsAt: Date | null = null;
  let endsAt: Date | null = null;
  let nights: number | null = null;
  if (mode === "week-slots") {
    if (selectedStart) {
      startsAt = selectedStart;
      endsAt = new Date(selectedStart.getTime() + durationMs);
    }
  } else if (stay?.ok) {
    startsAt = stay.range.startsAt;
    endsAt = stay.range.endsAt;
    nights = stay.nights;
  }

  const hasSelection = startsAt !== null && endsAt !== null;
  const petsOk = !petAware || selectedPetIds.length > 0;

  // ── The COMMON live-preview input (service + admin) ─────────────────────────
  function buildSelectionInput(): BookingSelectionInput {
    return {
      serviceSlug: service.slug,
      startsAt: startsAt!,
      endsAt: endsAt!,
      quantities: quantitiesToRecord(quantities, nights),
      petIds: petAware ? selectedPetIds : undefined,
      recurringRule:
        supportsRecurring && recurringOn
          ? { freq: "weekly" as const, interval: 1, count: occurrenceCount }
          : null,
    };
  }

  // ── Debounced live preview (no useEffect setState) ─────────────────────────
  // Driven entirely from event handlers + a debounce timer.
  // The Scheduler calls onSelectionChange on mount/change, so a rehydrated
  // returnTo selection triggers this path without a mount effect.
  // The timer reads the wrapper's gate + preview body from refs at fire-time
  // (kept fresh by the wrapper's ref-only effect) — so both week-slots and
  // month-range always quote against the committed state after re-render.
  function requestQuote() {
    if (quoteTimerRef.current !== null) {
      clearTimeout(quoteTimerRef.current);
    }
    quoteTimerRef.current = setTimeout(() => {
      if (!canQuoteRef.current) {
        clearOnIdleRef.current();
        return;
      }
      // Pass the async body through so the transition awaits it (the originals
      // wrapped the await in startPreviewing, keeping isPreviewing true).
      startPreviewing(() => runPreviewRef.current());
    }, 400);
  }

  // ── Bridge Scheduler selection → range / selectedStart ───────────────────────
  // Stable across renders (deps [mode]) — Scheduler subscribes to this in a
  // useEffect dep array, so an unstable identity would re-fire it every render.
  const onSelectionChange = useCallback(
    (state: ScheduleSelectionState) => {
      if (mode === "month-range") {
        // selectedDays = the nights selected (dayKeys).
        // range.from = check-in night, range.to = check-out day (last night + 1).
        if (state.selectedDays.size === 0) {
          setRange(undefined);
          clearOnSelectRef.current();
          return;
        }
        // NOTE: min/max derivation assumes selectedDays are CONTIGUOUS, which is
        // guaranteed today because this booking uses the "range" capability. If a
        // future capability change allowed non-contiguous selection, min..max+1
        // would include gap nights and this derivation must be revisited.
        const sorted = [...state.selectedDays].sort();
        const minKey = sorted[0];
        const maxKey = sorted[sorted.length - 1];
        // Add one day to maxKey (DST-safe via denverMidnight + 24h → denverDayKey).
        const checkOutDate = new Date(
          denverMidnight(maxKey).getTime() + 86_400_000,
        );
        const checkOutKey = denverDayKey(checkOutDate);
        setRange({
          from: localDateFromKey(minKey),
          to: localDateFromKey(checkOutKey),
        });
        clearOnSelectRef.current();
        // The timer fires ~400ms after this render completes. By then range state
        // has flushed → stay/startsAt/endsAt are fresh when the wrapper's preview reads them.
        requestQuote();
      } else {
        // gridDraft: exactly one cell "dayKey@minute" → selectedStart.
        if (state.gridDraft.size === 0) {
          setSelectedStart(null);
          clearOnSelectRef.current();
          return;
        }
        const [cell] = state.gridDraft;
        const atIdx = cell.indexOf("@");
        if (atIdx === -1) return;
        const dayKey = cell.slice(0, atIdx);
        const minute = parseInt(cell.slice(atIdx + 1), 10);
        if (isNaN(minute)) return;
        const startsAtMs = denverMidnight(dayKey).getTime() + minute * 60_000;
        setSelectedStart(new Date(startsAtMs));
        clearOnSelectRef.current();
        requestQuote();
      }
    },
    // HARD INVARIANT (SP3a, commit 99040d4): deps MUST be exactly [mode]. The
    // Scheduler subscribes to this callback in a useEffect dep array, so any extra
    // dep (clearOnSelectRef / requestQuote) that changes identity per render would
    // re-fire that subscription → spurious setState → render loop. The refs are
    // stable by construction and requestQuote only reads refs at fire-time, so
    // omitting them is correct, not a bug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode],
  );

  // ── Handler adapters for controlled inputs ─────────────────────────────────
  function onQuantitiesChange(s: QuantityState) {
    setQuantities(s);
    requestQuote();
  }

  function onPetIdsChange(ids: string[]) {
    setSelectedPetIds(ids);
    requestQuote();
  }

  function onRecurringOnChange(on: boolean) {
    setRecurringOn(on);
    requestQuote();
  }

  function onOccurrenceCountChange(n: number) {
    setOccurrenceCount(n);
    requestQuote();
  }

  /**
   * Resets all scheduling inputs to their initial defaults — used by "Book
   * another" to clear the selection so the user can start a new booking.
   * Clears the debounce timer so no stale preview fires after reset.
   */
  function resetScheduler() {
    if (quoteTimerRef.current !== null) {
      clearTimeout(quoteTimerRef.current);
      quoteTimerRef.current = null;
    }
    setSelectedStart(null);
    setRange(undefined);
    setQuantities(initialQuantities);
    setSelectedPetIds(initialPetIds);
    setRecurringOn(false);
    setOccurrenceCount(4);
  }

  return {
    mode,
    petAware,
    allowedSpecies,
    maxPets,
    supportsRecurring,
    durationBounds,
    windowsLoading,
    windowsError,
    capabilities,
    schedulerData,
    range,
    stay,
    startsAt,
    endsAt,
    nights,
    hasSelection,
    petsOk,
    quantities,
    selectedPetIds,
    recurringOn,
    occurrenceCount,
    isPreviewing,
    refreshBusy,
    buildSelectionInput,
    setSelectedPetIds,
    requestQuote,
    resetScheduler,
    onSelectionChange,
    onQuantitiesChange,
    onPetIdsChange,
    onRecurringOnChange,
    onOccurrenceCountChange,
  };
}
