import { PageShell } from "@/components/layout/page-shell";

/**
 * Onboarding zone — a pre-account gate, intentionally OUTSIDE the account
 * sidebar shell. Renders only the global header (the way back to the site) plus
 * the page's own back affordance. No zoneNav: an onboarding user has no account
 * sections to navigate yet.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageShell>{children}</PageShell>;
}
