import * as React from "react";

import { cn } from "@/lib/utils";
import { space, typeScale } from "@/lib/design-tokens";

type PageHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        "mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className={cn("flex flex-col", space.field)}>
        <h1
          className="text-4xl font-semibold tracking-tight"
          style={{ lineHeight: typeScale.h1.leading }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}
