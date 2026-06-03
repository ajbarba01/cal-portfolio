/**
 * /book — service chooser (server component).
 *
 * Lists active services as cards linking to the per-service booking flow at
 * /book/[serviceSlug]. Loaded via the service role (anon cannot read settings,
 * and we keep one load path). The calendar + booking UX lives on the per-service
 * route.
 */

import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";

interface ServiceCard {
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

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-destructive">
          Could not load services. Please try again later.
        </p>
      </main>
    );
  }

  const services: ServiceCard[] = (data ?? []).map((row) => ({
    slug: row.slug as string,
    name: row.name as string,
    description: typeof row.description === "string" ? row.description : null,
  }));

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Book a service</h1>
      <p className="text-muted-foreground mb-8 text-sm">
        Choose a service to see Cal&apos;s availability and book.
      </p>

      {services.length === 0 ? (
        <p className="text-muted-foreground">
          No services are currently available. Check back soon.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {services.map((s) => (
            <li key={s.slug}>
              <Link
                href={`/book/${s.slug}`}
                className="border-border bg-card text-card-foreground hover:border-foreground focus-visible:border-ring focus-visible:ring-ring/50 block h-full rounded-lg border p-4 transition-colors outline-none focus-visible:ring-3"
              >
                <span className="text-foreground block font-medium">
                  {s.name}
                </span>
                {s.description && (
                  <span className="text-muted-foreground mt-1 block text-sm">
                    {s.description}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
