"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { createPrepayIntent } from "@/features/payments/index.client";

interface PrepayButtonProps {
  bookingId: string;
  owedCents: number;
}

export function PrepayButton({ bookingId, owedCents }: PrepayButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  if (owedCents <= 0) return null;

  function handlePrepay() {
    startTransition(async () => {
      const result = await createPrepayIntent(bookingId);

      if (result.ok) {
        setMessage({
          kind: "success",
          // TODO: mount Stripe Elements with NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to confirm the PaymentIntent
          text: "Payment initialized — card entry coming soon",
        });
      } else {
        setMessage({ kind: "error", text: result.error });
      }
    });
  }

  if (message) {
    return (
      <p
        className={
          message.kind === "success"
            ? "text-foreground text-xs"
            : "text-destructive text-xs"
        }
      >
        {message.text}
      </p>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={handlePrepay}
      aria-label="Prepay for this booking"
    >
      {isPending ? "Processing…" : "Prepay"}
    </Button>
  );
}
