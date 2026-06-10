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
import { editBooking } from "@/features/booking/actions";
import { previewEdit } from "@/features/booking/preview-edit";
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
  quantitiesToRecord,
  type QuantityState,
} from "@/features/booking/_components/quantity-forms";
import { QuotePanel } from "@/features/booking/_components/quote-panel";
import { useToast } from "@/components/feedback/toast";
import { ErrorState } from "@/components/feedback/error-state";
import type { DateRange } from "@/components/ui/calendar";
import type { BookingRuleSettings } from "@/features/booking/availability";
import type { PublicBusyRange } from "@/features/booking/busy-ranges";
import type {
  BookingQuotePreview,
  EditBookingPatch,
} from "@/features/booking/booking-service";
import type { Pet } from "@/features/accounts/account-actions";
import type { PetSpecies } from "@/features/booking/_components/pet-avatar";
import type { ServiceDetail } from "@/app/(marketing)/book/[serviceSlug]/_components/service-booking-client";

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

/** Order-independent set equality for pet-id arrays. */
function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
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
}: EditBookingClientProps) {
  const router = useRouter();
  const toast = useToast();

  const mode: "week-slots" | "month-range" =
    service.pricingType === "house_sitting" ? "month-range" : "week-slots";
  const petAware =
    service.pricingType === "house_sitting" || service.pricingType === "walk";
  const allowedSpecies: PetSpecies[] =
    service.pricingType === "house_sitting" ? ["dog", "cat"] : ["dog"];

  // Stable "now" for the component lifetime (page reload re-mounts).
  const now = useMemo(() => new Date(), []);

  // ── State (seeded from the existing booking) ────────────────────────────────
  const [quantities, setQuantities] = useState<QuantityState>(
    initial.quantities,
  );
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>(
    initial.petIds,
  );
  const [comments, setComments] = useState<string>(initial.comments);

  // Hourly selection is just a start instant; the end is always start + the
  // currently-chosen duration, so changing duration re-derives the end live.
  const [selectedStart, setSelectedStart] = useState<Date | null>(() =>
    mode === "week-slots" ? new Date(initial.startsAtIso) : null,
  );
  const [range, setRange] = useState<DateRange | undefined>(() =>
    mode === "month-range"
      ? {
          from: localDateFromKey(denverDayKey(new Date(initial.startsAtIso))),
          to: localDateFromKey(denverDayKey(new Date(initial.endsAtIso))),
        }
      : undefined,
  );

  const [quote, setQuote] = useState<BookingQuotePreview | null>(null);
  const [approvalWillReReview, setApprovalWillReReview] = useState(false);
  // Inline error from preview/save; when set with `blocking`, Save is disabled.
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const [isPreviewing, startPreviewing] = useTransition();
  const [isSubmitting, startSubmitting] = useTransition();

  // ── Booking duration (single source of truth for hourly) ───────────────────
  // For hourly services the user-chosen "hours" IS the booking duration; it
  // drives the live quote, the day-timeline block height + candidate starts,
  // AND which month days read as available. House-sitting uses the service default.
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

  // ── Debounce timer ref for live preview ────────────────────────────────────
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (previewTimerRef.current !== null) {
        clearTimeout(previewTimerRef.current);
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
  const { busy } = useBusyRanges(service.slug, initialBusy);

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

  // Pre-select the booking's current slot (week-slots): drives the Scheduler's
  // initial selection block + the your-booking dot. (MeetGreetScheduler pattern.)
  const initialSlot = useMemo(() => {
    if (mode !== "week-slots") return undefined;
    const from = new Date(initial.startsAtIso);
    const dayKey = denverDayKey(from);
    const minute = Math.round(
      (from.getTime() - denverMidnight(dayKey).getTime()) / 60_000,
    );
    return { dayKey, minute };
  }, [mode, initial.startsAtIso]);

  // The booking's own day-keys (your-booking dot).
  const myBookings = useMemo(() => {
    if (mode === "week-slots") {
      return initialSlot ? new Set([initialSlot.dayKey]) : new Set<string>();
    }
    // month-range: mark the existing stay's nights.
    const keys = new Set<string>();
    let cursor = denverMidnight(denverDayKey(new Date(initial.startsAtIso)));
    const endMs = denverMidnight(
      denverDayKey(new Date(initial.endsAtIso)),
    ).getTime();
    while (cursor.getTime() < endMs) {
      keys.add(denverDayKey(cursor));
      cursor = new Date(cursor.getTime() + 86_400_000);
    }
    return keys;
  }, [mode, initialSlot, initial.startsAtIso, initial.endsAtIso]);

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

  const petsOk = !petAware || selectedPetIds.length > 0;

  // ── Patch diff: include a field ONLY when it differs from the seed ──────────
  // Unchanged fields are omitted so the core keeps the booking's stored values.
  const buildPatch = useCallback((): EditBookingPatch => {
    const patch: EditBookingPatch = {};

    const initialStartMs = new Date(initial.startsAtIso).getTime();
    const initialEndMs = new Date(initial.endsAtIso).getTime();
    if (startsAt && startsAt.getTime() !== initialStartMs) {
      patch.startsAt = startsAt;
    }
    if (endsAt && endsAt.getTime() !== initialEndMs) {
      patch.endsAt = endsAt;
    }

    if (petAware && !sameStringSet(selectedPetIds, initial.petIds)) {
      patch.petIds = selectedPetIds;
    }

    const nextQty = quantitiesToRecord(quantities, nights);
    const seedQty = quantitiesToRecord(initial.quantities, nights);
    if (JSON.stringify(nextQty) !== JSON.stringify(seedQty)) {
      patch.quantities = nextQty;
    }

    if (comments !== initial.comments) {
      patch.comments = comments;
    }

    return patch;
  }, [
    startsAt,
    endsAt,
    selectedPetIds,
    quantities,
    nights,
    comments,
    petAware,
    initial,
  ]);

  const patch = buildPatch();
  const patchEmpty = Object.keys(patch).length === 0;

  // ── Latest-ref pattern so the debounce timer reads fresh inputs at fire-time ──
  const buildPatchRef = useRef(buildPatch);
  const canPreviewRef = useRef(false);
  useEffect(() => {
    buildPatchRef.current = buildPatch;
    canPreviewRef.current =
      startsAt !== null && endsAt !== null && petsOk && !patchEmpty;
  });

  // ── Debounced live preview ──────────────────────────────────────────────────
  const requestPreview = useCallback(() => {
    if (previewTimerRef.current !== null) {
      clearTimeout(previewTimerRef.current);
    }
    previewTimerRef.current = setTimeout(() => {
      // Nothing to preview (no selection, missing pets, or no changes).
      if (!canPreviewRef.current) {
        setQuote(null);
        setApprovalWillReReview(false);
        setErrorMsg(null);
        setBlocked(false);
        return;
      }
      startPreviewing(async () => {
        const result = await previewEdit({
          bookingId,
          patch: buildPatchRef.current(),
        });
        switch (result.kind) {
          case "preview":
            setQuote(result.preview);
            setApprovalWillReReview(
              result.requiresApproval && initial.wasConfirmed,
            );
            setErrorMsg(null);
            setBlocked(false);
            break;
          case "unavailable":
            setQuote(null);
            setErrorMsg(result.reason);
            setBlocked(true);
            break;
          case "refuse":
            setQuote(null);
            setErrorMsg(result.reason);
            setBlocked(true);
            break;
          case "price_locked":
            setQuote(null);
            setErrorMsg(
              "This booking is already paid, so its price can't change.",
            );
            setBlocked(true);
            break;
          case "validation_error":
            setQuote(null);
            setErrorMsg(result.message);
            setBlocked(true);
            break;
          default:
            setQuote(null);
            setErrorMsg("Couldn't preview this change. Please contact Cal.");
            setBlocked(true);
        }
      });
    }, 400);
  }, [bookingId, initial.wasConfirmed]);

  // ── Bridge Scheduler selection → range / selectedStart ───────────────────────
  const onSelectionChange = useCallback(
    (state: ScheduleSelectionState) => {
      if (mode === "month-range") {
        if (state.selectedDays.size === 0) {
          setRange(undefined);
          setQuote(null);
          setErrorMsg(null);
          setBlocked(false);
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
        setBlocked(false);
        requestPreview();
      } else {
        if (state.gridDraft.size === 0) {
          setSelectedStart(null);
          setQuote(null);
          setErrorMsg(null);
          setBlocked(false);
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
        setBlocked(false);
        requestPreview();
      }
    },
    [mode, requestPreview],
  );

  // ── Save handler ────────────────────────────────────────────────────────────
  function handleSave() {
    if (patchEmpty || blocked) return;
    startSubmitting(async () => {
      const result = await editBooking({ bookingId, patch: buildPatch() });
      switch (result.kind) {
        case "success":
          toast.add({ title: "Booking updated" });
          router.push("/account/bookings");
          router.refresh();
          break;
        case "unavailable":
          setErrorMsg(result.reason);
          setBlocked(true);
          break;
        case "refuse":
          setErrorMsg(result.reason);
          setBlocked(true);
          break;
        case "slot_taken":
          setErrorMsg("That time was just taken. Please pick another slot.");
          setBlocked(true);
          break;
        case "validation_error":
          setErrorMsg(result.message);
          setBlocked(true);
          break;
        default:
          // price_locked | forbidden | invalid_status | blocked_debt |
          // onboarding_incomplete | not_found | error — not reachable from the
          // gated UI, but must not crash.
          toast.add({
            title: "Couldn't save",
            description: "Please contact Cal.",
            type: "error",
          });
      }
    });
  }

  function handlePetAdded(pet: Pet) {
    setSelectedPetIds((prev) => [...prev, pet.id]);
    setQuote(null);
    router.refresh();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const saveDisabled =
    patchEmpty || blocked || isPreviewing || isSubmitting || !petsOk;

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
          <PetAssignment
            pets={pets}
            allowedSpecies={allowedSpecies}
            selected={selectedPetIds}
            onChange={(ids) => {
              setSelectedPetIds(ids);
              requestPreview();
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
            requestPreview();
          }}
        />
      </section>

      {/* 4. Comments */}
      <section aria-labelledby="comments-heading">
        <h2
          id="comments-heading"
          className="text-brand-strong mb-3 text-xs font-semibold tracking-wide uppercase"
        >
          {step4Label}. Notes for Cal (optional)
        </h2>
        <textarea
          id="edit-comments"
          value={comments}
          onChange={(e) => {
            setComments(e.target.value);
            requestPreview();
          }}
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
            approvalWillReReview={approvalWillReReview}
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
