"use client";

/**
 * BookingFlow — the shared stepped-booking layout behind the three booking
 * surfaces (public self-serve, admin on-behalf create, owner/admin edit).
 *
 * SP6 Task 9: rebuilt as stacked step cards (numbered clay disc + Fraunces
 * heading) in a single column at all viewports — no sticky side receipt.
 * The summary card lives inline after the steps, above the primary CTA.
 * Calendar visuals are unchanged (maintainer-approved as-is).
 *
 * Extracted from the three near-identical client components (SP5a Task 10). The
 * three already share the `useBookingScheduler` substrate + the primitives, but
 * each DUPLICATED the stepped JSX. This component owns the parts that were
 * byte-identical: the page container and the Step-1 calendar section (mode →
 * week-slots vs month-range, the loading/error states, the Scheduler composition
 * with its month grid / legend / timeline / details panel, and the month-range
 * summary + invalid-range line).
 *
 * Everything that DIVERGED per surface stays with the caller as a React-node
 * slot, so this extraction is a pure MOVE with no behavior change:
 *   - `header`        — auth/returnTo banner (public) or admin identity header.
 *   - `petSection`    — Step 2 (caller owns the `petAware` wrapper + body:
 *                       public's not-ready fallback, admin's always-on
 *                       PetAssignment, edit's paid-lock notice).
 *   - `detailsSection`— Step 3 quantities (caller owns edit's paid-lock hiding).
 *   - `extraSection`  — Step 4 (public/admin recurring controls, edit's notes).
 *   - `receipt`       — the gated QuotePanel block (public's auth gating +
 *                       GatePanels, admin/edit's footer + warnings + deltas).
 *
 * Layout contract (SP6 visual contract, signed off 2026-06-11):
 *   - Stacked single column, max-w-xl (~36rem), all viewports — no side receipt.
 *   - Step 1 (calendar) and caller-supplied steps 2–4 each rendered inside a
 *     step-card shell (rounded card + numbered clay disc + Fraunces heading).
 *   - Summary card inline after the steps: existing receipt slot + U6 policy line.
 */

import type { ReactNode, ComponentProps } from "react";
import { Check, Info } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ShimmerCard } from "@/components/ui/shimmer-card";
import { Scheduler } from "./scheduler";
import type { SchedulerData } from "./scheduler";
import type { SchedulerCapabilities } from "../schedule-capabilities";
import { ErrorState } from "@/components/feedback/error-state";
import type { BookingMode } from "../use-booking-scheduler";
import type { validateStayRange } from "../calendar-model";
import type { ScheduleSelectionState } from "../schedule-selection";
import type { DateRange } from "@/components/ui/calendar";
import type { BookingRuleSettings } from "../availability";
import { cn } from "@/lib/utils";

/**
 * The common subset of the three hooks' returns that the shared calendar
 * section consumes. Each client passes this straight through from its hook.
 */
export interface BookingFlowState {
  mode: BookingMode;
  windowsLoading: boolean;
  windowsError: string | null;
  capabilities: SchedulerCapabilities;
  schedulerData: SchedulerData;
  range: DateRange | undefined;
  stay: ReturnType<typeof validateStayRange> | null;
  onSelectionChange: (state: ScheduleSelectionState) => void;
  /** Pre-select an existing slot on mount (edit only; week-slots). */
  initialSlot?: { dayKey: string; minute: number };
}

/**
 * Numbered clay disc + Fraunces heading for steps 2-4 in the booking flow.
 * Exported so the three consumer wrappers (ServiceBookingClient,
 * AdminCreateBookingClient, EditBookingClient) render a consistent step header
 * inside their section elements — keeps a11y structure at the caller while the
 * visual chrome matches the Step 1 heading in BookingFlow.
 */
export function BookingFlowStepHead({
  num,
  label,
  labelId,
  hint,
}: {
  num: number | string;
  label: string;
  labelId: string;
  hint?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="bg-clay-soft text-brand-strong flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
      >
        {num}
      </span>
      <h2
        id={labelId}
        className="font-heading text-foreground m-0 text-base leading-tight font-semibold"
      >
        {label}
      </h2>
      {hint && (
        <span className="text-muted-foreground ml-auto text-xs">{hint}</span>
      )}
    </div>
  );
}

export interface BookingFlowProps {
  flow: BookingFlowState;
  /**
   * Intro copy above the month-range calendar. Differs by one word between the
   * surfaces ("your stay" public/edit vs "the stay" admin), so the caller owns it.
   */
  monthRangeIntro: ReactNode;
  /** Step 0 — auth/returnTo banner (public) or admin identity header. */
  header?: ReactNode;
  /** Step 2 — pet assignment block (caller owns the petAware wrapper + body). */
  petSection?: ReactNode;
  /** Step 3 — quantities/details block. */
  detailsSection?: ReactNode;
  /** Step 4 — recurring controls (public/admin) or the single notes card (edit). */
  extraSection?: ReactNode;
  /** Step 5 — notes for Cal on create paths (public + admin); separate card from extraSection. Edit uses extraSection for notes instead. */
  notesSection?: ReactNode;
  /** The gated price receipt + primary CTA block. */
  receipt: ReactNode;
  /**
   * Booking rule settings — used for the U6 policy line (cancellation window +
   * late-cancel refund pct). Thread from the page's `loadBookingFormData` result.
   */
  rules?: BookingRuleSettings;
}

// ── Shared card shell ─────────────────────────────────────────────────────────
// Step 1 (calendar) is wrapped here. Steps 2-4 are provided by callers as
// section elements whose own headings carry the step numbers; we wrap them in the
// same card shell transparently so the column rhythm is uniform.

function StepShell({ children, className, ...rest }: ComponentProps<"div">) {
  return (
    <ShimmerCard className={cn("min-w-0 p-4.5", className)} {...rest}>
      {children}
    </ShimmerCard>
  );
}

// ── Step 1 heading (numbered clay disc + Fraunces label) ──────────────────────
// Only Step 1 is owned by BookingFlow; callers provide the h2 + disc for their
// own sections. The disc + heading pattern is documented here as the canonical
// reference.

function CalendarStepHead({ mode }: { mode: BookingMode }) {
  const label = mode === "month-range" ? "Pick your dates" : "Pick a day";
  return (
    <div className="mb-3 flex items-center gap-2.5">
      {/* Clay numbered disc — identical to callers' step discs. */}
      <span
        aria-hidden="true"
        className="bg-clay-soft text-brand-strong flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
      >
        1
      </span>
      <h2
        id="cal-heading"
        className="font-heading text-foreground m-0 text-base leading-tight font-semibold"
      >
        {label}
      </h2>
    </div>
  );
}

// ── U2 lead-time note ─────────────────────────────────────────────────────────
// Rendered when minLeadTimeHours > 0: one quiet note under the calendar with
// the first bookable date and a link to /contact. No new visual class — uses
// existing muted-foreground text. Renders null when lead time is zero.

function LeadTimeNote({
  minLeadTimeHours,
  bookingOpenMinute,
  now,
}: {
  minLeadTimeHours: number;
  /** Minutes-since-midnight (Denver) when the booking day opens. Used to align
   * the note's "first bookable day" with the calendar's day-state anchor: a day
   * is open when dayStart + bookingOpenMinute >= now + leadTime, so the first
   * open day starts at now + leadTime - bookingOpenMinute. */
  bookingOpenMinute: number;
  now: Date;
}) {
  if (minLeadTimeHours <= 0) return null;

  // Align with hourlyAvailableDayKeys / deriveBookableDays: a day is open when
  // dayStart + bookingOpenMinute*60000 >= now + leadTimeMs.
  // The first open day therefore starts at now + leadTimeMs - bookingOpenMinute*60000.
  const leadTimeMs = minLeadTimeHours * 60 * 60 * 1000;
  const firstBookable = new Date(
    now.getTime() + leadTimeMs - bookingOpenMinute * 60 * 1000,
  );
  // Format as "Mon, Jan 1" — short human-readable date.
  const formatted = firstBookable.toLocaleDateString("en-US", {
    timeZone: "America/Denver",
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <p className="text-muted-foreground mt-2.5 flex gap-1.5 text-[12.5px] leading-snug">
      <Info size={14} className="mt-px shrink-0" aria-hidden="true" />
      <span>
        Days before {formatted} need more notice —{" "}
        <Link
          href="/contact"
          className="text-brand-strong font-medium hover:underline focus-visible:underline"
        >
          contact Cal
        </Link>{" "}
        if you need something sooner.
      </span>
    </p>
  );
}

// ── U1 success panel ──────────────────────────────────────────────────────────
// Terminal state after createBooking succeeds (public/account create paths —
// admin create keeps its redirect). Visual contract: booking-flow-preview.html
// "Success state (U1)" — centered card, check disc, one-line recap, copy
// variant by requiresApproval, then "View my bookings" + "Book another".

export interface BookingSuccessPanelProps {
  /** True when the booking landed in pending_approval (copy variant). */
  requiresApproval: boolean;
  /** One-line recap, e.g. "Walk · Tue, Jun 16 · 1.5 hr · Juniper". */
  summary: string | null;
  /** Resets the flow so the user can start a fresh booking. */
  onBookAnother: () => void;
}

export function BookingSuccessPanel({
  requiresApproval,
  summary,
  onBookAnother,
}: BookingSuccessPanelProps) {
  return (
    <section
      role="status"
      aria-labelledby="booking-success-heading"
      className="mx-auto w-full max-w-md pb-12"
    >
      <ShimmerCard className="p-7 text-center">
        <div
          aria-hidden="true"
          className="bg-status-available mx-auto mb-3 flex size-11 items-center justify-center rounded-full"
        >
          <Check
            size={22}
            strokeWidth={2.5}
            className="text-status-available-foreground"
          />
        </div>
        <h2
          id="booking-success-heading"
          className="font-heading text-foreground m-0 text-xl font-semibold"
        >
          {requiresApproval ? "Booking requested" : "Booking confirmed"}
        </h2>
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
          {summary && (
            <span className="text-foreground block font-medium">{summary}</span>
          )}
          {requiresApproval
            ? "Cal approves requests within a day — you'll get an email either way."
            : "You're all set — Cal has it on the calendar."}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href="/account/bookings"
            className={cn(buttonVariants({ variant: "brand" }))}
          >
            View my bookings
          </Link>
          <button
            type="button"
            onClick={onBookAnother}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Book another
          </button>
        </div>
      </ShimmerCard>
    </section>
  );
}

// ── U6 policy line ─────────────────────────────────────────────────────────────
// Rendered from settings: "Free cancellation until {n}h before; later
// cancellations refund {pct}%." Never hardcoded — renders null when fields absent.
// Exported for unit testing only.

export function PolicyLine({ rules }: { rules: BookingRuleSettings }) {
  const { cancellationFullRefundHours, lateCancelRefundPct } = rules;
  if (
    cancellationFullRefundHours === undefined ||
    lateCancelRefundPct === undefined
  ) {
    return null;
  }
  return (
    <p className="text-muted-foreground mt-3 flex gap-1.5 text-[11.5px] leading-snug">
      <Info size={13} className="mt-px shrink-0" aria-hidden="true" />
      <span>
        Free cancellation until {cancellationFullRefundHours}h before; later
        cancellations refund {lateCancelRefundPct}%.
      </span>
    </p>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function BookingFlow({
  flow,
  monthRangeIntro,
  header,
  petSection,
  detailsSection,
  extraSection,
  notesSection,
  receipt,
  rules,
}: BookingFlowProps) {
  const {
    mode,
    windowsLoading,
    windowsError,
    capabilities,
    schedulerData,
    range,
    stay,
    onSelectionChange,
    initialSlot,
  } = flow;

  return (
    <div className="mx-auto flex w-full max-w-xl min-w-0 flex-col gap-5 pb-12">
      {header}

      {/* Step 1 — calendar, fully owned by BookingFlow */}
      <StepShell>
        <CalendarStepHead mode={mode} />
        <section aria-labelledby="cal-heading" className="max-w-full min-w-0">
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
              initialSlot={initialSlot}
            >
              <Scheduler.MonthGrid />
              {/* Legend sits directly under the month (B2), before the timeline. */}
              <Scheduler.Legend className="mt-5" />
              {/* U2: lead-time note after legend (only when minLeadTimeHours > 0). */}
              {rules && (
                <LeadTimeNote
                  minLeadTimeHours={rules.minLeadTimeHours ?? 0}
                  bookingOpenMinute={rules.bookingOpenMinute ?? 0}
                  now={schedulerData.now}
                />
              )}
              <div className="mt-6">
                <Scheduler.DayTimeline />
              </div>
              <Scheduler.BookingDetailsPanel />
            </Scheduler>
          )}
          {!windowsLoading && !windowsError && mode === "month-range" && (
            <>
              <p className="text-muted-foreground mb-3 text-sm">
                {monthRangeIntro}
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
                {/* U2: lead-time note after legend (month-range mode). */}
                {rules && (
                  <LeadTimeNote
                    minLeadTimeHours={rules.minLeadTimeHours ?? 0}
                    bookingOpenMinute={rules.bookingOpenMinute ?? 0}
                    now={schedulerData.now}
                  />
                )}
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
      </StepShell>

      {/* Steps 2–4 — caller-owned sections wrapped in the shared card shell.
          Each caller section is a <section aria-labelledby> with its own h2 +
          clay-disc heading; wrapping in StepShell gives the card chrome. */}
      {petSection && <StepShell>{petSection}</StepShell>}
      {detailsSection && <StepShell>{detailsSection}</StepShell>}
      {extraSection && <StepShell>{extraSection}</StepShell>}
      {notesSection && <StepShell>{notesSection}</StepShell>}

      {/* Summary + receipt card — inline after the steps (no side receipt).
          Owns: existing receipt slot (quote panel / gate panels / CTA) and the
          U6 policy line (rendered from settings when fields are present). */}
      <StepShell aria-label="Booking summary">
        <h2 className="font-heading text-foreground mb-2.5 text-[15px] font-semibold">
          Your booking
        </h2>
        {receipt}
        {rules && <PolicyLine rules={rules} />}
      </StepShell>
    </div>
  );
}
