import * as React from "react";

import { cn } from "@/lib/utils";
import { space } from "@/lib/design-tokens";

type PageContainerProps = React.ComponentProps<"div"> & {
  /** "read" = ~65ch reading column (marketing); "narrow" = ~36rem forms/booking; "app" = wider (account/admin tables). */
  width?: "read" | "narrow" | "app";
};

const widths = {
  read: "max-w-[65ch]",
  narrow: "max-w-xl", // forms / booking flow (~36rem)
  app: "max-w-6xl",
} as const;

export function PageContainer({
  width = "read",
  className,
  ...props
}: PageContainerProps) {
  return (
    <div
      data-slot="page-container"
      className={cn("mx-auto w-full", widths[width], space.pageX, className)}
      {...props}
    />
  );
}
