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

  // Reserve height either way so the swap to the spinner can't shift layout.
  if (!show) return <div className="min-h-[75vh]" aria-hidden="true" />;
  return <PageLoader label={label} />;
}
