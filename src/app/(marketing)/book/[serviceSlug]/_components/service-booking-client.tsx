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

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvailability } from "@/features/booking/use-availability";
import { useBusyRanges } from "@/features/booking/use-busy-ranges";
import { useOvernightNights } from "@/features/booking/use-overnight-nights";
import { validateStayRange } from "@/features/booking/calendar-model";
import { denverMidnight, denverDayKey } from "@/features/booking/availability";
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
import { PetAssignment, type AssignablePet } from "./pet-assignment";
import {
  QuantityForm,
  defaultQuantities,
  quantitiesToRecord,
  type QuantityState,
} from "./quantity-forms";
import { QuotePanel } from "./quote-panel";
import { RecurringControls } from "./recurring-controls";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/feedback/toast";
import { ErrorState } from "@/components/feedback/error-state";
import { centsToDollars } from "@/features/booking/format-money";
import {
  createResultMessage,
  previewResultMessage,
} from "../../_components/messages";
import type { UserMessage } from "../../_components/messages";
import type { DateRange } from "@/components/ui/calendar";
import type { PricingType } from "@/features/pricing/types";
import type {
  TimeRange,
  BookingRuleSettings,
} from "@/features/booking/availability";
import type { PublicBusyRange } from "@/features/booking/busy-ranges";
import type { BookingQuotePreview } from "@/features/booking/booking-service";
import type { Pet } from "@/features/accounts/account-actions";
import type { PetSpecies } from "@/features/booking/_components/pet-avatar";

// ── Props ─────────────────────────────────────────────────────────────────────

export type AuthState = "guest" | "needs-onboarding" | "ready";

export interface ServiceDetail {
  slug: string;
  name: string;
  description: string | null;
  pricingType: PricingType;
  defaultDurationMin: number | null;
}

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
  const durationMs = (service.defaultDurationMin ?? 60) * 60 * 1000;

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

  const [selectedSlot, setSelectedSlot] = useState<TimeRange | null>(() =>
    mode === "week-slots" && initialSelection.start && initialSelection.end
      ? {
          startsAt: new Date(initialSelection.start),
          endsAt: new Date(initialSelection.end),
        }
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
            intervalMinutes: service.defaultDurationMin ?? 60,
          },
    [mode, service.defaultDurationMin],
  );

  const schedulerData = useMemo<SchedulerData>(
    () => ({
      overnightNights,
      windows: openWindows,
      busy: busyRanges,
      busyResident: busyRanges,
      rules,
      now,
    }),
    [overnightNights, openWindows, busyRanges, rules, now],
  );

  // ── Bridge Scheduler selection → range / selectedSlot ────────────────────────
  const onSelectionChange = useCallback(
    (state: ScheduleSelectionState) => {
      if (mode === "month-range") {
        // selectedDays = the nights selected (dayKeys).
        // range.from = check-in night, range.to = check-out day (last night + 1).
        if (state.selectedDays.size === 0) {
          setRange(undefined);
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
      } else {
        // gridDraft: exactly one cell "dayKey@minute" → selectedSlot.
        if (state.gridDraft.size === 0) {
          setSelectedSlot(null);
          return;
        }
        const [cell] = state.gridDraft;
        const atIdx = cell.indexOf("@");
        if (atIdx === -1) return;
        const dayKey = cell.slice(0, atIdx);
        const minute = parseInt(cell.slice(atIdx + 1), 10);
        if (isNaN(minute)) return;
        const startsAtMs = denverMidnight(dayKey).getTime() + minute * 60_000;
        setSelectedSlot({
          startsAt: new Date(startsAtMs),
          endsAt: new Date(startsAtMs + durationMs),
        });
        setQuote(null);
        setPreviewMsg(null);
      }
    },
    [mode, durationMs, setRange, setSelectedSlot, setQuote, setPreviewMsg],
  );

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

  // ── Derived booking time ─────────────────────────────────────────────────────
  let startsAt: Date | null = null;
  let endsAt: Date | null = null;
  let nights: number | null = null;
  if (mode === "week-slots") {
    if (selectedSlot) {
      startsAt = selectedSlot.startsAt;
      endsAt = selectedSlot.endsAt;
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

  function handleGetQuote() {
    if (!hasSelection || !petsOk) return;
    startPreviewing(async () => {
      const result = await previewQuote(buildInput());
      const out = previewResultMessage(result);
      if (out.kind === "quote") {
        setQuote(out.preview);
        setPreviewMsg(null);
      } else {
        setQuote(null);
        setPreviewMsg(out.message);
      }
    });
  }

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

    startSubmitting(async () => {
      const result = await createBooking(buildInput());
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

  return (
    <div className="grid gap-8 pb-24 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:pb-0">
      {/* LEFT COLUMN */}
      <div className="flex flex-col gap-8">
        {/* 1. Calendar */}
        <section aria-labelledby="cal-heading">
          <h2
            id="cal-heading"
            className="text-brand-strong mb-3 text-xs font-semibold tracking-wide uppercase"
          >
            1. {mode === "month-range" ? "Pick your dates" : "Pick a time"}
          </h2>
          {windowsError && (
            <ErrorState
              title="Couldn't load availability"
              message={windowsError}
            />
          )}
          {windowsLoading && (
            <p className="text-muted-foreground text-sm">
              Loading availability…
            </p>
          )}
          {!windowsLoading && !windowsError && mode === "week-slots" && (
            <Scheduler
              capabilities={capabilities}
              data={schedulerData}
              onSelectionChange={onSelectionChange}
            >
              <Scheduler.WeekGrid />
              <Scheduler.Legend />
              <Scheduler.BookingDetailsPanel />
            </Scheduler>
          )}
          {!windowsLoading && !windowsError && mode === "month-range" && (
            <>
              <Scheduler
                capabilities={capabilities}
                data={schedulerData}
                onSelectionChange={onSelectionChange}
              >
                <Scheduler.MonthGrid />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <Scheduler.SelectionSummary />
                  <Scheduler.ClearDates />
                </div>
                <Scheduler.Legend />
                <Scheduler.BookingDetailsPanel />
              </Scheduler>
              {range?.from && range?.to && stay && !stay.ok && (
                <p className="text-destructive mt-2 text-sm">{stay.reason}</p>
              )}
              {stay?.ok && (
                <p className="text-muted-foreground mt-2 text-sm">
                  {stay.nights} night{stay.nights === 1 ? "" : "s"} selected.
                </p>
              )}
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
            {authState === "ready" ? (
              <PetAssignment
                pets={pets}
                allowedSpecies={allowedSpecies}
                selected={selectedPetIds}
                onChange={(ids) => {
                  setSelectedPetIds(ids);
                  clearQuote();
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
            {petAware ? "3" : "2"}. Details
          </h2>
          <QuantityForm
            state={quantities}
            onChange={(s) => {
              setQuantities(s);
              clearQuote();
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
              {petAware ? "4" : "3"}. Recurring (optional)
            </h2>
            <RecurringControls
              enabled={recurringOn}
              count={occurrenceCount}
              onEnabledChange={(on) => {
                setRecurringOn(on);
                clearQuote();
              }}
              onCountChange={(n) => {
                setOccurrenceCount(n);
                clearQuote();
              }}
            />
          </section>
        )}
      </div>

      {/* RIGHT RAIL (desktop sticky summary) */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
        {/* Quote section */}
        <section aria-labelledby="quote-heading">
          <h2
            id="quote-heading"
            className="text-brand-strong mb-3 text-xs font-semibold tracking-wide uppercase"
          >
            Get a price estimate
          </h2>
          <Button
            variant="outline"
            onClick={handleGetQuote}
            disabled={!hasSelection || !petsOk || isPreviewing || isSubmitting}
          >
            {isPreviewing ? "Loading…" : "Get quote"}
          </Button>
          {previewMsg && (
            <p role="alert" className="text-destructive mt-3 text-sm">
              {previewMsg.text}
            </p>
          )}
          {quote && (
            <div className="mt-4">
              <QuotePanel preview={quote} />
            </div>
          )}
        </section>

        {/* Book section */}
        {!submitDone && (
          <section aria-labelledby="book-heading">
            <h2
              id="book-heading"
              className="text-brand-strong mb-3 text-xs font-semibold tracking-wide uppercase"
            >
              Confirm booking
            </h2>
            <Button
              className="w-full"
              onClick={handleBook}
              disabled={!bookEnabled}
            >
              {isSubmitting ? "Submitting…" : "Book now"}
            </Button>
            {authState === "ready" && !quote && (
              <p className="text-muted-foreground mt-2 text-xs">
                Get a quote first to enable booking.
              </p>
            )}
          </section>
        )}
      </aside>

      {/* MOBILE STICKY BOTTOM BAR */}
      <div className="bg-card border-border fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="min-w-0">
          {quote ? (
            <span
              className="text-brand-strong text-lg"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {centsToDollars(quote.finalCents)}
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">Get a quote</span>
          )}
        </div>
        <Button
          onClick={quote ? handleBook : handleGetQuote}
          disabled={!hasSelection || !petsOk || isSubmitting || isPreviewing}
        >
          {quote
            ? isSubmitting
              ? "Submitting…"
              : "Book now"
            : isPreviewing
              ? "Loading…"
              : "Get quote"}
        </Button>
      </div>
    </div>
  );
}
