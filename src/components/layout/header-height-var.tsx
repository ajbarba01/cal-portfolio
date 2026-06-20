"use client";

import * as React from "react";

/**
 * Publishes the global header's measured height as `--site-header-h` on <html>,
 * so sticky elements below the pinned bar (the zone sidebar, editorial side-
 * labels) can offset by it via `calc(var(--site-header-h) + …)`. Measured rather
 * than hardcoded because the header's height shifts with the breakpoint (tab row
 * vs. burger) and as the auth island hydrates. Only mounted when STICKY_NAV is
 * on; otherwise the var keeps its 0px default and those offsets collapse to their
 * original values.
 */
export function HeaderHeightVar() {
  React.useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const root = document.documentElement;
    const apply = () =>
      root.style.setProperty("--site-header-h", `${header.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--site-header-h");
    };
  }, []);
  return null;
}
