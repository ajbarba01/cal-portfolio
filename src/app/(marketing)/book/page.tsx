/**
 * /book — service chooser. Cards link to the per-service booking flow.
 * Server component; loaded via the service role.
 */
import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/feedback/error-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { createServiceClient } from "@/lib/supabase/service";

interface ServiceCardData {
  slug: string;
  name: string;
  description: string | null;
}

export default async function BookPage() {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("services")
    .select("slug, name, description")
    .eq("active", true)
    .order("sort_order");

  return (
    <PageContainer width="app" className="py-12 sm:py-16">
      <PageHeader
        title="Book a service"
        subtitle="Choose a service to see Cal's availability and book."
      />

      {error ? (
        <ErrorState
          title="Couldn't load services"
          message="Please try again in a moment."
        />
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="No services available" message="Check back soon." />
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" role="list">
          {(data ?? []).map((row) => {
            const s: ServiceCardData = {
              slug: row.slug as string,
              name: row.name as string,
              description:
                typeof row.description === "string" ? row.description : null,
            };
            return (
              <li key={s.slug}>
                <Link
                  href={`/book/${s.slug}`}
                  className="focus-visible:ring-ring/50 block h-full rounded-xl outline-none focus-visible:ring-3"
                >
                  <Card className="hover:border-foreground/40 h-full transition-colors">
                    <CardHeader>
                      <CardTitle className="font-heading">{s.name}</CardTitle>
                    </CardHeader>
                    {s.description ? (
                      <CardContent className="text-muted-foreground leading-relaxed">
                        {s.description}
                      </CardContent>
                    ) : null}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
