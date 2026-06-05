import { PageShell } from "@/components/layout/page-shell";

export default function AuthLayout({
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
