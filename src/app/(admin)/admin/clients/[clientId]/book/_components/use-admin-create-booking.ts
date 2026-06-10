"use client";

/**
 * useAdminCreateBooking — extracts all state, effects, derived values, and
 * handlers from AdminCreateBookingClient into a co-located hook.
 *
 * Zero behavior change: same state shape, same effect bodies, same
 * dependency arrays, same handler logic as the original component.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  useAvailability,
  useBusyRanges,
  useOvernightNights,
  validateStayRange,
  denverMidnight,
  denverDayKey,
  hourlySchedulerData,
  createBookingForClient,
  previewQuoteForClient,
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

// ── Hook input ────────────────────────────────────────────────────────────────

export interface UseAdminCreateBookingInput {
  clientId: string;
  clientName: string;
  service: ServiceDetail;
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
  pets: AssignablePet[];
}

// ── Hook return ───────────────────────────────────────────────────────────────

export interface UseAdminCreateBookingReturn {
  // Derived flags / labels
  mode: "week-slots" | "month-range";
  petAware: boolean;
  allowedSpecies: PetSpecies[];
  supportsRecurring: boolean;

  // Loading/error from availability
  windowsLoading: boolean;
  windowsError: string | null;

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
  errorMsg: string | null;
  forceConfirm: boolean;
  isPreviewing: boolean;
  isSubmitting: boolean;
  submitDone: boolean;
  bookEnabled: boolean;

  // Controlled inputs
  quantities: QuantityState;
  selectedPetIds: string[];
  recurringOn: boolean;
  occurrenceCount: number;

  // Step labels
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
  setForceConfirm: (v: boolean) => void;
}

// Internal helper
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

export function useAdminCreateBooking({
  clientId,
  service,
  rules,
  initialBusy,
}: UseAdminCreateBookingInput): UseAdminCreateBookingReturn {
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

  // ── State ──────────────────────────────────────────────────────────────────
  const [quantities, setQuantities] = useState<QuantityState>(() =>
    defaultQuantities(service.pricingType),
  );
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [recurringOn, setRecurringOn] = useState(false);
  const [occurrenceCount, setOccurrenceCount] = useState(4);
  const [forceConfirm, setForceConfirm] = useState(false);

  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [quote, setQuote] = useState<BookingQuotePreview | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitDone, setSubmitDone] = useState(false);

  const [isPreviewing, startPreviewing] = useTransition();
  const [isSubmitting, startSubmitting] = useTransition();

  // ── Booking duration (single source of truth for hourly) ───────────────────
  const durationMin = useMemo(() => {
    if (mode !== "week-slots") return service.defaultDurationMin ?? 60;
    if (quantities.type === "meet_greet") {
      return service.defaultDurationMin ?? 30;
    }
    const hours =
      quantities.type === "house_sitting" ? 1 : quantities.qty.hours;
    return Math.max(15, Math.round(hours * 60));
  }, [mode, service.defaultDurationMin, quantities]);
  const durationMs = durationMin * 60_000;

  // ── Debounce timer ref for live quote ──────────────────────────────────────
  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        id: `pub-${b.startsAt}-${b.endsAt}`,
      })),
    [busy],
  );

  // ── Scheduler capabilities + data ────────────────────────────────────────────
  const capabilities = useMemo(
    () => buildCapabilities(mode, durationMin),
    [mode, durationMin],
  );

  // No existing-booking day-keys for admin create (empty set).
  const myBookings = useMemo(() => new Set<string>(), []);

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
    setErrorMsg(null);
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

  // Latest-ref pattern: keep refs current so the debounce timer reads fresh
  // inputs at fire-time.
  const buildInputRef = useRef(buildInput);
  const canQuoteRef = useRef(hasSelection && petsOk);
  useEffect(() => {
    buildInputRef.current = buildInput;
    canQuoteRef.current = hasSelection && petsOk;
  });

  // ── Debounced live quote ───────────────────────────────────────────────────
  function requestQuote() {
    if (quoteTimerRef.current !== null) {
      clearTimeout(quoteTimerRef.current);
    }
    quoteTimerRef.current = setTimeout(() => {
      if (!canQuoteRef.current) {
        setQuote(null);
        setErrorMsg(null);
        return;
      }
      startPreviewing(async () => {
        const input = buildInputRef.current();
        const result = await previewQuoteForClient({
          clientId,
          serviceSlug: input.serviceSlug,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          quantities: input.quantities,
          petIds: input.petIds,
          recurringRule: input.recurringRule,
        });
        switch (result.kind) {
          case "success":
            setQuote(result.preview);
            setErrorMsg(null);
            break;
          case "forbidden":
            setQuote(null);
            setErrorMsg("Admin session expired — refresh the page.");
            break;
          // Unreachable under ADMIN_POLICY (these gates warn-don't-block for admins);
          // kept as defensive fallbacks.
          case "refuse":
            setQuote(null);
            setErrorMsg(result.reason);
            break;
          case "blocked_debt":
            setQuote(null);
            setErrorMsg(
              `Client has an outstanding balance. Override with force-confirm if needed.`,
            );
            break;
          case "onboarding_incomplete":
            setQuote(null);
            setErrorMsg(
              "Client onboarding is incomplete. Admin policy applies.",
            );
            break;
          case "validation_error":
            setQuote(null);
            setErrorMsg(result.message);
            break;
          case "error":
            setQuote(null);
            setErrorMsg(result.message);
            break;
        }
      });
    }, 400);
  }

  // ── Bridge Scheduler selection → range / selectedSlot ────────────────────────
  // Plain function (not useCallback) — requestQuote is also a plain function in
  // the same scope, so there is no stable identity to preserve here.
  function onSelectionChange(state: ScheduleSelectionState) {
    if (mode === "month-range") {
      if (state.selectedDays.size === 0) {
        setRange(undefined);
        setQuote(null);
        setErrorMsg(null);
        return;
      }
      const sorted = [...state.selectedDays].sort();
      const minKey = sorted[0];
      const maxKey = sorted[sorted.length - 1];
      const checkOutDate = new Date(
        denverMidnight(maxKey).getTime() + 86_400_000,
      );
      const checkOutKey = denverDayKey(checkOutDate);
      setRange({
        from: localDateFromKey(minKey),
        to: localDateFromKey(checkOutKey),
      });
      setQuote(null);
      setErrorMsg(null);
      requestQuote();
    } else {
      if (state.gridDraft.size === 0) {
        setSelectedStart(null);
        setQuote(null);
        setErrorMsg(null);
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
      setErrorMsg(null);
      requestQuote();
    }
  }

  // ── Book handler ──────────────────────────────────────────────────────────
  function handleBook() {
    if (!startsAt || !endsAt || !petsOk) return;

    startSubmitting(async () => {
      const input = buildInput();
      const result = await createBookingForClient({
        clientId,
        serviceSlug: input.serviceSlug,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        quantities: input.quantities,
        petIds: input.petIds,
        recurringRule: input.recurringRule,
        forceConfirm,
      });
      if (result.kind === "success") {
        toast.add({
          title: "Booking created",
          description: result.warnings.length
            ? `${result.warnings.length} override(s) applied.`
            : undefined,
        });
        setSubmitDone(true);
        router.push(`/admin/clients/${clientId}`);
        router.refresh();
      } else if (result.kind === "slot_taken") {
        setErrorMsg("That time was just taken. Please pick another slot.");
      } else {
        setErrorMsg("Couldn't create the booking. Please check the details.");
      }
      void refreshBusy();
    });
  }

  function handlePetAdded(pet: Pet) {
    setSelectedPetIds((prev) => [...prev, pet.id]);
    clearQuote();
    router.refresh();
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const bookEnabled =
    hasSelection &&
    petsOk &&
    !isSubmitting &&
    !isPreviewing &&
    !submitDone &&
    quote !== null;

  // Step counter helpers
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
    errorMsg,
    forceConfirm,
    isPreviewing,
    isSubmitting,
    submitDone,
    bookEnabled,
    quantities,
    selectedPetIds,
    recurringOn,
    occurrenceCount,
    step3Label,
    step4Label,
    onSelectionChange,
    handleBook,
    handlePetAdded,
    onQuantitiesChange,
    onPetIdsChange,
    onRecurringOnChange,
    onOccurrenceCountChange,
    setForceConfirm,
  };
}
