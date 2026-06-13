/**
 * Account zone loading state — renders inside AppShell's `<main>` (the children
 * slot) while an account page fetches. The real sidebar and header stay mounted
 * during navigation, so only the page content shows a centered loading circle.
 */
import { PageLoader } from "@/components/ui/spinner";

export default function AccountLoading() {
  return <PageLoader label="Loading account" />;
}
