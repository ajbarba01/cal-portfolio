/**
 * Marketing zone loading state — renders inside the zone layout (below the
 * persistent header) while a dynamic marketing page fetches its data. A single
 * centered on-theme loading circle; the header stays mounted above it.
 */
import { PageLoader } from "@/components/ui/spinner";

export default function MarketingLoading() {
  return <PageLoader label="Loading page" />;
}
