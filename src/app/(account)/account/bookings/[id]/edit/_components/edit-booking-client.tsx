"use client";

/**
 * EditBookingClient — interactive in-place edit of one existing booking.
 *
 * The "edit twin" of ServiceBookingClient: it mirrors that orchestrator's
 * week-slots vs month-range mode selection, pet-aware species, hourly-duration
 * derivation, availability/busy hooks, the Scheduler selection bridge, and the
 * debounced live-quote pattern — but drops the deferred-auth gate, returnTo, and
 * recurring controls (this route is already gated to a ready owner/admin, and a
 * series occurrence is edited as a single visit). It seeds every dimension from
 * the booking's current values, builds a patch from CHANGED dimensions only,
 * previews a live price delta via previewEdit, and commits via editBooking.
 *
 * All state/effects/handlers live in useEditBooking; this component is a
 * thin wiring layer. See use-edit-booking.ts for full logic documentation.
 */

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
  QuantityState,
  ServiceDetail,
} from "@/features/booking/index.client";
import { ErrorState } from "@/components/feedback/error-state";
import { useEditBooking } from "./use-edit-booking";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface EditBookingInitial {
  startsAtIso: string;
  endsAtIso: string;
  petIds: string[];
  quantities: QuantityState;
  comments: string;
  /** true if current status === "confirmed" (drives approvalWillReReview). */
  wasConfirmed: boolean;
  /** series_id != null → render the per-occurrence note. */
  isSeriesOccurrence: boolean;
}

interface EditBookingClientProps {
  bookingId: string;
  service: ServiceDetail;
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
  pets: AssignablePet[];
  /** Current booking total (cents) — for the price delta. */
  priorFinalCents: number;
  initial: EditBookingInitial;
  /** When set, the surface runs in admin (on-behalf) mode. */
  admin?: {
    clientName: string;
    clientId: string;
    /** paidCents > 0 → price-affecting controls (pets/quantities) disabled. */
    paidLock: boolean;
  };
}

// ── Main ────────────────────────────────────────────────────────────────────────

export function EditBookingClient({
  bookingId,
  service,
  rules,
  initialBusy,
  pets,
  priorFinalCents,
  initial,
  admin,
}: EditBookingClientProps) {
  const {
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
  } = useEditBooking({
    bookingId,
    service,
    rules,
    initialBusy,
    initial,
    admin,
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 pb-12">
      {admin && (
        <header className="mb-2">
          <p className="text-brand-strong text-xs font-semibold tracking-wide uppercase">
            Admin · editing on behalf
          </p>
          <p className="text-muted-foreground text-sm">
            for{" "}
            <span className="text-foreground font-medium">
              {admin.clientName}
            </span>
          </p>
        </header>
      )}
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
            initialSlot={initialSlot}
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
            {step2Label}. Which pets?
          </h2>
          {admin?.paidLock ? (
            <p className="text-muted-foreground border-border bg-muted/30 rounded-lg border p-3 text-sm">
              <span aria-hidden="true">🔒</span> This booking is paid — pets and
              price can&apos;t change here. Manage price in Payments (coming
              soon).
            </p>
          ) : (
            <PetAssignment
              pets={pets}
              allowedSpecies={allowedSpecies}
              selected={selectedPetIds}
              onChange={onPetIdsChange}
              onPetAdded={handlePetAdded}
            />
          )}
        </section>
      )}

      {/* 3. Quantities */}
      {!admin?.paidLock && (
        <section aria-labelledby="qty-heading">
          <h2
            id="qty-heading"
            className="text-brand-strong mb-3 text-xs font-semibold tracking-wide uppercase"
          >
            {step3Label}. Details
          </h2>
          <QuantityForm state={quantities} onChange={onQuantitiesChange} />
        </section>
      )}

      {/* 4. Comments */}
      <section aria-labelledby="comments-heading">
        <h2
          id="comments-heading"
          className="text-brand-strong mb-3 text-xs font-semibold tracking-wide uppercase"
        >
          {step4Label}. Notes for Cal (optional)
        </h2>
        <label htmlFor="edit-comments" className="sr-only">
          Notes for Cal
        </label>
        <textarea
          id="edit-comments"
          value={comments}
          onChange={(e) => onCommentsChange(e.target.value)}
          rows={3}
          placeholder="Anything Cal should know about this visit?"
          className="border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full resize-y rounded-lg border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
      </section>

      {/* Receipt + Save */}
      <section aria-labelledby="receipt-heading" aria-live="polite">
        <h2 id="receipt-heading" className="sr-only">
          Your updated price
        </h2>

        {initial.isSeriesOccurrence && (
          <p className="text-muted-foreground mb-3 text-sm">
            This changes this visit only — your other recurring visits stay as
            they are.
          </p>
        )}

        {errorMsg && (
          <p role="alert" className="text-destructive mb-3 text-sm">
            {errorMsg}
          </p>
        )}

        {quote ? (
          <QuotePanel
            preview={quote}
            priorFinalCents={priorFinalCents}
            approvalWillReReview={approvalWillReReview && !forceConfirm}
            warnings={admin ? quote.warnings : undefined}
            footer={
              admin ? (
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
              ) : undefined
            }
            onBook={handleSave}
            bookLabel={isSubmitting ? "Saving…" : "Save changes"}
            bookDisabled={saveDisabled}
            showBook
          />
        ) : (
          <div className="border-border bg-card text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            {isPreviewing
              ? "Calculating…"
              : patchEmpty
                ? "Change a detail above to see your updated price."
                : "Adjust your selection to see your updated price."}
          </div>
        )}
      </section>
    </div>
  );
}
