// src/app/(site)/(marketing)/layout.tsx
import { ContentArea } from "@/components/layout/content-area";
import {
  JsonLd,
  buildBusinessJsonLd,
  buildWebSiteJsonLd,
} from "@/features/seo";

/** Public marketing routes. Chrome (header/footer/sheet) is provided by the
 *  parent (site) shell; this layout supplies the content main + sitewide
 *  LocalBusiness/WebSite structured data.
 *
 *  The business node deliberately carries no offers. Reading the service list
 *  here would make every route under this layout dynamic and make the build
 *  itself depend on the database; /services already fetches the list (and
 *  revalidates when Cal edits a service), so it adds the offers to this node
 *  by `@id`. */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // tabIndex -1 so the skip link actually lands: Safari/VoiceOver scrolls to
    // a non-focusable fragment target but leaves the virtual cursor behind,
    // which makes the bypass block a silent no-op there.
    <main id="main-content" tabIndex={-1} className="flex-1">
      <JsonLd data={buildBusinessJsonLd()} />
      <JsonLd data={buildWebSiteJsonLd()} />
      <ContentArea>{children}</ContentArea>
    </main>
  );
}
