/**
 * Admin zone loading state — renders inside AppShell's
 * `<main px-5 py-8 sm:px-8>` (the children slot) while an admin page
 * fetches. The real sidebar and header are mounted by the layout and stay
 * visible during navigation, so only the page content is skeletonized.
 * Matches system-preview panel 4 "admin hub" variant: (sk.m) + (sk.card) × 2.
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Loading admin content">
      {/* Page title row — "sk.m" from system-preview panel 4 */}
      <Skeleton className="mb-6 h-5 w-[55%]" />

      {/* Primary widget card — "sk.card" */}
      <Skeleton className="mb-4 h-40 w-full rounded-xl" />

      {/* Secondary widget card — "sk.card" */}
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}
