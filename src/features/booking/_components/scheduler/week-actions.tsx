"use client";

/**
 * WeekActions — admin action panel for the intraday WeekGrid draft.
 *
 * Reads gridDraft from context, collapses it into contiguous DraftRanges,
 * and offers three actions:
 *   1. Mark available   → createWindowsBatch (grouped by identical time block)
 *   2. Mark unavailable → setWindowUnavailable (one call per range)
 *   3. Clear            → clearGridDraft
 *
 * Admin-only: returns null when capabilities.editable is false.
 * Refuse-not-cancel: on conflict the draft is NOT cleared.
 *
 * Wireframe / token-only styling. a11y floor: role="alert" banner,
 * semantic buttons with disabled states, visible focus rings.
 */

import { useTransition, useState } from "react";
import { useScheduler } from "@/features/booking/scheduler-context";
import { mergeDraftToRanges } from "@/features/booking/schedule-selection";
import type { DraftRange } from "@/features/booking/schedule-selection";
import type { ConflictBooking } from "@/features/admin/availability-actions";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const DENVER_TZ = "America/Denver";

function denverDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: DENVER_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Batch-group helpers
// ──────────────────────────────────────────────────────────────────────────────

interface RangeGroup {
  fromMinute: number;
  toMinute: number;
  dayKeys: string[];
}

/**
 * Group DraftRanges by identical (fromMinute, toMinute) pair.
 * Days sharing the exact same time block can go in one createWindowsBatch call.
 */
function groupRangesByTime(ranges: DraftRange[]): RangeGroup[] {
  const map = new Map<string, RangeGroup>();
  for (const r of ranges) {
    const key = `${r.fromMinute}:${r.toMinute}`;
    let group = map.get(key);
    if (group === undefined) {
      group = { fromMinute: r.fromMinute, toMinute: r.toMinute, dayKeys: [] };
      map.set(key, group);
    }
    group.dayKeys.push(r.dayKey);
  }
  return [...map.values()];
}

// ──────────────────────────────────────────────────────────────────────────────
// Feedback
// ──────────────────────────────────────────────────────────────────────────────

interface Feedback {
  tone: "success" | "error";
  text: string;
  conflicts?: ConflictBooking[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export interface WeekActionsProps {
  className?: string;
}

export function WeekActions({ className }: WeekActionsProps) {
  const { selection, capabilities, callbacks } = useScheduler();

  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isPending, startTransition] = useTransition();

  // Admin-only.
  if (!capabilities.editable) return null;

  const interval = capabilities.intervalMinutes ?? 30;
  const ranges = mergeDraftToRanges(selection.state.gridDraft, interval);
  const hasRanges = ranges.length > 0;
  const disableActions = !hasRanges || isPending;

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleMarkAvailable() {
    setFeedback(null);
    startTransition(async () => {
      const groups = groupRangesByTime(ranges);
      const results = await Promise.all(
        groups.map((g) =>
          callbacks.createWindowsBatch?.({
            dayKeys: g.dayKeys,
            openMinute: g.fromMinute,
            closeMinute: g.toMinute,
          }),
        ),
      );

      // Find first result that is not a clean success.
      // `undefined` means the callback was not wired (optional-chained away).
      const firstProblem = results.find((r) => r?.kind !== "success");

      if (firstProblem === undefined) {
        // Every group returned success (or callback not wired — treat as no-op).
        const anyWired = results.some((r) => r !== undefined);
        if (anyWired) {
          setFeedback({ tone: "success", text: "Marked available." });
          selection.clearGridDraft();
        }
        return;
      }

      // firstProblem is AvailabilityResult with kind !== "success", or undefined
      // (callback not wired). Guard for undefined before exhaustive switch.
      if (firstProblem === undefined) return;

      switch (firstProblem.kind) {
        case "forbidden":
          setFeedback({ tone: "error", text: "Not permitted." });
          break;
        case "validation_error":
        case "error":
          setFeedback({ tone: "error", text: firstProblem.message });
          break;
        case "not_found":
          setFeedback({ tone: "error", text: "Window not found." });
          break;
        default: {
          const _exhaustive: never = firstProblem;
          void _exhaustive;
        }
      }
    });
  }

  function handleMarkUnavailable() {
    setFeedback(null);
    startTransition(async () => {
      const results = await Promise.all(
        ranges.map((r) =>
          callbacks.setWindowUnavailable?.({
            dayKey: r.dayKey,
            fromMinute: r.fromMinute,
            toMinute: r.toMinute,
          }),
        ),
      );

      // Collect all conflict bookings across all results.
      const allConflicts: ConflictBooking[] = [];
      let firstError: string | null = null;
      let forbidden = false;

      for (const r of results) {
        if (r === undefined) continue;
        switch (r.kind) {
          case "success":
            break;
          case "conflict":
            allConflicts.push(...r.bookings);
            break;
          case "forbidden":
            forbidden = true;
            break;
          case "validation_error":
          case "error":
            if (firstError === null) firstError = r.message;
            break;
          default: {
            const _exhaustive: never = r;
            void _exhaustive;
          }
        }
      }

      if (allConflicts.length > 0) {
        // Refuse-not-cancel: draft NOT cleared on conflict.
        setFeedback({
          tone: "error",
          text: "Can't remove — active bookings overlap these ranges:",
          conflicts: allConflicts,
        });
        return;
      }

      if (forbidden) {
        setFeedback({ tone: "error", text: "Not permitted." });
        return;
      }

      if (firstError !== null) {
        setFeedback({ tone: "error", text: firstError });
        return;
      }

      setFeedback({ tone: "success", text: "Marked unavailable." });
      selection.clearGridDraft();
    });
  }

  function handleClear() {
    setFeedback(null);
    selection.clearGridDraft();
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <aside
      aria-label="Week grid draft actions"
      className={[
        "bg-card border-border flex flex-col gap-4 rounded-lg border p-4",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      {/* Header */}
      <div>
        <h2 className="text-foreground text-sm font-semibold">
          {hasRanges
            ? `${ranges.length} painted block${ranges.length === 1 ? "" : "s"}`
            : "No blocks painted"}
        </h2>
        <p className="text-muted-foreground text-xs">
          {hasRanges
            ? "Apply an action to the painted time blocks."
            : "Drag over the week grid to paint time blocks."}
        </p>
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

      {/* Range preview */}
      {hasRanges && (
        <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
          {ranges.map((r, i) => (
            <li key={i}>
              {r.dayKey} {minutesToHHMM(r.fromMinute)}–
              {minutesToHHMM(r.toMinute)}
            </li>
          ))}
        </ul>
      )}

      {/* Actions */}
      <section aria-labelledby="week-actions-heading">
        <h3
          id="week-actions-heading"
          className="text-foreground mb-2 text-xs font-semibold tracking-wide uppercase"
        >
          Actions
        </h3>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleMarkAvailable}
            disabled={disableActions}
            className="bg-primary text-primary-foreground focus:ring-ring rounded px-3 py-1.5 text-sm font-medium focus:ring-2 focus:outline-none disabled:opacity-50"
          >
            {isPending ? "Applying…" : "Mark available"}
          </button>

          <button
            type="button"
            onClick={handleMarkUnavailable}
            disabled={disableActions}
            className="border-border bg-background text-foreground focus:ring-ring rounded border px-3 py-1.5 text-sm font-medium focus:ring-2 focus:outline-none disabled:opacity-50"
          >
            {isPending ? "Applying…" : "Mark unavailable"}
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={!hasRanges || isPending}
            className="border-border bg-background text-muted-foreground focus:ring-ring rounded border px-3 py-1.5 text-sm font-medium focus:ring-2 focus:outline-none disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </section>
    </aside>
  );
}
