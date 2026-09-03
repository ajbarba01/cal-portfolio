/**
 * /account/bookings/[id]/edit — server-gated edit page for a single booking.
 *
 * Routing only: the auth guard lives here, every other guard and read lives in
 * `getBookingEditView`, which answers whether this client may edit this booking
 * at all before returning anything to render.
 */

import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/supabase/server-cache";
import { createServiceClient } from "@/lib/supabase/service";
import { ErrorState } from "@/components/feedback/error-state";
import { BackToSite } from "@/components/layout/back-to-site";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { getBookingEditView } from "@/features/booking";
import { EditBookingClient } from "@/features/booking/index.client";

/** The booking flow's own column width (see booking-flow.tsx layout contract). */
const BOOKING_WIDTH = "max-w-2xl";

export default async function EditBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { user } = await getCachedUser();
  if (!user) redirect("/login");

  const view = await getBookingEditView(createServiceClient(), id, user.id);

  if (!view.ok) {
    if (view.reason === "forbidden") redirect("/account/bookings");
    return (
      <PageContainer className={BOOKING_WIDTH}>
        <BackToSite
          href="/account/bookings"
          label="Your bookings"
          className="mb-6"
        />
        <ErrorState
          title="Couldn't load this"
          message="Please try again shortly."
        />
      </PageContainer>
    );
  }

  const { service, formData, pets, priorFinalCents, driveBufferMin, initial } =
    view.data;

  return (
    <PageContainer className={BOOKING_WIDTH}>
      <BackToSite
        href="/account/bookings"
        label="Your bookings"
        className="mb-6"
      />
      <PageHeader title="Edit booking" subtitle={service.name} />
      <EditBookingClient
        bookingId={id}
        service={service}
        rules={formData.rules}
        initialBusy={formData.initialBusy}
        initialPremiumDays={formData.initialPremiumDays}
        pets={pets}
        priorFinalCents={priorFinalCents}
        viewerDriveBufferMin={driveBufferMin}
        initial={initial}
      />
    </PageContainer>
  );
}
