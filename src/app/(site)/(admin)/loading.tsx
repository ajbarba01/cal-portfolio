/**
 * Admin zone loading state — renders inside AppShell's `<main>` on first entry /
 * hard load. A single buffered page loading circle (blank first; spinner only if
 * the load drags), matching the in-zone `<ContentArea>` for soft navigations.
 */
import { DelayedPageLoader } from "@/components/ui/delayed-page-loader";

export default function AdminLoading() {
  return <DelayedPageLoader />;
}
