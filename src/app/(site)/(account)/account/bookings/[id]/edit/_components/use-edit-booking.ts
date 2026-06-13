"use client";

/**
 * useEditBooking — the client self-edit (and admin on-behalf edit) flow.
 *
 * Thin wrapper over the shared `useBookingScheduler` substrate (SP3b A13): the
 * shared hook owns all scheduler state/derivation/selection-bridge/debounce; this
 * file adds ONLY the edit-specific deltas — its quote-state ({quote,
 * approvalWillReReview, errorMsg, blocked, comments, forceConfirm}), the patch
 * diff + patchEmpty gate, the previewEdit body + result switch, the save handler,
 * and its return-shape extras (initialSlot, comments, saveDisabled, …).
 *
 * Zero behavior change: same public input/return interface, same effect bodies,
 * same dependency arrays, same handler logic as before the extraction.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  useBookingScheduler,
  useAvailability,
  useBusyRanges,
  useOvernightNights,
  usePremiumDays,
  localDateFromKey,
  denverMidnight,
  denverDayKey,
  editBooking,
  previewEdit,
  diffBookingPatch,
} from "@/features/booking/index.client";
import type {
  SchedulerData,
  ScheduleSelectionState,
  BookingRuleSettings,
  PublicBusyRange,
  BookingQuotePreview,
  EditBookingPatch,
  QuantityState,
  PetSpecies,
  ServiceDetail,
  UseBookingSchedulerReturn,
  validateStayRange,
} from "@/features/booking/index.client";
import type { Pet } from "@/features/accounts";
import { useToast } from "@/components/feedback/toast";
import type { DateRange } from "@/components/ui/calendar";
import type { EditBookingInitial } from "./edit-booking-client";

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
  capabilities: UseBookingSchedulerReturn["capabilities"];
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

  // ── Pre-select the booking's current slot (week-slots) ─────────────────────
  // Drives the Scheduler's initial selection block + the your-booking dot.
  const initialSlot = useMemo(() => {
    if (mode !== "week-slots") return undefined;
    const from = new Date(initial.startsAtIso);
    const dayKey = denverDayKey(from);
    const minute = Math.round(
      (from.getTime() - denverMidnight(dayKey).getTime()) / 60_000,
    );
    return { dayKey, minute };
  }, [mode, initial.startsAtIso]);

  // ── Seeds for the shared hook (seeded from the existing booking) ───────────
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

  // Seeds consumed once by the shared hook's lazy useState init.
  const initialSelectedStart = useMemo<Date | null>(
    () => (mode === "week-slots" ? new Date(initial.startsAtIso) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const initialRange = useMemo<DateRange | undefined>(
    () =>
      mode === "month-range"
        ? {
            from: localDateFromKey(denverDayKey(new Date(initial.startsAtIso))),
            to: localDateFromKey(denverDayKey(new Date(initial.endsAtIso))),
          }
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── Wrapper-owned quote-state ──────────────────────────────────────────────
  const [comments, setComments] = useState<string>(initial.comments);
  const [quote, setQuote] = useState<BookingQuotePreview | null>(null);
  const [approvalWillReReview, setApprovalWillReReview] = useState(false);
  // Inline error from preview/save; when set with `blocking`, Save is disabled.
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [forceConfirm, setForceConfirm] = useState(false);

  const [isSubmitting, startSubmitting] = useTransition();

  // ── Refs the shared hook reads at debounce fire-time ───────────────────────
  const canQuoteRef = useRef(false);
  const runPreviewRef = useRef<() => Promise<void>>(async () => {});
  const clearOnSelectRef = useRef<() => void>(() => {});
  const clearOnIdleRef = useRef<() => void>(() => {});

  // ── Shared scheduler substrate ─────────────────────────────────────────────
  const sched = useBookingScheduler({
    service,
    rules,
    initialBusy,
    io: { useAvailability, useBusyRanges, useOvernightNights, usePremiumDays },
    myBookings,
    initialQuantities: initial.quantities,
    initialPetIds: initial.petIds,
    initialSelectedStart,
    initialRange,
    canQuoteRef,
    runPreviewRef,
    clearOnSelectRef,
    clearOnIdleRef,
  });

  const {
    allowedSpecies,
    windowsLoading,
    windowsError,
    capabilities,
    schedulerData,
    range,
    stay,
    startsAt,
    endsAt,
    nights,
    petsOk,
    quantities,
    selectedPetIds,
    isPreviewing,
    setSelectedPetIds,
    requestQuote,
    onSelectionChange,
    onQuantitiesChange,
    onPetIdsChange,
  } = sched;

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

  // ── Edit-specific gate + preview/clear bodies, fed via refs ────────────────
  // Ref-only effect (no setState) — the repo's react-hooks/refs rule forbids
  // assigning ref.current during render. Runs synchronously after commit, well
  // before the 400ms timer fires. patch is read via patchRef so the timer sees a
  // fresh value at fire-time.
  const patchRef = useRef<EditBookingPatch>(patch);
  useEffect(() => {
    patchRef.current = patch;
    canQuoteRef.current =
      startsAt !== null && endsAt !== null && petsOk && !patchEmpty;
    runPreviewRef.current = async () => {
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
        case "forms_incomplete":
          setQuote(null);
          setApprovalWillReReview(false);
          setErrorMsg(
            "Finish your required forms before changing this booking — see Account → Forms.",
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
          // not_found/forbidden/error don't surface via previewEdit.
          // Block defensively but don't persist stale state.
          setQuote(null);
          setApprovalWillReReview(false);
          setErrorMsg("Couldn't preview this change. Please contact Cal.");
          setBlocked(true);
      }
    };
    clearOnSelectRef.current = () => {
      // NOTE: selection-change clears quote/errorMsg/blocked but NOT
      // approvalWillReReview (matches the original edit behavior).
      setQuote(null);
      setErrorMsg(null);
      setBlocked(false);
    };
    clearOnIdleRef.current = () => {
      setQuote(null);
      setApprovalWillReReview(false);
      setErrorMsg(null);
      setBlocked(false);
    };
  });

  // ── Save handler ────────────────────────────────────────────────────────────
  function handleSave() {
    if (patchEmpty || blocked) return;
    startSubmitting(async () => {
      const result = await editBooking({ bookingId, patch, forceConfirm });
      switch (result.kind) {
        case "success":
          toast.add({ type: "success", title: "Booking updated" });
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
        case "forms_incomplete":
          toast.add({
            title: "Forms required",
            description:
              "Finish your required forms before changing this booking — see Account → Forms.",
            type: "error",
          });
          break;
        case "validation_error":
          // Transient: user can fix input — keep Save available for retry.
          setErrorMsg(result.message);
          break;
        default:
          // price_locked | forbidden | invalid_status | blocked_debt |
          // onboarding_incomplete | not_found | error — not expected here,
          // but must not crash.
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
  // Quantities/pets use the shared hook's handlers directly (they trigger the
  // debounce). Comments lives in this wrapper, so it triggers the debounce here.
  function onCommentsChange(value: string) {
    setComments(value);
    requestQuote();
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
