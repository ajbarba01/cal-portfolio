import { PageShell } from "@/components/layout/page-shell";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PageShell>
      <main className="flex flex-1 items-center justify-center py-12">
        {children}
      </main>
    </PageShell>
  );
}
