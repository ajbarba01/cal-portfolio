import * as React from "react";

import { cn } from "@/lib/utils";
import { controlVariants } from "@/components/ui/control-variants";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      // Shares the control shell (border/radius/ring/padding) but overrides the
      // fixed track height — it's multi-line and resizable (h-auto wins via twMerge).
      className={cn(
        controlVariants(),
        "placeholder:text-muted-foreground disabled:bg-input/50 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 h-auto min-h-[6rem] w-full min-w-0 resize-y bg-transparent py-2 text-base md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
