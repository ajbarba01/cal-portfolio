"use client";

import { useEffect, useState } from "react";
import { PageLoader } from "./spinner";

/**
 * Page loading circle with a buffer: shows nothing for `delayMs`, then the
 * centered spinner. A fast load completes within the buffer and flashes only a
 * blank page (no spinner blip); a slow load surfaces the circle. Used by every
 * zone `loading.tsx` and the in-zone `<ContentArea>` so the loading experience
 * is one consistent, calm page-level circle (not per-element placeholders).
 */
export function DelayedPageLoader({
  delayMs = 400,
  label = "Loading",
}: {
  delayMs?: number;
  label?: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(id);
  }, [delayMs]);

  // Reserve a FULL viewport either way (`<main>` is flex-1, so the loader fills
  // the sheet and pushes the shell footer below the fold for the whole load —
  // it's never seen at a wrong position, then fades in at its final spot on
  // commit). Same height whether blank or spinner, so the swap can't shift it.
  if (!show) return <div className="min-h-dvh" aria-hidden="true" />;
  return <PageLoader label={label} />;
}
