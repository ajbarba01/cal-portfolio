/**
 * Persistent site shell. This layout sits above the (marketing) / (account) /
 * (admin) groups, so the App Router renders it ONCE and preserves it across every
 * navigation between those zones — the header, footer, and sheet never remount,
 * which is what kills the cross-zone auth-query flash and cursor swoop. Each zone
 * keeps only its own thin layout below (gate + sidebar). Auth/onboarding routes
 * live outside this group and stay chrome-free.
 */
import { PageShell } from "@/components/layout/page-shell";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageShell>{children}</PageShell>;
}
