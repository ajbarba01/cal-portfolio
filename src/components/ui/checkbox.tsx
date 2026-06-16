import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Checkbox — a custom-painted checkbox for boolean form fields. A real native
 * input (keeps form + a11y semantics) with `appearance-none`, styled to the
 * theme: a sand box that fills clay with an animated check when on. Pair with a
 * {@link Label} (or wrap text in a `<label>`). Control-only; no caption.
 */
export function Checkbox({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <span
      className={cn(
        "relative inline-grid size-4.5 shrink-0 place-items-center",
        className,
      )}
    >
      <input
        type="checkbox"
        data-slot="checkbox"
        className="peer border-input bg-background checked:border-brand checked:bg-brand focus-visible:ring-ring/50 hover:border-brand/50 col-start-1 row-start-1 size-full cursor-pointer appearance-none rounded-[6px] border transition-colors duration-150 outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      <Check
        aria-hidden
        strokeWidth={3}
        className="text-brand-foreground pointer-events-none col-start-1 row-start-1 size-3 scale-75 opacity-0 transition-[opacity,transform] duration-150 peer-checked:scale-100 peer-checked:opacity-100"
      />
    </span>
  );
}
