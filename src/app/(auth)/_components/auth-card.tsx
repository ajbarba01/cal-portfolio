import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { ShimmerCard } from "@/components/ui/shimmer-card";
import { cn } from "@/lib/utils";

/**
 * The one shape every auth route renders: a narrow shimmer card carrying the
 * heading, a line of context and the form, with an optional switch link
 * underneath. Sign in, sign up and claim differ only in what goes inside, so
 * the shell lives here rather than being re-typed per page.
 */
export function AuthCard({
  title,
  subtitle,
  icon: Icon,
  footer,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  /** Lead glyph for a state with nothing to fill in (the sent-email panel). */
  icon?: LucideIcon;
  /** The link under the card that switches to the other auth route. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <PageContainer width="narrow" className="w-full">
      <div className="mx-auto w-full max-w-sm">
        {/* A card with a glyph and no form centres, so the glyph reads as the
            panel's subject rather than as a stray mark beside the heading. */}
        <ShimmerCard className={cn("p-6 sm:p-8", Icon && "text-center")}>
          {Icon ? (
            <Icon
              aria-hidden="true"
              className="text-brand mx-auto mb-3 size-8"
              strokeWidth={1.5}
            />
          ) : null}

          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            {title}
          </h1>

          {subtitle ? (
            <p className="text-muted-foreground mt-1.5 text-sm">{subtitle}</p>
          ) : null}

          {children ? <div className="mt-5">{children}</div> : null}
        </ShimmerCard>

        {footer ? (
          <p className="text-muted-foreground mt-4 text-center text-sm">
            {footer}
          </p>
        ) : null}
      </div>
    </PageContainer>
  );
}
