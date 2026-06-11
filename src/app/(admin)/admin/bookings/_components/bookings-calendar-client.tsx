"use client";

/**
 * BookingsCalendarClient — the admin Bookings hub.
 *
 * A dual-view surface (Calendar ⇄ List) sharing ONE filter bar (status + client
 * search). Both views are driven by the pure Task-7 predicates
 * (filterBookings / daysWithMatch / isolate) so they never disagree.
 *
 *   List view     — chronological BookingRow list of the filtered rows, paginated.
 *   Calendar view — full-width vertical stack: the shared <Scheduler> MonthGrid
 *                   (booked fills + day selection + click-to-inspect) → a
 *                   read-only day timeline for the selected day → that day's
 *                   BookingRow list.
 *
 * SEARCH-GREYS CONTEXT
 *   When a query / non-"all" status is active, booked days with no match are
 *   HATCHED via SchedulerData.dimmedDays (token-derived stripe, see globals.css);
 *   non-matching timeline blocks are GREYED. Clicking a timeline block (or a
 *   booked month cell) ISOLATES that booking in the list; "Show all" restores.
 *
 * SHARED-SCHEDULER SAFETY
 *   The Scheduler is shared with public booking. We only pass the additive,
 *   optional `dimmedDays` field and the INSPECT_CAPABILITIES preset; the day
 *   timeline here is a hub-local read-only component (the shared DayTimeline
 *   renders availability windows, not arbitrary booking blocks), so no shared
 *   timeline behaviour is touched. `?booking={id}` deep-links pre-isolate a row.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, List } from "lucide-react";

import { useConfirm } from "@/components/feedback/confirm-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { Multiswitch } from "@/components/ui/multiswitch";
import { Pagination } from "@/components/ui/pagination";
import { ResultCount } from "@/components/ui/result-count";
import { SearchField } from "@/components/ui/search-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { paginate } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import {
  approveBooking,
  declineBooking,
  filterBookings,
  daysWithMatch,
  isolate,
  type BookingCalendarRow,
  type BookingStatusFilter,
} from "@/features/admin";
import {
  cancelBooking,
  useScheduler,
  Scheduler,
  INSPECT_CAPABILITIES,
  denverDayKey,
  buildInspectSchedulerData,
} from "@/features/booking/index.client";
import type { BusyBlock, SchedulerData } from "@/features/booking/index.client";

import { BookingRow } from "./booking-row";

// ── constants / helpers ─────────────────────────────────────────────────────

const TIME_ZONE = "America/Denver";

const STATUS_OPTIONS: { value: BookingStatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending_approval", label: "Pending approval" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "declined", label: "Declined" },
  { value: "no_show", label: "No-show" },
];

const PAGE_SIZE = 12;

const denverDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toDenverDayKey(iso: string): string {
  return denverDayFormatter.format(new Date(iso));
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

function dayHeading(dayKey: string): string {
  // dayKey is "YYYY-MM-DD" (Denver). Render via a noon-UTC anchor to avoid the
  // date sliding a day under the timezone formatter.
  const [y, m, d] = dayKey.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Map a booking row to a BusyBlock, preserving booking identity for inspect. */
function toBusyBlock(b: BookingCalendarRow): BusyBlock {
  return {
    startsAt: new Date(b.starts_at),
    endsAt: new Date(b.ends_at),
    id: b.id,
    label: b.client_name ?? undefined,
  };
}

type View = "calendar" | "list";

const VIEW_OPTIONS = [
  { value: "calendar" as const, label: "Calendar", icon: CalendarDays },
  { value: "list" as const, label: "List", icon: List },
];

type ActionResult = { kind: string };

// ──────────────────────────────────────────────────────────────────────────────
// InspectBridge — relays the Scheduler's in-context inspectedBookingId (set when
// a booked month cell is clicked) out to the hub. Clicking a booked month cell
// SELECTS that booking's day (reveals the day timeline); the finer-grained
// isolate-one-booking action lives on the timeline blocks. Mirrors the
// availability client pattern; consumes the inspection as a one-shot pulse.
// ──────────────────────────────────────────────────────────────────────────────

function InspectBridge({ onPickDay }: { onPickDay: () => void }) {
  const { selection, data } = useScheduler();
  const id = selection.inspectedBookingId;
  const { clearInspection, toggleDay, clearDays } = selection;
  useEffect(() => {
    if (!id) return;
    const block = data.busy.find((b) => b.id === id);
    if (block) {
      const key = denverDayKey(block.startsAt);
      clearDays();
      toggleDay(key);
      onPickDay();
    }
    clearInspection();
  }, [id, data.busy, clearInspection, toggleDay, clearDays, onPickDay]);
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// SelectedDayBridge — reads the Scheduler's single-day selection out to the hub
// so the read-only timeline + day list track the month grid. The hub owns the
// timeline/list (the shared DayTimeline renders availability, not bookings).
// ──────────────────────────────────────────────────────────────────────────────

function SelectedDayBridge({
  onSelect,
}: {
  onSelect: (dayKey: string | null) => void;
}) {
  const { selection } = useScheduler();
  const days = selection.state.selectedDays;
  useEffect(() => {
    const first = days.size > 0 ? [...days][0] : null;
    onSelect(first ?? null);
  }, [days, onSelect]);
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// BookingDayTimeline — read-only timeline of one day's booking blocks.
//
// A small, hub-local planner-style strip: hour gutter + vertically-positioned
// blocks for each booking that day. Non-matching blocks are greyed; clicking a
// block isolates it. This is intentionally NOT the shared Scheduler.DayTimeline
// (which renders availability windows + a single selectable slot, not arbitrary
// booking blocks) — keeping it local guarantees the public booking timeline is
// untouched.
// ──────────────────────────────────────────────────────────────────────────────

// The timeline always shows the full day (00:00–24:00) so it stays stable
// regardless of which bookings fall on the selected day. ~0.45px/min keeps a
// full 24h ≈ 648px tall.
const PX_PER_MIN = 0.45;
const DAY_START_MIN = 0;
const DAY_END_MIN = 1440;

function denverMinutes(iso: string): number {
  // Minutes since Denver midnight for the given instant.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (hour % 24) * 60 + minute;
}

function BookingDayTimeline({
  dayKey,
  dayBookings,
  matchedIds,
  searching,
  onIsolate,
}: {
  dayKey: string;
  dayBookings: BookingCalendarRow[];
  matchedIds: Set<string>;
  searching: boolean;
  onIsolate: (id: string) => void;
}) {
  const placed = useMemo(() => {
    return dayBookings
      .map((b) => {
        const startMin = denverMinutes(b.starts_at);
        let endMin = denverMinutes(b.ends_at);
        // Same-day end before start (overnight crossing midnight) → clamp to EOD.
        if (endMin <= startMin) endMin = 1440;
        return { booking: b, startMin, endMin };
      })
      .sort((a, b) => a.startMin - b.startMin);
  }, [dayBookings]);

  // Always render the full-day track (even when the day has no bookings) so the
  // timeline is a stable, complete clock under the month grid.
  const trackTop = DAY_START_MIN;
  const trackBottom = DAY_END_MIN;
  const trackHeight = (trackBottom - trackTop) * PX_PER_MIN;

  const hours: number[] = [];
  for (let h = trackTop; h < trackBottom; h += 60) hours.push(h);

  function hourLabel(min: number): string {
    const h24 = Math.floor(min / 60) % 24;
    const suffix = h24 < 12 ? "AM" : "PM";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12} ${suffix}`;
  }

  return (
    <div className="bg-card border-border grid grid-cols-[3.25rem_1fr] overflow-hidden rounded-xl border">
      {/* hour gutter */}
      <div
        className="border-border relative border-r py-2"
        style={{ height: trackHeight }}
        aria-hidden="true"
      >
        {hours.map((min) => {
          const top = (min - trackTop) * PX_PER_MIN;
          return (
            <div
              key={min}
              className="text-muted-foreground absolute right-2 -translate-y-1/2 text-[10px] font-medium"
              style={{ top: top + 8 }}
            >
              {hourLabel(min)}
            </div>
          );
        })}
      </div>

      {/* blocks */}
      <div className="relative p-2" style={{ height: trackHeight }}>
        {/* ruled hour lines */}
        {hours.map((min) => {
          const top = (min - trackTop) * PX_PER_MIN;
          return (
            <div
              key={min}
              className="border-border/50 pointer-events-none absolute inset-x-0 border-t"
              style={{ top: top + 8 }}
              aria-hidden="true"
            />
          );
        })}

        {placed.length === 0 && (
          <div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
            No bookings on {dayHeading(dayKey)}.
          </div>
        )}

        {placed.map(({ booking, startMin, endMin }) => {
          const top = (startMin - trackTop) * PX_PER_MIN;
          const height = Math.max((endMin - startMin) * PX_PER_MIN, 24);
          const isMatch = !searching || matchedIds.has(booking.id);
          return (
            <button
              key={booking.id}
              type="button"
              onClick={() => onIsolate(booking.id)}
              className={cn(
                "focus-visible:ring-ring absolute inset-x-2 flex flex-col justify-center rounded-md px-2.5 py-1 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none",
                isMatch
                  ? "bg-status-booked text-status-booked-foreground hover:brightness-95"
                  : "bg-muted text-muted-foreground hover:brightness-95",
              )}
              style={{ top: top + 8, height }}
              title="Click to isolate this booking"
            >
              <span className="truncate font-semibold">
                {timeLabel(booking.starts_at)} ·{" "}
                {booking.client_name ?? "Unknown client"}
              </span>
              {height >= 34 && (
                <span className="truncate opacity-80">
                  {booking.service_name ?? "Service"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// SectionLabel — the small uppercase clay caption used between calendar stacks.
// ──────────────────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-brand-strong text-[0.7rem] font-semibold tracking-wide uppercase">
      {children}
    </p>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Hub
// ──────────────────────────────────────────────────────────────────────────────

export function BookingsCalendarClient({
  bookings,
  monthStartIso,
  nowIso,
}: {
  bookings: BookingCalendarRow[];
  monthStartIso: string;
  nowIso: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { confirm, dialog } = useConfirm();
  const [isPending, startTransition] = useTransition();

  // ── ?booking={id} deep-link (from Availability "Manage on Bookings →") ──────
  // Seeded into initial state (not an effect) so the deep-link lands in List
  // view pre-isolated on first paint without a cascading re-render.
  const deepLinkId = useMemo(() => {
    const id = searchParams.get("booking");
    return id && bookings.some((b) => b.id === id) ? id : null;
    // The deep-link is an entry cue read once; later filter changes own isolation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>(deepLinkId ? "list" : "calendar");
  const [status, setStatus] = useState<BookingStatusFilter>("all");
  const [service, setService] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [isolatedId, setIsolatedId] = useState<string | null>(deepLinkId);
  const [page, setPage] = useState(1);

  const searching =
    query.trim() !== "" || status !== "all" || service !== "all";

  // ── service options (distinct sorted service_names from all bookings) ───────
  const serviceOptions = useMemo(() => {
    const names = new Set<string>();
    for (const b of bookings) {
      if (b.service_name != null) names.add(b.service_name);
    }
    return [...names].sort();
  }, [bookings]);

  // ── filtered rows (drives BOTH views) ───────────────────────────────────────
  const filtered = useMemo(
    () => filterBookings(bookings, { status, query, service }),
    [bookings, status, query, service],
  );

  // ── matched ids + days (for greys) ──────────────────────────────────────────
  const matchedIds = useMemo(
    () => new Set(filtered.map((b) => b.id)),
    [filtered],
  );

  // dimmedDays: booked days that do NOT match the active filter. Undefined when
  // not searching so the shared MonthGrid renders identically to public booking.
  const dimmedDays = useMemo<Set<string> | undefined>(() => {
    if (!searching) return undefined;
    const matchedDayKeys = daysWithMatch(filtered, "");
    const dimmed = new Set<string>();
    for (const b of bookings) {
      const key = toDenverDayKey(b.starts_at);
      if (!matchedDayKeys.has(key)) dimmed.add(key);
    }
    return dimmed;
  }, [searching, filtered, bookings]);

  // ── Scheduler data (bookings as busy blocks) ────────────────────────────────
  // Read-only inspect calendar: every day is bookable (so any day can be clicked
  // to reveal its — possibly empty — timeline) while booked days classify busy
  // and inspect rather than paint. Shared with the account bookings calendar.
  const data = useMemo<SchedulerData>(
    () =>
      buildInspectSchedulerData({
        blocks: bookings.map(toBusyBlock),
        monthStartIso,
        nowIso,
        dimmedDays,
      }),
    [bookings, monthStartIso, nowIso, dimmedDays],
  );

  // ── action runner ───────────────────────────────────────────────────────────
  function run(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.kind === "success") router.refresh();
      else setError(`Action failed: ${result.kind}`);
    });
  }

  function onApprove(id: string) {
    run(() => approveBooking(id));
  }
  function onDecline(id: string) {
    run(() => declineBooking(id));
  }
  async function onCancel(id: string) {
    const ok = await confirm({
      title: "Cancel this booking?",
      description: "The client is refunded in full and notified.",
      confirmLabel: "Cancel booking",
      destructive: true,
    });
    if (ok) run(() => cancelBooking({ bookingId: id, fullRefund: true }));
  }

  // ── derived lists ────────────────────────────────────────────────────────────

  // The list view rows: isolated booking wins; otherwise filtered + paginated.
  const isolatedRow = isolatedId ? isolate(filtered, isolatedId) : null;
  const listRows =
    isolatedRow && isolatedRow.length > 0 ? isolatedRow : filtered;
  // Isolated view shows the single row unpaginated; otherwise numbered pages.
  const listPage = paginate(listRows, page, PAGE_SIZE);
  const pagedRows = isolatedRow ? listRows : listPage.items;

  // Calendar: the selected day's bookings (filtered? — keep context: show ALL
  // that day, grey the non-matches in the timeline). Day list = matched-on-day,
  // unless a block is isolated.
  const dayBookings = useMemo(() => {
    if (!selectedDay) return [];
    return bookings
      .filter((b) => toDenverDayKey(b.starts_at) === selectedDay)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [bookings, selectedDay]);

  const calendarDayList = useMemo(() => {
    if (isolatedId) {
      const found = dayBookings.filter((b) => b.id === isolatedId);
      if (found.length > 0) return found;
    }
    // Otherwise the matching bookings on the selected day.
    if (!searching) return dayBookings;
    return dayBookings.filter((b) => matchedIds.has(b.id));
  }, [dayBookings, isolatedId, searching, matchedIds]);

  function resetIsolation() {
    setIsolatedId(null);
  }

  // Changing filters clears any block-level isolation (it would mask the filter).
  function onStatusChange(next: BookingStatusFilter) {
    setStatus(next);
    setIsolatedId(null);
    setPage(1);
  }
  function onServiceChange(next: string) {
    setService(next);
    setIsolatedId(null);
    setPage(1);
  }
  function onQueryChange(next: string) {
    setQuery(next);
    setIsolatedId(null);
    setPage(1);
  }

  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === status)?.label ?? "All statuses";

  const serviceLabel =
    service === "all" ? "All services" : (service ?? "All services");

  // ── filter bar (shared by both views) ───────────────────────────────────────
  const filterBar = (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Select
        value={status}
        onValueChange={(v) => {
          if (v !== null) onStatusChange(v as BookingStatusFilter);
        }}
      >
        <SelectTrigger aria-label="Filter by status" className="w-44">
          <SelectValue>{statusLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={service}
        onValueChange={(v) => {
          if (v !== null) onServiceChange(v);
        }}
      >
        <SelectTrigger aria-label="Filter by service" className="w-44">
          <SelectValue>{serviceLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All services</SelectItem>
          {serviceOptions.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <SearchField
        value={query}
        onValueChange={onQueryChange}
        placeholder="Search client…"
        ariaLabel="Search client"
        className="max-w-64"
      />

      <Multiswitch
        options={VIEW_OPTIONS}
        value={view}
        onValueChange={setView}
        ariaLabel="Switch view"
      />

      <ResultCount count={filtered.length} noun="booking" />
    </div>
  );

  // ── monthLabel for the calendar caption ─────────────────────────────────────
  const monthLabel = new Date(monthStartIso).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {filterBar}

      {/* "Show all" reset when a booking is isolated */}
      {isolatedId ? (
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            Showing 1 isolated booking.
          </span>
          <button
            type="button"
            onClick={resetIsolation}
            className="text-brand-strong font-semibold hover:underline"
          >
            Show all
          </button>
        </div>
      ) : null}

      {view === "list" ? (
        // ── LIST VIEW ──────────────────────────────────────────────────────
        listRows.length === 0 ? (
          <EmptyState title="No bookings match." />
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {pagedRows.map((booking) => (
                <BookingRow
                  key={booking.id}
                  booking={booking}
                  onApprove={onApprove}
                  onDecline={onDecline}
                  onCancel={onCancel}
                  pending={isPending}
                />
              ))}
            </ul>
            {isolatedRow ? null : (
              <Pagination
                page={listPage.page}
                pageCount={listPage.pageCount}
                onPageChange={setPage}
                className="mt-3"
              />
            )}
          </>
        )
      ) : (
        // ── CALENDAR VIEW ──────────────────────────────────────────────────
        <Scheduler capabilities={INSPECT_CAPABILITIES} data={data}>
          <InspectBridge onPickDay={resetIsolation} />
          <SelectedDayBridge onSelect={setSelectedDay} />

          <div className="flex flex-col gap-4">
            {/* month grid (shared) */}
            <div className="flex flex-col gap-2">
              <SectionLabel>
                {monthLabel}
                {searching ? " · matches highlighted" : null}
              </SectionLabel>
              <Scheduler.MonthGrid />
            </div>

            {/* read-only day timeline for the selected day */}
            {selectedDay ? (
              <div className="flex flex-col gap-2">
                <SectionLabel>
                  {dayHeading(selectedDay)} · time of day (click a block to
                  isolate)
                </SectionLabel>
                <BookingDayTimeline
                  dayKey={selectedDay}
                  dayBookings={dayBookings}
                  matchedIds={matchedIds}
                  searching={searching}
                  onIsolate={(id) => {
                    setView("calendar");
                    setIsolatedId(id);
                  }}
                />
              </div>
            ) : null}

            {/* the selected day's booking rows */}
            {selectedDay ? (
              <div className="flex flex-col gap-2">
                <SectionLabel>
                  Bookings ·{" "}
                  {isolatedId
                    ? "1 isolated"
                    : `${calendarDayList.length} ${
                        searching ? "match" : "this day"
                      }`}
                </SectionLabel>
                {calendarDayList.length === 0 ? (
                  <EmptyState title="No bookings to show for this day." />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {calendarDayList.map((booking) => (
                      <BookingRow
                        key={booking.id}
                        booking={booking}
                        onApprove={onApprove}
                        onDecline={onDecline}
                        onCancel={onCancel}
                        pending={isPending}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Pick a day above to see its bookings.
              </p>
            )}
          </div>
        </Scheduler>
      )}
    </div>
  );
}
