"use client";

/**
 * useEditBooking — extracts all state, effects, derived values, and
 * handlers from EditBookingClient into a co-located hook.
 *
 * Zero behavior change: same state shape, same effect bodies, same
 * dependency arrays, same handler logic as the original component.
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
  editBooking,
  previewEdit,
  BOOK_HOUSE_SITTING_CAPABILITIES,
  BOOK_WALK_CAPABILITIES,
  diffBookingPatch,
} from "@/features/booking/index.client";
import type {
  SchedulerData,
  BusyBlock,
  ScheduleSelectionState,
  BookingRuleSettings,
  PublicBusyRange,
  BookingQuotePreview,
  EditBookingPatch,
  QuantityState,
  PetSpecies,
  ServiceDetail,
} from "@/features/booking/index.client";
import type { Pet } from "@/features/accounts";
import { useToast } from "@/components/feedback/toast";
import type { DateRange } from "@/components/ui/calendar";
import type { EditBookingInitial } from "./edit-booking-client";

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

export interface UseEditBookingInput {
  bookingId: string;
  service: ServiceDetail;
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
  initial: EditBookingInitial;
  admin?: {
    clientName: string;
    clientId: string;
    paidLock: boolean;
  };
}

// ── Hook return ───────────────────────────────────────────────────────────────

export interface UseEditBookingReturn {
  // Derived flags / labels
  mode: "week-slots" | "month-range";
  petAware: boolean;
  allowedSpecies: PetSpecies[];

  // Loading/error from availability
  windowsLoading: boolean;
  windowsError: string | null;

  // Scheduler inputs
  capabilities: ReturnType<typeof buildCapabilities>;
  schedulerData: SchedulerData;
  initialSlot: { dayKey: string; minute: number } | undefined;

  // Selection state (for JSX display)
  range: DateRange | undefined;
  stay: ReturnType<typeof validateStayRange> | null;
  patchEmpty: boolean;

  // Quote / submit state
  quote: BookingQuotePreview | null;
  approvalWillReReview: boolean;
  errorMsg: string | null;
  blocked: boolean;
  forceConfirm: boolean;
  isPreviewing: boolean;
  isSubmitting: boolean;
  saveDisabled: boolean;

  // Controlled inputs
  quantities: QuantityState;
  selectedPetIds: string[];
  comments: string;

  // Step labels
  step2Label: string;
  step3Label: string;
  step4Label: string;

  // Event handlers
  onSelectionChange: (state: ScheduleSelectionState) => void;
  handleSave: () => void;
  handlePetAdded: (pet: Pet) => void;
  onQuantitiesChange: (s: QuantityState) => void;
  onPetIdsChange: (ids: string[]) => void;
  onCommentsChange: (value: string) => void;
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

export function useEditBooking({
  bookingId,
  service,
  rules,
  initialBusy,
  initial,
  admin,
}: UseEditBookingInput): UseEditBookingReturn {
  const router = useRouter();
  const toast = useToast();

  const mode: "week-slots" | "month-range" =
    service.pricingType === "house_sitting" ? "month-range" : "week-slots";
  const petAware =
    service.pricingType === "house_sitting" || service.pricingType === "walk";
  const allowedSpecies: PetSpecies[] =
    service.pricingType === "house_sitting" ? ["dog", "cat"] : ["dog"];

  // Stable "now" for the component lifetime (page reload re-mounts).
  const now = useMemo(() => new Date(), []);

  // ── State (seeded from the existing booking) ────────────────────────────────
  const [quantities, setQuantities] = useState<QuantityState>(
    initial.quantities,
  );
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>(
    initial.petIds,
  );
  const [comments, setComments] = useState<string>(initial.comments);

  // Hourly selection is just a start instant; the end is always start + the
  // currently-chosen duration, so changing duration re-derives the end live.
  const [selectedStart, setSelectedStart] = useState<Date | null>(() =>
    mode === "week-slots" ? new Date(initial.startsAtIso) : null,
  );
  const [range, setRange] = useState<DateRange | undefined>(() =>
    mode === "month-range"
      ? {
          from: localDateFromKey(denverDayKey(new Date(initial.startsAtIso))),
          to: localDateFromKey(denverDayKey(new Date(initial.endsAtIso))),
        }
      : undefined,
  );

  const [quote, setQuote] = useState<BookingQuotePreview | null>(null);
  const [approvalWillReReview, setApprovalWillReReview] = useState(false);
  // Inline error from preview/save; when set with `blocking`, Save is disabled.
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const [forceConfirm, setForceConfirm] = useState(false);

  const [isPreviewing, startPreviewing] = useTransition();
  const [isSubmitting, startSubmitting] = useTransition();

  // ── Booking duration (single source of truth for hourly) ───────────────────
  // For hourly services the user-chosen "hours" IS the booking duration; it
  // drives the live quote, the day-timeline block height + candidate starts,
  // AND which month days read as available. House-sitting uses the service default.
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

  // ── Debounce timer ref for live preview ────────────────────────────────────
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (previewTimerRef.current !== null) {
        clearTimeout(previewTimerRef.current);
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
  const { busy } = useBusyRanges(service.slug, initialBusy);

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

  // Pre-select the booking's current slot (week-slots): drives the Scheduler's
  // initial selection block + the your-booking dot. (MeetGreetScheduler pattern.)
  const initialSlot = useMemo(() => {
    if (mode !== "week-slots") return undefined;
    const from = new Date(initial.startsAtIso);
    const dayKey = denverDayKey(from);
    const minute = Math.round(
      (from.getTime() - denverMidnight(dayKey).getTime()) / 60_000,
    );
    return { dayKey, minute };
  }, [mode, initial.startsAtIso]);

  // The booking's own day-keys (your-booking dot).
  const myBookings = useMemo(() => {
    if (mode === "week-slots") {
      return initialSlot ? new Set([initialSlot.dayKey]) : new Set<string>();
    }
    // month-range: mark the existing stay's nights.
    const keys = new Set<string>();
    let cursor = denverMidnight(denverDayKey(new Date(initial.startsAtIso)));
    const endMs = denverMidnight(
      denverDayKey(new Date(initial.endsAtIso)),
    ).getTime();
    while (cursor.getTime() < endMs) {
      keys.add(denverDayKey(cursor));
      cursor = new Date(cursor.getTime() + 86_400_000);
    }
    return keys;
  }, [mode, initialSlot, initial.startsAtIso, initial.endsAtIso]);

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

  const petsOk = !petAware || selectedPetIds.length > 0;

  // ── Patch diff: include a field ONLY when it differs from the seed ──────────
  // Unchanged fields are omitted so the core keeps the booking's stored values.
  const patch = useMemo(
    () =>
      diffBookingPatch(initial, {
        startsAt,
        endsAt,
        selectedPetIds,
        quantities,
        nights,
        comments,
        petAware,
      }),
    [
      startsAt,
      endsAt,
      selectedPetIds,
      quantities,
      nights,
      comments,
      petAware,
      initial,
    ],
  );
  const patchEmpty = Object.keys(patch).length === 0;

  // ── Latest-ref pattern so the debounce timer reads fresh inputs at fire-time ──
  const patchRef = useRef<EditBookingPatch>(patch);
  const canPreviewRef = useRef(false);
  useEffect(() => {
    patchRef.current = patch;
    canPreviewRef.current =
      startsAt !== null && endsAt !== null && petsOk && !patchEmpty;
  });

  // ── Debounced live preview ──────────────────────────────────────────────────
  const requestPreview = useCallback(() => {
    if (previewTimerRef.current !== null) {
      clearTimeout(previewTimerRef.current);
    }
    previewTimerRef.current = setTimeout(() => {
      // Nothing to preview (no selection, missing pets, or no changes).
      if (!canPreviewRef.current) {
        setQuote(null);
        setApprovalWillReReview(false);
        setErrorMsg(null);
        setBlocked(false);
        return;
      }
      startPreviewing(async () => {
        const result = await previewEdit({
          bookingId,
          patch: patchRef.current,
        });
        switch (result.kind) {
          case "preview":
            setQuote(result.preview);
            setApprovalWillReReview(
              result.requiresApproval && initial.wasConfirmed,
            );
            setErrorMsg(null);
            setBlocked(false);
            break;
          case "unavailable":
            setQuote(null);
            setApprovalWillReReview(false);
            setErrorMsg(result.reason);
            setBlocked(true);
            break;
          case "refuse":
            setQuote(null);
            setApprovalWillReReview(false);
            setErrorMsg(result.reason);
            setBlocked(true);
            break;
          case "price_locked":
            setQuote(null);
            setApprovalWillReReview(false);
            setErrorMsg(
              "This booking is already paid, so its price can't change.",
            );
            setBlocked(true);
            break;
          case "validation_error":
            setQuote(null);
            setApprovalWillReReview(false);
            setErrorMsg(result.message);
            setBlocked(true);
            break;
          default:
            // Unreachable from the gated UI — not_found/forbidden/error don't
            // surface via previewEdit. Block defensively but don't persist stale state.
            setQuote(null);
            setApprovalWillReReview(false);
            setErrorMsg("Couldn't preview this change. Please contact Cal.");
            setBlocked(true);
        }
      });
    }, 400);
  }, [bookingId, initial.wasConfirmed]);

  // ── Bridge Scheduler selection → range / selectedStart ───────────────────────
  const onSelectionChange = useCallback(
    (state: ScheduleSelectionState) => {
      if (mode === "month-range") {
        if (state.selectedDays.size === 0) {
          setRange(undefined);
          setQuote(null);
          setErrorMsg(null);
          setBlocked(false);
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
        setBlocked(false);
        requestPreview();
      } else {
        if (state.gridDraft.size === 0) {
          setSelectedStart(null);
          setQuote(null);
          setErrorMsg(null);
          setBlocked(false);
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
        setBlocked(false);
        requestPreview();
      }
    },
    [mode, requestPreview],
  );

  // ── Save handler ────────────────────────────────────────────────────────────
  function handleSave() {
    if (patchEmpty || blocked) return;
    startSubmitting(async () => {
      const result = await editBooking({ bookingId, patch, forceConfirm });
      switch (result.kind) {
        case "success":
          toast.add({ title: "Booking updated" });
          router.push(
            admin ? `/admin/clients/${admin.clientId}` : "/account/bookings",
          );
          router.refresh();
          break;
        case "unavailable":
          // Transient: slot may free up — keep Save available for retry.
          setErrorMsg(result.reason);
          break;
        case "refuse":
          // Transient: policy may change — keep Save available for retry.
          setErrorMsg(result.reason);
          break;
        case "slot_taken":
          // Transient: user should pick a different slot, not permanently blocked.
          setErrorMsg("That time was just taken. Please pick another slot.");
          break;
        case "validation_error":
          // Transient: user can fix input — keep Save available for retry.
          setErrorMsg(result.message);
          break;
        default:
          // price_locked | forbidden | invalid_status | blocked_debt |
          // onboarding_incomplete | not_found | error — not reachable from the
          // gated UI, but must not crash.
          toast.add({
            title: "Couldn't save",
            description: "Please contact Cal.",
            type: "error",
          });
      }
    });
  }

  function handlePetAdded(pet: Pet) {
    setSelectedPetIds((prev) => [...prev, pet.id]);
    setQuote(null);
    router.refresh();
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const saveDisabled =
    patchEmpty || blocked || isPreviewing || isSubmitting || !petsOk;

  const step2Label = "2";
  const step3Label = petAware ? "3" : "2";
  const step4Label = petAware ? "4" : "3";

  // ── Handler adapters for controlled inputs ─────────────────────────────────
  function onQuantitiesChange(s: QuantityState) {
    setQuantities(s);
    requestPreview();
  }

  function onPetIdsChange(ids: string[]) {
    setSelectedPetIds(ids);
    requestPreview();
  }

  function onCommentsChange(value: string) {
    setComments(value);
    requestPreview();
  }

  return {
    mode,
    petAware,
    allowedSpecies,
    windowsLoading,
    windowsError,
    capabilities,
    schedulerData,
    initialSlot,
    range,
    stay,
    patchEmpty,
    quote,
    approvalWillReReview,
    errorMsg,
    blocked,
    forceConfirm,
    isPreviewing,
    isSubmitting,
    saveDisabled,
    quantities,
    selectedPetIds,
    comments,
    step2Label,
    step3Label,
    step4Label,
    onSelectionChange,
    handleSave,
    handlePetAdded,
    onQuantitiesChange,
    onPetIdsChange,
    onCommentsChange,
    setForceConfirm,
  };
}
