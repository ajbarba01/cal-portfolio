import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/server-cache";
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
  type AccountBookingPet,
  type AccountBookingQuoteInputs,
} from "./_components/account-bookings-client";

interface PaymentRow {
  amount_cents: number;
  status: string;
}

interface PetRow {
  name: string;
  species: string | null;
}

interface BookingPetRow {
  pets: PetRow | PetRow[] | null;
}

interface RawBookingRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatusDb;
  final_cents: number;
  payments: PaymentRow[];
  services: { name: string; slug: string }[] | null;
  booking_pets: BookingPetRow[] | null;
  quote_inputs: AccountBookingQuoteInputs | null;
}

/** Sum of succeeded payments (cents). */
function paidCents(payments: PaymentRow[]): number {
  return payments
    .filter((p) => p.status === "succeeded")
    .reduce((acc, p) => acc + p.amount_cents, 0);
}

function parsePets(bookingPets: BookingPetRow[] | null): AccountBookingPet[] {
  if (!bookingPets) return [];
  const result: AccountBookingPet[] = [];
  for (const bp of bookingPets) {
    if (!bp.pets) continue;
    // Supabase returns a single object for a to-one join or an array for to-many
    const petArr = Array.isArray(bp.pets) ? bp.pets : [bp.pets];
    for (const pet of petArr) {
      result.push({ name: pet.name, species: pet.species });
    }
  }
  return result;
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
  const settings = await repo.getSettings();

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, starts_at, ends_at, status, final_cents, quote_inputs, payments(amount_cents, status), services(name, slug), booking_pets(pets(name, species))",
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
    pets: parsePets(b.booking_pets),
    quoteInputs: b.quote_inputs ?? undefined,
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
