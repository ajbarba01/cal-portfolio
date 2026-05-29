"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createWindow,
  deleteWindow,
} from "@/features/admin/availability-actions";
import type { AvailabilityWindow } from "@/features/admin/availability-actions";

export function AvailabilityClient({
  initialWindows,
}: {
  initialWindows: AvailabilityWindow[];
}) {
  const [windows, setWindows] = useState(initialWindows);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createWindow({
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        note: note || null,
      });
      if (result.kind === "success") {
        setStartsAt("");
        setEndsAt("");
        setNote("");
        // Reload via router refresh; for now show a simple message.
        window.location.reload();
      } else {
        setError(
          "message" in result
            ? result.message
            : `Action failed: ${result.kind}`,
        );
      }
    });
  }

  async function handleDelete(windowId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteWindow({ windowId });
      if (result.kind === "success") {
        setWindows((prev) => prev.filter((w) => w.id !== windowId));
        setConfirmDeleteId(null);
      } else {
        setError(
          "message" in result
            ? result.message
            : `Action failed: ${result.kind}`,
        );
        setConfirmDeleteId(null);
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* Create form */}
      <section aria-labelledby="create-heading">
        <h2 id="create-heading" className="mb-4 text-lg font-medium">
          Add Availability Window
        </h2>
        <div className="space-y-4 rounded-md border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="starts-at">Starts At (local time)</Label>
              <Input
                id="starts-at"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ends-at">Ends At (local time)</Label>
              <Input
                id="ends-at"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="note">Note (optional)</Label>
            <Input
              id="note"
              type="text"
              placeholder="e.g. Spring availability"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <Button
            onClick={handleCreate}
            disabled={isPending || !startsAt || !endsAt}
          >
            {isPending ? "Saving…" : "Add Window"}
          </Button>
        </div>
      </section>

      {/* Existing windows */}
      <section aria-labelledby="windows-heading">
        <h2 id="windows-heading" className="mb-4 text-lg font-medium">
          Current Windows
        </h2>
        {windows.length === 0 ? (
          <p className="text-muted-foreground text-sm">No windows defined.</p>
        ) : (
          <ul className="space-y-3">
            {windows.map((w) => (
              <li
                key={w.id}
                className="flex items-start justify-between gap-4 rounded-md border px-4 py-3"
              >
                <div className="text-sm">
                  <p>
                    <time dateTime={w.starts_at}>
                      {new Date(w.starts_at).toLocaleString("en-US", {
                        timeZone: "America/Denver",
                      })}
                    </time>
                    {" — "}
                    <time dateTime={w.ends_at}>
                      {new Date(w.ends_at).toLocaleString("en-US", {
                        timeZone: "America/Denver",
                      })}
                    </time>
                  </p>
                  {w.note && <p className="text-muted-foreground">{w.note}</p>}
                </div>

                {confirmDeleteId === w.id ? (
                  <div
                    className="flex gap-2"
                    role="group"
                    aria-label="Confirm delete"
                  >
                    <span className="text-destructive text-sm">
                      This will cancel overlapping bookings. Confirm?
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(w.id)}
                      disabled={isPending}
                      autoFocus
                    >
                      Yes, delete
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmDeleteId(w.id)}
                    disabled={isPending}
                  >
                    Block out / Delete
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
