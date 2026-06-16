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
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { mergeDraftToRanges } from "@/features/booking/schedule-selection";
import type { DraftRange } from "@/features/booking/schedule-selection";
import type { ConflictBooking } from "@/features/admin";

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
    // Clear the draft outline NOW so it disappears in step with the optimistic
    // fill flip (the consumer mirrors the window add optimistically). Snapshot it
    // first so a server refusal can restore it for retry.
    const snapshot = new Set(selection.state.gridDraft);
    const restoreDraft = () => selection.paintCells([...snapshot], "add");
    startTransition(async () => {
      // Clear inside the transition so the outline drops in the SAME commit as
      // the consumer's optimistic fill (both dispatched in this sync tick).
      selection.clearGridDraft();
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
        if (anyWired)
          setFeedback({ tone: "success", text: "Marked available." });
        else restoreDraft(); // nothing ran — undo the optimistic clear
        return;
      }

      // Server refused — restore the draft so the user can retry.
      restoreDraft();

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
    // Optimistically clear the draft outline in step with the fill; restore on
    // refusal (refuse-not-cancel) so the conflicting blocks stay visible.
    const snapshot = new Set(selection.state.gridDraft);
    const restoreDraft = () => selection.paintCells([...snapshot], "add");
    startTransition(async () => {
      // Clear inside the transition so the outline drops in the SAME commit as
      // the consumer's optimistic fill.
      selection.clearGridDraft();
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
        // Refuse-not-cancel: restore the draft so conflicting blocks stay visible.
        restoreDraft();
        setFeedback({
          tone: "error",
          text: "Can't remove — active bookings overlap these ranges:",
          conflicts: allConflicts,
        });
        return;
      }

      if (forbidden) {
        restoreDraft();
        setFeedback({ tone: "error", text: "Not permitted." });
        return;
      }

      if (firstError !== null) {
        restoreDraft();
        setFeedback({ tone: "error", text: firstError });
        return;
      }

      // All-success path: nothing ran when no callback was wired — restore so the
      // draft isn't silently dropped.
      if (results.every((r) => r === undefined)) {
        restoreDraft();
        return;
      }

      setFeedback({ tone: "success", text: "Marked unavailable." });
    });
  }

  function handleClear() {
    setFeedback(null);
    selection.clearGridDraft();
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Surface
      as="aside"
      variant="plain"
      aria-label="Week grid draft actions"
      className={cn("flex flex-col gap-4 p-4", className)}
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
          <Button
            size="sm"
            onClick={handleMarkAvailable}
            disabled={disableActions}
          >
            {isPending ? "Applying…" : "Mark available"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleMarkUnavailable}
            disabled={disableActions}
          >
            {isPending ? "Applying…" : "Mark unavailable"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleClear}
            disabled={!hasRanges || isPending}
          >
            Clear
          </Button>
        </div>
      </section>
    </Surface>
  );
}
