import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  createSupabaseBookingRepository,
  type BookingStatusDb,
} from "@/features/booking";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

import {
  AccountBookingsClient,
  type AccountBookingRow,
} from "./_components/account-bookings-client";

interface PaymentRow {
  amount_cents: number;
  status: string;
}

interface RawBookingRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatusDb;
  final_cents: number;
  payments: PaymentRow[];
  services: { name: string; slug: string }[] | null;
}

/** Sum of succeeded payments (cents). */
function paidCents(payments: PaymentRow[]): number {
  return payments
    .filter((p) => p.status === "succeeded")
    .reduce((acc, p) => acc + p.amount_cents, 0);
}

export default async function BookingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const now = new Date();
  const monthStartIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();

  const repo = createSupabaseBookingRepository(createServiceClient());
  const settings = await repo.getSettings();

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, starts_at, ends_at, status, final_cents, payments(amount_cents, status), services(name, slug)",
    )
    .eq("client_id", user.id)
    .order("starts_at", { ascending: false });

  const raw = (bookings as RawBookingRow[]) ?? [];
  const rows: AccountBookingRow[] = raw.map((b) => ({
    id: b.id,
    starts_at: b.starts_at,
    ends_at: b.ends_at,
    status: b.status,
    final_cents: b.final_cents,
    paid_cents: paidCents(b.payments),
    service_name: b.services?.[0]?.name ?? "Service",
    service_slug: b.services?.[0]?.slug ?? "",
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
