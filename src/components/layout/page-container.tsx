import * as React from "react";

import { cn } from "@/lib/utils";
import { space } from "@/lib/design-tokens";

type PageContainerProps = React.ComponentProps<"div"> & {
  /** "read" = ~65ch reading column (marketing); "app" = wider (account/admin tables). */
  width?: "read" | "app";
};

const widths = {
  read: "max-w-[65ch]",
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
