"use client";

/**
 * useAdminCreateBooking — the admin on-behalf "create booking for client" flow.
 *
 * Thin wrapper over the shared `useBookingScheduler` substrate (SP3b A13): the
 * shared hook owns all scheduler state/derivation/selection-bridge/debounce; this
 * file adds ONLY the admin-specific deltas — its quote-state ({quote, errorMsg,
 * forceConfirm, submitDone}), the previewQuoteForClient body + result switch, the
 * book/submit handler, and its return-shape extras (bookEnabled, setForceConfirm).
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
  validateStayRange,
  createBookingForClient,
  previewQuoteForClient,
  defaultQuantities,
} from "@/features/booking/index.client";
import type {
  SchedulerData,
  ScheduleSelectionState,
  BookingRuleSettings,
  PublicBusyRange,
  BookingQuotePreview,
  AssignablePet,
  QuantityState,
  PetSpecies,
  ServiceDetail,
  UseBookingSchedulerReturn,
} from "@/features/booking/index.client";
import type { Pet } from "@/features/accounts";
import { useToast } from "@/components/feedback/toast";
import type { DateRange } from "@/components/ui/calendar";

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
  capabilities: UseBookingSchedulerReturn["capabilities"];
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

  // ── Seeds for the shared hook (admin starts empty/default) ─────────────────
  // No existing-booking day-keys for admin create (empty set).
  const myBookings = useMemo(() => new Set<string>(), []);
  const initialQuantities = useMemo(
    () => defaultQuantities(service.pricingType),
    [service.pricingType],
  );

  // ── Wrapper-owned quote-state ──────────────────────────────────────────────
  const [quote, setQuote] = useState<BookingQuotePreview | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [forceConfirm, setForceConfirm] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);

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
    io: { useAvailability, useBusyRanges, useOvernightNights },
    myBookings,
    initialQuantities,
    initialPetIds: [],
    initialSelectedStart: null,
    initialRange: undefined,
    canQuoteRef,
    runPreviewRef,
    clearOnSelectRef,
    clearOnIdleRef,
  });

  const {
    petAware,
    allowedSpecies,
    supportsRecurring,
    windowsLoading,
    windowsError,
    capabilities,
    schedulerData,
    range,
    stay,
    startsAt,
    endsAt,
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
    onSelectionChange,
    onQuantitiesChange,
    onPetIdsChange,
    onRecurringOnChange,
    onOccurrenceCountChange,
  } = sched;

  // ── Admin-specific gate + preview/clear bodies, fed via refs ───────────────
  // Ref-only effect (no setState) — the repo's react-hooks/refs rule forbids
  // assigning ref.current during render. Runs synchronously after commit, well
  // before the 400ms timer fires.
  useEffect(() => {
    canQuoteRef.current = hasSelection && petsOk;
    runPreviewRef.current = async () => {
      const input = buildSelectionInput();
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
          setErrorMsg("Client onboarding is incomplete. Admin policy applies.");
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
    };
    clearOnSelectRef.current = () => {
      setQuote(null);
      setErrorMsg(null);
    };
    clearOnIdleRef.current = () => {
      setQuote(null);
      setErrorMsg(null);
    };
  });

  // ── Book handler ──────────────────────────────────────────────────────────
  function handleBook() {
    if (!startsAt || !endsAt || !petsOk) return;

    startSubmitting(async () => {
      const input = buildSelectionInput();
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
    setQuote(null);
    setErrorMsg(null);
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
