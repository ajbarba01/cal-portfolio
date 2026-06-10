"use client";

/**
 * ServiceBookingClient — the interactive per-service booking flow.
 *
 * Picks the calendar mode from the service's pricing_type:
 *   house_sitting → month-range (check-in/out dates); else → week-slots (times).
 *
 * All state/effects/handlers live in useServiceBooking; this component is a
 * thin wiring layer. See use-service-booking.ts for full logic documentation.
 *
 * DEFERRED-AUTH GATE: a guest / not-yet-onboarded user who clicks Book is bounced
 * to /login or /onboarding with a `returnTo` encoding their selection, then
 * returned here (rehydrated from the URL) to finish. createBooking keeps its own
 * server-side redirect("/login") backstop.
 */

import Link from "next/link";
import {
  Scheduler,
  PetAssignment,
  QuantityForm,
  QuotePanel,
} from "@/features/booking/index.client";
import type {
  BookingRuleSettings,
  PublicBusyRange,
  AssignablePet,
  ServiceDetail,
} from "@/features/booking/index.client";
import { RecurringControls } from "./recurring-controls";
import { ErrorState } from "@/components/feedback/error-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useServiceBooking } from "./use-service-booking";

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
  const {
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
    quote,
    previewMsg,
    isPreviewing,
    isSubmitting,
    submitDone,
    bookEnabled,
    guestLoginHref,
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
  } = useServiceBooking({
    service,
    rules,
    initialBusy,
    authState,
    pets,
    initialSelection,
    myBookingDayKeys,
  });

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
              onChange={onPetIdsChange}
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
        <QuantityForm state={quantities} onChange={onQuantitiesChange} />
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
            onEnabledChange={onRecurringOnChange}
            onCountChange={onOccurrenceCountChange}
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
