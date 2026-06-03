"use client";

/** Weekly-recurrence toggle + occurrence count. Presentational; caller owns state. */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RecurringControls({
  enabled,
  count,
  onEnabledChange,
  onCountChange,
}: {
  enabled: boolean;
  count: number;
  onEnabledChange: (on: boolean) => void;
  onCountChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <input
          id="recurring-toggle"
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          className="border-border accent-foreground focus-visible:outline-ring h-4 w-4 rounded focus-visible:outline-2"
        />
        <Label htmlFor="recurring-toggle">Repeat weekly</Label>
      </div>
      {enabled && (
        <div className="ml-7 flex flex-col gap-1">
          <Label htmlFor="occurrence-count">Number of weeks</Label>
          <Input
            id="occurrence-count"
            type="number"
            value={count}
            min={2}
            max={52}
            step={1}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!isNaN(n) && n >= 2) onCountChange(n);
            }}
            className="w-28"
          />
          <p className="text-muted-foreground text-xs">
            Books {count} weekly occurrences starting from the selected slot.
          </p>
        </div>
      )}
    </div>
  );
}
