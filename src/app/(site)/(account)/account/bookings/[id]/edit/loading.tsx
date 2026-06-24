/**
 * Booking-edit loading state — co-located so soft navigations INTO a single
 * booking (from the bookings list) flip to the page loading circle immediately,
 * not just on first entry / hard load. Without a boundary here the nearest
 * `loading.tsx` is the account-zone root, which isn't the changing segment on
 * an in-zone nav, so no instant loading shows. Same DelayedPageLoader as the
 * zone shell for one consistent, calm circle.
 */
import { DelayedPageLoader } from "@/components/ui/delayed-page-loader";

export default function EditBookingLoading() {
  return <DelayedPageLoader label="Loading booking" />;
}
