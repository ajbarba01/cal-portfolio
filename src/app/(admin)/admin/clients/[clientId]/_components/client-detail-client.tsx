"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Check,
  Circle,
  ExternalLink,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { useConfirm } from "@/components/feedback/confirm-dialog";
import { useToast } from "@/components/feedback/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  approveBooking,
  declineBooking,
  setKicheAllowed,
  settleDebit,
  OnboardingStatusSelect,
  adminCreatePet,
  adminUpdatePet,
  adminUploadPetPhoto,
  adminSubmitForm,
  type ClientDetailView,
} from "@/features/admin";
import {
  paymentPill,
  retainedHalfLabel,
  disputeLabel,
} from "@/features/payments/index.client";
import { cancelBooking } from "@/features/booking/index.client";
import {
  FormCard,
  PetList,
  type PetViewLike,
} from "@/features/accounts/index.client";
import type { PetFormActions } from "@/features/accounts/index.client";
import type { ActionResult } from "@/features/accounts/index.client";
import type { FormKey } from "@/features/accounts/index.client";

// ─── Editable booking statuses ───────────────────────────────────────────────

const EDITABLE = new Set(["pending_approval", "confirmed"]);

// ─── Status label maps ────────────────────────────────────────────────────────

const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pending approval",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  declined: "Declined",
  completed: "Completed",
};

function bookingStatusLabel(status: string): string {
  return BOOKING_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

const DEBIT_REASON_LABELS: Record<string, string> = {
  no_show: "No-show charge",
  late_cancel: "Late cancellation",
  damage: "Damage charge",
  other: "Other charge",
};

function debitReasonLabel(reason: string): string {
  if (reason in DEBIT_REASON_LABELS) return DEBIT_REASON_LABELS[reason];
  // Title-case fallback
  return reason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

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

// ─── Token classes ────────────────────────────────────────────────────────────

const SECTION =
  "bg-card border-border flex flex-col gap-3 rounded-xl border p-4";
const LEGEND =
  "text-brand-strong text-xs font-semibold tracking-wide uppercase";

// ─── Payment pill ─────────────────────────────────────────────────────────────

const PAYMENT_PILL_CLASSES: Record<
  "unpaid" | "paid" | "partial" | "refunded",
  string
> = {
  paid: "bg-status-available text-status-available-foreground",
  partial: "bg-warning text-warning-foreground",
  refunded: "bg-status-unavailable text-status-unavailable-foreground",
  unpaid: "bg-muted text-muted-foreground",
};

function PaymentPillIcon({
  tone,
}: {
  tone: "unpaid" | "paid" | "partial" | "refunded";
}) {
  if (tone === "paid") return <Check className="size-3" aria-hidden="true" />;
  if (tone === "partial" || tone === "refunded")
    return <RotateCcw className="size-3" aria-hidden="true" />;
  return <Circle className="size-3" aria-hidden="true" />;
}

// ─── Main component ───────────────────────────────────────────────────────────

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
    run(() => cancelBooking({ bookingId: id, fullRefund: true }));
  }

  const meetGreetBooking =
    client.bookings.find((b) => b.service_name === "Meet & Greet") ?? null;

  // ─── Admin pet actions (on-behalf) ──────────────────────────────────────────

  const adminPetActions: PetFormActions = {
    create: async (input) => {
      const r = await adminCreatePet(client.id, input);
      if (r.kind === "forbidden")
        return { kind: "error", message: "Not allowed" };
      return r;
    },
    update: async (petId, input): Promise<ActionResult> => {
      const r = await adminUpdatePet(client.id, petId, input);
      if (r.kind === "forbidden")
        return { kind: "error", message: "Not allowed" };
      return r;
    },
    uploadPhoto: async (petId, file): Promise<ActionResult> => {
      const r = await adminUploadPetPhoto(client.id, petId, file);
      if (r.kind === "forbidden")
        return { kind: "error", message: "Not allowed" };
      return r;
    },
  };

  // Adapt ClientPet[] → PetViewLike[] (ClientPet already has photoUrl)
  const petsForList: PetViewLike[] = client.pets.map((p) => ({
    id: p.id,
    name: p.name,
    species: p.species,
    breed: p.breed,
    notes: p.notes,
    photo_url: null, // photo_url not surfaced on ClientPet; photoUrl is the signed URL
    photoUrl: p.photoUrl,
  }));

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {/* Account */}
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
          <dt className="text-muted-foreground">Joined</dt>
          <dd>{denver(client.created_at)}</dd>
        </dl>
      </section>

      {/* Kiche discount — own card with switch + explanation */}
      <section className={SECTION}>
        <p className={LEGEND}>Kiche discount</p>
        <div className="flex items-center gap-3">
          {/* Accessible switch */}
          <button
            type="button"
            role="switch"
            aria-checked={isKicheAllowed}
            aria-label="Kiche discount"
            disabled={isPending}
            onClick={toggleKiche}
            className={[
              "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              "focus-visible:ring-ring",
              isKicheAllowed ? "bg-brand" : "bg-muted-foreground",
              isPending ? "cursor-not-allowed opacity-50" : "",
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className={[
                "pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
                isKicheAllowed ? "translate-x-4" : "translate-x-0.5",
              ].join(" ")}
            />
          </button>
          <span className="text-sm font-medium">
            {isKicheAllowed ? "On" : "Off"}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          Gives this client the friends-of-Kiche rate on every booking. Toggle
          off to charge standard pricing.
        </p>
      </section>

      {/* Onboarding */}
      <section className={SECTION}>
        <p className={LEGEND}>Onboarding</p>
        {meetGreetBooking ? (
          <p className="text-muted-foreground text-sm">
            Meet &amp; greet:{" "}
            <span className="text-foreground font-medium">
              {denver(meetGreetBooking.starts_at)}
            </span>{" "}
            &middot; {bookingStatusLabel(meetGreetBooking.status)}
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
      </section>

      {/* Pets */}
      <section className={SECTION}>
        <p className={LEGEND}>
          Pets{" "}
          {client.pets.length > 0 ? (
            <span className="text-muted-foreground font-normal tracking-normal normal-case">
              ({client.pets.length})
            </span>
          ) : null}
        </p>
        {client.pets.length === 0 ? (
          <p className="text-muted-foreground text-sm">No pets on file.</p>
        ) : null}
        <PetList
          pets={petsForList}
          onChanged={router.refresh}
          actions={adminPetActions}
          // No onDelete → Delete button is suppressed in admin zone
        />
      </section>

      {/* Forms */}
      <section className={SECTION}>
        <p className={LEGEND}>
          Forms{" "}
          {client.forms.length > 0 ? (
            <span className="text-muted-foreground font-normal tracking-normal normal-case">
              ({client.forms.length} on file)
            </span>
          ) : null}
        </p>
        {client.forms.length === 0 ? (
          <p className="text-muted-foreground text-sm">No forms on file.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {client.forms.map((form) => (
              <FormCard
                key={form.id}
                formKey={form.form_key as FormKey}
                existing={{ data: form.data as Record<string, unknown> }}
                onSubmit={async (fk, vals) => {
                  const r = await adminSubmitForm(client.id, fk, vals);
                  if (r.kind === "forbidden") {
                    return { kind: "error", message: "Not allowed" };
                  }
                  if (r.kind === "success") {
                    router.refresh();
                    return { kind: "success" };
                  }
                  return r;
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Bookings */}
      <section className={SECTION}>
        <p className={LEGEND}>Bookings</p>
        {client.bookings.length === 0 ? (
          <p className="text-muted-foreground text-sm">No bookings.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {client.bookings.map((booking) => {
              const pill = paymentPill(booking.payment_status);
              const pillClasses = PAYMENT_PILL_CLASSES[pill.tone];
              const retainedLine = retainedHalfLabel({
                finalCents: booking.final_cents,
                refundedCents: booking.refunded_cents,
              });
              const isDisputed = Boolean(booking.disputed_at);

              return (
                <li
                  key={booking.id}
                  className={[
                    "flex flex-col gap-1.5 py-2 text-sm",
                    isDisputed
                      ? "border-destructive bg-card ring-destructive rounded-xl border p-3 ring-1"
                      : "border-border/60 border-b last:border-b-0",
                  ].join(" ")}
                >
                  {/* Top row: service + pills + amount */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      {booking.service_name ?? "Service"}
                    </span>
                    {/* Payment pill */}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${pillClasses}`}
                    >
                      <PaymentPillIcon tone={pill.tone} />
                      {pill.label}
                    </span>
                    {/* Dispute pill — red reserved for disputes only */}
                    {isDisputed ? (
                      <span className="bg-destructive/10 text-destructive inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-current">
                        <TriangleAlert className="size-3" aria-hidden="true" />
                        {disputeLabel(booking.dispute_status)}
                      </span>
                    ) : null}
                    <span className="ml-auto font-semibold">
                      {dollars(booking.final_cents)}
                    </span>
                  </div>

                  {/* Date + status row */}
                  <div className="text-muted-foreground text-xs">
                    {denver(booking.starts_at)} &ndash;{" "}
                    {denver(booking.ends_at)} &middot;{" "}
                    <Badge
                      variant={
                        booking.status === "pending_approval"
                          ? "pending"
                          : "default"
                      }
                    >
                      {bookingStatusLabel(booking.status)}
                    </Badge>
                  </div>

                  {/* Retained-half line */}
                  {retainedLine ? (
                    <div className="text-warning-foreground inline-flex items-center gap-1.5 text-xs">
                      <RotateCcw className="size-3" aria-hidden="true" />
                      {retainedLine}
                    </div>
                  ) : null}

                  {/* Actions row */}
                  <div className="flex flex-wrap gap-2">
                    {EDITABLE.has(booking.status) ? (
                      <Link
                        href={`/admin/clients/${client.id}/bookings/${booking.id}/edit`}
                        className="border-border hover:bg-accent focus-visible:border-ring focus-visible:ring-ring/50 inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium focus-visible:ring-3"
                      >
                        Edit
                      </Link>
                    ) : null}
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
                    {/* Dispute: Stripe link */}
                    {isDisputed && booking.payment_intent_id ? (
                      <a
                        href={`https://dashboard.stripe.com/test/payments/${booking.payment_intent_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border-destructive text-destructive hover:bg-destructive/5 focus-visible:ring-ring/50 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium focus-visible:ring-3"
                      >
                        View dispute in Stripe
                        <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Link
          href={`/admin/clients/${client.id}/book`}
          className="bg-brand text-brand-foreground focus-visible:border-ring focus-visible:ring-ring/50 mt-1 inline-flex w-fit items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold focus-visible:ring-3"
        >
          + New booking for {client.full_name ?? "this client"}
        </Link>
      </section>

      {/* Balance */}
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
                <Badge>{debitReasonLabel(debit.reason)}</Badge>
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
