/**
 * Admin create-on-behalf route. Role is gated by the (admin) layout; this page
 * loads the fixed client + their pets + services + booking rules and renders a
 * service-pick step then the create surface. Service selection is held in
 * client state in AdminCreateBookingFlow.
 */
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { ErrorState } from "@/components/feedback/error-state";
import { BackToSite } from "@/components/layout/back-to-site";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import {
  loadBookingFormData,
  SERVICE_DETAIL_COLUMNS,
  toServiceDetail,
} from "@/features/booking";
import { listClientPets, type AssignablePet } from "@/features/pets";
import { AdminCreateBookingFlow } from "./_components/admin-create-booking-flow";

/** The booking flow's own column width (see booking-flow.tsx layout contract). */
const BOOKING_WIDTH = "max-w-2xl";

export default async function AdminCreateBookingPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  const svc = createServiceClient();

  const { data: clientRow } = await svc
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", clientId)
    .single();
  if (!clientRow || clientRow.role !== "client") notFound();
  const clientName = clientRow.full_name ?? clientRow.email ?? "client";

  const { data: serviceRows } = await svc
    .from("services")
    .select(SERVICE_DETAIL_COLUMNS)
    .eq("active", true)
    .order("sort_order", { ascending: true });
  const services = (serviceRows ?? []).map(toServiceDetail);

  const petsRead = await listClientPets(svc, clientId);
  const pets: AssignablePet[] = petsRead.data.map(
    ({ id, name, species, breed, notes, photoUrl }) => ({
      id,
      name,
      species,
      breed,
      notes,
      photoUrl,
    }),
  );

  // The slug only drives the (discarded) initialBusy; booking rules come from
  // the global settings row, so the slug choice is inconsequential.
  const loaded = await loadBookingFormData(services[0]?.slug ?? "meet-greet");
  if (!loaded.ok) {
    return (
      <PageContainer className={BOOKING_WIDTH}>
        <BackToSite
          href={`/admin/clients/${clientId}`}
          label={clientName}
          className="mb-6"
        />
        <ErrorState
          title="Couldn't load this"
          message="Please try again shortly."
        />
      </PageContainer>
    );
  }
  const rules = loaded.data.rules;
  const initialPremiumDays = loaded.data.initialPremiumDays;

  return (
    <PageContainer className={BOOKING_WIDTH}>
      <BackToSite
        href={`/admin/clients/${clientId}`}
        label={clientName}
        className="mb-6"
      />
      <PageHeader title="New booking" subtitle={`for ${clientName}`} />
      <AdminCreateBookingFlow
        clientId={clientId}
        clientName={clientName}
        services={services}
        pets={pets}
        rules={rules}
        initialPremiumDays={initialPremiumDays}
      />
    </PageContainer>
  );
}
