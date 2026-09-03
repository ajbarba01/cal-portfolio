"use client";

/**
 * AvailabilityClient — Cal's availability editing surface, built on the shared
 * compound <Scheduler>. Pick one day on the month calendar or a whole run of
 * them (drag, shift-click, ctrl/cmd-click, or the keyboard — see MonthGrid),
 * then paint walk hours on the <Scheduler.DayPainter> timeline and flip
 * overnight + premium across the selection.
 *
 * SCOPE IS THE SELECTION. Every write here is already a batch, so the two
 * toggles and both create paths apply to every selected day; a switch reads ON
 * only when every one of them is on. Carving time back out stays a one-day job
 * (each removal can strand a booking and pop its own confirm), so the painter
 * withholds the eraser and the block gestures while several days are selected.
 *
 * PAINT-ONLY: this page creates/removes availability windows and toggles
 * overnight nights + premium days. It does NOT moderate bookings. Booked days
 * are ordinary selectable days — the booking renders on the timeline for
 * awareness only.
 *
 * Cancel-by-blocking: painting booked time unavailable (or turning an overnight
 * night off under a stay) is destructive, so the removal callbacks intercept any
 * affected bookings, pop a confirm listing each at a 100% (Cal-initiated) refund,
 * then cancel each via cancelBooking before applying the block. Empty time
 * blocks silently.
 *
 * Server data (windows, busy, nights, rules) flows straight from props — server
 * actions revalidate this route, so there is no client copy to drift.
 *
 * Scheduler callbacks deliberately do NOT route through router.refresh(): each
 * server action revalidatePath()s "/admin/availability", refreshing this route's
 * RSC data within the same transition. They await the action, return its real
 * result (the painter reverts a move whose removal was refused) and toast every
 * refusal — an optimistic paint that silently snaps back explains nothing.
 */

import { useCallback, useMemo, useOptimistic, useTransition } from "react";
import {
  denverMidnight,
  denverDayKey,
  cancelBooking,
  useScheduler,
  Scheduler,
  ADMIN_CAPABILITIES,
} from "@/features/booking/index.client";
import type {
  TimeRange,
  SchedulerData,
  SchedulerCallbacks,
  BusyBlock,
  BookingRuleSettings,
} from "@/features/booking/index.client";
import {
  bookingsInWindowSlice,
  createWindowsBatch,
  setWindowUnavailable,
  setOvernightNightsBatch,
  setPremiumDaysBatch,
} from "@/features/admin/index.client";
import type {
  AvailabilityWindow,
  AdminBusyRangeView,
} from "@/features/admin/index.client";
import { centsToDollars } from "@/features/pricing";
import { useConfirm } from "@/components/feedback/confirm-dialog";
import { useToast } from "@/components/feedback/toast";
import { DENVER_TZ } from "@/lib/time-of-day";
import { PAYMENTS_ENABLED } from "@/lib/payments-enabled";
import { Switch } from "@/components/ui/switch";
import { Star } from "lucide-react";

/** Map an enriched admin busy range to a BusyBlock, preserving booking identity. */
function toBusyBlock(b: AdminBusyRangeView): BusyBlock {
  return {
    startsAt: new Date(b.startsAt),
    endsAt: new Date(b.endsAt),
    id: b.bookingId,
    label: b.clientName ?? undefined,
  };
}

/**
 * One line per affected booking in the confirm: "Jane Doe · 2:00 PM", or
 * "Jane Doe · Jul 6, 2:00 PM" when the booking started on a Denver day other
 * than `dayKey` (the day being edited). The gate matches on instant overlap, so
 * a house-sit that began days ago lands in this list — and a bare clock time
 * from a day the operator cannot see would not say which stay is being
 * cancelled at a full refund.
 */
function affectedLabel(b: AdminBusyRangeView, dayKey: string): string {
  const start = new Date(b.startsAt);
  const startedOnDay = denverDayKey(start) === dayKey;
  const when = start.toLocaleString("en-US", {
    timeZone: DENVER_TZ,
    ...(startedOnDay ? {} : { month: "short", day: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
  const who = b.clientName ?? "Unknown client";
  return `${who} · ${when}`;
}

/** "Wednesday, Jun 3" (Denver) for the day-panel header. */
function denverDayLabel(dayKey: string): string {
  return denverMidnight(dayKey).toLocaleDateString("en-US", {
    timeZone: DENVER_TZ,
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Optimistic availability windows
// ──────────────────────────────────────────────────────────────────────────────
//
// "Mark available/unavailable" hits the server then revalidates — the timeline
// only repaints once that round-trip lands, so the commit felt laggy. We mirror
// the mutation onto the local `windows` array via useOptimistic so the bands flip
// instantly; when the refreshed server data arrives it becomes the new base and
// the optimistic layer dissolves into it. On failure (e.g. a booking conflict
// refuses the removal) the transition ends without a refresh, so the optimistic
// op auto-reverts.

const MS_PER_MINUTE = 60_000;

/** A single day's availability window spanning [openMinute, closeMinute) Denver. */
function dayWindow(
  dayKey: string,
  openMinute: number,
  closeMinute: number,
): TimeRange {
  const midnight = denverMidnight(dayKey).getTime();
  return {
    startsAt: new Date(midnight + openMinute * MS_PER_MINUTE),
    endsAt: new Date(midnight + closeMinute * MS_PER_MINUTE),
  };
}

/** Remove [sliceStart, sliceEnd) from a window list, splitting straddling windows. */
function subtractSlice(
  windows: TimeRange[],
  sliceStart: number,
  sliceEnd: number,
): TimeRange[] {
  const out: TimeRange[] = [];
  for (const w of windows) {
    const ws = w.startsAt.getTime();
    const we = w.endsAt.getTime();
    if (we <= sliceStart || ws >= sliceEnd) {
      out.push(w); // no overlap
      continue;
    }
    if (ws < sliceStart)
      out.push({ startsAt: w.startsAt, endsAt: new Date(sliceStart) });
    if (we > sliceEnd)
      out.push({ startsAt: new Date(sliceEnd), endsAt: w.endsAt });
    // fully-covered middle is dropped
  }
  return out;
}

type WindowOptimisticAction =
  | { type: "add"; ranges: TimeRange[] }
  | { type: "subtract"; dayKey: string; fromMinute: number; toMinute: number };

function applyOptimisticWindows(
  current: TimeRange[],
  action: WindowOptimisticAction,
): TimeRange[] {
  if (action.type === "add") return [...current, ...action.ranges];
  const midnight = denverMidnight(action.dayKey).getTime();
  return subtractSlice(
    current,
    midnight + action.fromMinute * MS_PER_MINUTE,
    midnight + action.toMinute * MS_PER_MINUTE,
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Cancel-by-blocking — overlap detection
// ──────────────────────────────────────────────────────────────────────────────
//
// Which bookings an intraday carve-out would destroy is `bookingsInWindowSlice`
// in the admin feature — pure, tested, and matching the instant-overlap rule the
// server refuses on.

const MS_PER_DAY = 86_400_000;

/**
 * Bookings affected by turning OFF the given overnight nights: any active
 * RESIDENT (overnight) stay that OVERLAPS one of the targeted nights — not just
 * stays that start on it, so untoggling a night in the middle of a multi-night
 * sit is still gated. Intraday walk bookings are excluded (untoggling overnight
 * availability never cancels a walk).
 */
function bookingsOnNights(
  busy: AdminBusyRangeView[],
  nights: string[],
): AdminBusyRangeView[] {
  return busy.filter((b) => {
    const start = new Date(b.startsAt);
    const end = new Date(b.endsAt);
    // Resident stay = spans more than one Denver day.
    const isResident =
      denverDayKey(start) !== denverDayKey(new Date(end.getTime() - 1));
    if (!isResident) return false;
    return nights.some((night) => {
      const ns = denverMidnight(night).getTime();
      return start.getTime() < ns + MS_PER_DAY && end.getTime() > ns;
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Mutation feedback
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Stand-in result when a mutation never came back at all (a dropped request or
 * a server crash). Its message doubles as the fallback description for the
 * refusals that carry none of their own.
 */
const ACTION_FAILED = {
  kind: "error",
  message: "Something went wrong. Please try again.",
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// DayControls — selected-day header + per-day overnight / premium toggles
// ──────────────────────────────────────────────────────────────────────────────

/**
 * States the scope of the next action — the day, or how many days — and exposes
 * overnight + premium as toggles over the whole selection. Each calls the
 * context callback with every selected day (the callbacks own the optimistic
 * flip + cancel-gate). Disabled until something is picked.
 */
function DayControls() {
  const { selection, data, callbacks } = useScheduler();

  const dayKeys = useMemo(
    () => [...selection.state.selectedDays].sort(),
    [selection.state.selectedDays],
  );
  const count = dayKeys.length;
  const [firstDay] = dayKeys;
  const disabled = count === 0;
  const isBulk = count > 1;

  // A switch reads ON only when EVERY selected day is on, so flipping it always
  // means the same thing: on turns the whole selection on, off turns it off.
  const overnightOn =
    count > 0 && dayKeys.every((k) => data.overnightNights.has(k));
  const premiumOn =
    count > 0 && dayKeys.every((k) => data.premiumDays?.has(k) ?? false);

  // The callbacks own their own optimistic flip + transition (and the cancel
  // confirm for overnight-off), so just fire them.
  function toggleOvernight(on: boolean) {
    if (count === 0) return;
    void callbacks.setOvernightNightsBatch?.({ nights: dayKeys, on });
  }

  function togglePremium(on: boolean) {
    if (count === 0) return;
    void callbacks.setPremiumDaysBatch?.({ dayKeys, on });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-foreground text-base font-medium">
          {firstDay === undefined
            ? "Pick one or more days"
            : count === 1
              ? denverDayLabel(firstDay)
              : `${count} days selected`}
        </h2>
        {/* The heading already carries the scope for a multi-day selection, and
            the painter repeats it where the create gestures are — one sentence,
            not two. */}
        {count === 1 && (
          <p className="text-muted-foreground text-xs">
            {"Paint walk hours below; set overnight & premium for this day."}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="toggle-overnight"
            className="text-foreground text-sm font-medium"
          >
            Overnight available
            <span className="text-muted-foreground block text-xs font-normal">
              {isBulk ? "for these days" : "House-sitting stays this night"}
            </span>
          </label>
          <Switch
            id="toggle-overnight"
            checked={overnightOn}
            onCheckedChange={toggleOvernight}
            disabled={disabled}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="toggle-premium"
            className="text-foreground text-sm font-medium"
          >
            <span className="inline-flex items-center gap-1">
              <Star
                aria-hidden="true"
                size={14}
                className="text-warning-foreground fill-current"
              />
              Premium day
            </span>
            <span className="text-muted-foreground block text-xs font-normal">
              Holiday surcharge applies
            </span>
          </label>
          <Switch
            id="toggle-premium"
            checked={premiumOn}
            onCheckedChange={togglePremium}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// AvailabilityClient
// ──────────────────────────────────────────────────────────────────────────────

export function AvailabilityClient({
  initialWindows,
  initialBusy,
  initialNights,
  initialPremiumDays,
  rules,
  nowIso,
}: {
  initialWindows: AvailabilityWindow[];
  initialBusy: AdminBusyRangeView[];
  initialNights: string[];
  /** Day-keys (YYYY-MM-DD) that carry a premium surcharge. */
  initialPremiumDays: string[];
  rules: BookingRuleSettings;
  /**
   * Server-authoritative "now" (ISO). Computed once on the server and threaded
   * through so SSR and hydration agree — a client-side `new Date()` here would
   * differ from the server's render instant and trip a hydration mismatch
   * (cells/past classification diverge). Static after load is fine for an admin
   * tool; the page re-fetches on every revalidation anyway.
   */
  nowIso: string;
}) {
  const { confirm, dialog } = useConfirm();
  const toast = useToast();
  // Single owner of the optimistic-mutation transition. EVERY useOptimistic
  // dispatch below runs inside startMutation so it's valid whether it fires
  // directly or from the cancel-confirm dialog's click handler (which is outside
  // any caller transition — dispatching there without this would throw, hang the
  // confirm, and strand the UI).
  const [, startMutation] = useTransition();

  // Server windows as TimeRanges; the optimistic layer flips bands instantly and
  // dissolves when the refreshed `initialWindows` becomes the new base.
  const serverWindows = useMemo<TimeRange[]>(
    () =>
      initialWindows.map((w) => ({
        startsAt: new Date(w.starts_at),
        endsAt: new Date(w.ends_at),
      })),
    [initialWindows],
  );
  const [optimisticWindows, applyOptimisticWindow] = useOptimistic(
    serverWindows,
    applyOptimisticWindows,
  );

  // Overnight nights drive the MONTH calendar fills (available vs unavailable),
  // so they get their own optimistic layer — same instant-flip / dissolve-on-
  // refresh / revert-on-conflict behaviour as the windows above.
  const serverNights = useMemo(() => new Set(initialNights), [initialNights]);
  const [optimisticNights, applyOptimisticNights] = useOptimistic(
    serverNights,
    (current: Set<string>, action: { nights: string[]; on: boolean }) => {
      const next = new Set(current);
      for (const n of action.nights) {
        if (action.on) next.add(n);
        else next.delete(n);
      }
      return next;
    },
  );

  // Premium days — same optimistic pattern as overnightNights.
  const serverPremiumDays = useMemo(
    () => new Set(initialPremiumDays),
    [initialPremiumDays],
  );
  const [optimisticPremiumDays, applyOptimisticPremiumDays] = useOptimistic(
    serverPremiumDays,
    (current: Set<string>, action: { dayKeys: string[]; on: boolean }) => {
      const next = new Set(current);
      for (const k of action.dayKeys) {
        if (action.on) next.add(k);
        else next.delete(k);
      }
      return next;
    },
  );

  // Day-keys that have any intraday window — drives the month's green fill so a
  // day reads available if it's overnight-bookable OR has open walk hours.
  const windowDays = useMemo(() => {
    const s = new Set<string>();
    for (const w of optimisticWindows) s.add(denverDayKey(w.startsAt));
    return s;
  }, [optimisticWindows]);

  const data: SchedulerData = useMemo(
    () => ({
      overnightNights: optimisticNights,
      windows: optimisticWindows,
      windowDays,
      busy: initialBusy.map(toBusyBlock),
      // AdminBusyRangeView has no concurrency class, so we pass all admin busy
      // here too; this slightly over-marks non-resident days in the month
      // (cosmetic only; admin can still select them). A future enrichment can
      // add class to narrow this.
      busyResident: initialBusy.map(toBusyBlock),
      // ADMIN parity (U2): lead-time greying is a client-booking affordance —
      // it must never grey days on Cal's availability calendar (and ADMIN_POLICY
      // skips the lead-time guard anyway). Zero it here; all other rules stay
      // live from settings.
      rules: { ...rules, minLeadTimeHours: 0 },
      now: new Date(nowIso),
      premiumDays: optimisticPremiumDays,
    }),
    [
      optimisticWindows,
      windowDays,
      optimisticNights,
      optimisticPremiumDays,
      initialBusy,
      rules,
      nowIso,
    ],
  );

  /**
   * Runs one mutation: dispatch its optimistic update, await the server action
   * inside the same transition (so the optimistic paint holds until the
   * revalidation lands, and reverts when the action refuses), then toast
   * anything that is not a success.
   *
   * The promise bridge is here because startTransition returns nothing: the
   * optimistic dispatch is only legal inside the transition, while the caller —
   * the painter committing a move — needs the result the transition awaited.
   */
  const runMutation = useCallback(
    <R extends { kind: string; message?: string }>(
      optimistic: () => void,
      action: () => Promise<R>,
    ): Promise<R | typeof ACTION_FAILED> =>
      new Promise((resolve) => {
        startMutation(async () => {
          // Resolved from `finally` so a throw in either thunk still settles the
          // bridge: an unsettled promise would hang the painter mid-commit with
          // the optimistic paint stuck on screen.
          let result: R | typeof ACTION_FAILED = ACTION_FAILED;
          try {
            optimistic();
            result = await action();
          } catch (cause) {
            console.error("availability mutation failed", cause);
          } finally {
            if (result.kind !== "success")
              toast.add({
                type: "error",
                title: "Couldn't save",
                description: result.message ?? ACTION_FAILED.message,
              });
            resolve(result);
          }
        });
      }),
    [startMutation, toast],
  );

  /**
   * Cancel-by-blocking gate. Given the bookings a block would destroy and the
   * `applyBlock` thunk that performs the server-side removal, this:
   *   - runs `applyBlock` directly when nothing is affected (silent block), or
   *   - confirms (listing each booking + its 100% refund), cancels each via
   *     cancelBooking (admin path forces fullRefund: true), then applies the
   *     block. Declining leaves everything untouched.
   *
   * `dayKey` is the day being edited; it dates the listed bookings that started
   * on some other day.
   */
  async function blockWithCancelGate<T>(
    affected: AdminBusyRangeView[],
    dayKey: string,
    applyBlock: () => Promise<T>,
  ): Promise<T | undefined> {
    if (affected.length === 0) {
      return applyBlock();
    }

    let result: T | undefined;
    await confirm({
      title: `Cancel ${affected.length} booking${affected.length === 1 ? "" : "s"} & block?`,
      destructive: true,
      confirmLabel: `Cancel ${affected.length} & block`,
      cancelLabel: "Keep bookings",
      // With payments off nothing was ever charged, so both refund lines would
      // promise a transaction that cannot happen. Drop them rather than reword
      // — the title, the destructive confirm and the named bookings carry the
      // rest (same call as the admin booking cancel).
      description: (
        <span className="flex flex-col gap-3">
          {PAYMENTS_ENABLED && (
            <span>
              Marking this time unavailable will cancel the following and fully
              refund the clients:
            </span>
          )}
          {affected.map((b) => (
            <span key={b.bookingId} className="flex flex-col">
              <span className="text-foreground font-medium">
                {affectedLabel(b, dayKey)}
              </span>
              {PAYMENTS_ENABLED && (
                <span>
                  Refund {centsToDollars(b.finalCents)} — 100% (you cancelled)
                </span>
              )}
            </span>
          ))}
        </span>
      ),
      onConfirm: async () => {
        for (const b of affected) {
          // fullRefund is forced server-side for admin cancels (decided by role).
          const res = await cancelBooking({ bookingId: b.bookingId });
          if (res.kind !== "success") {
            // Returning false only re-enables the confirm button, so the most
            // destructive step in the flow has to say why nothing happened.
            toast.add({
              type: "error",
              title: "Couldn't save",
              description:
                "message" in res ? res.message : ACTION_FAILED.message,
            });
            return false;
          }
        }
        result = await applyBlock();
        return true;
      },
    });
    return result;
  }

  // These callbacks do NOT call router.refresh(): each server action already
  // calls revalidatePath("/admin/availability"), which refreshes this route's
  // RSC data within the same transition. Relying on revalidation alone lets the
  // optimistic state dissolve seamlessly into the fresh server props.
  const callbacks: SchedulerCallbacks = useMemo(
    () => ({
      createWindowsBatch: async (input) =>
        // Optimistic add — synthesize the day windows so the bands appear before
        // the server round-trip lands.
        runMutation(
          () =>
            applyOptimisticWindow({
              type: "add",
              ranges: input.dayKeys.map((k) =>
                dayWindow(k, input.openMinute, input.closeMinute),
              ),
            }),
          () => createWindowsBatch(input),
        ),
      setWindowUnavailable: async (input) => {
        // Cancel-by-blocking: if any booking overlaps the slice, confirm +
        // cancel-with-refund before blocking; otherwise block silently.
        const affected = bookingsInWindowSlice(
          initialBusy,
          dayWindow(input.dayKey, input.fromMinute, input.toMinute),
        );
        const result = await blockWithCancelGate(affected, input.dayKey, () =>
          // Optimistic removal — interval-subtract the slice. Reverts if the
          // server refuses since revalidation won't fire.
          runMutation(
            () =>
              applyOptimisticWindow({
                type: "subtract",
                dayKey: input.dayKey,
                fromMinute: input.fromMinute,
                toMinute: input.toMinute,
              }),
            () => setWindowUnavailable(input),
          ),
        );
        // Declining the confirm leaves the window untouched. Report a NON-success
        // so the painter knows the removal didn't apply and snaps the window back
        // (and skips the paired create when this removal is half of a move).
        // No toast on that path: declining is Cal's own answer, not a refusal.
        return result ?? { kind: "conflict", bookings: [] };
      },
      setOvernightNightsBatch: async (input) => {
        // Turning nights OFF can strand bookings on those nights → gate it.
        // Turning ON never destroys anything → apply directly.
        const apply = () =>
          runMutation(
            () => applyOptimisticNights({ nights: input.nights, on: input.on }),
            () => setOvernightNightsBatch(input),
          );
        if (input.on) {
          return apply();
        }
        // The earliest targeted night dates the listed bookings that began on
        // some other day. With no night targeted there is nothing to strand,
        // so skip the gate.
        const [earliestNight] = [...input.nights].sort();
        if (earliestNight === undefined) return apply();
        const affected = bookingsOnNights(initialBusy, input.nights);
        const result = await blockWithCancelGate(
          affected,
          earliestNight,
          apply,
        );
        return result ?? { kind: "success" };
      },
      setPremiumDaysBatch: async (input) =>
        // Optimistic ★ flip; reverts if the server write fails.
        runMutation(
          () =>
            applyOptimisticPremiumDays({
              dayKeys: input.dayKeys,
              on: input.on,
            }),
          () => setPremiumDaysBatch(input.dayKeys, input.on),
        ),
    }),
    // blockWithCancelGate/confirm are stable enough across renders; initialBusy
    // is the affected-booking source and must stay fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      runMutation,
      applyOptimisticWindow,
      applyOptimisticNights,
      applyOptimisticPremiumDays,
      initialBusy,
    ],
  );

  return (
    <div className="flex flex-col gap-6">
      <Scheduler
        capabilities={ADMIN_CAPABILITIES}
        data={data}
        callbacks={callbacks}
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Scheduler.MonthGrid />
            {/* Persistent read-out of the selection, right under the grid it
                describes: which days are in it, and the one control that empties
                it (Escape does the same from the grid). */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Scheduler.SelectionSummary />
              <Scheduler.ClearDates />
            </div>
            <Scheduler.Legend />
          </div>
          <section
            // Names the region without claiming a count: the same section edits
            // one day or a whole selection.
            aria-label="Availability editor"
            className="border-border flex flex-col gap-5 border-t pt-6"
          >
            <DayControls />
            <Scheduler.DayPainter />
          </section>
        </div>
      </Scheduler>

      {dialog}
    </div>
  );
}
