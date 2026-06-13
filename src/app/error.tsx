"use client";

/**
 * Global error boundary — catches render/runtime errors in any route below the
 * root layout. Styled to match `not-found.tsx`. Shows a generic message only (no
 * error detail leaked to the user); the raw error is logged to the console.
 */

import { useEffect } from "react";

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

      <button
        type="button"
        onClick={reset}
        className="text-foreground mt-8 underline underline-offset-4 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Try again
      </button>
    </main>
  );
}
