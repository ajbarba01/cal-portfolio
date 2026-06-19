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
import { Check } from "lucide-react";
import {
  BookingFlow,
  BookingFlowStepHead,
  BookingSuccessPanel,
  NotesForCalSection,
  PetAssignment,
  QuantityForm,
  QuotePanel,
} from "@/features/booking/index.client";
import { Surface } from "@/components/ui/surface";
import type {
  BookingRuleSettings,
  PublicBusyRange,
  AssignablePet,
  ServiceDetail,
} from "@/features/booking/index.client";
import { RecurringControls } from "./recurring-controls";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { bookingSuccessSummary } from "../../_components/messages";
import { useServiceBooking } from "./use-service-booking";
import type { RequirementItem } from "@/features/booking/index.client";
import {
  FormCard,
  submitForm,
  acceptAuthorization,
  EXPENSE_AUTH_KIND,
  EXPENSE_AUTH_VERSION,
  EXPENSE_AUTH_TEXT,
} from "@/features/accounts/index.client";
import type { AuthConfig } from "@/features/accounts/index.client";

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
  /** Server-seeded premium (holiday) day-keys. */
  initialPremiumDays?: string[];
  authState: AuthState;
  pets: AssignablePet[];
  initialSelection: InitialSelection;
  /** Denver day-keys where this client already has an active booking (your-booking dot). */
  myBookingDayKeys: string[];
  /** Server-loaded form responses keyed by form_key (account) or `${form_key}:${pet_id}` (pet). */
  formResponses: Record<string, { data: Record<string, unknown> }>;
  /** Latest accepted expense-auth version (null = never accepted). */
  acceptedAuthVersion: string | null;
  /** ISO timestamp of the acceptance (null = never accepted). */
  acceptedAuthAt: string | null;
  /** Viewer's one-way drive buffer in whole minutes (0 = unknown / guest). */
  viewerDriveBufferMin: number;
}

// ── Main ────────────────────────────────────────────────────────────────────────

export function ServiceBookingClient({
  service,
  rules,
  initialBusy,
  initialPremiumDays,
  authState,
  pets,
  initialSelection,
  myBookingDayKeys,
  formResponses,
  acceptedAuthVersion,
  acceptedAuthAt,
  viewerDriveBufferMin,
}: ServiceBookingClientProps) {
  const {
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
    quote,
    previewMsg,
    isPreviewing,
    isSubmitting,
    success,
    bookEnabled,
    guestLoginHref,
    resetFlow,
    quantities,
    selectedPetIds,
    recurringOn,
    occurrenceCount,
    comments,
    kicheWelcome,
    onKicheWelcomeChange,
    formsIncomplete,
    profileRequirements,
    refreshRequirements,
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
  } = useServiceBooking({
    service,
    rules,
    initialBusy,
    initialPremiumDays,
    authState,
    pets,
    initialSelection,
    myBookingDayKeys,
    viewerDriveBufferMin,
  });

  // Pet-step heading adapts to the service: "dog" when only dogs are eligible,
  // singular when at most one may be selected (training is a single-dog session).
  const petNoun =
    allowedSpecies.length === 1 && allowedSpecies[0] === "dog" ? "dog" : "pet";
  const petSectionLabel = `Which ${maxPets === 1 ? petNoun : `${petNoun}s`}?`;

  // U1: terminal success state — the panel replaces the flow until the user
  // starts over ("Book another") or leaves for /account/bookings.
  if (success) {
    return (
      <BookingSuccessPanel
        requiresApproval={success.requiresApproval}
        summary={bookingSuccessSummary({
          serviceName: service.name,
          mode,
          startsAt: success.startsAt,
          endsAt: success.endsAt,
          petNames: success.petNames,
        })}
        onBookAnother={resetFlow}
      />
    );
  }

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
              num={petStepLabel}
              label={petSectionLabel}
              labelId="pets-heading"
            />
            {authState === "ready" ? (
              <PetAssignment
                pets={pets}
                allowedSpecies={allowedSpecies}
                selected={selectedPetIds}
                onChange={onPetIdsChange}
                onPetAdded={handlePetAdded}
                maxSelect={maxPets}
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
            num={detailsStepLabel}
            label="Details"
            labelId="qty-heading"
          />
          <QuantityForm
            state={quantities}
            onChange={onQuantitiesChange}
            kiche={{ welcome: kicheWelcome, onChange: onKicheWelcomeChange }}
            minHours={durationBounds.minHours}
            maxHours={durationBounds.maxHours}
          />
        </section>
      }
      extraSection={
        supportsRecurring && (
          <section aria-labelledby="recur-heading">
            <BookingFlowStepHead
              num={recurringStepLabel}
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
      formsSection={
        authState === "ready" ? (
          <section aria-labelledby="forms-heading">
            <BookingFlowStepHead
              num={formsStepLabel}
              label="Required forms"
              labelId="forms-heading"
            />
            {formsIncomplete ? (
              <RequirementsGate
                requirements={profileRequirements ?? []}
                pets={pets}
                formResponses={formResponses}
                auth={{
                  acceptedVersion: acceptedAuthVersion,
                  acceptedAt: acceptedAuthAt,
                  currentVersion: EXPENSE_AUTH_VERSION,
                  text: EXPENSE_AUTH_TEXT,
                  onAccept: (name) =>
                    acceptAuthorization({
                      kind: EXPENSE_AUTH_KIND,
                      version: EXPENSE_AUTH_VERSION,
                      acceptedName: name,
                    }),
                }}
                onSaved={refreshRequirements}
              />
            ) : quote ? (
              <p className="text-status-available-foreground inline-flex items-center gap-1.5 text-sm font-medium">
                <Check
                  className="size-4"
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
                Your forms are up to date.
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                Pick a date and time and we&apos;ll list any forms Cal needs for
                this booking.
              </p>
            )}
          </section>
        ) : (
          <section aria-labelledby="forms-heading">
            <BookingFlowStepHead
              num={formsStepLabel}
              label="Required forms"
              labelId="forms-heading"
            />
            <p className="text-muted-foreground text-sm">
              You&apos;ll complete any required forms after signing in.
            </p>
          </section>
        )
      }
      notesSection={
        <NotesForCalSection
          id="create-comments"
          num={notesStepLabel}
          value={comments}
          onChange={onCommentsChange}
          placeholder="Anything Cal should know about this visit?"
        />
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

          {/* Receipt + Book. The required-profiles gate is its own step above.
              The price ALWAYS shows once a quote is computed — it does not depend
              on the forms being complete. While any form is unmet, the Book CTA
              is disabled and a pointer back to the forms step is shown. */}
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
                // U1: success renders a terminal panel (early return above),
                // so the Book CTA always shows alongside a quote here. When forms
                // are unmet, bookEnabled is false → the CTA is disabled.
                <>
                  <QuotePanel
                    preview={quote}
                    onBook={handleBook}
                    bookLabel={isSubmitting ? "Submitting…" : "Book now"}
                    bookDisabled={!bookEnabled}
                    showBook
                  />
                  {formsIncomplete && (
                    <p className="text-muted-foreground mt-3 text-sm">
                      Complete the required forms above to book.
                    </p>
                  )}
                </>
              ) : (
                <Surface
                  variant="plain"
                  className="text-muted-foreground border-dashed p-6 text-center text-sm"
                >
                  {isPreviewing
                    ? "Calculating…"
                    : "Fill out the above details to see your price."}
                </Surface>
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
      <Surface variant="plain" className="p-6">
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
      </Surface>
    </section>
  );
}

// ── Requirements gate ─────────────────────────────────────────────────────────

function requirementLabel(
  item: RequirementItem,
  pets: AssignablePet[],
): string {
  switch (item.formKey) {
    case "owner":
      return "Owner & emergency contacts";
    case "home_access":
      return "Home access";
    case "home_sitting":
      return "House-sitting details";
    default: {
      const name = item.petId
        ? pets.find((p) => p.id === item.petId)?.name
        : undefined;
      const kind = item.formKey === "pet_walk" ? "walks & outings" : "care";
      return name ? `${name} — ${kind}` : kind;
    }
  }
}

/**
 * Renders the required profiles as flat, collapsible rows inside the forms step's
 * single card (no nested cards) and hard-blocks booking until all are complete.
 * Each row starts collapsed with its status; the client expands the ones to fill.
 * After any save, onSaved re-runs the preview so the gate clears once all
 * requirements are met. Status is conveyed by text, never by color alone.
 */
function RequirementsGate({
  requirements,
  pets,
  formResponses,
  auth,
  onSaved,
}: {
  requirements: RequirementItem[];
  pets: AssignablePet[];
  formResponses: Record<string, { data: Record<string, unknown> }>;
  auth: AuthConfig;
  onSaved: () => void;
}) {
  return (
    <>
      <p className="text-muted-foreground mb-3 text-sm">
        So Cal has what&apos;s needed to care for your pets. Complete or
        reconfirm these to finish booking.
      </p>
      <div className="border-border divide-border divide-y rounded-xl border">
        {requirements.map((item) => {
          const scopeKey = item.petId
            ? `${item.formKey}:${item.petId}`
            : item.formKey;
          return (
            <FormCard
              key={scopeKey}
              flat
              formKey={item.formKey}
              petId={item.petId ?? null}
              title={requirementLabel(item, pets)}
              status={item.status}
              existing={formResponses[scopeKey]}
              onSubmit={submitForm}
              onSaved={onSaved}
              auth={item.formKey === "owner" ? auth : undefined}
            />
          );
        })}
      </div>
    </>
  );
}
