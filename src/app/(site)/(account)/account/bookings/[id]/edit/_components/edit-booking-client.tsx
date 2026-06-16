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

import { Lock } from "lucide-react";
import { Surface } from "@/components/ui/surface";
import { Alert } from "@/components/ui/alert";
import {
  BookingFlow,
  BookingFlowStepHead,
  NotesForCalSection,
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
  /** Server-seeded premium (holiday) day-keys. */
  initialPremiumDays?: string[];
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
  initialPremiumDays,
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
    initialPremiumDays,
    initial,
    admin,
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
        initialSlot,
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
      header={
        admin && (
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
        )
      }
      petSection={
        petAware && (
          <section aria-labelledby="pets-heading">
            <BookingFlowStepHead
              num={step2Label}
              label="Which pets?"
              labelId="pets-heading"
            />
            {admin?.paidLock ? (
              <Alert variant="info" icon={Lock}>
                This booking is paid — pets and price can&apos;t change here.
                Manage price in Payments (coming soon).
              </Alert>
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
        )
      }
      detailsSection={
        !admin?.paidLock && (
          <section aria-labelledby="qty-heading">
            <BookingFlowStepHead
              num={step3Label}
              label="Details"
              labelId="qty-heading"
            />
            <QuantityForm state={quantities} onChange={onQuantitiesChange} />
          </section>
        )
      }
      notesSection={
        <NotesForCalSection
          id="edit-comments"
          num={step4Label}
          value={comments}
          onChange={onCommentsChange}
          placeholder="Anything Cal should know about this visit?"
        />
      }
      receipt={
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
            <Surface
              variant="plain"
              className="text-muted-foreground border-dashed p-6 text-center text-sm"
            >
              {isPreviewing
                ? "Calculating…"
                : patchEmpty
                  ? "Change a detail above to see your updated price."
                  : "Adjust your selection to see your updated price."}
            </Surface>
          )}
        </section>
      }
    />
  );
}
