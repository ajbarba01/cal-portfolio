/**
 * Pass-through layout for all public (marketing) routes.
 * Session-aware nav and analytics are wired here in Phase 11.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
