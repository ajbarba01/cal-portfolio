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
 *   timeline is the admin feature's own `BookingDayTimeline` (the shared
 *   DayTimeline renders availability windows, not arbitrary booking blocks), so
 *   no shared timeline behaviour is touched. `?booking={id}` deep-links
 *   pre-isolate a row.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, List } from "lucide-react";

import { useConfirm } from "@/components/feedback/confirm-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { BackToTop } from "@/components/ui/back-to-top";
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
import { denverDayKey, denverDayLabel } from "@/lib/time-of-day";
import {
  approveBooking,
  declineBooking,
  filterBookings,
  daysWithMatch,
  isolate,
  BookingDayTimeline,
  type BookingCalendarRow,
  type BookingStatusFilter,
} from "@/features/admin/index.client";
import {
  bookingStatusPill,
  cancelBooking,
  useScheduler,
  Scheduler,
  INSPECT_CAPABILITIES,
  denverMidnight,
  buildInspectSchedulerData,
} from "@/features/booking/index.client";
import type {
  BookingStatus,
  BusyBlock,
  SchedulerData,
} from "@/features/booking/index.client";

import { BookingRow } from "./booking-row";
import { denverMonthDate, monthParamOf } from "./month-param";

// ── constants / helpers ─────────────────────────────────────────────────────

/** Filter order — deliberate, and unrelated to the lifecycle order. */
const FILTERABLE_STATUSES = [
  "pending_approval",
  "confirmed",
  "completed",
  "cancelled",
  "declined",
  "no_show",
] as const satisfies readonly BookingStatus[];

const STATUS_OPTIONS: { value: BookingStatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  ...FILTERABLE_STATUSES.map((value) => ({
    value,
    label: bookingStatusPill(value).label,
  })),
];

const PAGE_SIZE = 12;

/**
 * The caption over the month grid, e.g. "September 2026". No `timeZone`: it
 * formats the same local first-of-month Date the grid is showing, which names a
 * month and nothing finer (see `month-param`).
 */
const monthCaptionFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

/** "Sat, Jun 7" for a Denver "YYYY-MM-DD" day-key. */
function dayHeading(dayKey: string): string {
  return denverDayLabel(denverMidnight(dayKey), { year: false });
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

/** One Denver calendar day in ms — the span the day filter treats as "this day". */
const DAY_MS = 86_400_000;

type ActionResult = { kind: string } | { kind: string; message: string };

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
  const pathname = usePathname();
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

  // ── ?status={filter} deep-link (from dashboard attention list "Review →") ───
  // When a valid BookingStatusFilter arrives via the query string, seed the
  // initial status state and start in List view (more actionable for triage).
  // Behaviour is unchanged when the param is absent or invalid.
  const deepLinkStatus = useMemo((): BookingStatusFilter => {
    const raw = searchParams.get("status");
    const valid = STATUS_OPTIONS.find((o) => o.value === raw);
    return valid ? valid.value : "all";
    // Read once at mount — same rationale as deepLinkId above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>(
    deepLinkId || deepLinkStatus !== "all" ? "list" : "calendar",
  );
  const [status, setStatus] = useState<BookingStatusFilter>(deepLinkStatus);
  const [service, setService] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [isolatedId, setIsolatedId] = useState<string | null>(deepLinkId);
  const [page, setPage] = useState(1);

  // ── the month on screen ─────────────────────────────────────────────────────
  // The grid moves the moment an arrow is pressed, so the hub mirrors the move
  // here rather than waiting for the server: the caption and the grid would
  // otherwise name different months for the length of the round trip. The
  // `?month=` push is what fetches that month's rows, and `monthStartIso` comes
  // back naming the month already on screen — except after a back/forward, which
  // moves the window without going through the grid, so the state follows it.
  const [month, setMonth] = useState(() => denverMonthDate(monthStartIso));
  const [loadedMonthIso, setLoadedMonthIso] = useState(monthStartIso);
  if (monthStartIso !== loadedMonthIso) {
    setLoadedMonthIso(monthStartIso);
    setMonth(denverMonthDate(monthStartIso));
  }

  function onMonthChange(next: Date) {
    setMonth(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", monthParamOf(next));
    // Keep the scroll position: the grid the arrow was pressed on sits well
    // below the fold on a long hub. Wrapped in startTransition so isPending
    // covers the round trip the same way it covers a row action, dimming the
    // grid/day list below until the new month's rows land.
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

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
  // Both sides are keyed over every day a booking covers, so a multi-day stay
  // that matches lights its whole span rather than leaving the rest hatched.
  const dimmedDays = useMemo<Set<string> | undefined>(() => {
    if (!searching) return undefined;
    const matchedDayKeys = daysWithMatch(filtered, "");
    const dimmed = new Set<string>();
    for (const key of daysWithMatch(bookings, "")) {
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
      else
        setError(
          "message" in result
            ? result.message
            : `Action failed: ${result.kind}`,
        );
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
      description: "The client is refunded in full.",
      confirmLabel: "Cancel booking",
      destructive: true,
    });
    // fullRefund is forced server-side for admin cancels (decided by role).
    if (ok) run(() => cancelBooking({ bookingId: id }));
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
    // Include any booking whose [starts_at, ends_at) covers the selected Denver
    // day — not just those that START on it — so a multi-day house-sit shows on
    // every day of the stay (check-in, every middle day, and check-out morning).
    const dayStartMs = denverMidnight(selectedDay).getTime();
    const dayEndMs = dayStartMs + DAY_MS;
    return bookings
      .filter((b) => {
        const s = new Date(b.starts_at).getTime();
        const e = new Date(b.ends_at).getTime();
        return s < dayEndMs && e > dayStartMs;
      })
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
  const monthLabel = monthCaptionFormat.format(month);

  // The selected day only means something for the month it was picked in —
  // once the grid moves on, a stale Sep-12 selection is not a match for the
  // October grid now on screen, so the day sections hide until a day in the
  // visible month is picked again.
  const visibleSelectedDay =
    selectedDay && selectedDay.slice(0, 7) === monthParamOf(month)
      ? selectedDay
      : null;

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

          <div
            className={`flex flex-col gap-4 ${isPending ? "pointer-events-none opacity-50" : ""}`}
          >
            {/* month grid (shared) */}
            <div className="flex flex-col gap-2">
              <SectionLabel>
                {monthLabel}
                {searching ? " · matches highlighted" : null}
              </SectionLabel>
              <Scheduler.MonthGrid
                month={month}
                onMonthChange={onMonthChange}
              />
            </div>

            {/* read-only day timeline for the selected day */}
            {visibleSelectedDay ? (
              <div className="flex flex-col gap-2">
                <SectionLabel>
                  {dayHeading(visibleSelectedDay)} · time of day (click a block
                  to isolate)
                </SectionLabel>
                <BookingDayTimeline
                  dayKey={visibleSelectedDay}
                  dayLabel={dayHeading(visibleSelectedDay)}
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
            {visibleSelectedDay ? (
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
      <BackToTop />
    </div>
  );
}
