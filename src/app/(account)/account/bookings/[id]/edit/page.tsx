/**
 * /account/bookings/[id]/edit — server-gated edit page for a single booking.
 *
 * Guards: auth → ownership → editability (via clientCanEditBooking) → service
 * exists. Loads booking-form data and pets exactly as the book page does, then
 * seeds EditBookingClient from the booking's current values.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createSupabaseBookingRepository } from "@/features/booking/booking-repository";
import { clientCanEditBooking } from "@/features/booking/client-can-edit";
import { loadBookingFormData } from "@/features/booking/booking-form-data";
import { quantityStateFromQuoteInputs } from "@/features/booking/quantity-state-from-quote-inputs";
import { EditBookingClient } from "./_components/edit-booking-client";
import type { ServiceDetail } from "@/features/booking/service-detail";
import type { AssignablePet } from "@/features/booking/_components/pet-assignment";
import type { PricingType } from "@/features/pricing/types";
import type { PetSpecies } from "@/features/booking/_components/pet-avatar";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export default async function EditBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Auth guard.
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();
  const repo = createSupabaseBookingRepository(svc);

  // Ownership guard.
  const booking = await repo.getBookingForEdit(id);
  if (!booking || booking.client_id !== user.id) redirect("/account/bookings");

  // Editability guard.
  const settings = await repo.getSettings();
  const editability = clientCanEditBooking(
    {
      status: booking.status,
      startsAt: booking.startsAt,
      paidCents: booking.paidCents,
      serviceSlug: booking.service_slug,
    },
    new Date(),
    settings.cancellation_full_refund_hours,
  );
  if (!editability.editable) redirect("/account/bookings");

  // Service detail.
  const { data: serviceRow } = await svc
    .from("services")
    .select("id, slug, name, description, pricing_type, default_duration_min")
    .eq("slug", booking.service_slug)
    .single();

  if (!serviceRow) redirect("/account/bookings");

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

  // Prior final_cents (getBookingForEdit does not return it).
  const { data: feeRow } = await svc
    .from("bookings")
    .select("final_cents")
    .eq("id", id)
    .single();
  const priorFinalCents: number = (feeRow?.final_cents as number | null) ?? 0;

  // Booking-rule settings + initial public busy ranges.
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
  const { rules, initialBusy } = loaded.data;

  // Client's pets with signed photo URLs.
  const { data: petRows } = await svc
    .from("pets")
    .select("id, name, species, breed, notes, photo_url")
    .eq("client_id", user.id)
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

  // Seed form from booking's current values.
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
        href="/account/bookings"
        className="text-muted-foreground hover:text-foreground mb-6 inline-block text-sm"
      >
        ← Your bookings
      </Link>
      <h1 className="mb-1 text-2xl font-semibold">Edit booking</h1>
      <p className="text-muted-foreground mb-8 text-sm">{service.name}</p>
      <EditBookingClient
        bookingId={id}
        service={service}
        rules={rules}
        initialBusy={initialBusy}
        pets={pets}
        priorFinalCents={priorFinalCents}
        initial={initial}
      />
    </main>
  );
}
