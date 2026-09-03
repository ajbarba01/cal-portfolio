/**
 * Admin edit route — edit ANY client's booking as the admin actor. Role is
 * gated by the (admin) layout; this page only checks the booking belongs to
 * the route's client and is in an editable status. No ownership/clientCanEdit
 * gate — unlike the client-facing edit page, an admin isn't bound by the
 * reschedule cutoff.
 */
import { redirect, notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { ErrorState } from "@/components/feedback/error-state";
import { BackToSite } from "@/components/layout/back-to-site";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import {
  createSupabaseBookingRepository,
  driveBufferMinutes,
  loadBookingFormData,
  quantityStateFromQuoteInputs,
  manualDiscountRows,
  EDITABLE_STATUSES,
  SERVICE_DETAIL_COLUMNS,
  toServiceDetail,
} from "@/features/booking";
import { listClientPets, type AssignablePet } from "@/features/pets";
import { EditBookingClient } from "@/features/booking/index.client";
import { AdminManualDiscounts } from "./_components/admin-manual-discounts";
import { parsePricingConfig, type Modifier } from "@/features/pricing";
// Pure projection — the client entry avoids dragging the Stripe gateway in.
import { netPaid } from "@/features/payments/index.client";

/** The booking flow's own column width (see booking-flow.tsx layout contract). */
const BOOKING_WIDTH = "max-w-2xl";

export default async function AdminEditBookingPage({
  params,
}: {
  params: Promise<{ clientId: string; bookingId: string }>;
}) {
  const { clientId, bookingId } = await params;

  const svc = createServiceClient();
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
  const clientName = clientRow?.full_name ?? clientRow?.email ?? "client";

  const { data: serviceRow } = await svc
    .from("services")
    .select(SERVICE_DETAIL_COLUMNS)
    .eq("slug", booking.service_slug)
    .single();
  if (!serviceRow) redirect(`/admin/clients/${clientId}`);

  const service = toServiceDetail(serviceRow);

  // manualDiscountRows needs the full modifier list, not just constraints —
  // toServiceDetail only carries constraints, so parse pricing_config again.
  let modifiers: Modifier[] = [];
  try {
    modifiers = parsePricingConfig(serviceRow.pricing_config).modifiers;
  } catch {
    // keep modifiers empty — never crash on bad config
  }

  // Also the row manualDiscountRows needs below — one read serves both, so it
  // is fetched here rather than a second time further down.
  const discountBooking = await repo.getBookingForKiche(bookingId);
  const priorFinalCents = discountBooking?.finalCents ?? 0;

  const loaded = await loadBookingFormData(booking.service_slug);
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
  const { rules, initialBusy, initialPremiumDays, driveBuffer } = loaded.data;

  // The travel time this client's visits reserve, so the picker offers Cal the
  // same drive-time-clear slots the save-side guard would accept.
  const viewerDriveBufferMin = driveBufferMinutes(
    driveBuffer.origin,
    await repo.getProfileLatLng(clientId),
    driveBuffer.config,
  );

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

  // Manual discounts — the service names them, but the booking's FROZEN quote
  // decides which it can carry: manualDiscountRows drops any the stored quote
  // cannot re-price, so a malformed or legacy quote_inputs leaves an empty list
  // rather than crashing the page.
  //
  // Paid amounts are NET of refunds — a booking already partly refunded has
  // paid less than it was charged, and quoting the gross would over-state the
  // refund Cal is about to authorise.
  const discountRows = discountBooking
    ? manualDiscountRows({
        modifiers,
        quoteInputs: discountBooking.quote_inputs,
        kicheApplied: discountBooking.kiche_applied,
        kicheWelcome: discountBooking.kiche_welcome,
        currentFinalCents: discountBooking.finalCents,
        paidCents: netPaid(discountBooking.payments),
      })
    : [];

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
    <PageContainer className={BOOKING_WIDTH}>
      <BackToSite
        href={`/admin/clients/${clientId}`}
        label={clientName}
        className="mb-6"
      />
      <PageHeader title="Edit booking" subtitle={service.name} />
      {discountRows.length > 0 && (
        <AdminManualDiscounts bookingId={bookingId} rows={discountRows} />
      )}
      <EditBookingClient
        bookingId={bookingId}
        service={service}
        rules={rules}
        initialBusy={initialBusy}
        initialPremiumDays={initialPremiumDays}
        pets={pets}
        priorFinalCents={priorFinalCents}
        viewerDriveBufferMin={viewerDriveBufferMin}
        initial={initial}
        admin={{ clientName, clientId, paidLock: booking.paidCents > 0 }}
      />
    </PageContainer>
  );
}
