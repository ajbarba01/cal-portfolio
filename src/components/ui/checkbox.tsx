import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Checkbox — the shared styled native checkbox for boolean form fields ("repeat
 * weekly", row selection). Uses the platform control via `accent-brand` so it
 * stays accessible and lightweight; pair with a {@link Label}.
 */
export function Checkbox({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        "border-input accent-brand focus-visible:outline-ring size-4 shrink-0 rounded focus-visible:outline-2 focus-visible:outline-offset-2",
        className,
      )}
      {...props}
    />
  );
}
