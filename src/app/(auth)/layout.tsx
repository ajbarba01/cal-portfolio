import { PageShell } from "@/components/layout/page-shell";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PageShell>
      {/* tabIndex -1 so the skip link actually lands: Safari/VoiceOver scrolls
          to a non-focusable fragment target but leaves the virtual cursor
          behind, which makes the bypass block a silent no-op there. */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center py-12"
      >
        {children}
      </main>
    </PageShell>
  );
}
