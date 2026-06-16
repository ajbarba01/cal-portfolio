import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Alert — an inline callout *within* a page (info / success / warning / error),
 * as opposed to the full-page `EmptyState` / `ErrorState` panels. One component
 * for every "heads-up" strip, replacing the hand-rolled tinted boxes. Tint +
 * border + leading icon; no drop-shadow.
 */
const alertVariants = cva(
  "flex items-start gap-2.5 rounded-lg border p-3 text-sm",
  {
    variants: {
      variant: {
        info: "bg-muted/50 border-border text-foreground",
        success:
          "bg-status-available border-status-available-foreground/25 text-status-available-foreground",
        warning:
          "bg-warning border-warning-foreground/30 text-warning-foreground",
        error: "bg-destructive/10 border-destructive/30 text-destructive",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

const DEFAULT_ICONS: Record<NonNullable<AlertVariant>, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle,
};

type AlertVariant = VariantProps<typeof alertVariants>["variant"];

export function Alert({
  variant = "info",
  title,
  icon,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof alertVariants> & {
    /** Bold lead line above the body. */
    title?: React.ReactNode;
    /** Override the default per-variant lucide icon; `null` hides it. */
    icon?: LucideIcon | null;
  }) {
  const Icon =
    icon === null ? null : (icon ?? DEFAULT_ICONS[variant ?? "info"]);
  return (
    <div
      data-slot="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {Icon ? (
        <Icon
          data-slot="alert-icon"
          aria-hidden
          className="mt-0.5 size-4 shrink-0 opacity-90"
        />
      ) : null}
      <div className="flex min-w-0 flex-col gap-0.5">
        {title ? <p className="leading-tight font-medium">{title}</p> : null}
        {children ? <div className="opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}
