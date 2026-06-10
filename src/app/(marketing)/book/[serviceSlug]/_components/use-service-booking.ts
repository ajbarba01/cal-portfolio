"use client";

/**
 * useServiceBooking — extracts all state, effects, derived values, and
 * handlers from ServiceBookingClient into a co-located hook.
 *
 * The component calls this hook and wires its return value to JSX/props.
 * Zero behavior change: same state shape, same effect bodies, same
 * dependency arrays, same handler logic.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  useAvailability,
  useBusyRanges,
  useOvernightNights,
  validateStayRange,
  denverMidnight,
  denverDayKey,
  hourlySchedulerData,
  buildReturnTo,
  previewQuote,
  createBooking,
  BOOK_HOUSE_SITTING_CAPABILITIES,
  BOOK_WALK_CAPABILITIES,
  defaultQuantities,
  quantitiesToRecord,
} from "@/features/booking/index.client";
import type {
  SchedulerData,
  BusyBlock,
  ScheduleSelectionState,
  BookingRuleSettings,
  PublicBusyRange,
  BookingQuotePreview,
  AssignablePet,
  QuantityState,
  PetSpecies,
  ServiceDetail,
} from "@/features/booking/index.client";
import type { Pet } from "@/features/accounts";
import { useToast } from "@/components/feedback/toast";
import type { DateRange } from "@/components/ui/calendar";
import {
  createResultMessage,
  previewResultMessage,
} from "../../_components/messages";
import type { UserMessage } from "../../_components/messages";
import type { AuthState, InitialSelection } from "./service-booking-client";

// ── Local date helpers (browser-local calendar keys; layout, not business rules) ──

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function localDateFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d);
}

// ── Hook input (mirrors the component props that drive logic) ─────────────────

export interface UseServiceBookingInput {
  service: ServiceDetail;
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
  authState: AuthState;
  pets: AssignablePet[];
  initialSelection: InitialSelection;
  myBookingDayKeys: string[];
}

// ── Hook return ───────────────────────────────────────────────────────────────

export interface UseServiceBookingReturn {
  // Derived flags / labels
  mode: "week-slots" | "month-range";
  petAware: boolean;
  allowedSpecies: PetSpecies[];
  supportsRecurring: boolean;

  // Loading/error from availability
  windowsLoading: boolean;
  windowsError: string | null; // from useAvailability (already string | null)

  // Scheduler inputs
  capabilities: ReturnType<typeof buildCapabilities>;
  schedulerData: SchedulerData;

  // Selection state (for JSX display)
  range: DateRange | undefined;
  stay: ReturnType<typeof validateStayRange> | null;
  hasSelection: boolean;
  petsOk: boolean;

  // Quote / submit state
  quote: BookingQuotePreview | null;
  previewMsg: UserMessage | null;
  isPreviewing: boolean;
  isSubmitting: boolean;
  submitDone: boolean;
  bookEnabled: boolean;
  guestLoginHref: string;

  // Quantities / pets / recurring (for controlled inputs)
  quantities: QuantityState;
  selectedPetIds: string[];
  recurringOn: boolean;
  occurrenceCount: number;

  // Step labels
  step2Label: string;
  step3Label: string;
  step4Label: string;

  // Event handlers
  onSelectionChange: (state: ScheduleSelectionState) => void;
  handleBook: () => void;
  handlePetAdded: (pet: Pet) => void;
  onQuantitiesChange: (s: QuantityState) => void;
  onPetIdsChange: (ids: string[]) => void;
  onRecurringOnChange: (on: boolean) => void;
  onOccurrenceCountChange: (n: number) => void;
}

// Internal helper to avoid inline ternary repetition (mirrors component logic exactly)
function buildCapabilities(
  mode: "week-slots" | "month-range",
  durationMin: number,
) {
  return mode === "month-range"
    ? BOOK_HOUSE_SITTING_CAPABILITIES
    : {
        ...BOOK_WALK_CAPABILITIES,
        weekNavigable: false,
        intervalMinutes: durationMin,
      };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useServiceBooking({
  service,
  rules,
  initialBusy,
  authState,
  initialSelection,
  myBookingDayKeys,
}: UseServiceBookingInput): UseServiceBookingReturn {
  const router = useRouter();
  const toast = useToast();

  const mode: "week-slots" | "month-range" =
    service.pricingType === "house_sitting" ? "month-range" : "week-slots";
  const petAware =
    service.pricingType === "house_sitting" || service.pricingType === "walk";
  const allowedSpecies: PetSpecies[] =
    service.pricingType === "house_sitting" ? ["dog", "cat"] : ["dog"];
  const supportsRecurring = mode === "week-slots";

  // Stable "now" for the component lifetime (page reload re-mounts).
  const now = useMemo(() => new Date(), []);

  // ── State (selection rehydrated from returnTo round-trip) ──────────────────
  const [quantities, setQuantities] = useState<QuantityState>(() =>
    defaultQuantities(service.pricingType),
  );
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>(
    initialSelection.petIds,
  );
  const [recurringOn, setRecurringOn] = useState(false);
  const [occurrenceCount, setOccurrenceCount] = useState(4);

  // Hourly selection is just a start instant; the end is always start + the
  // currently-chosen duration, so changing duration re-derives the end live.
  const [selectedStart, setSelectedStart] = useState<Date | null>(() =>
    mode === "week-slots" && initialSelection.start
      ? new Date(initialSelection.start)
      : null,
  );
  const [range, setRange] = useState<DateRange | undefined>(() =>
    mode === "month-range" && initialSelection.start && initialSelection.end
      ? {
          from: localDateFromKey(
            denverDayKey(new Date(initialSelection.start)),
          ),
          to: localDateFromKey(denverDayKey(new Date(initialSelection.end))),
        }
      : undefined,
  );
  const [quote, setQuote] = useState<BookingQuotePreview | null>(null);
  const [previewMsg, setPreviewMsg] = useState<UserMessage | null>(null);
  const [submitDone, setSubmitDone] = useState(false);

  const [isPreviewing, startPreviewing] = useTransition();
  const [isSubmitting, startSubmitting] = useTransition();

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

  // ── Debounce timer ref for live quote ──────────────────────────────────────
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
    () => buildCapabilities(mode, durationMin),
    [mode, durationMin],
  );

  // The client's existing-booking day-keys (your-booking dot).
  const myBookings = useMemo(
    () => new Set(myBookingDayKeys),
    [myBookingDayKeys],
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
        rules,
        myBookings,
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
    };
  }, [
    mode,
    overnightNights,
    openWindows,
    busyRanges,
    durationMin,
    rules,
    myBookings,
    now,
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

  // ── Mutators that invalidate a stale quote ──────────────────────────────────
  function clearQuote() {
    setQuote(null);
    setPreviewMsg(null);
  }

  function buildInput() {
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

  // Latest-ref pattern: a ref-only effect (no setState) keeps these current so the
  // debounce timer reads fresh inputs at fire-time. The repo's react-hooks/refs rule
  // forbids assigning ref.current during render, so the sync lives in this effect
  // (which runs synchronously after commit, well before the 400ms timer fires).
  const buildInputRef = useRef(buildInput);
  const canQuoteRef = useRef(hasSelection && petsOk && authState === "ready");
  useEffect(() => {
    buildInputRef.current = buildInput;
    // Non-ready users never get a server quote — the price box shows an auth
    // prompt instead, so skip the round-trip entirely.
    canQuoteRef.current = hasSelection && petsOk && authState === "ready";
  });

  // ── Debounced live quote (no useEffect setState) ───────────────────────────
  // Driven entirely from event handlers + a debounce timer.
  // The Scheduler calls onSelectionChange on mount/change, so a rehydrated
  // returnTo selection triggers this path without a mount effect.
  // The timer reads from refs at fire-time so both week-slots and month-range
  // always quote against the committed state after re-render.

  function requestQuote() {
    if (quoteTimerRef.current !== null) {
      clearTimeout(quoteTimerRef.current);
    }
    quoteTimerRef.current = setTimeout(() => {
      if (!canQuoteRef.current) {
        setQuote(null);
        setPreviewMsg(null);
        return;
      }
      startPreviewing(async () => {
        const result = await previewQuote(buildInputRef.current());
        const out = previewResultMessage(result);
        if (out.kind === "quote") {
          setQuote(out.preview);
          setPreviewMsg(null);
        } else {
          setQuote(null);
          setPreviewMsg(out.message);
        }
      });
    }, 400);
  }

  // ── Bridge Scheduler selection → range / selectedSlot ────────────────────────
  const onSelectionChange = useCallback(
    (state: ScheduleSelectionState) => {
      if (mode === "month-range") {
        // selectedDays = the nights selected (dayKeys).
        // range.from = check-in night, range.to = check-out day (last night + 1).
        if (state.selectedDays.size === 0) {
          setRange(undefined);
          setQuote(null);
          setPreviewMsg(null);
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
        setQuote(null);
        setPreviewMsg(null);
        // The timer fires ~400ms after this render completes. By then range state
        // has flushed → stay/startsAt/endsAt are fresh in buildInputRef.current().
        requestQuote();
      } else {
        // gridDraft: exactly one cell "dayKey@minute" → selectedStart.
        if (state.gridDraft.size === 0) {
          setSelectedStart(null);
          setQuote(null);
          setPreviewMsg(null);
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
        setQuote(null);
        setPreviewMsg(null);
        requestQuote();
      }
    },
    [mode],
  );

  // ── Book handler ──────────────────────────────────────────────────────────
  function handleBook() {
    if (!startsAt || !endsAt || !petsOk) return;

    // Deferred-auth gate: bounce guests / un-onboarded users with a returnTo.
    if (authState !== "ready") {
      const returnTo = buildReturnTo({
        serviceSlug: service.slug,
        start: startsAt.toISOString(),
        end: endsAt.toISOString(),
        petIds: petAware ? selectedPetIds : undefined,
      });
      const dest = authState === "guest" ? "/login" : "/onboarding";
      router.push(`${dest}?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }

    // Submit — mid-session onboarding_incomplete routes to /onboarding.
    startSubmitting(async () => {
      const result = await createBooking(buildInput());
      if (result.kind === "onboarding_incomplete") {
        router.push("/onboarding");
        return;
      }
      const msg = createResultMessage(result, quote?.requiresApproval ?? true);
      if (result.kind === "success") {
        toast.add({ title: "Booking requested", description: msg.text });
        setSubmitDone(true);
      } else {
        toast.add({
          title: "Couldn't book",
          description: msg.text,
          type: "error",
        });
      }
      // Either way, refresh busy so the calendar reflects the latest state.
      void refreshBusy();
    });
  }

  function handlePetAdded(pet: Pet) {
    setSelectedPetIds((prev) => [...prev, pet.id]);
    clearQuote();
    // Reload server data (fresh pet list + signed photo URLs); client state persists.
    router.refresh();
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const bookEnabled =
    hasSelection &&
    petsOk &&
    !isSubmitting &&
    !isPreviewing &&
    !submitDone &&
    (authState !== "ready" || quote !== null);

  // Auth-prompt href for guest — login with returnTo so the user lands back here.
  const guestLoginHref = (() => {
    if (!startsAt || !endsAt) return "/login";
    const returnTo = buildReturnTo({
      serviceSlug: service.slug,
      start: startsAt.toISOString(),
      end: endsAt.toISOString(),
      petIds: petAware ? selectedPetIds : undefined,
    });
    return `/login?returnTo=${encodeURIComponent(returnTo)}`;
  })();

  // Step counter helpers
  const step2Label = "2";
  const step3Label = petAware ? "3" : "2";
  const step4Label = petAware ? "4" : "3";

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

  return {
    mode,
    petAware,
    allowedSpecies,
    supportsRecurring,
    windowsLoading,
    windowsError,
    capabilities,
    schedulerData,
    range,
    stay,
    hasSelection,
    petsOk,
    quote,
    previewMsg,
    isPreviewing,
    isSubmitting,
    submitDone,
    bookEnabled,
    guestLoginHref,
    quantities,
    selectedPetIds,
    recurringOn,
    occurrenceCount,
    step2Label,
    step3Label,
    step4Label,
    onSelectionChange,
    handleBook,
    handlePetAdded,
    onQuantitiesChange,
    onPetIdsChange,
    onRecurringOnChange,
    onOccurrenceCountChange,
  };
}
