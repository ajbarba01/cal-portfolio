"use client";

/**
 * DayPanel — admin bulk-apply side panel for the compound <Scheduler.*> tree.
 *
 * Reads selection + capabilities + callbacks from context. Admin-only:
 * renders null when capabilities.editable is false.
 *
 * Two action sections:
 *  1. Bulk intraday window — two native <input type="time"> → createWindowsBatch
 *  2. Bulk overnight toggle — two buttons → setOvernightNightsBatch
 *     (only when capabilities.overnight === true)
 *
 * Wireframe / token-only styling. No business logic beyond HH:MM→minutes
 * parsing and reading result unions — all real logic is in the server actions.
 */

import { useState, useTransition } from "react";
import { useScheduler } from "@/features/booking/scheduler-context";
import { Button } from "@/components/ui/button";
import type { ConflictBooking } from "@/features/admin";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const DENVER_TZ = "America/Denver";

/** Parse "HH:MM" to total minutes since midnight. Returns NaN on bad input. */
function parseTimeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  if (h === undefined || m === undefined || isNaN(h) || isNaN(m)) return NaN;
  return h * 60 + m;
}

function denverDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: DENVER_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Feedback state shape
// ──────────────────────────────────────────────────────────────────────────────

interface Feedback {
  tone: "success" | "error" | "info";
  text: string;
  conflicts?: ConflictBooking[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export interface DayPanelProps {
  className?: string;
}

export function DayPanel({ className }: DayPanelProps) {
  const { selection, capabilities, callbacks } = useScheduler();
  const { selectedDays } = selection.state;
  const hasSelection = selectedDays.size > 0;

  const [fromTime, setFromTime] = useState("09:00");
  const [toTime, setToTime] = useState("17:00");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isPending, startTransition] = useTransition();

  // Admin-only panel.
  if (!capabilities.editable) return null;

  // ── Handlers ────────────────────────────────────────────────────────────────

  function clearFeedback() {
    setFeedback(null);
  }

  function handleApplyWindow() {
    const openMinute = parseTimeToMinutes(fromTime);
    const closeMinute = parseTimeToMinutes(toTime);

    if (isNaN(openMinute) || isNaN(closeMinute)) {
      setFeedback({
        tone: "error",
        text: "Enter valid times for both From and To.",
      });
      return;
    }
    if (openMinute >= closeMinute) {
      setFeedback({
        tone: "error",
        text: '"From" time must be before "To" time.',
      });
      return;
    }

    clearFeedback();
    startTransition(async () => {
      const result = await callbacks.createWindowsBatch?.({
        dayKeys: [...selectedDays],
        openMinute,
        closeMinute,
      });

      if (!result) return;

      switch (result.kind) {
        case "success":
          setFeedback({
            tone: "success",
            text: "Window applied to selected days.",
          });
          break;
        case "forbidden":
          setFeedback({ tone: "error", text: "Not permitted." });
          break;
        case "not_found":
          setFeedback({ tone: "error", text: "Window not found." });
          break;
        case "validation_error":
        case "error":
          setFeedback({ tone: "error", text: result.message });
          break;
        default: {
          const _exhaustive: never = result;
          void _exhaustive;
        }
      }
    });
  }

  function handleOvernightToggle(on: boolean) {
    clearFeedback();
    startTransition(async () => {
      const result = await callbacks.setOvernightNightsBatch?.({
        nights: [...selectedDays],
        on,
      });

      if (!result) return;

      switch (result.kind) {
        case "success":
          setFeedback({
            tone: "success",
            text: on
              ? "Marked selected nights as overnight available."
              : "Marked selected nights as overnight unavailable.",
          });
          break;
        case "forbidden":
          setFeedback({ tone: "error", text: "Not permitted." });
          break;
        case "conflict":
          setFeedback({
            tone: "error",
            text: "Can't remove — these bookings overlap:",
            conflicts: result.bookings,
          });
          break;
        case "validation_error":
        case "error":
          setFeedback({ tone: "error", text: result.message });
          break;
        default: {
          const _exhaustive: never = result;
          void _exhaustive;
        }
      }
    });
  }

  function handlePremiumToggle(on: boolean) {
    clearFeedback();
    startTransition(async () => {
      const result = await callbacks.setPremiumDaysBatch?.({
        dayKeys: [...selectedDays],
        on,
      });

      if (!result) return;

      switch (result.kind) {
        case "success":
          setFeedback({
            tone: "success",
            text: on
              ? "Marked selected days as premium."
              : "Removed premium from selected days.",
          });
          break;
        case "forbidden":
          setFeedback({ tone: "error", text: "Not permitted." });
          break;
        case "not_found":
          setFeedback({ tone: "error", text: "Settings not found." });
          break;
        case "validation_error":
        case "error":
          setFeedback({ tone: "error", text: result.message });
          break;
        default: {
          const _exhaustive: never = result;
          void _exhaustive;
        }
      }
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const disableActions = !hasSelection || isPending;

  return (
    <aside
      aria-label="Bulk availability actions"
      className={[
        "bg-card border-border flex flex-col gap-5 rounded-xl border p-4",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      {/* Header */}
      <div>
        <h2 className="text-foreground text-sm font-semibold">
          {hasSelection
            ? `${selectedDays.size} day${selectedDays.size === 1 ? "" : "s"} selected`
            : "No days selected"}
        </h2>
        {hasSelection ? (
          <p className="text-muted-foreground text-xs">
            {selection.summaryLabel}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Select days on the calendar to apply availability.
          </p>
        )}
      </div>

      {/* Feedback banner */}
      {feedback !== null && (
        <div
          role="alert"
          className={[
            "rounded-md border px-3 py-2 text-xs",
            feedback.tone === "success"
              ? "border-border bg-muted text-foreground"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          ].join(" ")}
        >
          <p>{feedback.text}</p>
          {feedback.conflicts !== undefined &&
            feedback.conflicts.length > 0 && (
              <ul className="mt-1 list-inside list-disc">
                {feedback.conflicts.map((b) => (
                  <li key={b.id}>
                    {denverDateLabel(b.startsAt)} – {denverDateLabel(b.endsAt)}
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}

      {/* ── Section 1: Bulk intraday window ─────────────────────────────────── */}
      <section aria-labelledby="day-panel-window-heading">
        <h3
          id="day-panel-window-heading"
          className="text-foreground mb-2 text-xs font-semibold tracking-wide uppercase"
        >
          Intraday window
        </h3>

        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="day-panel-from"
              className="text-muted-foreground text-xs"
            >
              From
            </label>
            <input
              id="day-panel-from"
              type="time"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value)}
              disabled={isPending}
              className="border-border bg-background text-foreground focus:ring-ring rounded border px-2 py-1 text-sm focus:ring-2 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="day-panel-to"
              className="text-muted-foreground text-xs"
            >
              To
            </label>
            <input
              id="day-panel-to"
              type="time"
              value={toTime}
              onChange={(e) => setToTime(e.target.value)}
              disabled={isPending}
              className="border-border bg-background text-foreground focus:ring-ring rounded border px-2 py-1 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
        </div>

        <Button
          size="sm"
          onClick={handleApplyWindow}
          disabled={disableActions}
          className="mt-3"
        >
          {isPending ? "Applying…" : "Apply window to selected days"}
        </Button>
      </section>

      {/* ── Section 2: Bulk overnight toggle (conditional) ──────────────────── */}
      {capabilities.overnight && (
        <section aria-labelledby="day-panel-overnight-heading">
          <h3
            id="day-panel-overnight-heading"
            className="text-foreground mb-2 text-xs font-semibold tracking-wide uppercase"
          >
            Overnight availability
          </h3>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => handleOvernightToggle(true)}
              disabled={disableActions}
            >
              Mark overnight available
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleOvernightToggle(false)}
              disabled={disableActions}
            >
              Mark overnight unavailable
            </Button>
          </div>
        </section>
      )}

      {/* ── Section 3: Premium days (admin only) ────────────────────────────── */}
      {capabilities.premiumMarkable && (
        <section aria-labelledby="day-panel-premium-heading">
          <h3
            id="day-panel-premium-heading"
            className="text-foreground mb-2 text-xs font-semibold tracking-wide uppercase"
          >
            Premium days
          </h3>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => handlePremiumToggle(true)}
              disabled={disableActions}
            >
              Mark premium
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => handlePremiumToggle(false)}
              disabled={disableActions}
            >
              Remove premium
            </Button>
          </div>
        </section>
      )}
    </aside>
  );
}
