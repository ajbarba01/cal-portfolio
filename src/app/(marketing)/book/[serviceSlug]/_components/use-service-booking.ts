"use client";

/**
 * useServiceBooking — the per-service self-serve booking flow.
 *
 * Thin wrapper over the shared `useBookingScheduler` substrate (SP3b A13): the
 * shared hook owns all scheduler state/derivation/selection-bridge/debounce; this
 * file adds ONLY the service-specific deltas — its quote-state ({quote,
 * previewMsg, submitDone}), its preview body (previewQuote → previewResultMessage),
 * its quote gate (auth-aware), its book/submit handler, and its return-shape extras.
 *
 * The component calls this hook and wires its return value to JSX/props.
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
  localDateFromKey,
  denverDayKey,
  buildReturnTo,
  previewQuote,
  createBooking,
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
  validateStayRange,
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

// ── Success snapshot (U1) ─────────────────────────────────────────────────────

/**
 * Snapshot of the booking captured at createBooking success — drives the
 * terminal success panel. Captured (not derived live) because the post-success
 * busy refresh can re-derive calendar state while the panel is shown.
 */
export interface BookingSuccessInfo {
  /** True when the booking landed in pending_approval (copy variant). */
  requiresApproval: boolean;
  startsAt: Date;
  endsAt: Date;
  /** Names of the assigned pets ([] for non-pet-aware services). */
  petNames: string[];
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
  capabilities: UseBookingSchedulerReturn["capabilities"];
  schedulerData: SchedulerData;

  // Selection state (for JSX display)
  range: DateRange | undefined;
  stay: ReturnType<typeof validateStayRange> | null;
  /** Resolved booking start instant (null when no valid selection). */
  startsAt: Date | null;
  /** Resolved booking end instant (null when no valid selection). */
  endsAt: Date | null;
  hasSelection: boolean;
  petsOk: boolean;

  // Quote / submit state
  quote: BookingQuotePreview | null;
  previewMsg: UserMessage | null;
  isPreviewing: boolean;
  isSubmitting: boolean;
  submitDone: boolean;
  /** Non-null after createBooking success — renders the terminal panel (U1). */
  success: BookingSuccessInfo | null;
  bookEnabled: boolean;
  guestLoginHref: string;
  /** Resets all booking state so the user can book again ("Book another"). */
  resetFlow: () => void;

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

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useServiceBooking({
  service,
  rules,
  initialBusy,
  authState,
  pets,
  initialSelection,
  myBookingDayKeys,
}: UseServiceBookingInput): UseServiceBookingReturn {
  const router = useRouter();
  const toast = useToast();

  const mode: "week-slots" | "month-range" =
    service.pricingType === "house_sitting" ? "month-range" : "week-slots";

  // ── Seeds for the shared hook (selection rehydrated from returnTo round-trip) ──
  const myBookings = useMemo(
    () => new Set(myBookingDayKeys),
    [myBookingDayKeys],
  );
  const initialQuantities = useMemo(
    () => defaultQuantities(service.pricingType),
    [service.pricingType],
  );
  // Seeds consumed once by the shared hook's lazy useState init.
  const initialSelectedStart = useMemo<Date | null>(
    () =>
      mode === "week-slots" && initialSelection.start
        ? new Date(initialSelection.start)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const initialRange = useMemo<DateRange | undefined>(
    () =>
      mode === "month-range" && initialSelection.start && initialSelection.end
        ? {
            from: localDateFromKey(
              denverDayKey(new Date(initialSelection.start)),
            ),
            to: localDateFromKey(denverDayKey(new Date(initialSelection.end))),
          }
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── Wrapper-owned quote-state ──────────────────────────────────────────────
  const [quote, setQuote] = useState<BookingQuotePreview | null>(null);
  const [previewMsg, setPreviewMsg] = useState<UserMessage | null>(null);
  // U1: success snapshot — non-null is the flow's terminal state.
  const [success, setSuccess] = useState<BookingSuccessInfo | null>(null);
  const submitDone = success !== null;

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
    initialPetIds: initialSelection.petIds,
    initialSelectedStart,
    initialRange,
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
    resetScheduler,
    onSelectionChange,
    onQuantitiesChange,
    onPetIdsChange,
    onRecurringOnChange,
    onOccurrenceCountChange,
  } = sched;

  // ── Service-specific gate + preview/clear bodies, fed via refs ─────────────
  // Ref-only effect (no setState) — the repo's react-hooks/refs rule forbids
  // assigning ref.current during render. Runs synchronously after commit, well
  // before the 400ms timer fires.
  useEffect(() => {
    // Non-ready users never get a server quote — the price box shows an auth
    // prompt instead, so skip the round-trip entirely.
    canQuoteRef.current = hasSelection && petsOk && authState === "ready";
    runPreviewRef.current = async () => {
      const result = await previewQuote(buildSelectionInput());
      const out = previewResultMessage(result);
      if (out.kind === "quote") {
        setQuote(out.preview);
        setPreviewMsg(null);
      } else {
        setQuote(null);
        setPreviewMsg(out.message);
      }
    };
    clearOnSelectRef.current = () => {
      setQuote(null);
      setPreviewMsg(null);
    };
    clearOnIdleRef.current = () => {
      setQuote(null);
      setPreviewMsg(null);
    };
  });

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
      const result = await createBooking(buildSelectionInput());
      if (result.kind === "onboarding_incomplete") {
        router.push("/onboarding");
        return;
      }
      if (result.kind === "success") {
        // U1: capture the snapshot for the terminal success panel. No toast —
        // the panel replaces the flow and is the success feedback.
        setSuccess({
          requiresApproval: quote?.requiresApproval ?? true,
          startsAt,
          endsAt,
          petNames: petAware
            ? pets
                .filter((p) => selectedPetIds.includes(p.id))
                .map((p) => p.name)
            : [],
        });
      } else {
        const msg = createResultMessage(
          result,
          quote?.requiresApproval ?? true,
        );
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

  function resetFlow() {
    resetScheduler();
    setQuote(null);
    setPreviewMsg(null);
    setSuccess(null);
  }

  function handlePetAdded(pet: Pet) {
    setSelectedPetIds((prev) => [...prev, pet.id]);
    setQuote(null);
    setPreviewMsg(null);
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
    startsAt,
    endsAt,
    hasSelection,
    petsOk,
    quote,
    previewMsg,
    isPreviewing,
    isSubmitting,
    submitDone,
    success,
    bookEnabled,
    guestLoginHref,
    resetFlow,
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
