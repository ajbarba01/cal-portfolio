import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PrepayButton } from "./_components/prepay-button";

/** Money: integer cents → dollars string (e.g. 4500 → "$45.00"). */
function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** UTC ISO string → America/Denver local string. */
function formatDenver(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Denver",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

interface PaymentRow {
  amount_cents: number;
  status: string;
}

interface BookingRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  final_cents: number;
  payments: PaymentRow[];
  services: { name: string }[] | null;
}

/** Amount owed = final_cents − sum of succeeded payments. */
function amountOwed(booking: BookingRow): number {
  const paid = booking.payments
    .filter((p) => p.status === "succeeded")
    .reduce((acc, p) => acc + p.amount_cents, 0);
  return Math.max(0, booking.final_cents - paid);
}

export default async function BookingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const now = new Date().toISOString();

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, starts_at, ends_at, status, final_cents, payments(amount_cents, status), services(name)",
    )
    .eq("client_id", user.id)
    .order("starts_at", { ascending: false });

  const rows = (bookings as BookingRow[]) ?? [];
  const upcoming = rows.filter((b) => b.ends_at >= now);
  const history = rows.filter((b) => b.ends_at < now);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-foreground mb-2 text-2xl font-semibold">
        Your bookings
      </h1>
      <p className="text-muted-foreground mb-8 text-sm">
        Upcoming and past bookings. Times shown in Mountain time.
      </p>

      <nav aria-label="Account sections" className="mb-8 flex gap-4 text-sm">
        <a
          href="/account"
          className="text-muted-foreground hover:text-foreground"
        >
          Profile
        </a>
        <a
          href="/account/dogs"
          className="text-muted-foreground hover:text-foreground"
        >
          Dogs
        </a>
        <a
          href="/account/forms"
          className="text-muted-foreground hover:text-foreground"
        >
          Forms
        </a>
        <a
          href="/account/bookings"
          className="text-foreground font-medium underline"
        >
          Bookings
        </a>
      </nav>

      <section className="mb-10">
        <h2 className="text-foreground mb-4 text-base font-medium">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground text-sm">No upcoming bookings.</p>
        ) : (
          <BookingList bookings={upcoming} showPayButton />
        )}
      </section>

      <section>
        <h2 className="text-foreground mb-4 text-base font-medium">History</h2>
        {history.length === 0 ? (
          <p className="text-muted-foreground text-sm">No past bookings.</p>
        ) : (
          <BookingList bookings={history} showPayButton={false} />
        )}
      </section>
    </main>
  );
}

function BookingList({
  bookings,
  showPayButton,
}: {
  bookings: BookingRow[];
  showPayButton: boolean;
}) {
  return (
    <ul className="flex flex-col gap-4">
      {bookings.map((b) => {
        const owed = amountOwed(b);
        return (
          <li key={b.id} className="rounded-md border px-4 py-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-foreground text-sm font-medium">
                    {b.services?.[0]?.name ?? "Service"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatDenver(b.starts_at)} — {formatDenver(b.ends_at)}
                  </p>
                </div>
                <span className="text-muted-foreground shrink-0 text-xs capitalize">
                  {b.status.replace(/_/g, " ")}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="text-sm">
                  <span className="text-muted-foreground">Total: </span>
                  <span className="text-foreground">
                    {formatDollars(b.final_cents)}
                  </span>
                  {owed > 0 && (
                    <>
                      <span className="text-muted-foreground mx-2">·</span>
                      <span className="text-foreground">
                        Owed: {formatDollars(owed)}
                      </span>
                    </>
                  )}
                </div>

                {showPayButton && (
                  <PrepayButton bookingId={b.id} owedCents={owed} />
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
