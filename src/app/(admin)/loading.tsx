/**
 * Admin zone loading state — renders inside the zone layout (below the
 * persistent header) while an admin page fetches. Mirrors the AppShell
 * structure: sidebar rail + content area. Matches system-preview panel 4
 * "admin hub" variant: (sk.m) + (sk.card) × 2.
 *
 * AppShell: `<aside w-60> | <main px-5 py-8 sm:px-8>`
 * This file renders AS the children slot (below header, same flex row as AppShell).
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div
      className="flex flex-1"
      aria-busy="true"
      aria-label="Loading admin content"
    >
      {/* Sidebar rail placeholder — mirrors AppShell's w-60 aside (hidden on mobile). */}
      <div
        className="border-border bg-sidebar hidden w-60 shrink-0 border-r md:block"
        aria-hidden="true"
      >
        <div className="flex flex-col gap-1 p-3 pt-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      </div>

      {/* Content area — matches AppShell's `<main px-5 py-8 sm:px-8>` */}
      <div className="min-w-0 flex-1 px-5 py-8 sm:px-8">
        {/* Page title row — "sk.m" from system-preview panel 4 */}
        <Skeleton className="mb-6 h-5 w-[55%]" />

        {/* Primary widget card — "sk.card" */}
        <Skeleton className="mb-4 h-40 w-full rounded-xl" />

        {/* Secondary widget card — "sk.card" */}
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    </div>
  );
}
