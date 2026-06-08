"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useConfirm } from "@/components/feedback/confirm-dialog";
import { useToast } from "@/components/feedback/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  approveBooking,
  declineBooking,
} from "@/features/admin/approval-actions";
import {
  setKicheAllowed,
  settleDebit,
  type ClientDetailView,
} from "@/features/admin/clients-actions";
import { PetAvatar } from "@/features/booking/_components/pet-avatar";
import { cancelBooking, markNoShow } from "@/features/booking/actions";

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function denver(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Denver",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const SECTION =
  "bg-card border-border flex flex-col gap-3 rounded-xl border p-4";
const LEGEND =
  "text-brand-strong text-xs font-semibold tracking-wide uppercase";

export function ClientDetailClient({ client }: { client: ClientDetailView }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isKicheAllowed, setIsKicheAllowed] = useState(client.kiche_allowed);

  function run<T extends { kind: string }>(
    action: () => Promise<T>,
    onSuccess?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.kind === "success") {
        onSuccess?.();
        router.refresh();
      } else {
        setError(`Action failed: ${result.kind}`);
      }
    });
  }

  function toggleKiche() {
    const next = !isKicheAllowed;
    setIsKicheAllowed(next);
    run(
      () => setKicheAllowed(client.id, next),
      () =>
        toast.add({
          title: next ? "Kiche discount enabled" : "Kiche discount disabled",
        }),
    );
  }

  async function onCancel(id: string) {
    const isConfirmed = await confirm({
      title: "Cancel this booking?",
      description: "This cancels the booking per the refund policy.",
      confirmLabel: "Cancel booking",
      destructive: true,
    });
    if (!isConfirmed) return;
    run(() => cancelBooking({ bookingId: id }));
  }

  async function onNoShow(id: string) {
    const isConfirmed = await confirm({
      title: "Mark no-show?",
      description: "This records a no-show and writes a debit per policy.",
      confirmLabel: "Mark no-show",
      destructive: true,
    });
    if (!isConfirmed) return;
    run(() => markNoShow(id));
  }

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <section className={SECTION}>
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
          <dt className="text-muted-foreground">Onboarded</dt>
          <dd>{client.onboarding_complete ? "Yes" : "No"}</dd>
          <dt className="text-muted-foreground">Joined</dt>
          <dd>{denver(client.created_at)}</dd>
        </dl>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isKicheAllowed}
            disabled={isPending}
            onChange={toggleKiche}
          />
          Kiche discount eligible
        </label>
      </section>

      <section className={SECTION}>
        <p className={LEGEND}>Pets</p>
        {client.pets.length === 0 ? (
          <p className="text-muted-foreground text-sm">No pets.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {client.pets.map((pet) => (
              <li key={pet.id} className="flex items-start gap-3 text-sm">
                <PetAvatar
                  name={pet.name}
                  species={pet.species}
                  photoUrl={pet.photoUrl}
                  size={36}
                />
                <div>
                  <p className="font-medium">
                    {pet.name}{" "}
                    <span className="text-muted-foreground font-normal">
                      ({pet.species}
                      {pet.breed ? `, ${pet.breed}` : ""})
                    </span>
                  </p>
                  {pet.notes ? (
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {pet.notes}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={SECTION}>
        <p className={LEGEND}>Forms</p>
        {client.forms.length === 0 ? (
          <p className="text-muted-foreground text-sm">No form responses.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {client.forms.map((form) => (
              <li key={form.id} className="text-sm">
                <p className="font-medium">{form.form_key}</p>
                <pre className="bg-muted/40 text-muted-foreground overflow-x-auto rounded p-2 text-xs">
                  {JSON.stringify(form.data, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={SECTION}>
        <p className={LEGEND}>Bookings</p>
        {client.bookings.length === 0 ? (
          <p className="text-muted-foreground text-sm">No bookings.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {client.bookings.map((booking) => (
              <li
                key={booking.id}
                className="border-border/60 flex flex-wrap items-center gap-2 border-b pb-2 text-sm"
              >
                <span className="font-medium">
                  {booking.service_name ?? "Service"}
                </span>
                <Badge
                  variant={
                    booking.status === "pending_approval"
                      ? "pending"
                      : "default"
                  }
                >
                  {booking.status}
                </Badge>
                <span className="text-muted-foreground">
                  {denver(booking.starts_at)} - {denver(booking.ends_at)}
                </span>
                <span className="text-muted-foreground">
                  {dollars(booking.final_cents)}
                </span>
                <span className="ml-auto flex gap-2">
                  {booking.status === "pending_approval" ? (
                    <>
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() => run(() => approveBooking(booking.id))}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => run(() => declineBooking(booking.id))}
                      >
                        Decline
                      </Button>
                    </>
                  ) : null}
                  {booking.status === "pending_approval" ||
                  booking.status === "confirmed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => onCancel(booking.id)}
                    >
                      Cancel
                    </Button>
                  ) : null}
                  {booking.status === "confirmed" ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => onNoShow(booking.id)}
                    >
                      No-show
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={SECTION}>
        <p className={LEGEND}>Balance</p>
        <p className="text-sm">
          Outstanding:{" "}
          <span
            className={
              client.outstandingCents > 0
                ? "text-destructive font-semibold"
                : "font-semibold"
            }
          >
            {dollars(client.outstandingCents)}
          </span>
        </p>
        {client.debits.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {client.debits.map((debit) => (
              <li
                key={debit.id}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span>{dollars(debit.amount_cents)}</span>
                <Badge>{debit.reason}</Badge>
                <span className="text-muted-foreground">
                  {denver(debit.created_at)}
                </span>
                {debit.settled_at ? (
                  <span className="text-muted-foreground ml-auto">settled</span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => settleDebit(debit.id, client.id),
                        () => toast.add({ title: "Debit settled" }),
                      )
                    }
                  >
                    Mark settled
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
