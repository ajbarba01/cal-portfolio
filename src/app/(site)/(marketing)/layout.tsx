/** Public marketing routes. Chrome (header/footer/sheet) is provided by the
 *  parent (site) shell; this layout only supplies the full-width content main. */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main className="flex-1">{children}</main>;
}
