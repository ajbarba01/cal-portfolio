import { Surface } from "@/components/ui/surface";
import {
  MEET_GREET_SLUG,
  OnboardingStatusSelect,
  type ClientDetailView,
} from "@/features/admin/index.client";
import { bookingStatusPill } from "@/features/booking/index.client";
import { denverDateTime } from "@/lib/time-of-day";
import { AccountClaimPanel } from "./account-claim-panel";
import { SECTION, LEGEND } from "./shared";

/** Account identity, the unclaimed-account claim panel, and onboarding status. */
export function ClientProfile({ client }: { client: ClientDetailView }) {
  const meetGreetBooking =
    client.bookings.find((b) => b.service_slug === MEET_GREET_SLUG) ?? null;

  return (
    <>
      {/* Account */}
      <Surface as="section" variant="emphasis" className={SECTION}>
        <p className={LEGEND}>Account</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd>{client.email ?? "-"}</dd>
          <dt className="text-muted-foreground">Phone</dt>
          <dd>{client.phone ?? "-"}</dd>
          <dt className="text-muted-foreground">Address</dt>
          <dd>
            {[client.address, client.zip].filter(Boolean).join(", ") || "-"}
          </dd>
          <dt className="text-muted-foreground">Joined</dt>
          <dd>{denverDateTime(new Date(client.created_at))}</dd>
        </dl>
      </Surface>

      {/* Account claim (unclaimed shadow accounts only) */}
      {client.unclaimed ? (
        <AccountClaimPanel clientId={client.id} invitedAt={client.invited_at} />
      ) : null}

      {/* Onboarding */}
      <Surface as="section" variant="emphasis" className={SECTION}>
        <p className={LEGEND}>Onboarding</p>
        {meetGreetBooking ? (
          <p className="text-muted-foreground text-sm">
            Meet &amp; greet:{" "}
            <span className="text-foreground font-medium">
              {denverDateTime(new Date(meetGreetBooking.starts_at))}
            </span>{" "}
            &middot; {bookingStatusPill(meetGreetBooking.status).label}
          </p>
        ) : null}
        {client.onboarding_status === "info_pending" ? (
          <p className="text-muted-foreground text-sm">
            Awaiting profile/forms from client.
          </p>
        ) : null}
        <OnboardingStatusSelect
          clientId={client.id}
          status={client.onboarding_status}
          meetGreetUpcoming={client.meetGreetUpcoming}
        />
      </Surface>
    </>
  );
}
