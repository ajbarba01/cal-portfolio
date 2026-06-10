"use client";

/**
 * ServiceBookingClient — the interactive per-service booking flow.
 *
 * Picks the calendar mode from the service's pricing_type:
 *   house_sitting → month-range (check-in/out dates); else → week-slots (times).
 *
 * Owns all booking business state; the compound <Scheduler> (and its nested
 * parts) are presentational. Busy availability comes from the service-role `useBusyRanges`
 * source (identity-free); open windows from `useAvailability`. Pet-aware services
 * (house_sitting, walk) assign real pets — the server derives dog/cat counts.
 *
 * DEFERRED-AUTH GATE: a guest / not-yet-onboarded user who clicks Book is bounced
 * to /login or /onboarding with a `returnTo` encoding their selection, then
 * returned here (rehydrated from the URL) to finish. createBooking keeps its own
 * server-side redirect("/login") backstop.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAvailability } from "@/features/booking/use-availability";
import { useBusyRanges } from "@/features/booking/use-busy-ranges";
import { useOvernightNights } from "@/features/booking/use-overnight-nights";
import { validateStayRange } from "@/features/booking/calendar-model";
import { denverMidnight, denverDayKey } from "@/features/booking/availability";
import { hourlySchedulerData } from "@/features/booking/hourly-scheduler-data";
import { buildReturnTo } from "@/features/booking/return-to";
import { previewQuote } from "@/features/booking/quote-action";
import { createBooking } from "@/features/booking/actions";
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
import { RecurringControls } from "./recurring-controls";
import { useToast } from "@/components/feedback/toast";
import { ErrorState } from "@/components/feedback/error-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createResultMessage,
  previewResultMessage,
} from "../../_components/messages";
import type { UserMessage } from "../../_components/messages";
import type { DateRange } from "@/components/ui/calendar";
import type { BookingRuleSettings } from "@/features/booking/availability";
import type { PublicBusyRange } from "@/features/booking/busy-ranges";
import type { BookingQuotePreview } from "@/features/booking/booking-service";
import type { Pet } from "@/features/accounts/account-actions";
import type { PetSpecies } from "@/features/booking/_components/pet-avatar";
import type { ServiceDetail } from "@/features/booking/service-detail";

export type { ServiceDetail };

// ── Props ─────────────────────────────────────────────────────────────────────

export type AuthState =
  | "guest"
  | "needs-info"
  | "needs-meet-greet"
  | "declined"
  | "ready";

export interface InitialSelection {
  start: string | null;
  end: string | null;
  petIds: string[];
}

interface ServiceBookingClientProps {
  service: ServiceDetail;
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
  authState: AuthState;
  pets: AssignablePet[];
  initialSelection: InitialSelection;
  /** Denver day-keys where this client already has an active booking (your-booking dot). */
  myBookingDayKeys: string[];
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

export function ServiceBookingClient({
  service,
  rules,
  initialBusy,
  authState,
  pets,
  initialSelection,
  myBookingDayKeys,
}: ServiceBookingClientProps) {
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

  // ── Render ─────────────────────────────────────────────────────────────────
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
  const step2Label = petAware ? "2" : "2";
  const step3Label = petAware ? "3" : "2";
  const step4Label = petAware ? "4" : "3";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 pb-12">
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
            {/* Legend sits directly under the month (B2), before the timeline. */}
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
              Click the two ends of your stay — in any order, and across months
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
              {/* Fixed-height summary row: nights live inline (never a new line)
                    and the Clear-dates slot is always reserved, so selecting a
                    range changes only text/opacity — never layout height. */}
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
            {/* Reserved-height line for the invalid-range message only. */}
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
            {step2Label}. Which pets?
          </h2>
          {authState === "ready" ? (
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
          ) : (
            <p className="text-muted-foreground text-sm">
              You&apos;ll assign your pets after signing in.
            </p>
          )}
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

      {/* ── Gate panels — shown instead of the price box when not ready ── */}
      {authState === "guest" && (
        <GatePanel
          labelledById="gate-guest-heading"
          title="Sign in to book"
          body="Log in to get a quote and complete your booking."
          ctaHref={guestLoginHref}
          ctaLabel="Log in →"
        />
      )}

      {authState === "needs-info" && (
        <GatePanel
          labelledById="gate-info-heading"
          title="Finish setting up your profile"
          body="Finish your profile and emergency info to book."
          ctaHref="/onboarding"
          ctaLabel="Complete profile →"
        />
      )}

      {authState === "needs-meet-greet" && (
        <GatePanel
          labelledById="gate-mg-heading"
          title="Meet & greet required"
          body="A free, in-person meet & greet is required before your first booking — a chance to get introduced before any pet care."
          ctaHref="/onboarding"
          ctaLabel="Schedule meet & greet →"
        />
      )}

      {authState === "declined" && (
        <GatePanel
          labelledById="gate-declined-heading"
          title="Your account needs attention"
          body="We need to sort out your account before you can book. Please get in touch and we'll help."
          ctaHref="/onboarding"
          ctaLabel="View details →"
        />
      )}

      {/* Receipt + Book — only for ready users */}
      {authState === "ready" && (
        <section aria-labelledby="receipt-heading" aria-live="polite">
          <h2 id="receipt-heading" className="sr-only">
            Your price
          </h2>
          {previewMsg && (
            <p role="alert" className="text-destructive mb-3 text-sm">
              {previewMsg.text}
            </p>
          )}
          {quote ? (
            <QuotePanel
              preview={quote}
              onBook={handleBook}
              bookLabel={isSubmitting ? "Submitting…" : "Book now"}
              bookDisabled={!bookEnabled}
              showBook={!submitDone}
            />
          ) : (
            <div className="border-border bg-card text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
              {isPreviewing
                ? "Calculating…"
                : "Select a day and time to see your price."}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ── Gate panel ──────────────────────────────────────────────────────────────
// Shared CTA card shown (instead of the price box) when the viewer can't book
// yet: guest, needs-info, needs-meet-greet, or declined. One structure so the
// four states stay visually + a11y consistent.
function GatePanel({
  labelledById,
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  labelledById: string;
  title: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <section aria-labelledby={labelledById}>
      <div className="bg-card border-border rounded-xl border p-6">
        <h2
          id={labelledById}
          className="font-heading text-foreground mb-1 text-base font-semibold"
        >
          {title}
        </h2>
        <p className="text-muted-foreground mb-4 text-sm">{body}</p>
        <Link
          href={ctaHref}
          className={cn(
            buttonVariants({ variant: "brand" }),
            "w-full sm:w-auto",
          )}
        >
          {ctaLabel}
        </Link>
      </div>
    </section>
  );
}
