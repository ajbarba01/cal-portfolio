/**
 * Admin booking-edit loading state — co-located so soft navigations INTO a
 * single client's booking (from the client detail page) flip to the page
 * loading circle immediately, not just on first entry / hard load. Mirrors the
 * account-side booking-edit loading boundary.
 */
import { DelayedPageLoader } from "@/components/ui/delayed-page-loader";

export default function AdminEditBookingLoading() {
  return <DelayedPageLoader label="Loading booking" />;
}
