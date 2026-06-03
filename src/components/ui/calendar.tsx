"use client";

/**
 * Calendar primitive — a thin react-day-picker v9 wrapper styled with the repo's
 * semantic design tokens (no hardcoded colors).
 *
 * Hand-authored (NOT via the shadcn CLI): the CLI scaffolds Radix-based wrappers,
 * but this project layers shadcn-style components on @base-ui/react. rdp ships its
 * own headless day-grid, so we only restyle it here with `classNames` + token
 * utility classes and swap the nav chevron for a lucide icon.
 *
 * rdp v9 API note: class slots are flat keys (e.g. `month_grid`, `day_button`,
 * `range_start`) — different from v8's nested `caption`/`head` structure.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DayPicker,
  getDefaultClassNames,
  type DayPickerProps,
} from "react-day-picker";

import { cn } from "@/lib/utils";

export type { DateRange } from "react-day-picker";

export function Calendar({ className, classNames, ...props }: DayPickerProps) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      className={cn("w-fit", className)}
      classNames={{
        root: cn(defaults.root, "p-2"),
        months: cn(defaults.months, "relative flex flex-col gap-4"),
        month: cn(defaults.month, "flex flex-col gap-4"),
        month_caption: cn(
          defaults.month_caption,
          "flex h-8 items-center justify-center px-8",
        ),
        caption_label: cn(defaults.caption_label, "text-sm font-medium"),
        nav: cn(
          defaults.nav,
          "absolute inset-x-0 top-0 flex items-center justify-between",
        ),
        button_previous: cn(
          defaults.button_previous,
          "hover:bg-muted inline-flex size-8 items-center justify-center rounded-lg disabled:opacity-40",
        ),
        button_next: cn(
          defaults.button_next,
          "hover:bg-muted inline-flex size-8 items-center justify-center rounded-lg disabled:opacity-40",
        ),
        month_grid: cn(defaults.month_grid, "w-full border-collapse"),
        weekdays: cn(defaults.weekdays, "flex"),
        weekday: cn(
          defaults.weekday,
          "text-muted-foreground w-9 text-xs font-normal",
        ),
        week: cn(defaults.week, "mt-1 flex w-full"),
        day: cn(defaults.day, "size-9 p-0 text-center text-sm"),
        day_button: cn(
          defaults.day_button,
          "hover:bg-muted focus-visible:ring-ring/50 inline-flex size-9 items-center justify-center rounded-lg outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-40 aria-selected:opacity-100",
        ),
        today: cn(defaults.today, "border-border rounded-lg border"),
        selected: cn(
          defaults.selected,
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary/80",
        ),
        range_start: cn(defaults.range_start, "rounded-l-lg"),
        range_middle: cn(
          defaults.range_middle,
          "bg-secondary text-secondary-foreground [&>button]:bg-transparent [&>button]:text-secondary-foreground",
        ),
        range_end: cn(defaults.range_end, "rounded-r-lg"),
        outside: cn(defaults.outside, "text-muted-foreground opacity-50"),
        disabled: cn(defaults.disabled, "text-muted-foreground opacity-40"),
        hidden: cn(defaults.hidden, "invisible"),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          ),
      }}
      {...props}
    />
  );
}
