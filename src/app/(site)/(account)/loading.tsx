/**
 * Account zone loading state — renders inside AppShell's `<main>` (the children
 * slot) on first entry / hard load while an account page fetches. The real
 * sidebar and header stay mounted. Same content-shaped skeleton the in-zone
 * `<ContentArea>` overlay uses for soft navigations, so the placeholder is
 * identical however the navigation started.
 */
import { AccountContentSkeleton } from "@/components/layout/zone-skeletons";

export default function AccountLoading() {
  return <AccountContentSkeleton />;
}
