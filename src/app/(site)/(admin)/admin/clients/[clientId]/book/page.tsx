/**
 * Admin create-on-behalf route. Verifies admin, loads the fixed client + their
 * pets + services + booking rules, renders a service-pick step then the create
 * surface. Service selection is held in client state in AdminCreateBookingFlow.
 */
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCachedUser } from "@/lib/supabase/server-cache";
import { createServiceClient } from "@/lib/supabase/service";
import { loadBookingFormData } from "@/features/booking";
import { AdminCreateBookingFlow } from "./_components/admin-create-booking-flow";
import type { PetSpecies, AssignablePet } from "@/features/booking";
import type { PricingType } from "@/features/pricing";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export default async function AdminCreateBookingPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  const { user } = await getCachedUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();
  const { data: actor } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (actor?.role !== "admin") redirect("/admin");

  const { data: clientRow } = await svc
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", clientId)
    .single();
  if (!clientRow || clientRow.role !== "client") notFound();
  const clientName =
    (clientRow.full_name as string | null) ??
    (clientRow.email as string | null) ??
    "client";

  const { data: serviceRows } = await svc
    .from("services")
    .select("slug, name, description, pricing_type, default_duration_min")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  const services = (serviceRows ?? []).map((s) => ({
    slug: s.slug as string,
    name: s.name as string,
    description: typeof s.description === "string" ? s.description : null,
    pricingType: s.pricing_type as PricingType,
    defaultDurationMin:
      typeof s.default_duration_min === "number"
        ? s.default_duration_min
        : null,
  }));

  const { data: petRows } = await svc
    .from("pets")
    .select("id, name, species, breed, notes, photo_url")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  const pets: AssignablePet[] = await Promise.all(
    (petRows ?? []).map(async (p) => {
      let photoUrl: string | null = null;
      if (p.photo_url) {
        const { data } = await svc.storage
          .from("pet-photos")
          .createSignedUrl(p.photo_url as string, SIGNED_URL_TTL_SECONDS);
        photoUrl = data?.signedUrl ?? null;
      }
      return {
        id: p.id as string,
        name: p.name as string,
        species: p.species as PetSpecies,
        breed: typeof p.breed === "string" ? p.breed : null,
        notes: typeof p.notes === "string" ? p.notes : null,
        photoUrl,
      };
    }),
  );

  // The slug only drives the (discarded) initialBusy; booking rules come from
  // the global settings row, so the slug choice is inconsequential.
  const loaded = await loadBookingFormData(services[0]?.slug ?? "meet-greet");
  if (!loaded.ok) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-destructive">
          Could not load booking settings. Please try again later.
        </p>
      </main>
    );
  }
  const rules = loaded.data.rules;
  const initialPremiumDays = loaded.data.initialPremiumDays;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href={`/admin/clients/${clientId}`}
        className="text-muted-foreground hover:text-foreground mb-6 inline-block text-sm"
      >
        ← {clientName}
      </Link>
      <h1 className="mb-1 text-2xl font-semibold">New booking</h1>
      <p className="text-muted-foreground mb-8 text-sm">for {clientName}</p>
      <AdminCreateBookingFlow
        clientId={clientId}
        clientName={clientName}
        services={services}
        pets={pets}
        rules={rules}
        initialPremiumDays={initialPremiumDays}
      />
    </main>
  );
}
