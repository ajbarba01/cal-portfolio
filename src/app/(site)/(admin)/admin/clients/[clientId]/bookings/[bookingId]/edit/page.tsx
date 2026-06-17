/**
 * Admin edit route — edit ANY client's booking as the admin actor.
 * Guards: admin role → status editable. No ownership/clientCanEdit gate.
 */
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCachedUser } from "@/lib/supabase/server-cache";
import { createServiceClient } from "@/lib/supabase/service";
import {
  createSupabaseBookingRepository,
  loadBookingFormData,
  quantityStateFromQuoteInputs,
  serviceSupportsKiche,
  kichePreview,
  EDITABLE_STATUSES,
  type ServiceDetail,
  type AssignablePet,
  type PetSpecies,
} from "@/features/booking";
import { EditBookingClient } from "@/app/(site)/(account)/account/bookings/[id]/edit/_components/edit-booking-client";
import { AdminKicheControl } from "./_components/admin-kiche-control";
import type { PricingType } from "@/features/pricing";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export default async function AdminEditBookingPage({
  params,
}: {
  params: Promise<{ clientId: string; bookingId: string }>;
}) {
  const { clientId, bookingId } = await params;

  const { user } = await getCachedUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();
  const { data: actor } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (actor?.role !== "admin") redirect("/admin");

  const repo = createSupabaseBookingRepository(svc);
  const booking = await repo.getBookingForEdit(bookingId);
  if (!booking || booking.client_id !== clientId) notFound();
  if (!EDITABLE_STATUSES.includes(booking.status))
    redirect(`/admin/clients/${clientId}`);

  const { data: clientRow } = await svc
    .from("profiles")
    .select("full_name, email")
    .eq("id", clientId)
    .single();
  const clientName =
    (clientRow?.full_name as string | null) ??
    (clientRow?.email as string | null) ??
    "client";

  const { data: serviceRow } = await svc
    .from("services")
    .select("id, slug, name, description, pricing_type, default_duration_min")
    .eq("slug", booking.service_slug)
    .single();
  if (!serviceRow) redirect(`/admin/clients/${clientId}`);

  const service: ServiceDetail = {
    slug: serviceRow.slug as string,
    name: serviceRow.name as string,
    description:
      typeof serviceRow.description === "string"
        ? serviceRow.description
        : null,
    pricingType: serviceRow.pricing_type as PricingType,
    defaultDurationMin:
      typeof serviceRow.default_duration_min === "number"
        ? serviceRow.default_duration_min
        : null,
  };

  const { data: feeRow } = await svc
    .from("bookings")
    .select("final_cents")
    .eq("id", bookingId)
    .single();
  const priorFinalCents: number = (feeRow?.final_cents as number | null) ?? 0;

  const loaded = await loadBookingFormData(booking.service_slug);
  if (!loaded.ok) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-destructive">
          Could not load booking settings. Please try again later.
        </p>
      </main>
    );
  }
  const { rules, initialBusy, initialPremiumDays } = loaded.data;

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

  // Kiche apply control — only for kiche-rated services where the client
  // consented. Preview numbers computed server-side from the frozen quote;
  // kichePreview returns null (control omitted) when that stored quote can't be
  // re-priced, so a malformed/legacy quote_inputs never crashes the page.
  const kicheRow = await repo.getBookingForKiche(bookingId);
  const kiche =
    kicheRow &&
    serviceSupportsKiche(service.pricingType) &&
    kicheRow.kiche_welcome
      ? kichePreview({
          quoteInputs: kicheRow.quote_inputs,
          kicheApplied: kicheRow.kiche_applied,
          currentFinalCents: kicheRow.finalCents,
          paidCents: kicheRow.payments
            .filter((p) => p.status === "succeeded")
            .reduce((sum, p) => sum + p.amountCents, 0),
        })
      : null;

  const initial = {
    startsAtIso: booking.startsAt.toISOString(),
    endsAtIso: booking.endsAt.toISOString(),
    petIds: booking.petIds,
    quantities: quantityStateFromQuoteInputs(
      service.pricingType,
      booking.quote_inputs,
    ),
    comments: booking.comments ?? "",
    wasConfirmed: booking.status === "confirmed",
    isSeriesOccurrence: booking.series_id !== null,
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href={`/admin/clients/${clientId}`}
        className="text-muted-foreground hover:text-foreground mb-6 inline-block text-sm"
      >
        ← {clientName}
      </Link>
      <h1 className="mb-1 text-2xl font-semibold">Edit booking</h1>
      <p className="text-muted-foreground mb-8 text-sm">{service.name}</p>
      {kiche && (
        <AdminKicheControl
          bookingId={bookingId}
          applied={kiche.applied}
          currentFinalCents={kiche.currentFinalCents}
          toggledFinalCents={kiche.toggledFinalCents}
          refundIfApplyCents={kiche.refundIfApplyCents}
          paidCents={kiche.paidCents}
        />
      )}
      <EditBookingClient
        bookingId={bookingId}
        service={service}
        rules={rules}
        initialBusy={initialBusy}
        initialPremiumDays={initialPremiumDays}
        pets={pets}
        priorFinalCents={priorFinalCents}
        initial={initial}
        admin={{ clientName, clientId, paidLock: booking.paidCents > 0 }}
      />
    </main>
  );
}
