/** Public marketing routes — global shell (header + sheet + footer) via PageShell. */
import { PageShell } from "@/components/layout/page-shell";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PageShell>
      <main className="flex-1">{children}</main>
    </PageShell>
  );
}
