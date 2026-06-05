"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ErrorStateProps = {
  title: React.ReactNode;
  message?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({
  title,
  message,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      data-slot="error-state"
      role="alert"
      className={cn(
        "mx-auto flex max-w-sm flex-col items-center gap-2 py-16 text-center",
        className,
      )}
    >
      <span className="bg-destructive/10 text-destructive flex size-11 items-center justify-center rounded-full">
        <AlertTriangle className="size-5" />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      {message ? (
        <p className="text-muted-foreground text-sm">{message}</p>
      ) : null}
      {onRetry ? (
        <Button variant="outline" size="lg" className="mt-2" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
