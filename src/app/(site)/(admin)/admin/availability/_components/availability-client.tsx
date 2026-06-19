"use client";

/**
 * AvailabilityClient — Cal's availability editing surface, built on the shared
 * compound <Scheduler>. ONE DAY AT A TIME: pick a day on the month calendar,
 * then paint its intraday walk windows on the <Scheduler.DayPainter> timeline
 * and flip its overnight + premium status with per-day toggles.
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
 * RSC data within the same transition. They return the action result directly so
 * the DayPainter can surface conflicts/feedback.
 */

import { useMemo, useOptimistic, useTransition } from "react";
import {
  denverMidnight,
  denverDayKey,
  denverMinutesSinceMidnight,
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
  createWindowsBatch,
  setWindowUnavailable,
  setOvernightNightsBatch,
  setPremiumDaysBatch,
} from "@/features/admin";
import type { AvailabilityWindow, AdminBusyRangeView } from "@/features/admin";
import { useConfirm } from "@/components/feedback/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { Star } from "lucide-react";

const DENVER_TZ = "America/Denver";

/** Map an enriched admin busy range to a BusyBlock, preserving booking identity. */
function toBusyBlock(b: AdminBusyRangeView): BusyBlock {
  return {
    startsAt: new Date(b.startsAt),
    endsAt: new Date(b.endsAt),
    id: b.bookingId,
    label: b.clientName ?? undefined,
  };
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** "Jane Doe · 2:00 PM" — one line per affected booking in the confirm. */
function affectedLabel(b: AdminBusyRangeView): string {
  const time = new Date(b.startsAt).toLocaleTimeString("en-US", {
    timeZone: DENVER_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
  const who = b.clientName ?? "Unknown client";
  return `${who} · ${time}`;
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

/**
 * Bookings affected by removing the intraday slice [fromMinute, toMinute) on
 * `dayKey`: rows whose Denver day-key matches AND whose intraday minute range
 * overlaps the slice. Whole-day bookings (00:00→00:00 next day) read as
 * [0, 1440) on their start day so they count for any same-day slice.
 */
function bookingsInWindowSlice(
  busy: AdminBusyRangeView[],
  dayKey: string,
  fromMinute: number,
  toMinute: number,
): AdminBusyRangeView[] {
  return busy.filter((b) => {
    const start = new Date(b.startsAt);
    if (denverDayKey(start) !== dayKey) return false;
    const startMin = denverMinutesSinceMidnight(start);
    const endRaw = denverMinutesSinceMidnight(new Date(b.endsAt));
    // 00:00 end means it runs to (or past) midnight → treat as 1440 on this day.
    const endMin = endRaw <= startMin ? 1440 : endRaw;
    return startMin < toMinute && endMin > fromMinute;
  });
}

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
// DayControls — selected-day header + per-day overnight / premium toggles
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Reads the single selected day from context and exposes its overnight + premium
 * status as toggles. Each calls the context callback for just that day (the
 * callbacks own the optimistic flip + cancel-gate). Disabled until a day is
 * picked.
 */
function DayControls() {
  const { selection, data, callbacks } = useScheduler();

  const dayKey =
    selection.state.selectedDays.size > 0
      ? [...selection.state.selectedDays][0]
      : null;

  const overnightOn = dayKey ? data.overnightNights.has(dayKey) : false;
  const premiumOn = dayKey ? (data.premiumDays?.has(dayKey) ?? false) : false;
  const disabled = dayKey === null;

  // The callbacks own their own optimistic flip + transition (and the cancel
  // confirm for overnight-off), so just fire them.
  function toggleOvernight(on: boolean) {
    if (!dayKey) return;
    void callbacks.setOvernightNightsBatch?.({ nights: [dayKey], on });
  }

  function togglePremium(on: boolean) {
    if (!dayKey) return;
    void callbacks.setPremiumDaysBatch?.({ dayKeys: [dayKey], on });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-foreground text-base font-medium">
          {dayKey ? denverDayLabel(dayKey) : "Select a day"}
        </h2>
        <p className="text-muted-foreground text-xs">
          {dayKey
            ? "Paint walk hours below; set overnight & premium for this day."
            : "Pick a day on the calendar to edit its availability."}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="toggle-overnight"
            className="text-foreground text-sm font-medium"
          >
            Overnight available
            <span className="text-muted-foreground block text-xs font-normal">
              House-sitting stays this night
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
   * Cancel-by-blocking gate. Given the bookings a block would destroy and the
   * `applyBlock` thunk that performs the server-side removal, this:
   *   - runs `applyBlock` directly when nothing is affected (silent block), or
   *   - confirms (listing each booking + its 100% refund), cancels each via
   *     cancelBooking (admin path forces fullRefund: true), then applies the
   *     block. Declining leaves everything untouched.
   */
  async function blockWithCancelGate<T>(
    affected: AdminBusyRangeView[],
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
      description: (
        <span className="flex flex-col gap-3">
          <span>
            Marking this time unavailable will cancel the following and fully
            refund the clients:
          </span>
          {affected.map((b) => (
            <span key={b.bookingId} className="flex flex-col">
              <span className="text-foreground font-medium">
                {affectedLabel(b)}
              </span>
              <span>Refund {dollars(b.finalCents)} — 100% (you cancelled)</span>
            </span>
          ))}
        </span>
      ),
      onConfirm: async () => {
        for (const b of affected) {
          // fullRefund is forced server-side for admin cancels (decided by role).
          const res = await cancelBooking({ bookingId: b.bookingId });
          if (res.kind !== "success") return false;
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
      createWindowsBatch: async (input) => {
        // Optimistic add — synthesize the day windows so the bands appear before
        // the server round-trip lands. Optimistic + server both inside the
        // transition so the optimistic state holds until revalidation arrives.
        startMutation(async () => {
          applyOptimisticWindow({
            type: "add",
            ranges: input.dayKeys.map((k) =>
              dayWindow(k, input.openMinute, input.closeMinute),
            ),
          });
          await createWindowsBatch(input);
        });
        return { kind: "success" };
      },
      setWindowUnavailable: async (input) => {
        // Cancel-by-blocking: if any booking overlaps the slice, confirm +
        // cancel-with-refund before blocking; otherwise block silently.
        const affected = bookingsInWindowSlice(
          initialBusy,
          input.dayKey,
          input.fromMinute,
          input.toMinute,
        );
        const apply = async () => {
          // Optimistic removal — interval-subtract the slice. Reverts if the
          // server refuses since revalidation won't fire. Wrapped in the
          // transition so it's valid even when fired from the confirm dialog.
          startMutation(async () => {
            applyOptimisticWindow({
              type: "subtract",
              dayKey: input.dayKey,
              fromMinute: input.fromMinute,
              toMinute: input.toMinute,
            });
            await setWindowUnavailable(input);
          });
          return { kind: "success" } as const;
        };
        const result = await blockWithCancelGate(affected, apply);
        // Declining the confirm leaves the window untouched. Report a NON-success
        // so the painter knows the removal didn't apply and snaps the window back
        // (and skips the paired create when this removal is half of a move).
        return result ?? { kind: "conflict", bookings: [] };
      },
      setOvernightNightsBatch: async (input) => {
        // Turning nights OFF can strand bookings on those nights → gate it.
        // Turning ON never destroys anything → apply directly.
        const apply = async () => {
          startMutation(async () => {
            applyOptimisticNights({ nights: input.nights, on: input.on });
            await setOvernightNightsBatch(input);
          });
          return { kind: "success" } as const;
        };
        if (input.on) {
          return apply();
        }
        const affected = bookingsOnNights(initialBusy, input.nights);
        const result = await blockWithCancelGate(affected, apply);
        return result ?? { kind: "success" };
      },
      setPremiumDaysBatch: async (input) => {
        // Optimistic ★ flip; reverts if server write fails.
        startMutation(async () => {
          applyOptimisticPremiumDays({ dayKeys: input.dayKeys, on: input.on });
          await setPremiumDaysBatch(input.dayKeys, input.on);
        });
        return { kind: "success" };
      },
    }),
    // blockWithCancelGate/confirm are stable enough across renders; initialBusy
    // is the affected-booking source and must stay fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      startMutation,
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
            <Scheduler.Legend />
          </div>
          <section
            aria-label="Selected day availability"
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
