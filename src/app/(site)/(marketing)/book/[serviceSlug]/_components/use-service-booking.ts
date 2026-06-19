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
 * The required-forms gate is derived client-side from pet selection + form
 * freshness timestamps (not the price quote), so it reacts to pet changes with
 * no date selected; the server stays authoritative at create time.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bookingRequirements,
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
  RECURRING_UI_ENABLED,
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
  RequirementItem,
  AccountFormKey,
  PetFormKey,
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
  /** Server-seeded premium (holiday) day-keys. */
  initialPremiumDays?: string[];
  authState: AuthState;
  pets: AssignablePet[];
  initialSelection: InitialSelection;
  myBookingDayKeys: string[];
  /** Server-loaded form responses (keyed by form_key or `${form_key}:${pet_id}`). */
  formResponses?: Record<
    string,
    { data: Record<string, unknown>; submittedAt: string | null }
  >;
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
   * True when any required profile is missing or stale — computed client-side
   * from pet selection + form timestamps, independent of the quote.
   */
  formsIncomplete: boolean;
  /** All profile requirements for the current selection (empty when auth !== "ready"). */
  profileRequirements: RequirementItem[];
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
  formResponses = {},
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

  // ── Client-side requirements gate — driven by pet selection + timestamps ────
  // Mirrors the server's computeBookingArtifacts shape so the display gate is
  // always current: no date/quote needed. After a form save, refreshRequirements
  // calls router.refresh() so the page re-fetches submitted_at from the server.
  const profileRequirements: RequirementItem[] = useMemo(() => {
    if (authState !== "ready") return [];
    const assignedPets = pets
      .filter((p) => selectedPetIds.includes(p.id))
      .map((p) => ({ id: p.id, name: p.name, species: p.species }));

    const accountForms: Partial<Record<AccountFormKey, string | null>> = {
      owner: formResponses["owner"]?.submittedAt ?? null,
      home_access: formResponses["home_access"]?.submittedAt ?? null,
      home_sitting: formResponses["home_sitting"]?.submittedAt ?? null,
    };
    const petForms: Record<
      string,
      Partial<Record<PetFormKey, string | null>>
    > = {};
    for (const p of assignedPets) {
      petForms[p.id] = {
        pet_care: formResponses[`pet_care:${p.id}`]?.submittedAt ?? null,
        pet_walk: formResponses[`pet_walk:${p.id}`]?.submittedAt ?? null,
      };
    }
    return bookingRequirements({
      pricingType: service.pricingType,
      assignedPets,
      accountForms,
      petForms,
      now: new Date(),
    });
  }, [authState, pets, selectedPetIds, formResponses, service.pricingType]);

  const formsIncomplete = useMemo(
    () => profileRequirements.some((r) => r.status !== "complete"),
    [profileRequirements],
  );

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
        // The receipt computes regardless of form state: show the price.
        // Requirements are now derived client-side from pet selection + timestamps.
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
        // toast informs the user; router.refresh() re-fetches timestamps so
        // the derived gate re-evaluates automatically.
        if (result.kind === "profiles_incomplete") {
          router.refresh();
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
    router.refresh();
  }

  function resetFlow() {
    resetScheduler();
    setQuote(null);
    setPreviewMsg(null);
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
  const recurringStepLabel =
    supportsRecurring && RECURRING_UI_ENABLED ? String(++stepCounter) : "";
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
