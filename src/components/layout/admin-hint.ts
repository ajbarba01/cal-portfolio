"use client";

import { useSyncExternalStore } from "react";

/**
 * Optimistic admin hint — last-known `isAdmin`, persisted in localStorage.
 *
 * Why: on a full page load (or hard refresh) landing in any zone, the header's
 * async auth + role query is still pending, so the wordmark's Suspense fallback
 * (HeaderAuthSkeleton) renders without an authoritative role and would default to
 * non-admin — flashing an admin's clay wordmark to black until the query lands.
 * This hint lets the fallback render the last-known state immediately. It's only a
 * guess: the authoritative server value always wins and overwrites it, so a stale
 * hint self-heals as soon as HeaderAuth resolves.
 *
 * (Cross-zone client navigation no longer remounts the header — it lives in the
 * persistent (site) shell now — so this hint is purely for the initial-render
 * Suspense window, not zone switches.)
 *
 * Never a security boundary — purely cosmetic (tint/link). Authorization is
 * always re-checked server-side (admin-guard / assertActorIsAdmin).
 */
const KEY = "cal:admin-hint";
const listeners = new Set<() => void>();

function getSnapshot(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** SSR + first hydration snapshot: unknown ⇒ non-admin (matches server HTML). */
function getServerSnapshot(): boolean {
  return false;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Read the optimistic admin hint (reactive, cross-tab via the storage event). */
export function useAdminHint(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Persist the authoritative admin flag so later fallbacks guess correctly. */
export function rememberAdminHint(isAdmin: boolean): void {
  try {
    const next = isAdmin ? "1" : "0";
    if (localStorage.getItem(KEY) === next) return;
    localStorage.setItem(KEY, next);
    listeners.forEach((notify) => notify());
  } catch {
    // Private mode / storage disabled — degrade to the original flash, no crash.
  }
}
