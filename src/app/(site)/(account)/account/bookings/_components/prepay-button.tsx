"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createPrepayIntent } from "@/features/payments/index.client";
import { centsToDollars } from "@/features/pricing";
import { PAYMENTS_ENABLED } from "@/lib/payments-enabled";
import { PrepayDialog } from "./prepay-dialog";

interface PrepayButtonProps {
  bookingId: string;
  owedCents: number;
}

export function PrepayButton({ bookingId, owedCents }: PrepayButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // With payments off there is no way to pay online, so the CTA goes away
  // entirely. The balance itself still reads as owed on the row above — the
  // kill-switch hides the payment path, not the debt. Placed below the hooks
  // so the hook order never depends on the flag.
  if (!PAYMENTS_ENABLED || owedCents <= 0) return null;

  const amountLabel = centsToDollars(owedCents);

  function handlePrepay() {
    setError(null);
    startTransition(async () => {
      const result = await createPrepayIntent(bookingId);
      if (result.ok) {
        setClientSecret(result.clientSecret);
        setOpen(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={handlePrepay}
        aria-label="Prepay for this booking"
      >
        {isPending ? "Processing…" : "Prepay"}
      </Button>
      {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
      {clientSecret && (
        <PrepayDialog
          open={open}
          onOpenChange={setOpen}
          clientSecret={clientSecret}
          amountLabel={amountLabel}
          onPaid={() => router.refresh()}
        />
      )}
    </>
  );
}
