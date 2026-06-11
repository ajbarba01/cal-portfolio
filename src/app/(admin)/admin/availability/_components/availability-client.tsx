"use client";

/**
 * AvailabilityClient — Cal's availability + booking management via the
 * compound <Scheduler>. The Scheduler handles window creation/block-out and
 * overnight-night toggling. This client owns the wiring: it passes mutation
 * callbacks to the Scheduler, preserves booking moderation (cancel/approve/
 * decline/no-show) via the BusySidePanel, and uses router.refresh() to reload
 * server-rendered data after mutations.
 *
 * Server data (windows, busy, nights, rules) flows straight from props —
 * refresh re-renders the page and hands down fresh props, so there is no
 * client copy to drift.
 *
 * Scheduler callbacks deliberately do NOT route through run() — they return
 * the action result directly so panels can render conflicts/feedback. Booking
 * moderation still uses run() (fire-and-forget, result surfaced via error state).
 */

import {
  useState,
  useTransition,
  useMemo,
  useEffect,
  useOptimistic,
} from "react";
import { useRouter } from "next/navigation";
import {
  useScheduler,
  denverMidnight,
  cancelBooking,
  markNoShow,
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
  approveBooking,
  declineBooking,
} from "@/features/admin";
import type { AvailabilityWindow, AdminBusyRangeView } from "@/features/admin";
import { BusySidePanel } from "./busy-side-panel";

type ActionResult = { kind: string } & Record<string, unknown>;

function resultError(result: ActionResult): string | null {
  if (result.kind === "success") return null;
  return typeof result.message === "string"
    ? result.message
    : `Action failed: ${result.kind}`;
}

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

function denverLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: DENVER_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Optimistic availability windows
// ──────────────────────────────────────────────────────────────────────────────
//
// "Mark available/unavailable" hits the server then router.refresh()es — the
// grid only repaints once that round-trip lands, so the commit felt laggy. We
// mirror the mutation onto the local `windows` array via useOptimistic so the
// WeekGrid fills flip instantly; when the refreshed server data arrives it
// becomes the new base and the optimistic layer dissolves into it. On failure
// (e.g. a booking conflict refuses the removal) the transition ends without a
// refresh, so the optimistic op auto-reverts.
//
// Pure helpers (window math is the SAME shape the server returns — no grid-cell
// coupling): synthesize day windows for "add", interval-subtract a slice for
// "remove".

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

/**
 * InspectBridge — relays the Scheduler's in-context `inspectedBookingId` to the
 * outside `selectedBookingId` state that drives BusySidePanel. Rendered as a
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
   * tool; the page re-fetches on every router.refresh anyway.
   */
  nowIso: string;
}) {
  const router = useRouter();
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  /** Run a server action, surface any error, refresh on success. */
  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      const message = resultError(result);
      if (message) {
        setError(message);
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

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
      rules,
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

  // These callbacks do NOT call router.refresh(): each server action already
  // calls revalidatePath("/admin/availability"), which refreshes this route's
  // RSC data within the same transition. An extra router.refresh() was a second,
  // redundant full refetch — doubling the round-trip and causing the optimistic
  // layer to briefly revert before the refresh landed (the "slow"/flicker feel).
  // Relying on revalidation alone lets the optimistic state dissolve seamlessly
  // into the fresh server props as the transition resolves.
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
        // Optimistic removal — interval-subtract the slice. Reverts if the
        // server refuses (booking conflict) since revalidation won't fire.
        applyOptimisticWindow({
          type: "subtract",
          dayKey: input.dayKey,
          fromMinute: input.fromMinute,
          toMinute: input.toMinute,
        });
        return setWindowUnavailable(input);
      },
      setOvernightNightsBatch: async (input) => {
        // Optimistic month-fill flip; reverts if removal hits a booking conflict.
        applyOptimisticNights({ nights: input.nights, on: input.on });
        return setOvernightNightsBatch(input);
      },
      setPremiumDaysBatch: async (input) => {
        // Optimistic ★ flip; reverts if server write fails.
        applyOptimisticPremiumDays({ dayKeys: input.dayKeys, on: input.on });
        return setPremiumDaysBatch(input.dayKeys, input.on);
      },
    }),
    [applyOptimisticWindow, applyOptimisticNights, applyOptimisticPremiumDays],
  );

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

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

      {/* Bookings — select a booking to open the moderation panel */}
      {initialBusy.length > 0 && (
        <section aria-label="Bookings">
          <h2 className="text-foreground mb-2 text-sm font-semibold">
            Bookings
          </h2>
          <ul className="flex flex-col gap-1">
            {initialBusy.map((b) => (
              <li key={b.bookingId}>
                <button
                  type="button"
                  onClick={() => setSelectedBookingId(b.bookingId)}
                  className="bg-card border-border hover:bg-accent text-foreground w-full rounded border px-3 py-2 text-left text-xs transition-colors"
                >
                  <span className="font-medium">
                    {b.clientName ?? "Unknown client"}
                  </span>
                  <span className="text-muted-foreground mx-1">·</span>
                  <span className="text-muted-foreground">{b.status}</span>
                  <span className="text-muted-foreground mx-1">·</span>
                  <span className="text-muted-foreground">
                    {denverLabel(b.startsAt)} — {denverLabel(b.endsAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selectedBooking && (
        <BusySidePanel
          booking={selectedBooking}
          pending={isPending}
          onClose={() => setSelectedBookingId(null)}
          onCancel={(id) =>
            run(
              () => cancelBooking({ bookingId: id }),
              () => setSelectedBookingId(null),
            )
          }
          onApprove={(id) => run(() => approveBooking(id))}
          onDecline={(id) =>
            run(
              () => declineBooking(id),
              () => setSelectedBookingId(null),
            )
          }
          onNoShow={(id) =>
            run(
              () => markNoShow(id),
              () => setSelectedBookingId(null),
            )
          }
        />
      )}
    </div>
  );
}
