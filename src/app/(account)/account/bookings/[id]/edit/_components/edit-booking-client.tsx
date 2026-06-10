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
import {
  useAvailability,
  useBusyRanges,
  useOvernightNights,
  validateStayRange,
  denverMidnight,
  denverDayKey,
  hourlySchedulerData,
  editBooking,
  previewEdit,
  Scheduler,
  BOOK_HOUSE_SITTING_CAPABILITIES,
  BOOK_WALK_CAPABILITIES,
  PetAssignment,
  QuantityForm,
  QuotePanel,
  diffBookingPatch,
} from "@/features/booking";
import type {
  SchedulerData,
  BusyBlock,
  ScheduleSelectionState,
  BookingRuleSettings,
  PublicBusyRange,
  BookingQuotePreview,
  EditBookingPatch,
  AssignablePet,
  QuantityState,
  PetSpecies,
  ServiceDetail,
} from "@/features/booking";
import type { Pet } from "@/features/accounts";
import { useToast } from "@/components/feedback/toast";
import { ErrorState } from "@/components/feedback/error-state";
import type { DateRange } from "@/components/ui/calendar";

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

  const [forceConfirm, setForceConfirm] = useState(false);

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
  const patch = useMemo(
    () =>
      diffBookingPatch(initial, {
        startsAt,
        endsAt,
        selectedPetIds,
        quantities,
        nights,
        comments,
        petAware,
      }),
    [
      startsAt,
      endsAt,
      selectedPetIds,
      quantities,
      nights,
      comments,
      petAware,
      initial,
    ],
  );
  const patchEmpty = Object.keys(patch).length === 0;

  // ── Latest-ref pattern so the debounce timer reads fresh inputs at fire-time ──
  const patchRef = useRef<EditBookingPatch>(patch);
  const canPreviewRef = useRef(false);
  useEffect(() => {
    patchRef.current = patch;
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
          patch: patchRef.current,
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
            setApprovalWillReReview(false);
            setErrorMsg(result.reason);
            setBlocked(true);
            break;
          case "refuse":
            setQuote(null);
            setApprovalWillReReview(false);
            setErrorMsg(result.reason);
            setBlocked(true);
            break;
          case "price_locked":
            setQuote(null);
            setApprovalWillReReview(false);
            setErrorMsg(
              "This booking is already paid, so its price can't change.",
            );
            setBlocked(true);
            break;
          case "validation_error":
            setQuote(null);
            setApprovalWillReReview(false);
            setErrorMsg(result.message);
            setBlocked(true);
            break;
          default:
            // Unreachable from the gated UI — not_found/forbidden/error don't
            // surface via previewEdit. Block defensively but don't persist stale state.
            setQuote(null);
            setApprovalWillReReview(false);
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
      const result = await editBooking({ bookingId, patch, forceConfirm });
      switch (result.kind) {
        case "success":
          toast.add({ title: "Booking updated" });
          router.push(
            admin ? `/admin/clients/${admin.clientId}` : "/account/bookings",
          );
          router.refresh();
          break;
        case "unavailable":
          // Transient: slot may free up — keep Save available for retry.
          setErrorMsg(result.reason);
          break;
        case "refuse":
          // Transient: policy may change — keep Save available for retry.
          setErrorMsg(result.reason);
          break;
        case "slot_taken":
          // Transient: user should pick a different slot, not permanently blocked.
          setErrorMsg("That time was just taken. Please pick another slot.");
          break;
        case "validation_error":
          // Transient: user can fix input — keep Save available for retry.
          setErrorMsg(result.message);
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

  const step2Label = "2";
  const step3Label = petAware ? "3" : "2";
  const step4Label = petAware ? "4" : "3";

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
              onChange={(ids) => {
                setSelectedPetIds(ids);
                requestPreview();
              }}
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
          <QuantityForm
            state={quantities}
            onChange={(s) => {
              setQuantities(s);
              requestPreview();
            }}
          />
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
