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
  BookingFlow,
  BookingFlowStepHead,
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
    <BookingFlow
      flow={{
        mode,
        windowsLoading,
        windowsError,
        capabilities,
        schedulerData,
        range,
        stay,
        onSelectionChange,
      }}
      rules={rules}
      monthRangeIntro={
        <>
          Click the two ends of your stay — in any order, and across months if
          needed. Highlighted days are the{" "}
          <span className="text-foreground font-medium">nights</span> Cal sleeps
          over; check-out is the morning after the last night.
        </>
      }
      petSection={
        petAware && (
          <section aria-labelledby="pets-heading">
            <BookingFlowStepHead
              num={step2Label}
              label="Which pets?"
              labelId="pets-heading"
            />
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
        )
      }
      detailsSection={
        <section aria-labelledby="qty-heading">
          <BookingFlowStepHead
            num={step3Label}
            label="Details"
            labelId="qty-heading"
          />
          <QuantityForm state={quantities} onChange={onQuantitiesChange} />
        </section>
      }
      extraSection={
        supportsRecurring && (
          <section aria-labelledby="recur-heading">
            <BookingFlowStepHead
              num={step4Label}
              label="Repeat weekly?"
              labelId="recur-heading"
              hint="optional"
            />
            <RecurringControls
              enabled={recurringOn}
              count={occurrenceCount}
              onEnabledChange={onRecurringOnChange}
              onCountChange={onOccurrenceCountChange}
            />
          </section>
        )
      }
      receipt={
        <>
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
        </>
      }
    />
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
