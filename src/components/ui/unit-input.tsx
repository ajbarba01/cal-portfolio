import * as React from "react";

import { controlVariants } from "@/components/ui/control-variants";
import { cn } from "@/lib/utils";

/**
 * UnitInput — an Input with a leading or trailing unit adornment ($, %, "per
 * booking") inside one control-track box, so it lines up with plain fields. The
 * adornment is a muted, non-selectable label set off by a hairline divider (an
 * input-group), and the figure renders `tabular-nums`. The focus ring lives on
 * the box (`focus-within`). Promoted from the admin-settings local UnitField.
 */
export function UnitInput({
  unit,
  unitPosition = "trailing",
  className,
  ...props
}: React.ComponentProps<"input"> & {
  unit: React.ReactNode;
  unitPosition?: "leading" | "trailing";
}) {
  const adornment = (side: "leading" | "trailing") => (
    <span
      className={cn(
        "text-muted-foreground border-border flex shrink-0 items-center self-stretch text-xs font-medium select-none",
        side === "leading" ? "mr-2 border-r pr-2" : "ml-2 border-l pl-2",
      )}
    >
      {unit}
    </span>
  );

  return (
    <div
      data-slot="unit-input"
      className={cn(
        controlVariants(),
        "bg-background focus-within:border-ring focus-within:ring-ring/50 flex items-center focus-within:ring-3",
        className,
      )}
    >
      {unitPosition === "leading" ? adornment("leading") : null}
      <input
        className="min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      {unitPosition === "trailing" ? adornment("trailing") : null}
    </div>
  );
}
