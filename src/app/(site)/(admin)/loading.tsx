/**
 * Admin zone loading state — renders inside AppShell's `<main>` (the children
 * slot) on first entry / hard load while an admin page fetches. The real sidebar
 * and header stay mounted. Same content-shaped skeleton the in-zone
 * `<ContentArea>` overlay uses for soft navigations.
 */
import { AdminContentSkeleton } from "@/components/layout/zone-skeletons";

export default function AdminLoading() {
  return <AdminContentSkeleton />;
}
