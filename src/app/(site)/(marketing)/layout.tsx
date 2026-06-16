// src/app/(site)/(marketing)/layout.tsx
import { ContentArea } from "@/components/layout/content-area";
import { createStaticClient } from "@/lib/supabase/static";
import { listActiveServices } from "@/features/booking";
import {
  JsonLd,
  buildBusinessJsonLd,
  buildWebSiteJsonLd,
} from "@/features/seo";

/** Public marketing routes. Chrome (header/footer/sheet) is provided by the
 *  parent (site) shell; this layout supplies the content main + sitewide
 *  LocalBusiness/WebSite structured data. */
export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const services = await listActiveServices(createStaticClient());
  return (
    <main className="flex-1">
      <JsonLd data={buildBusinessJsonLd(services)} />
      <JsonLd data={buildWebSiteJsonLd()} />
      <ContentArea>{children}</ContentArea>
    </main>
  );
}
