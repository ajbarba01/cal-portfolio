/**
 * Account zone loading state — renders inside AppShell's
 * `<main px-5 py-8 sm:px-8>` (the children slot) while an account page
 * fetches. The real sidebar and header are mounted by the layout and stay
 * visible during navigation, so only the page content is skeletonized:
 * title + descriptor row + cards matching typical account page dimensions.
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function AccountLoading() {
  return (
    <div aria-busy="true" aria-label="Loading account content">
      {/* Page title */}
      <Skeleton className="mb-4 h-7 w-[40%]" />

      {/* Descriptor row */}
      <Skeleton className="mb-6 h-3.5 w-[65%]" />

      {/* Primary content card */}
      <Skeleton className="mb-4 h-40 w-full rounded-xl" />

      {/* Secondary row */}
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}
