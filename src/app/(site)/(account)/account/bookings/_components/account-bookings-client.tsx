"use client";

/**
 * AccountBookingsClient — the client-facing "your bookings" hub.
 *
 * Modeled off the admin Bookings hub (BookingsCalendarClient): one shared filter
 * bar (status + service Selects, search, Calendar ⇄ List multiswitch, result
 * count) driving two views. The calendar is read-only (Scheduler INSPECT preset)
 * and shows ONLY this client's booked days as blue cells — non-booked days carry
 * no availability, so they render neutral and only booked days are clickable.
 * The list view is the shared one-per-row rect with the client's self-service
 * actions (Prepay / Edit). Both views are driven by the same filtered set.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, List } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { BackToTop } from "@/components/ui/back-to-top";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
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
import {
  Scheduler,
  INSPECT_CAPABILITIES,
  useScheduler,
  denverDayKey,
  type BusyBlock,
  type SchedulerData,
  type BookingStatusDb,
} from "@/features/booking/index.client";
import { paginate } from "@/lib/pagination";

import { PrepayButton } from "./prepay-button";
import { EditCell } from "./edit-cell";

// ── constants / helpers ───────────────────────────────────────────────────────

const TIME_ZONE = "America/Denver";
const PAGE_SIZE = 12;

type View = "calendar" | "list";

const VIEW_OPTIONS = [
  { value: "calendar" as const, label: "Calendar", icon: CalendarDays },
  { value: "list" as const, label: "List", icon: List },
];

// no_show is intentionally absent — it was removed from client-facing UI in SP5.
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "confirmed", label: "Confirmed" },
  { value: "pending_approval", label: "Pending approval" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "declined", label: "Declined" },
];

/** Minimal pet info for display. */
export interface AccountBookingPet {
  name: string;
  species: string | null;
}

/** Opaque quote_inputs shape — only the display-relevant fields are read. */
export interface AccountBookingQuoteInputs {
  pricingType?: string;
  nights?: number;
  hours?: number;
  dogs?: number;
  cats?: number;
}

export interface AccountBookingRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatusDb;
  final_cents: number;
  /** Sum of succeeded payments (cents). */
  paid_cents: number;
  service_name: string;
  service_slug: string;
  /** Pets assigned to this booking (may be absent for legacy rows). */
  pets?: AccountBookingPet[];
  /** Stored quote inputs — used to derive duration + service detail lines. */
  quoteInputs?: AccountBookingQuoteInputs;
}

type BadgeVariant =
  | "available"
  | "pending"
  | "unavailable"
  | "destructive"
  | "default";

function statusMeta(status: BookingStatusDb): {
  label: string;
  variant: BadgeVariant;
} {
  switch (status) {
    case "confirmed":
      return { label: "Confirmed", variant: "available" };
    case "pending_approval":
      return { label: "Pending approval", variant: "pending" };
    case "completed":
      return { label: "Completed", variant: "unavailable" };
    case "no_show":
      return { label: "No-show", variant: "unavailable" };
    case "declined":
      return { label: "Declined", variant: "destructive" };
    case "cancelled":
      return { label: "Cancelled", variant: "destructive" };
  }
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function denverParts(iso: string): { date: string; time: string; key: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-US", {
      timeZone: TIME_ZONE,
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("en-US", {
      timeZone: TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
    }),
    key: d.toLocaleDateString("en-CA", { timeZone: TIME_ZONE }),
  };
}

/** Single-day visit → "date · start – end"; multi-day stay → "date – date". */
function formatWhen(startIso: string, endIso: string): string {
  const s = denverParts(startIso);
  const e = denverParts(endIso);
  return s.key === e.key
    ? `${s.date} · ${s.time} – ${e.time}`
    : `${s.date} – ${e.date}`;
}

function dayHeading(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function owedCents(b: AccountBookingRow): number {
  return Math.max(0, b.final_cents - b.paid_cents);
}

function toBusyBlock(b: AccountBookingRow): BusyBlock {
  return {
    startsAt: new Date(b.starts_at),
    endsAt: new Date(b.ends_at),
    id: b.id,
    label: b.service_name,
  };
}

// ── bridges (mirror the admin hub) ──────────────────────────────────────────────

/** Clicking a booked month cell selects that booking's day (reveals its rows). */
function InspectBridge() {
  const { selection, data } = useScheduler();
  const id = selection.inspectedBookingId;
  const { clearInspection, toggleDay, clearDays } = selection;
  useEffect(() => {
    if (!id) return;
    const block = data.busy.find((b) => b.id === id);
    if (block) {
      clearDays();
      toggleDay(denverDayKey(block.startsAt));
    }
    clearInspection();
  }, [id, data.busy, clearInspection, toggleDay, clearDays]);
  return null;
}

/** Relays the single-day selection out to the hub. */
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

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-brand-strong text-[0.7rem] font-semibold tracking-wide uppercase">
      {children}
    </p>
  );
}

/** Derive a short duration string from quote_inputs fields. */
function formatDuration(
  qi: AccountBookingQuoteInputs | undefined,
): string | null {
  if (!qi) return null;
  if (qi.nights != null && qi.nights > 0) {
    return `${qi.nights} night${qi.nights !== 1 ? "s" : ""}`;
  }
  if (qi.hours != null && qi.hours > 0) {
    return `${qi.hours} hr${qi.hours !== 1 ? "s" : ""}`;
  }
  return null;
}

// ── booking row card (shared one-per-row rect) ──────────────────────────────────

function BookingCard({
  booking,
  now,
  cancellationFullRefundHours,
}: {
  booking: AccountBookingRow;
  now: Date;
  cancellationFullRefundHours: number;
}) {
  const owed = owedCents(booking);
  const { label, variant } = statusMeta(booking.status);
  const duration = formatDuration(booking.quoteInputs);
  const petNames =
    booking.pets && booking.pets.length > 0
      ? booking.pets.map((p) => p.name).join(", ")
      : null;

  return (
    <Surface as="li" variant="emphasis" className="px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-foreground font-semibold">
          {booking.service_name}
        </span>
        <Badge variant={variant}>{label}</Badge>
        <span className="ml-auto font-semibold">
          {formatDollars(booking.final_cents)}
          {owed > 0 ? (
            <span className="text-brand-strong">
              {" "}
              · owed {formatDollars(owed)}
            </span>
          ) : null}
        </span>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        {formatWhen(booking.starts_at, booking.ends_at)} · Mountain time
        {duration ? <> · {duration}</> : null}
        {petNames ? <> · {petNames}</> : null}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <PrepayButton bookingId={booking.id} owedCents={owed} />
        <EditCell
          bookingId={booking.id}
          booking={{
            status: booking.status,
            startsAt: new Date(booking.starts_at),
            paidCents: booking.paid_cents,
            serviceSlug: booking.service_slug,
          }}
          now={now}
          cancellationFullRefundHours={cancellationFullRefundHours}
        />
      </div>
    </Surface>
  );
}

// ── hub ─────────────────────────────────────────────────────────────────────────

export function AccountBookingsClient({
  bookings,
  monthStartIso,
  nowIso,
  cancellationFullRefundHours,
}: {
  bookings: AccountBookingRow[];
  monthStartIso: string;
  nowIso: string;
  cancellationFullRefundHours: number;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);

  const [view, setView] = useState<View>("calendar");
  const [status, setStatus] = useState("all");
  const [service, setService] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const serviceOptions = useMemo(() => {
    const names = new Set<string>();
    for (const b of bookings) names.add(b.service_name);
    return [...names].sort();
  }, [bookings]);

  // Newest-first filtered set drives both views.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookings
      .filter((b) => {
        if (status !== "all" && b.status !== status) return false;
        if (service !== "all" && b.service_name !== service) return false;
        if (!q) return true;
        return (
          b.service_name.toLowerCase().includes(q) ||
          statusMeta(b.status).label.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  }, [bookings, status, service, query]);

  // Read-only calendar: only this client's booked days; no availability.
  // myBookings signals MonthGrid to tint these cells in muted clay (sidebar-active)
  // instead of the admin-style blue, so the client can recognise their own days.
  const data = useMemo<SchedulerData>(() => {
    const blocks = bookings.map(toBusyBlock);
    const myBookingKeys = new Set<string>(
      bookings.map((b) => denverDayKey(new Date(b.starts_at))),
    );
    return {
      overnightNights: new Set<string>(),
      windows: [],
      busy: blocks,
      busyResident: blocks,
      myBookings: myBookingKeys,
      rules: {
        bookingOpenMinute: 0,
        bookingCloseMinute: 1440,
        minLeadTimeHours: 0,
        hardMaxAdvanceDays: 3650,
      },
      now,
    };
  }, [bookings, now]);

  const calendarDayList = useMemo(() => {
    if (!selectedDay) return [];
    return filtered.filter(
      (b) => denverDayKey(new Date(b.starts_at)) === selectedDay,
    );
  }, [filtered, selectedDay]);

  const listPage = paginate(filtered, page, PAGE_SIZE);

  const monthLabel = new Date(monthStartIso).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });

  function changeStatus(next: string) {
    setStatus(next);
    setPage(1);
  }
  function changeService(next: string) {
    setService(next);
    setPage(1);
  }
  function changeQuery(next: string) {
    setQuery(next);
    setPage(1);
  }

  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === status)?.label ?? "All statuses";
  const serviceLabel = service === "all" ? "All services" : service;

  return (
    <div className="flex flex-col gap-4">
      {/* Shared filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status}
          onValueChange={(v) => {
            if (v !== null) changeStatus(v);
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
            if (v !== null) changeService(v);
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
          onValueChange={changeQuery}
          placeholder="Search your bookings…"
          ariaLabel="Search your bookings"
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

      {view === "list" ? (
        // ── LIST VIEW ────────────────────────────────────────────────────────
        filtered.length === 0 ? (
          <EmptyState title="No bookings match." />
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {listPage.items.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  now={now}
                  cancellationFullRefundHours={cancellationFullRefundHours}
                />
              ))}
            </ul>
            <Pagination
              page={listPage.page}
              pageCount={listPage.pageCount}
              onPageChange={setPage}
              className="mt-3"
            />
          </>
        )
      ) : (
        // ── CALENDAR VIEW (read-only, booked days only) ──────────────────────
        <Scheduler capabilities={INSPECT_CAPABILITIES} data={data} outlined>
          <InspectBridge />
          <SelectedDayBridge onSelect={setSelectedDay} />

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <SectionLabel>{monthLabel}</SectionLabel>
              <Scheduler.MonthGrid />
              {/* Legend: muted clay = own bookings */}
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <span
                  className="bg-sidebar-active inline-block h-3 w-3 shrink-0 rounded-sm"
                  aria-hidden="true"
                />
                Clay = your bookings. Tap a highlighted day to see details.
              </p>
            </div>

            {selectedDay ? (
              <div className="flex flex-col gap-2">
                <SectionLabel>
                  Bookings · {dayHeading(selectedDay)}
                </SectionLabel>
                {calendarDayList.length === 0 ? (
                  <EmptyState title="No bookings on this day." />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {calendarDayList.map((booking) => (
                      <BookingCard
                        key={booking.id}
                        booking={booking}
                        now={now}
                        cancellationFullRefundHours={
                          cancellationFullRefundHours
                        }
                      />
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Pick a highlighted day to see its booking.
              </p>
            )}
          </div>
        </Scheduler>
      )}
      <BackToTop />
    </div>
  );
}
