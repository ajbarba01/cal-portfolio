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
  usePremiumDays,
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
import type { RequirementItem } from "@/features/booking/index.client";
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
  /** Server-seeded premium (holiday) day-keys. */
  initialPremiumDays?: string[];
  authState: AuthState;
  pets: AssignablePet[];
  initialSelection: InitialSelection;
  myBookingDayKeys: string[];
  /** Viewer's one-way drive buffer in whole minutes (0 = unknown / guest). */
  viewerDriveBufferMin?: number;
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
  maxPets: number | null;
  supportsRecurring: boolean;
  durationBounds: { minHours: number; maxHours?: number };

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
  /**
   * True when the previewed booking has one or more required profiles missing or
   * stale (derived from `quote.requirements`). The price box still renders; this
   * only disables the Book button and shows the inline requirements gate.
   */
  formsIncomplete: boolean;
  /** The unmet (and met) profile requirements backing the gate checklist. */
  profileRequirements: RequirementItem[] | null;
  isPreviewing: boolean;
  isSubmitting: boolean;
  submitDone: boolean;
  /** Non-null after createBooking success — renders the terminal panel (U1). */
  success: BookingSuccessInfo | null;
  bookEnabled: boolean;
  guestLoginHref: string;
  /** Resets all booking state so the user can book again ("Book another"). */
  resetFlow: () => void;
  /** Re-runs the preview so the gate re-evaluates after a form save. */
  refreshRequirements: () => void;

  // Quantities / pets / recurring / comments (for controlled inputs)
  quantities: QuantityState;
  selectedPetIds: string[];
  recurringOn: boolean;
  occurrenceCount: number;
  comments: string;
  kicheWelcome: boolean;

  // Step labels
  /** Step numbers, derived sequentially from which sections are present. */
  petStepLabel: string;
  detailsStepLabel: string;
  recurringStepLabel: string;
  formsStepLabel: string;
  notesStepLabel: string;

  // Event handlers
  onSelectionChange: (state: ScheduleSelectionState) => void;
  handleBook: () => void;
  handlePetAdded: (pet: Pet) => void;
  onQuantitiesChange: (s: QuantityState) => void;
  onPetIdsChange: (ids: string[]) => void;
  onRecurringOnChange: (on: boolean) => void;
  onOccurrenceCountChange: (n: number) => void;
  onCommentsChange: (v: string) => void;
  onKicheWelcomeChange: (v: boolean) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useServiceBooking({
  service,
  rules,
  initialBusy,
  initialPremiumDays = [],
  authState,
  pets,
  initialSelection,
  myBookingDayKeys,
  viewerDriveBufferMin = 0,
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
  const [comments, setComments] = useState("");
  // Client consent that Kiche may tag along (house-sitting / walk). Default on.
  // Consent only — never affects the quote, so it's omitted from the preview input.
  const [kicheWelcome, setKicheWelcome] = useState(true);
  const [previewMsg, setPreviewMsg] = useState<UserMessage | null>(null);
  const [formsIncomplete, setFormsIncomplete] = useState(false);
  const [profileRequirements, setProfileRequirements] = useState<
    RequirementItem[] | null
  >(null);
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
    initialPremiumDays,
    io: { useAvailability, useBusyRanges, useOvernightNights, usePremiumDays },
    myBookings,
    initialQuantities,
    initialPetIds: initialSelection.petIds,
    initialSelectedStart,
    initialRange,
    canQuoteRef,
    runPreviewRef,
    clearOnSelectRef,
    clearOnIdleRef,
    viewerDriveBufferMin,
  });

  const {
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
        // The receipt computes regardless of form state: show the price, then
        // derive the gate from the requirements that ride along on the preview.
        setQuote(out.preview);
        setPreviewMsg(null);
        const reqs = out.preview.requirements;
        setProfileRequirements(reqs);
        setFormsIncomplete(reqs.some((r) => r.status !== "complete"));
      } else {
        setQuote(null);
        setPreviewMsg(out.message);
        setFormsIncomplete(false);
        setProfileRequirements(null);
      }
    };
    clearOnSelectRef.current = () => {
      setQuote(null);
      setPreviewMsg(null);
      setFormsIncomplete(false);
      setProfileRequirements(null);
    };
    clearOnIdleRef.current = () => {
      setQuote(null);
      setPreviewMsg(null);
      setFormsIncomplete(false);
      setProfileRequirements(null);
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
      const selInput = buildSelectionInput();
      const result = await createBooking({
        ...selInput,
        comments: comments.trim() || undefined,
        kicheWelcome,
      });
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
        // Backstop: Book is disabled while formsIncomplete, but if a create still
        // returns profiles_incomplete (e.g. a profile went stale mid-session),
        // re-surface the gate so the client knows what to finish.
        if (result.kind === "profiles_incomplete") {
          setFormsIncomplete(true);
          setProfileRequirements(result.requirements);
        }
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

  function refreshRequirements() {
    void runPreviewRef.current();
  }

  function resetFlow() {
    resetScheduler();
    setQuote(null);
    setPreviewMsg(null);
    setFormsIncomplete(false);
    setProfileRequirements(null);
    setSuccess(null);
    setComments("");
    setKicheWelcome(true);
  }

  function handlePetAdded(pet: Pet) {
    // Respect the per-service cap: single-select services (training) replace the
    // selection rather than appending, so adding a pet can't leave two selected.
    setSelectedPetIds((prev) => (maxPets === 1 ? [pet.id] : [...prev, pet.id]));
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
    !formsIncomplete &&
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

  // Step numbering. Schedule is step 1; each section that renders takes the next
  // number. Pets appear for pet-aware services, recurring only when supported;
  // the required-forms step and notes always render (forms = its own step before
  // notes).
  let stepCounter = 1;
  const petStepLabel = petAware ? String(++stepCounter) : "";
  const detailsStepLabel = String(++stepCounter);
  const recurringStepLabel = supportsRecurring ? String(++stepCounter) : "";
  const formsStepLabel = String(++stepCounter);
  const notesStepLabel = String(++stepCounter);

  function onCommentsChange(v: string) {
    setComments(v);
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
    hasSelection,
    petsOk,
    quote,
    previewMsg,
    formsIncomplete,
    profileRequirements,
    isPreviewing,
    isSubmitting,
    submitDone,
    success,
    bookEnabled,
    guestLoginHref,
    resetFlow,
    refreshRequirements,
    quantities,
    selectedPetIds,
    recurringOn,
    occurrenceCount,
    comments,
    kicheWelcome,
    onKicheWelcomeChange: setKicheWelcome,
    petStepLabel,
    detailsStepLabel,
    recurringStepLabel,
    formsStepLabel,
    notesStepLabel,
    onSelectionChange,
    handleBook,
    handlePetAdded,
    onQuantitiesChange,
    onPetIdsChange,
    onRecurringOnChange,
    onOccurrenceCountChange,
    onCommentsChange,
  };
}
