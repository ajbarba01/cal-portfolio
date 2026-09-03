import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { getCachedUser } from "@/lib/supabase/server-cache";
import { createServiceClient } from "@/lib/supabase/service";
import { createSupabaseBookingRepository } from "@/features/booking";
import { netPaid } from "@/features/payments";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

import {
  AccountBookingsClient,
  type AccountBookingRow,
  type AccountBookingPet,
} from "./_components/account-bookings-client";

/** The `payments` columns the balance line reads, projected out of the schema. */
type PaymentRow = Pick<
  Database["public"]["Tables"]["payments"]["Row"],
  "amount_cents" | "refunded_cents" | "status"
>;

/** What the client is actually out of pocket, refunds netted out. */
function paidCents(payments: PaymentRow[]): number {
  return netPaid(
    payments.map((p) => ({
      status: p.status,
      amountCents: p.amount_cents,
      refundedCents: p.refunded_cents,
    })),
  );
}

export default async function BookingsPage() {
  const { user } = await getCachedUser();

  if (!user) redirect("/login");

  const supabase = await createClient();
  const now = new Date();
  const monthStartIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();

  const repo = createSupabaseBookingRepository(createServiceClient());

  // Settings and the bookings list are independent — fetch in parallel.
  // window = newest 500; client search/pager operate on the window.
  const [settings, { data: bookings }] = await Promise.all([
    repo.getSettings(),
    supabase
      .from("bookings")
      .select(
        "id, starts_at, ends_at, status, final_cents, quote_inputs, quote_breakdown, payments(amount_cents, refunded_cents, status), services(name, slug), booking_pets(pets(name, species))",
      )
      .eq("client_id", user.id)
      .order("starts_at", { ascending: false })
      .limit(500),
  ]);

  const rows: AccountBookingRow[] = (bookings ?? []).map((b) => ({
    id: b.id,
    starts_at: b.starts_at,
    ends_at: b.ends_at,
    status: b.status,
    final_cents: b.final_cents,
    paid_cents: paidCents(b.payments),
    // `bookings.service_id` is `not null references services(id)`, so the join
    // always resolves to exactly one service.
    service_name: b.services.name,
    service_slug: b.services.slug,
    pets: b.booking_pets.map(
      (bp): AccountBookingPet => ({
        name: bp.pets.name,
        species: bp.pets.species,
      }),
    ),
    // Both columns are jsonb, so the generated type is the open `Json`. Legacy
    // bookings hold `{}` and every reader guards the fields it touches, so the
    // display shapes are asserted rather than parsed.
    quoteInputs:
      (b.quote_inputs as AccountBookingRow["quoteInputs"]) ?? undefined,
    quoteBreakdown:
      (b.quote_breakdown as AccountBookingRow["quoteBreakdown"]) ?? undefined,
  }));

  return (
    <PageContainer width="app">
      <PageHeader
        title="Your bookings"
        subtitle="Upcoming and past bookings. Times shown in Mountain time."
      />
      <AccountBookingsClient
        bookings={rows}
        monthStartIso={monthStartIso}
        nowIso={now.toISOString()}
        cancellationFullRefundHours={settings.cancellation_full_refund_hours}
      />
    </PageContainer>
  );
}
