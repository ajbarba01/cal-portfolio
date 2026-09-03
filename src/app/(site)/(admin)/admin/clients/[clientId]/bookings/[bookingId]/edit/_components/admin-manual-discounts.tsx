"use client";

/**
 * AdminManualDiscounts — Cal applies or removes the manual discounts a booking
 * can carry (Kiche, Friends & Family, Complimentary — whatever the service's
 * pricing config declares manual).
 *
 * Rendered ONLY by the admin edit route, never the client self-edit. Each
 * apply/remove is a standalone mutation rather than part of the edit-quote
 * patch: it re-prices the booking and, when applying to an already-paid
 * booking, refunds the overpayment. The confirm dialog states the exact new
 * total and refund before anything changes.
 *
 * The page passes one row per discount the booking's FROZEN quote can re-price,
 * each named by its own config label — what Cal reads here is what the database
 * holds.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { useConfirm } from "@/components/feedback/confirm-dialog";
import { useToast } from "@/components/feedback/toast";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import {
  setManualApplied,
  type ManualDiscountRow,
} from "@/features/booking/index.client";
import { centsToDollars } from "@/features/pricing";

export interface AdminManualDiscountsProps {
  bookingId: string;
  /** The discounts this booking offers, in pricing-config order. */
  rows: ManualDiscountRow[];
}

export function AdminManualDiscounts({
  bookingId,
  rows,
}: AdminManualDiscountsProps) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  // One flag for the whole list: two discounts re-pricing the same booking at
  // once would each quote from a total the other is about to change.
  const [pending, setPending] = React.useState(false);

  async function handleToggle(row: ManualDiscountRow, next: boolean) {
    const willOweCents =
      !next && row.paidCents > 0
        ? Math.max(0, row.toggledFinalCents - row.paidCents)
        : 0;

    const description = next ? (
      <>
        New total <strong>{centsToDollars(row.toggledFinalCents)}</strong> (was{" "}
        {centsToDollars(row.currentFinalCents)}).
        {row.refundIfApplyCents > 0
          ? ` ${centsToDollars(row.refundIfApplyCents)} will be refunded to the client's card.`
          : ""}
      </>
    ) : (
      <>
        Total returns to{" "}
        <strong>{centsToDollars(row.toggledFinalCents)}</strong> (was{" "}
        {centsToDollars(row.currentFinalCents)}).
        {willOweCents > 0
          ? ` The client has paid ${centsToDollars(row.paidCents)} and will owe the ${centsToDollars(willOweCents)} difference.`
          : ""}
      </>
    );

    await confirm({
      title: `${next ? "Apply" : "Remove"} ${row.label}?`,
      description,
      confirmLabel: next ? "Apply discount" : "Remove discount",
      onConfirm: async () => {
        setPending(true);
        try {
          const res = await setManualApplied(bookingId, row.id, next);
          if (res.kind === "success") {
            toast.add({
              type: "success",
              title: `${row.label} ${next ? "applied" : "removed"}`,
              description:
                res.refundedCents > 0
                  ? `${centsToDollars(res.refundedCents)} refunded to the client.`
                  : undefined,
            });
            router.refresh();
            return true;
          }
          toast.add({
            type: "error",
            title: `Couldn't update ${row.label}`,
            description: errorMessage(res, row.label),
          });
          return false;
        } finally {
          setPending(false);
        }
      },
    });
  }

  return (
    <Surface
      as="section"
      variant="emphasis"
      aria-labelledby="manual-discounts-heading"
      className="mb-6 flex flex-col gap-3 p-4"
    >
      <h2
        id="manual-discounts-heading"
        className="text-brand-strong text-xs font-semibold tracking-wide uppercase"
      >
        Discounts
      </h2>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
          >
            <span id={`manual-discount-${row.id}`} className="text-sm">
              {row.label}
            </span>
            <Switch
              checked={row.applied}
              disabled={pending}
              onCheckedChange={(next) => handleToggle(row, next)}
              aria-labelledby={`manual-discount-${row.id}`}
            />
          </li>
        ))}
      </ul>
      {dialog}
    </Surface>
  );
}

/** Maps a non-success setManualApplied result to a Cal-friendly message. */
function errorMessage(
  res: { kind: string; message?: string },
  label: string,
): string {
  switch (res.kind) {
    case "no_consent":
      return "The client hasn't marked Kiche welcome on this booking.";
    case "unsupported":
      return `This service doesn't offer ${label}.`;
    case "not_found":
      return "This booking could not be found.";
    case "invalid_state":
      return res.message ?? "This booking can no longer be changed.";
    default:
      return res.message ?? "Something went wrong. Please try again.";
  }
}
