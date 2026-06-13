import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/page-container";

/**
 * Content-shaped loading skeletons, one per zone. Each is reused by BOTH the
 * zone `loading.tsx` (first-entry / hard load) and the in-zone `<ContentArea>`
 * overlay (soft sibling navigation), so the placeholder is identical however the
 * navigation started. Shapes mirror each zone's real page layout so the swap is
 * unmistakable. `min-h-[75vh]` keeps the slot from collapsing. Skeleton's pulse
 * already degrades to a static block under `prefers-reduced-motion` (animate-pulse).
 */

/** Account pages: page title + subtitle, then stacked cards. */
export function AccountContentSkeleton() {
  return (
    <PageContainer width="app" aria-busy="true" className="min-h-[75vh]">
      <div className="mb-8 flex flex-col gap-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="flex flex-col gap-5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="border-border flex flex-col gap-4 rounded-xl border p-5"
          >
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}

/** Admin pages: page title, then a list/table of rows. */
export function AdminContentSkeleton() {
  return (
    <PageContainer width="app" aria-busy="true" className="min-h-[75vh]">
      <div className="mb-8">
        <Skeleton className="h-9 w-64" />
      </div>
      <div className="border-border overflow-hidden rounded-xl border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="border-border flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
          >
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}

/** Marketing pages: a centered title + a few text lines and a media block. */
export function MarketingContentSkeleton() {
  return (
    <div
      className="mx-auto min-h-[75vh] w-full max-w-[65ch] px-4 py-12"
      aria-busy="true"
    >
      <Skeleton className="mb-4 h-10 w-2/3" />
      <Skeleton className="mb-2 h-4 w-full" />
      <Skeleton className="mb-2 h-4 w-full" />
      <Skeleton className="mb-8 h-4 w-1/2" />
      <Skeleton className="aspect-[3/2] w-full rounded-xl" />
    </div>
  );
}
