"use client";

import * as React from "react";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { cn } from "@/lib/utils";

/**
 * Tooltip — hover (pointer), tap-to-toggle (touch), and focus (keyboard) reveal
 * of short helper text. Bordered, shadow-free popup per the house no-shadow rule;
 * tokens only. Thin wrapper over @base-ui/react so callers don't compose parts.
 */
export function Tooltip({
  content,
  children,
}: {
  content: React.ReactNode;
  children: React.ReactElement;
}) {
  // @base-ui/react's Tooltip does not itself wire aria-describedby from the
  // trigger to the popup, so screen-reader users would otherwise never learn
  // the popup's content exists. Wire it manually.
  const popupId = React.useId();
  if (!content) return children;
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} aria-describedby={popupId} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner sideOffset={6}>
          <BaseTooltip.Popup
            id={popupId}
            className={cn(
              "border-border bg-popover text-popover-foreground max-w-xs rounded-md border px-3 py-2 text-xs leading-relaxed",
            )}
          >
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}

/**
 * InfoTooltip — an ⓘ icon button that reveals `content`. `label` is the trigger's
 * accessible name; `content` is additionally wired via aria-describedby (see
 * `Tooltip` above), so screen-reader users get both the question (`label`) and
 * the definition (`content`).
 */
export function InfoTooltip({
  label,
  content,
}: {
  label: string;
  content: React.ReactNode;
}) {
  if (!content) return null;
  return (
    <Tooltip content={content}>
      <button
        type="button"
        aria-label={label}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-4 items-center justify-center rounded-full align-middle focus-visible:ring-2 focus-visible:outline-none"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5">
          <circle
            cx="8"
            cy="8"
            r="7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M8 7v4M8 5h.01"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </Tooltip>
  );
}
