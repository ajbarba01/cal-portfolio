/**
 * Per-service booking loading state — co-located at the [serviceSlug] segment so
 * the page loading circle shows on EVERY navigation that lands here, not just
 * first entry / hard load. Crucially this covers sibling-to-sibling hops via the
 * in-page ServiceSwitcher (/book/dog-walking → /book/house-sitting): those change
 * only the [serviceSlug] segment, so the marketing-zone root loading.tsx (above
 * the unchanged `book` segment) never re-triggers — the boundary has to live
 * here, on the segment that actually changes. Same DelayedPageLoader as the zone
 * shell for one consistent, calm circle.
 */
import { DelayedPageLoader } from "@/components/ui/delayed-page-loader";

export default function ServiceBookingLoading() {
  return <DelayedPageLoader label="Loading service" />;
}
