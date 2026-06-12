/**
 * Account zone loading state — renders inside the zone layout (below the
 * persistent header) while an account page fetches. Mirrors the AppShell
 * structure: a 240px sidebar rail on md+ and a content area with rows + cards.
 * The real sidebar renders in the layout (already mounted); this skeleton is
 * for the PAGE content slot only, so the sidebar column is omitted — only the
 * main content area is skeletonized.
 *
 * AppShell: `<aside w-60> | <main px-5 py-8 sm:px-8>`
 * This file renders AS the main content area (children slot).
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function AccountLoading() {
  return (
    <div
      className="flex flex-1"
      aria-busy="true"
      aria-label="Loading account content"
    >
      {/* Sidebar rail placeholder — keeps the layout from collapsing while the
          real sidebar (part of the layout, already painted) is loading. Hidden
          on mobile (matches AppShell's hidden md:block aside). */}
      <div
        className="border-border bg-sidebar hidden w-60 shrink-0 border-r md:block"
        aria-hidden="true"
      >
        <div className="flex flex-col gap-1 p-3 pt-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      </div>

      {/* Content area — matches AppShell's `<main px-5 py-8 sm:px-8>` */}
      <div className="min-w-0 flex-1 px-5 py-8 sm:px-8">
        {/* Page title */}
        <Skeleton className="mb-4 h-7 w-[40%]" />

        {/* Descriptor row */}
        <Skeleton className="mb-6 h-3.5 w-[65%]" />

        {/* Primary content card */}
        <Skeleton className="mb-4 h-40 w-full rounded-xl" />

        {/* Secondary row */}
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}
