import * as React from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground",
        brand: "bg-brand text-brand-foreground",
        available: "bg-status-available text-status-available-foreground",
        booked: "bg-status-booked text-status-booked-foreground",
        unavailable: "bg-status-unavailable text-status-unavailable-foreground",
        pending: "bg-brand/15 text-brand-strong",
        destructive: "bg-destructive/10 text-destructive",
        outline: "border-border bg-card text-foreground border",
      },
      size: {
        sm: "px-2.5 py-0.5 text-xs",
        md: "px-3 py-1 text-xs",
      },
    },
    defaultVariants: { variant: "default", size: "sm" },
  },
);

function Badge({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
