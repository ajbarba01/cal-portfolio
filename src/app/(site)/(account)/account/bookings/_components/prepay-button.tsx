"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createPrepayIntent } from "@/features/payments/index.client";
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

  if (owedCents <= 0) return null;

  const amountLabel = `$${(owedCents / 100).toFixed(2)}`;

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
