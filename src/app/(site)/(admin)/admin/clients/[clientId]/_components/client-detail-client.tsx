"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useConfirm } from "@/components/feedback/confirm-dialog";
import { useToast } from "@/components/feedback/toast";
import {
  approveBooking,
  declineBooking,
  settleDebit,
  waiveDebit,
  adjustDebit,
  type ClientDetailView,
} from "@/features/admin/index.client";
import { cancelBooking } from "@/features/booking/index.client";
import { centsToDollars } from "@/features/pricing";
import { AdjustDebitDialog } from "./adjust-debit-dialog";
import { ClientProfile } from "./profile-section";
import { ClientPets } from "./pets-section";
import { ClientForms } from "./forms-section";
import { ClientBookings } from "./bookings-section";
import { ClientDebits } from "./debits-section";

type ClientDebitRow = ClientDetailView["debits"][number];

/** The admin client-detail page: profile, pets, forms, bookings, and balance,
 * composed from their own section components. Owns the state and mutations
 * shared across sections; each section is presentational. */
export function ClientDetailClient({ client }: { client: ClientDetailView }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adjustingDebitId, setAdjustingDebitId] = useState<string | null>(null);

  function run<T extends { kind: string } | { kind: string; message: string }>(
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
        setError(
          "message" in result
            ? result.message
            : `Action failed: ${result.kind}`,
        );
      }
    });
  }

  function onApprove(bookingId: string) {
    run(() => approveBooking(bookingId));
  }

  function onDecline(bookingId: string) {
    run(() => declineBooking(bookingId));
  }

  async function onCancel(bookingId: string) {
    const isConfirmed = await confirm({
      title: "Cancel this booking?",
      // Deliberately not gated on the payments flag: this wording is accurate
      // whether or not payments are enabled, because it names the policy rather
      // than promising a transaction.
      description: "This cancels the booking per the refund policy.",
      confirmLabel: "Cancel booking",
      destructive: true,
    });
    if (!isConfirmed) return;
    // fullRefund is forced server-side for admin cancels (decided by role).
    run(() => cancelBooking({ bookingId }));
  }

  async function onWaive(debit: ClientDebitRow) {
    const ok = await confirm({
      title: `Waive this ${centsToDollars(debit.amount_cents)} balance?`,
      description: "Forgives the debt without collecting. Cannot be undone.",
      confirmLabel: "Waive",
      destructive: false,
    });
    if (!ok) return;
    run(
      () => waiveDebit(debit.id, client.id),
      () => toast.add({ type: "success", title: "Debit waived" }),
    );
  }

  async function onSettle(debit: ClientDebitRow) {
    const ok = await confirm({
      title: `Mark ${client.full_name ?? "this client"}'s ${centsToDollars(debit.amount_cents)} balance as settled?`,
      description: "This marks the debit settled and cannot be undone.",
      confirmLabel: "Mark settled",
      destructive: false,
    });
    if (!ok) return;
    run(
      () => settleDebit(debit.id, client.id),
      () => toast.add({ type: "success", title: "Debit settled" }),
    );
  }

  function onAdjustSave(cents: number) {
    // AdjustDebitDialog only mounts (and so can only call onSave) while
    // adjustingDebitId is set — see the guarded render below.
    if (!adjustingDebitId) return;
    const debitId = adjustingDebitId;
    run(
      () => adjustDebit(debitId, client.id, cents),
      () => toast.add({ type: "success", title: "Debit adjusted" }),
    );
    setAdjustingDebitId(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <ClientProfile client={client} />
      <ClientPets clientId={client.id} pets={client.pets} />
      <ClientForms
        clientId={client.id}
        forms={client.forms}
        pets={client.pets}
      />
      <ClientBookings
        clientId={client.id}
        clientName={client.full_name}
        bookings={client.bookings}
        isPending={isPending}
        onApprove={onApprove}
        onDecline={onDecline}
        onCancel={onCancel}
      />
      <ClientDebits
        outstandingCents={client.outstandingCents}
        debits={client.debits}
        isPending={isPending}
        onWaive={onWaive}
        onSettle={onSettle}
        onAdjustClick={setAdjustingDebitId}
      />

      {adjustingDebitId ? (
        <AdjustDebitDialog
          open={adjustingDebitId !== null}
          onOpenChange={(open) => {
            if (!open) setAdjustingDebitId(null);
          }}
          currentAmountCents={
            client.debits.find((d) => d.id === adjustingDebitId)
              ?.amount_cents ?? 0
          }
          pending={isPending}
          onSave={onAdjustSave}
        />
      ) : null}
    </div>
  );
}
