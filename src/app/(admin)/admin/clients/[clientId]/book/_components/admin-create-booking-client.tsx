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
 *
 * All state/effects/handlers live in useAdminCreateBooking; this component is
 * a thin wiring layer. See use-admin-create-booking.ts for full logic documentation.
 */

import {
  BookingFlow,
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
import { RecurringControls } from "@/app/(marketing)/book/[serviceSlug]/_components/recurring-controls";
import { useAdminCreateBooking } from "./use-admin-create-booking";

// ── Props ─────────────────────────────────────────────────────────────────────

interface AdminCreateBookingClientProps {
  clientId: string;
  clientName: string;
  service: ServiceDetail;
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
  pets: AssignablePet[];
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
  } = useAdminCreateBooking({
    clientId,
    clientName,
    service,
    rules,
    initialBusy,
    pets,
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
      monthRangeIntro={
        <>
          Click the two ends of the stay — in any order, and across months if
          needed. Highlighted days are the{" "}
          <span className="text-foreground font-medium">nights</span> Cal sleeps
          over; check-out is the morning after the last night.
        </>
      }
      header={
        <header className="mb-2">
          <p className="text-brand-strong text-xs font-semibold tracking-wide uppercase">
            Admin · booking on behalf
          </p>
          <p className="text-muted-foreground text-sm">
            for{" "}
            <span className="text-foreground font-medium">{clientName}</span>
          </p>
        </header>
      }
      petSection={
        petAware && (
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
              onChange={onPetIdsChange}
              onPetAdded={handlePetAdded}
            />
          </section>
        )
      }
      detailsSection={
        <section aria-labelledby="qty-heading">
          <h2
            id="qty-heading"
            className="text-brand-strong mb-3 text-xs font-semibold tracking-wide uppercase"
          >
            {step3Label}. Details
          </h2>
          <QuantityForm state={quantities} onChange={onQuantitiesChange} />
        </section>
      }
      extraSection={
        supportsRecurring && (
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
        )
      }
      receipt={
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
      }
    />
  );
}
