/**
 * Legend — horizontal status color key for the scheduler.
 *
 * Renders four entries (Available, Booked, Unavailable, Selected) each with
 * a color swatch and text label — never color-only. Purely presentational;
 * reads no context. Token-only colors.
 */

import { cn } from "@/lib/utils";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface LegendProps {
  className?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Data
// ──────────────────────────────────────────────────────────────────────────────

const ENTRIES = [
  {
    label: "Available",
    swatchClass: "bg-status-available",
  },
  {
    label: "Booked",
    swatchClass: "bg-status-booked",
  },
  {
    label: "Unavailable",
    swatchClass: "bg-status-unavailable",
  },
  {
    label: "Selected",
    swatchClass: "border-2 border-brand bg-transparent",
  },
  {
    label: "Your booking",
    swatchClass:
      "bg-status-available relative after:absolute after:bottom-0.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-status-available-foreground after:content-['']",
  },
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export function Legend({ className }: LegendProps) {
  return (
    <ul
      aria-label="Calendar legend"
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}
    >
      {ENTRIES.map(({ label, swatchClass }) => (
        <li key={label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn("size-3 rounded-sm", swatchClass)}
          />
          <span className="text-muted-foreground text-xs">{label}</span>
        </li>
      ))}
    </ul>
  );
}
