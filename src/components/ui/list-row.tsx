import * as React from "react";

import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/**
 * ListRow — one row surface for list/data items (bookings, inquiries, clients).
 * A {@link Surface} with the standard row padding; `interactive` adds the hover
 * affordance (border + tint, no shadow). For a clickable row, nest a
 * {@link TextLink} for the primary label rather than making the whole row a link.
 */
export function ListRow({
  interactive = false,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Surface>, "variant"> & {
  interactive?: boolean;
}) {
  return (
    <Surface
      data-slot="list-row"
      variant={interactive ? "interactive" : "plain"}
      className={cn("px-4 py-3", className)}
      {...props}
    />
  );
}
