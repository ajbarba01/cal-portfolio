"use client";

/**
 * AdminKicheControl — Cal applies or removes the Kiche discount on one booking.
 *
 * Rendered ONLY by the admin edit route (never the client self-edit), and only
 * when the service carries a Kiche rate and the client marked Kiche welcome. The
 * apply/remove is a standalone mutation (not part of the edit-quote patch): it
 * re-prices the booking and, when applying to an already-paid booking, refunds
 * the overpayment. The confirm dialog states the exact new total and refund
 * before anything changes.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { PawPrint } from "lucide-react";

import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/feedback/confirm-dialog";
import { useToast } from "@/components/feedback/toast";
import { setKicheApplied } from "@/features/booking/index.client";

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export interface AdminKicheControlProps {
  bookingId: string;
  /** Current applied state (server truth; drives the switch). */
  applied: boolean;
  /** The booking's total as it stands now. */
  currentFinalCents: number;
  /** What the total becomes if the switch is flipped. */
  toggledFinalCents: number;
  /** Refund issued to the client if applying now (already-paid overpayment); 0 otherwise. */
  refundIfApplyCents: number;
  /** Amount the client has already paid (phrases the remove-while-paid warning). */
  paidCents: number;
}

export function AdminKicheControl({
  bookingId,
  applied,
  currentFinalCents,
  toggledFinalCents,
  refundIfApplyCents,
  paidCents,
}: AdminKicheControlProps) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [pending, setPending] = React.useState(false);

  async function handleToggle(next: boolean) {
    const willOweCents =
      !next && paidCents > 0 ? Math.max(0, toggledFinalCents - paidCents) : 0;

    const description = next ? (
      <>
        New total <strong>{dollars(toggledFinalCents)}</strong> (was{" "}
        {dollars(currentFinalCents)}).
        {refundIfApplyCents > 0
          ? ` ${dollars(refundIfApplyCents)} will be refunded to the client's card.`
          : ""}
      </>
    ) : (
      <>
        Total returns to <strong>{dollars(toggledFinalCents)}</strong> (was{" "}
        {dollars(currentFinalCents)}).
        {willOweCents > 0
          ? ` The client has paid ${dollars(paidCents)} and will owe the ${dollars(willOweCents)} difference.`
          : ""}
      </>
    );

    await confirm({
      title: next ? "Apply Kiche discount?" : "Remove Kiche discount?",
      description,
      confirmLabel: next ? "Apply discount" : "Remove discount",
      onConfirm: async () => {
        setPending(true);
        try {
          const res = await setKicheApplied(bookingId, next);
          if (res.kind === "success") {
            toast.add({
              type: "success",
              title: next ? "Kiche discount applied" : "Kiche discount removed",
              description:
                res.refundedCents > 0
                  ? `${dollars(res.refundedCents)} refunded to the client.`
                  : undefined,
            });
            router.refresh();
            return true;
          }
          toast.add({
            type: "error",
            title: "Couldn't update the Kiche discount",
            description: errorMessage(res),
          });
          return false;
        } finally {
          setPending(false);
        }
      },
    });
  }

  return (
    <Surface variant="floating" className="mb-6 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="bg-brand/15 text-brand-strong mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full"
          >
            <PawPrint className="size-4" />
          </span>
          <div>
            <p className="font-medium">Kiche discount</p>
            <p className="text-muted-foreground text-sm">
              {applied
                ? "Kiche is coming along — this booking is discounted."
                : "The client is OK with Kiche tagging along. Turn on to discount this booking."}
            </p>
          </div>
        </div>
        <Switch
          checked={applied}
          disabled={pending}
          onCheckedChange={handleToggle}
          aria-label="Apply Kiche discount to this booking"
        />
      </div>
      {dialog}
    </Surface>
  );
}

/** Maps a non-success setKicheApplied result to a Cal-friendly message. */
function errorMessage(res: { kind: string; message?: string }): string {
  switch (res.kind) {
    case "no_consent":
      return "The client hasn't marked Kiche welcome on this booking.";
    case "unsupported":
      return "This service doesn't offer a Kiche discount.";
    case "not_found":
      return "This booking could not be found.";
    case "invalid_state":
      return res.message ?? "This booking can no longer be changed.";
    default:
      return res.message ?? "Something went wrong. Please try again.";
  }
}
