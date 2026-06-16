"use client";

/**
 * AvailabilityClient — Cal's availability painting surface, built on the shared
 * compound <Scheduler>. PAINT-ONLY: this page creates/removes availability
 * windows and toggles overnight nights + premium days. It does NOT moderate
 * bookings — clicking a booked cell opens a READ-ONLY inspect card that links
 * out to the Bookings hub (where moderation lives) and the client record.
 *
 * Cancel-by-blocking: painting booked time unavailable is destructive, so the
 * removal callbacks intercept any affected bookings, pop a confirm listing each
 * one at a 100% (Cal-initiated) refund, then cancel each via cancelBooking
 * before applying the block. Empty time blocks silently.
 *
 * Server data (windows, busy, nights, rules) flows straight from props —
 * server actions revalidate this route, so there is no client copy to drift.
 *
 * Scheduler callbacks deliberately do NOT route through router.refresh(): each
 * server action revalidatePath()s "/admin/availability", refreshing this
 * route's RSC data within the same transition. They return the action result
 * directly so the Scheduler can surface conflicts/feedback.
 */

import { useState, useMemo, useEffect, useOptimistic } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, X } from "lucide-react";
import {
  useScheduler,
  denverMidnight,
  denverDayKey,
  denverMinutesSinceMidnight,
  cancelBooking,
  PetAvatar,
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
import { Surface } from "@/components/ui/surface";

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

const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pending approval",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
  no_show: "No-show",
};

function humanizeStatus(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** "Tue, Jun 7, 2:00 – 2:30 PM" (Denver). */
function denverRange(startIso: string, endIso: string): string {
  const date = new Date(startIso).toLocaleDateString("en-US", {
    timeZone: DENVER_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", {
      timeZone: DENVER_TZ,
      hour: "numeric",
      minute: "2-digit",
    });
  return `${date}, ${fmtTime(startIso)} – ${fmtTime(endIso)}`;
}

/** "Jane Doe · Dog Walk · 2:00 PM" — one line per affected booking in the confirm. */
function affectedLabel(b: AdminBusyRangeView): string {
  const time = new Date(b.startsAt).toLocaleTimeString("en-US", {
    timeZone: DENVER_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
  const who = b.clientName ?? "Unknown client";
  return `${who} · ${time}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Optimistic availability windows
// ──────────────────────────────────────────────────────────────────────────────
//
// "Mark available/unavailable" hits the server then revalidates — the grid only
// repaints once that round-trip lands, so the commit felt laggy. We mirror the
// mutation onto the local `windows` array via useOptimistic so the WeekGrid
// fills flip instantly; when the refreshed server data arrives it becomes the
// new base and the optimistic layer dissolves into it. On failure (e.g. a
// booking conflict refuses the removal) the transition ends without a refresh,
// so the optimistic op auto-reverts.

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

/**
 * Bookings affected by turning OFF the given overnight nights: any active
 * booking whose start day-key is one of the targeted nights (Denver).
 */
function bookingsOnNights(
  busy: AdminBusyRangeView[],
  nights: string[],
): AdminBusyRangeView[] {
  const targeted = new Set(nights);
  return busy.filter((b) => targeted.has(denverDayKey(new Date(b.startsAt))));
}

/**
 * InspectBridge — relays the Scheduler's in-context `inspectedBookingId` to the
 * outside `selectedBookingId` state that drives the inspect card. Rendered as a
 * child of <Scheduler> so it can read context. Consumes the inspection as a
 * one-shot pulse (clears it), so re-clicking the same booking re-opens.
 */
function InspectBridge({ onInspect }: { onInspect: (id: string) => void }) {
  const { selection } = useScheduler();
  const id = selection.inspectedBookingId;
  const clear = selection.clearInspection;
  useEffect(() => {
    if (id) {
      onInspect(id);
      clear();
    }
  }, [id, onInspect, clear]);
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Read-only inspect card
// ──────────────────────────────────────────────────────────────────────────────

function InspectCard({
  booking,
  onClose,
}: {
  booking: AdminBusyRangeView;
  onClose: () => void;
}) {
  return (
    <Surface
      as="section"
      variant="plain"
      aria-label="Booking details"
      className="p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-foreground text-sm font-semibold">
            {booking.clientName ?? "Unknown client"}
          </h2>
          <p className="text-muted-foreground text-xs">
            {humanizeStatus(booking.status)}
          </p>
          <p className="text-muted-foreground text-xs">
            {denverRange(booking.startsAt, booking.endsAt)}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close booking details"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded focus-visible:ring-2 focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {booking.pets.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {booking.pets.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-xs">
              <PetAvatar
                name={p.name}
                species={p.species}
                photoUrl={p.photoUrl}
                size={28}
              />
              <span className="text-foreground">{p.name}</span>
              <span className="text-muted-foreground">({p.species})</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <Link
          href={`/admin/bookings?booking=${booking.bookingId}`}
          className="text-brand-strong hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded font-medium focus-visible:ring-2 focus-visible:outline-none"
        >
          Manage on Bookings
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <Link
          href={`/admin/clients/${booking.clientId}`}
          className="text-brand-strong hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded font-medium focus-visible:ring-2 focus-visible:outline-none"
        >
          View client
          <ExternalLink className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <p className="text-muted-foreground mt-3 text-xs">
        Availability is paint-only — moderation lives on Bookings.
      </p>
    </Surface>
  );
}

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
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(
    null,
  );
  const { confirm, dialog } = useConfirm();

  const selectedBooking =
    initialBusy.find((b) => b.bookingId === selectedBookingId) ?? null;

  // Server windows as TimeRanges; the optimistic layer flips fills instantly and
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

  const data: SchedulerData = useMemo(
    () => ({
      overnightNights: optimisticNights,
      windows: optimisticWindows,
      busy: initialBusy.map(toBusyBlock),
      // AdminBusyRangeView has no concurrency class, so we pass all admin busy
      // here too; this slightly over-marks non-resident days in the month
      // (cosmetic only; admin can still select them). A future enrichment can
      // add class to narrow this.
      busyResident: initialBusy.map(toBusyBlock),
      // ADMIN parity (U2): lead-time greying is a client-booking affordance —
      // it must never grey days on Cal's availability-painting calendar (and
      // ADMIN_POLICY skips the lead-time guard anyway). Zero it here; all
      // other rules stay live from settings.
      rules: { ...rules, minLeadTimeHours: 0 },
      now: new Date(nowIso),
      premiumDays: optimisticPremiumDays,
    }),
    [
      optimisticWindows,
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
        // Optimistic add — synthesize the day windows so the grid flips green
        // before the server round-trip lands. Runs inside WeekActions' transition.
        applyOptimisticWindow({
          type: "add",
          ranges: input.dayKeys.map((k) =>
            dayWindow(k, input.openMinute, input.closeMinute),
          ),
        });
        return createWindowsBatch(input);
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
        const result = await blockWithCancelGate(affected, async () => {
          // Optimistic removal — interval-subtract the slice. Reverts if the
          // server refuses (booking conflict) since revalidation won't fire.
          applyOptimisticWindow({
            type: "subtract",
            dayKey: input.dayKey,
            fromMinute: input.fromMinute,
            toMinute: input.toMinute,
          });
          return setWindowUnavailable(input);
        });
        // Declining the confirm = no block: report success so the Scheduler
        // treats it as a no-op rather than an error.
        return result ?? { kind: "success" };
      },
      setOvernightNightsBatch: async (input) => {
        // Turning nights OFF can strand bookings on those nights → gate it.
        // Turning ON never destroys anything → apply directly.
        const apply = async () => {
          applyOptimisticNights({ nights: input.nights, on: input.on });
          return setOvernightNightsBatch(input);
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
        applyOptimisticPremiumDays({ dayKeys: input.dayKeys, on: input.on });
        return setPremiumDaysBatch(input.dayKeys, input.on);
      },
    }),
    // blockWithCancelGate/confirm are stable enough across renders; initialBusy
    // is the affected-booking source and must stay fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
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
        <InspectBridge onInspect={setSelectedBookingId} />
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="flex flex-col gap-3">
            <Scheduler.MonthGrid />
            <Scheduler.SelectionSummary />
            <Scheduler.Legend />
          </div>
          <Scheduler.DayPanel />
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_16rem]">
          <Scheduler.WeekGrid />
          <Scheduler.WeekActions />
        </div>
      </Scheduler>

      {selectedBooking && (
        <InspectCard
          booking={selectedBooking}
          onClose={() => setSelectedBookingId(null)}
        />
      )}

      {dialog}
    </div>
  );
}
