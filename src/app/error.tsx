"use client";

/**
 * Global error boundary — catches render/runtime errors in any route below the
 * root layout, so (like the root `not-found.tsx`) it can't inherit the site
 * shell; `BackToSite` gives it a way out instead. Shows a generic message only
 * (no error detail leaked to the user); the raw error is logged to the console.
 */

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { BackToSite } from "@/components/layout/back-to-site";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-muted-foreground font-mono text-sm tracking-widest">
        error
      </p>

      <h1 className="text-foreground mt-3 text-3xl font-bold tracking-tight">
        Something went wrong
      </h1>

      <p className="text-muted-foreground mt-3 leading-relaxed">
        An unexpected error occurred. Please try again.
      </p>

      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={reset}
        className="mt-8"
      >
        Try again
      </Button>

      <BackToSite className="mt-6" />
    </main>
  );
}
