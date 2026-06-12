/**
 * Marketing zone loading state — renders inside the zone layout (below the
 * persistent header) while a dynamic marketing page fetches its data. Matches
 * the content area width + rhythm of a typical marketing page: a page-width
 * container with a title block, prose rows, and a card-height content block.
 * Mirrors the skeleton shapes from system-preview panel 4.
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function MarketingLoading() {
  return (
    <div
      className="mx-auto w-full max-w-[65ch] flex-1 px-5 py-12 sm:px-8 sm:py-16"
      aria-busy="true"
      aria-label="Loading page content"
    >
      {/* Title — ~45% width, matches "sk.t" from system-preview */}
      <Skeleton className="mb-4 h-9 w-[45%]" />

      {/* Prose rows — long + medium, matches "sk.l" + "sk.m" */}
      <Skeleton className="mb-2.5 h-3.5 w-[90%]" />
      <Skeleton className="mb-6 h-3.5 w-[70%]" />

      {/* Card block — content area placeholder, matches "sk.card" */}
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
