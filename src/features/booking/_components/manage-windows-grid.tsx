"use client";

/**
 * ManageWindowsGrid — admin availability surface (Cal). Third arm of the shared
 * BookingCalendar. Presentational: the caller owns server data (windows + busy)
 * and wires the callbacks to the availability cores + router.refresh(); this grid
 * owns only ephemeral form state (selected day, draft times, edit/confirm flags).
 *
 * Interaction model (WIREFRAME, pragmatic over slick gestures — see the plan's
 * Phase 23 scope note): pick a day on the month calendar, then create/resize/delete
 * windows via inline time inputs rather than pointer drag. Days carrying a window or
 * a booking are marked. Selecting a booking dispatches `onSelectBooking` (the caller
 * opens the side panel).
 *
 * TIME MODEL: inputs are America/Denver wall time. A day + "HH:MM" maps to a UTC
 * instant via `denverMidnight(dayKey)` + minutes. DST caveat: on the spring-forward
 * day, times after 02:00 are an hour off (single-tz wireframe; acceptable). Display
 * uses Denver-localized `toLocaleString`. date-fns is not needed here.
 *
 * DAY-KEY BRIDGE: same as MonthGrid — rdp yields local-midnight cell Dates; we key
 * them by local Y-M-D, which equals the Denver day key when the browser runs in
 * America/Denver (the single-tz assumption the whole calendar makes).
 */

import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { denverDayKey, denverMidnight } from "../availability";
import type { AvailabilityWindow } from "@/features/admin/availability-actions";
import type { AdminBusyRangeView } from "@/features/admin/admin-busy";
import { PetAvatar } from "./pet-avatar";

const DENVER_TZ = "America/Denver";

// ── Denver-aware date helpers (layout/input concern, local to this grid) ──────

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local Y-M-D of a Date — matches Denver day keys under the single-tz assumption. */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local-midnight Date for a "YYYY-MM-DD" key (for rdp modifiers + selection). */
function localDateFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d);
}

/** The calendar day after `key` (Denver/local Y-M-D string). */
function nextDayKey(key: string): string {
  const d = localDateFromKey(key);
  d.setDate(d.getDate() + 1);
  return localDayKey(d);
}

/** Denver wall time of an instant as "HH:MM" (24h), for prefilling time inputs. */
function denverTimeHHMM(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: DENVER_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** UTC ISO instant for a Denver day + "HH:MM" wall time. */
function instantFromDenver(dayKey: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  const base = denverMidnight(dayKey).getTime();
  return new Date(base + (h * 60 + m) * 60000).toISOString();
}

/** Half-open [start, end) overlap of a range with a single Denver day. */
function overlapsDay(
  startIso: string,
  endIso: string,
  dayKey: string,
): boolean {
  const dayStart = denverMidnight(dayKey).getTime();
  const dayEnd = denverMidnight(nextDayKey(dayKey)).getTime();
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  return s < dayEnd && e > dayStart;
}

/** Denver day keys a [start, end) range touches (end-exclusive at midnight). */
function denverDayKeysInRange(startIso: string, endIso: string): string[] {
  const keys: string[] = [];
  let k = denverDayKey(new Date(startIso));
  // Subtract 1ms so an end landing exactly on midnight does not claim that day.
  const endK = denverDayKey(new Date(new Date(endIso).getTime() - 1));
  for (let i = 0; i < 366 && k <= endK; i++) {
    keys.push(k);
    k = nextDayKey(k);
  }
  return keys;
}

function denverRangeLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: DENVER_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ManageWindowsGridProps {
  windows: AvailabilityWindow[];
  busy: AdminBusyRangeView[];
  month: Date;
  onMonthChange: (month: Date) => void;
  /** Create a window from two UTC ISO instants. */
  onCreateWindow: (
    startsAtIso: string,
    endsAtIso: string,
    note: string | null,
  ) => void;
  /** Trim (resize) a window — block-out cancels bookings in the removed slice. */
  onTrimWindow: (
    windowId: string,
    newStartsAtIso: string,
    newEndsAtIso: string,
  ) => void;
  /** Block-out: delete window + cancel overlapping bookings. */
  onDeleteWindow: (windowId: string) => void;
  /** Open the booking side panel for the selected booking. */
  onSelectBooking: (bookingId: string) => void;
  /** A mutation is in flight — disable controls. */
  pending: boolean;
}

// ── Component ───────────────────────────────────────────────────────────────────

export function ManageWindowsGrid({
  windows,
  busy,
  month,
  onMonthChange,
  onCreateWindow,
  onTrimWindow,
  onDeleteWindow,
  onSelectBooking,
  pending,
}: ManageWindowsGridProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  // Draft "create" inputs for the selected day.
  const [createStart, setCreateStart] = useState("09:00");
  const [createEnd, setCreateEnd] = useState("17:00");
  const [createNote, setCreateNote] = useState("");

  // Inline edit (trim) state.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const dayKey = selectedDate ? localDayKey(selectedDate) : null;

  // rdp modifiers: which calendar cells carry a window / a booking.
  const windowDays = windows.flatMap((w) =>
    denverDayKeysInRange(w.starts_at, w.ends_at).map(localDateFromKey),
  );
  const bookingDays = busy.flatMap((b) =>
    denverDayKeysInRange(b.startsAt, b.endsAt).map(localDateFromKey),
  );

  const dayWindows = dayKey
    ? windows.filter((w) => overlapsDay(w.starts_at, w.ends_at, dayKey))
    : [];
  const dayBookings = dayKey
    ? busy.filter((b) => overlapsDay(b.startsAt, b.endsAt, dayKey))
    : [];

  function beginEdit(w: AvailabilityWindow) {
    setEditingId(w.id);
    setEditStart(denverTimeHHMM(w.starts_at));
    setEditEnd(denverTimeHHMM(w.ends_at));
    setConfirmDeleteId(null);
  }

  function submitCreate() {
    if (!dayKey) return;
    onCreateWindow(
      instantFromDenver(dayKey, createStart),
      instantFromDenver(dayKey, createEnd),
      createNote.trim() || null,
    );
    setCreateNote("");
  }

  function submitEdit(w: AvailabilityWindow) {
    // Preserve each bound's existing Denver day; only its time-of-day changes.
    onTrimWindow(
      w.id,
      instantFromDenver(denverDayKey(new Date(w.starts_at)), editStart),
      instantFromDenver(denverDayKey(new Date(w.ends_at)), editEnd),
    );
    setEditingId(null);
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <Calendar
        mode="single"
        month={month}
        onMonthChange={onMonthChange}
        selected={selectedDate}
        onSelect={setSelectedDate}
        modifiers={{ hasWindow: windowDays, hasBooking: bookingDays }}
        modifiersClassNames={{
          hasWindow: "[&>button]:font-semibold [&>button]:underline",
          hasBooking: "[&>button]:text-primary",
        }}
        className="border-border h-fit rounded-lg border"
      />

      <div className="min-w-0 flex-1">
        {!dayKey ? (
          <p className="text-muted-foreground text-sm">
            Select a day to manage its windows and bookings. Underlined days
            have a window; colored days have a booking.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            <h3 className="text-foreground text-sm font-semibold">
              {localDateFromKey(dayKey).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </h3>

            {/* Windows on this day */}
            <section aria-labelledby="day-windows-heading">
              <h4
                id="day-windows-heading"
                className="text-muted-foreground mb-2 text-xs font-medium"
              >
                Availability windows
              </h4>
              {dayWindows.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No windows on this day.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {dayWindows.map((w) => (
                    <li
                      key={w.id}
                      className="border-border rounded-lg border px-3 py-2 text-xs"
                    >
                      {editingId === w.id ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`edit-start-${w.id}`}>From</Label>
                            <Input
                              id={`edit-start-${w.id}`}
                              type="time"
                              className="w-32"
                              value={editStart}
                              onChange={(e) => setEditStart(e.target.value)}
                            />
                            <Label htmlFor={`edit-end-${w.id}`}>to</Label>
                            <Input
                              id={`edit-end-${w.id}`}
                              type="time"
                              className="w-32"
                              value={editEnd}
                              onChange={(e) => setEditEnd(e.target.value)}
                            />
                          </div>
                          <p className="text-muted-foreground">
                            Shrinking cancels bookings in the removed slice.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => submitEdit(w)}
                              disabled={pending}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingId(null)}
                              disabled={pending}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-foreground">
                              {denverRangeLabel(w.starts_at)} —{" "}
                              {denverRangeLabel(w.ends_at)}
                            </p>
                            {w.note && (
                              <p className="text-muted-foreground">{w.note}</p>
                            )}
                          </div>
                          {confirmDeleteId === w.id ? (
                            <div
                              className="flex items-center gap-2"
                              role="group"
                              aria-label="Confirm delete"
                            >
                              <span className="text-destructive">
                                Cancels overlapping bookings. Confirm?
                              </span>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  onDeleteWindow(w.id);
                                  setConfirmDeleteId(null);
                                }}
                                disabled={pending}
                                autoFocus
                              >
                                Yes
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setConfirmDeleteId(null)}
                                disabled={pending}
                              >
                                No
                              </Button>
                            </div>
                          ) : (
                            <div className="flex shrink-0 gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => beginEdit(w)}
                                disabled={pending}
                              >
                                Resize
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setConfirmDeleteId(w.id)}
                                disabled={pending}
                              >
                                Block out
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Create a window on this day */}
            <section
              aria-labelledby="create-window-heading"
              className="border-border rounded-lg border p-3"
            >
              <h4
                id="create-window-heading"
                className="text-foreground mb-2 text-xs font-medium"
              >
                Add a window
              </h4>
              <div className="flex flex-col gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Label htmlFor="create-start">From</Label>
                  <Input
                    id="create-start"
                    type="time"
                    className="w-32"
                    value={createStart}
                    onChange={(e) => setCreateStart(e.target.value)}
                  />
                  <Label htmlFor="create-end">to</Label>
                  <Input
                    id="create-end"
                    type="time"
                    className="w-32"
                    value={createEnd}
                    onChange={(e) => setCreateEnd(e.target.value)}
                  />
                </div>
                <Input
                  type="text"
                  placeholder="Note (optional)"
                  value={createNote}
                  onChange={(e) => setCreateNote(e.target.value)}
                />
                <Button
                  size="sm"
                  className="self-start"
                  onClick={submitCreate}
                  disabled={pending || createStart >= createEnd}
                >
                  Add window
                </Button>
              </div>
            </section>

            {/* Bookings on this day */}
            <section aria-labelledby="day-bookings-heading">
              <h4
                id="day-bookings-heading"
                className="text-muted-foreground mb-2 text-xs font-medium"
              >
                Bookings
              </h4>
              {dayBookings.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No bookings on this day.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {dayBookings.map((b) => (
                    <li key={b.bookingId}>
                      <button
                        type="button"
                        onClick={() => onSelectBooking(b.bookingId)}
                        className="border-border bg-background hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs outline-none focus-visible:ring-3"
                      >
                        <span className="min-w-0">
                          <span className="text-foreground block truncate">
                            {b.clientName ?? "Unknown client"}
                          </span>
                          <span className="text-muted-foreground block">
                            {denverRangeLabel(b.startsAt)} · {b.status}
                          </span>
                        </span>
                        <span className="flex -space-x-1.5">
                          {b.pets.map((p) => (
                            <PetAvatar
                              key={p.id}
                              name={p.name}
                              species={p.species}
                              photoUrl={p.photoUrl}
                              size={24}
                              className="ring-background ring-2"
                            />
                          ))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
