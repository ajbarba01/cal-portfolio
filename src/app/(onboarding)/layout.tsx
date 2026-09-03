import { Suspense } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { VerifiedToast } from "./_components/verified-toast";

/**
 * Onboarding zone — a pre-account gate, intentionally OUTSIDE the account
 * sidebar shell. Renders only the global header (the way back to the site) plus
 * the page's own back affordance. No zoneNav: an onboarding user has no account
 * sections to navigate yet.
 *
 * The zone owns its own `<main>` (every other zone has one) so the wizard is a
 * landmark and, being `flex-1`, fills the sheet instead of leaving the footer
 * floating mid-page. The toast stays outside it — it is not page content.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PageShell>
      <Suspense fallback={null}>
        <VerifiedToast />
      </Suspense>
      <main id="main-content" className="flex-1">
        {children}
      </main>
    </PageShell>
  );
}
