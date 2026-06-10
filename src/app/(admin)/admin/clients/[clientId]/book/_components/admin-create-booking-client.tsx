"use client";

/**
 * AdminCreateBookingClient — interactive create-on-behalf flow for admin.
 *
 * Adapted from the public ServiceBookingClient. Key differences:
 *   - Fixed client (clientId + clientName) — no deferred-auth gate, no returnTo.
 *   - Calls previewQuoteForClient / createBookingForClient (admin actions).
 *   - Admin identity header + force-confirm checkbox in the QuotePanel footer.
 *   - On success, redirects to /admin/clients/[clientId].
 *   - Recurring is fully supported (same RecurringControls as public flow).
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
import { useAvailability } from "@/features/booking/use-availability";
import { useBusyRanges } from "@/features/booking/use-busy-ranges";
import { useOvernightNights } from "@/features/booking/use-overnight-nights";
import { validateStayRange } from "@/features/booking/calendar-model";
import { denverMidnight, denverDayKey } from "@/features/booking/availability";
import { hourlySchedulerData } from "@/features/booking/hourly-scheduler-data";
import { createBookingForClient } from "@/features/booking/actions";
import { previewQuoteForClient } from "@/features/booking/preview-quote-for-client";
import { Scheduler } from "@/features/booking/_components/scheduler";
import {
  BOOK_HOUSE_SITTING_CAPABILITIES,
  BOOK_WALK_CAPABILITIES,
} from "@/features/booking/schedule-capabilities";
import type {
  SchedulerData,
  BusyBlock,
} from "@/features/booking/_components/scheduler";
import type { ScheduleSelectionState } from "@/features/booking/schedule-selection";
import {
  PetAssignment,
  type AssignablePet,
} from "@/features/booking/_components/pet-assignment";
import {
  QuantityForm,
  defaultQuantities,
  quantitiesToRecord,
  type QuantityState,
} from "@/features/booking/_components/quantity-forms";
import { QuotePanel } from "@/features/booking/_components/quote-panel";
import { RecurringControls } from "@/app/(marketing)/book/[serviceSlug]/_components/recurring-controls";
import { useToast } from "@/components/feedback/toast";
import { ErrorState } from "@/components/feedback/error-state";
import type { DateRange } from "@/components/ui/calendar";
import type { BookingRuleSettings } from "@/features/booking/availability";
import type { PublicBusyRange } from "@/features/booking/busy-ranges";
import type { BookingQuotePreview } from "@/features/booking/booking-service";
import type { Pet } from "@/features/accounts/account-actions";
import type { PetSpecies } from "@/features/booking/_components/pet-avatar";
import type { ServiceDetail } from "@/features/booking/service-detail";

// ── Props ─────────────────────────────────────────────────────────────────────

interface AdminCreateBookingClientProps {
  clientId: string;
  clientName: string;
  service: ServiceDetail;
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
  pets: AssignablePet[];
}

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

// ── Main ────────────────────────────────────────────────────────────────────────

export function AdminCreateBookingClient({
  clientId,
  clientName,
  service,
  rules,
  initialBusy,
  pets,
}: AdminCreateBookingClientProps) {
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
    () =>
      mode === "month-range"
        ? BOOK_HOUSE_SITTING_CAPABILITIES
        : {
            ...BOOK_WALK_CAPABILITIES,
            weekNavigable: false,
            intervalMinutes: durationMin,
          },
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
  const onSelectionChange = useCallback(
    (state: ScheduleSelectionState) => {
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
    },
    [mode],
  );

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

  // ── Render ─────────────────────────────────────────────────────────────────
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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 pb-12">
      <header className="mb-2">
        <p className="text-brand-strong text-xs font-semibold tracking-wide uppercase">
          Admin · booking on behalf
        </p>
        <p className="text-muted-foreground text-sm">
          for <span className="text-foreground font-medium">{clientName}</span>
        </p>
      </header>

      {/* 1. Calendar */}
      <section aria-labelledby="cal-heading">
        <h2
          id="cal-heading"
          className="text-brand-strong mb-3 text-xs font-semibold tracking-wide uppercase"
        >
          1. {mode === "month-range" ? "Pick your dates" : "Pick a day"}
        </h2>
        {windowsError && (
          <ErrorState
            title="Couldn't load availability"
            message={windowsError}
          />
        )}
        {windowsLoading && (
          <p className="text-muted-foreground text-sm">Loading availability…</p>
        )}
        {!windowsLoading && !windowsError && mode === "week-slots" && (
          <Scheduler
            capabilities={capabilities}
            data={schedulerData}
            onSelectionChange={onSelectionChange}
          >
            <Scheduler.MonthGrid />
            <Scheduler.Legend className="mt-5" />
            <div className="mt-6">
              <Scheduler.DayTimeline />
            </div>
            <Scheduler.BookingDetailsPanel />
          </Scheduler>
        )}
        {!windowsLoading && !windowsError && mode === "month-range" && (
          <>
            <p className="text-muted-foreground mb-3 text-sm">
              Click the two ends of the stay — in any order, and across months
              if needed. Highlighted days are the{" "}
              <span className="text-foreground font-medium">nights</span> Cal
              sleeps over; check-out is the morning after the last night.
            </p>
            <Scheduler
              capabilities={capabilities}
              data={schedulerData}
              onSelectionChange={onSelectionChange}
            >
              <Scheduler.MonthGrid />
              <div className="mt-5 flex h-8 items-center justify-between gap-3 overflow-hidden">
                <div className="flex items-baseline gap-2 whitespace-nowrap">
                  <Scheduler.SelectionSummary />
                  {stay?.ok && (
                    <span className="text-muted-foreground text-sm">
                      · {stay.nights} night{stay.nights === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <Scheduler.ClearDates />
              </div>
              <Scheduler.Legend className="mt-5" />
              <Scheduler.BookingDetailsPanel />
            </Scheduler>
            <p className="mt-2 min-h-5 text-sm" aria-live="polite">
              {range?.from && range?.to && stay && !stay.ok && (
                <span className="text-destructive">{stay.reason}</span>
              )}
            </p>
          </>
        )}
      </section>

      {/* 2. Pet assignment (pet-aware services) */}
      {petAware && (
        <section aria-labelledby="pets-heading">
          <h2
            id="pets-heading"
            className="text-brand-strong mb-3 text-xs font-semibold tracking-wide uppercase"
          >
            2. Which pets?
          </h2>
          <PetAssignment
            pets={pets}
            allowedSpecies={allowedSpecies}
            selected={selectedPetIds}
            onChange={(ids) => {
              setSelectedPetIds(ids);
              requestQuote();
            }}
            onPetAdded={handlePetAdded}
          />
        </section>
      )}

      {/* 3. Quantities */}
      <section aria-labelledby="qty-heading">
        <h2
          id="qty-heading"
          className="text-brand-strong mb-3 text-xs font-semibold tracking-wide uppercase"
        >
          {step3Label}. Details
        </h2>
        <QuantityForm
          state={quantities}
          onChange={(s) => {
            setQuantities(s);
            requestQuote();
          }}
        />
      </section>

      {/* 4. Recurring (time-bounded services only) */}
      {supportsRecurring && (
        <section aria-labelledby="recur-heading">
          <h2
            id="recur-heading"
            className="text-brand-strong mb-3 text-xs font-semibold tracking-wide uppercase"
          >
            {step4Label}. Recurring (optional)
          </h2>
          <RecurringControls
            enabled={recurringOn}
            count={occurrenceCount}
            onEnabledChange={(on) => {
              setRecurringOn(on);
              requestQuote();
            }}
            onCountChange={(n) => {
              setOccurrenceCount(n);
              requestQuote();
            }}
          />
        </section>
      )}

      {/* Receipt + Book */}
      <section aria-labelledby="receipt-heading" aria-live="polite">
        <h2 id="receipt-heading" className="sr-only">
          Price estimate
        </h2>
        {errorMsg && (
          <p role="alert" className="text-destructive mb-3 text-sm">
            {errorMsg}
          </p>
        )}
        {quote ? (
          <QuotePanel
            preview={quote}
            onBook={handleBook}
            bookLabel={isSubmitting ? "Creating…" : "Create booking"}
            bookDisabled={!bookEnabled}
            showBook={!submitDone}
            warnings={quote.warnings}
            footer={
              <label className="border-border bg-background flex items-start gap-2 rounded-md border p-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={forceConfirm}
                  onChange={(e) => setForceConfirm(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Confirm immediately</span> —
                  skip pending approval
                </span>
              </label>
            }
          />
        ) : (
          <div className="border-border bg-card text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            {isPreviewing
              ? "Calculating…"
              : "Select a day and time to see the price."}
          </div>
        )}
      </section>
    </div>
  );
}
