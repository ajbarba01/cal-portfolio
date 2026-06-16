import * as React from "react";

import { controlVariants } from "@/components/ui/control-variants";
import { cn } from "@/lib/utils";

/**
 * UnitInput — an Input with a leading or trailing unit adornment ($, %, "per
 * booking") inside one control-track box, so it lines up with plain fields. The
 * field sits flush; the adornment is muted and non-selectable. The focus ring
 * lives on the box (`focus-within`). Promoted from the admin-settings local
 * UnitField.
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
  return (
    <div
      data-slot="unit-input"
      className={cn(
        controlVariants(),
        "bg-background focus-within:border-ring focus-within:ring-ring/50 flex items-center gap-2 focus-within:ring-3",
        className,
      )}
    >
      {unitPosition === "leading" ? (
        <span className="text-muted-foreground shrink-0 text-xs select-none">
          {unit}
        </span>
      ) : null}
      <input
        className="min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      {unitPosition === "trailing" ? (
        <span className="text-muted-foreground ml-auto shrink-0 text-xs select-none">
          {unit}
        </span>
      ) : null}
    </div>
  );
}
