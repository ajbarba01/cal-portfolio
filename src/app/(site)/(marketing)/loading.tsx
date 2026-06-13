/**
 * Marketing zone loading state — renders inside the zone layout (below the
 * persistent header) on first entry / hard load. A single buffered page loading
 * circle, matching the in-zone `<ContentArea>` for soft navigations.
 */
import { DelayedPageLoader } from "@/components/ui/delayed-page-loader";

export default function MarketingLoading() {
  return <DelayedPageLoader label="Loading page" />;
}
