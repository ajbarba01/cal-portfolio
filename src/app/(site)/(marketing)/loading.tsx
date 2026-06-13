/**
 * Marketing zone loading state — renders inside the zone layout (below the
 * persistent header) on first entry / hard load while a dynamic marketing page
 * fetches. Same content-shaped skeleton the in-zone `<ContentArea>` overlay uses
 * for soft navigations.
 */
import { MarketingContentSkeleton } from "@/components/layout/zone-skeletons";

export default function MarketingLoading() {
  return <MarketingContentSkeleton />;
}
