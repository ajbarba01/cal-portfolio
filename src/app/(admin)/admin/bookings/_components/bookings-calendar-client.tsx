"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useConfirm } from "@/components/feedback/confirm-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  approveBooking,
  declineBooking,
} from "@/features/admin/approval-actions";
import type { BookingCalendarRow } from "@/features/admin/bookings-calendar-actions";
import { matchesClientQuery } from "@/features/admin/client-search";
import { cancelBooking, markNoShow } from "@/features/booking/actions";

const TIME_ZONE = "America/Denver";
const STATUSES = [
  "all",
  "pending_approval",
  "confirmed",
  "completed",
  "cancelled",
  "declined",
  "no_show",
] as const;
type StatusFilter = (typeof STATUSES)[number];

function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function BookingsCalendarClient({
  bookings,
  monthStartIso,
}: {
  bookings: BookingCalendarRow[];
  monthStartIso: string;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      bookings.filter((booking) => {
        if (status !== "all" && booking.status !== status) return false;
        return matchesClientQuery(
          { full_name: booking.client_name, email: null, phone: null },
          query,
        );
      }),
    [bookings, status, query],
  );

  const byDay = useMemo(() => {
    const grouped = new Map<string, BookingCalendarRow[]>();
    for (const booking of filtered) {
      const key = dayKey(booking.starts_at);
      const dayBookings = grouped.get(key) ?? [];
      dayBookings.push(booking);
      grouped.set(key, dayBookings);
    }
    return grouped;
  }, [filtered]);

  const monthDate = new Date(monthStartIso);
  const year = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const cells: (string | null)[] = [];
  for (let index = 0; index < firstWeekday; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(
      `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
  }

  function run<T extends { kind: string }>(action: () => Promise<T>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.kind === "success") router.refresh();
      else setError(`Action failed: ${result.kind}`);
    });
  }

  async function onCancel(id: string) {
    const isConfirmed = await confirm({
      title: "Cancel this booking?",
      confirmLabel: "Cancel booking",
      destructive: true,
    });
    if (isConfirmed) run(() => cancelBooking({ bookingId: id }));
  }

  async function onNoShow(id: string) {
    const isConfirmed = await confirm({
      title: "Mark no-show?",
      confirmLabel: "Mark no-show",
      destructive: true,
    });
    if (isConfirmed) run(() => markNoShow(id));
  }

  const dayList = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          aria-label="Filter by status"
          className="border-input bg-background rounded-md border px-2 py-1 text-sm"
        >
          {STATUSES.map((statusOption) => (
            <option key={statusOption} value={statusOption}>
              {statusOption === "all" ? "All statuses" : statusOption}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search client..."
          aria-label="Search client"
          className="border-input bg-background rounded-md border px-2 py-1 text-sm"
        />
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
          <div key={day} className="text-muted-foreground py-1 font-medium">
            {day}
          </div>
        ))}
        {cells.map((key, index) =>
          key === null ? (
            <div key={`pad-${index}`} />
          ) : (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedDay(key)}
              className={`aspect-square rounded-md border p-1 text-left transition-colors ${
                selectedDay === key
                  ? "border-brand bg-brand/10"
                  : "border-border bg-card hover:bg-accent"
              }`}
            >
              <span className="text-foreground">{Number(key.slice(-2))}</span>
              {(byDay.get(key)?.length ?? 0) > 0 ? (
                <span className="bg-brand-strong mt-1 block h-1.5 w-1.5 rounded-full" />
              ) : null}
            </button>
          ),
        )}
      </div>

      {selectedDay ? (
        <section aria-label={`Bookings on ${selectedDay}`}>
          <h2 className="text-foreground mb-2 text-sm font-semibold">
            {selectedDay}
          </h2>
          {dayList.length === 0 ? (
            <EmptyState title="No bookings this day." />
          ) : (
            <ul className="flex flex-col gap-2">
              {dayList.map((booking) => (
                <li
                  key={booking.id}
                  className="bg-card border-border flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm"
                >
                  <Link
                    href={`/admin/clients/${booking.client_id}`}
                    className="text-brand-strong font-medium hover:underline"
                  >
                    {booking.client_name ?? "Unknown client"}
                  </Link>
                  <span>{booking.service_name ?? "Service"}</span>
                  <Badge
                    variant={
                      booking.status === "pending_approval"
                        ? "pending"
                        : "default"
                    }
                  >
                    {booking.status}
                  </Badge>
                  <span className="text-muted-foreground">
                    {timeLabel(booking.starts_at)}-{timeLabel(booking.ends_at)}
                  </span>
                  <span className="text-muted-foreground">
                    {dollars(booking.final_cents)}
                  </span>
                  <span className="ml-auto flex gap-2">
                    {booking.status === "pending_approval" ||
                    booking.status === "confirmed" ? (
                      <Link
                        href={`/admin/clients/${booking.client_id}/bookings/${booking.id}/edit`}
                        className="border-border hover:bg-accent focus-visible:border-ring focus-visible:ring-ring/50 inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium focus-visible:ring-3"
                      >
                        Edit
                      </Link>
                    ) : null}
                    {booking.status === "pending_approval" ? (
                      <>
                        <Button
                          size="sm"
                          disabled={isPending}
                          onClick={() => run(() => approveBooking(booking.id))}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => run(() => declineBooking(booking.id))}
                        >
                          Decline
                        </Button>
                      </>
                    ) : null}
                    {booking.status === "pending_approval" ||
                    booking.status === "confirmed" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => onCancel(booking.id)}
                      >
                        Cancel
                      </Button>
                    ) : null}
                    {booking.status === "confirmed" ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isPending}
                        onClick={() => onNoShow(booking.id)}
                      >
                        No-show
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
