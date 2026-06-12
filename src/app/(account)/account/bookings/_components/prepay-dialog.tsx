"use client";

import { useState } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/feedback/toast";
import { getStripe, paymentAppearance } from "@/lib/stripe/browser";

const stripePromise = getStripe();

export function PrepayDialog({
  open,
  onOpenChange,
  clientSecret,
  amountLabel,
  onPaid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientSecret: string;
  amountLabel: string;
  onPaid: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Pay ${amountLabel}`}
    >
      {clientSecret ? (
        <Elements
          stripe={stripePromise}
          options={{ clientSecret, appearance: paymentAppearance }}
        >
          <PrepayForm onPaid={onPaid} onOpenChange={onOpenChange} />
        </Elements>
      ) : null}
    </Dialog>
  );
}

function PrepayForm({
  onPaid,
  onOpenChange,
}: {
  onPaid: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    const { error } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    setSubmitting(false);
    if (error) {
      toast.add({ type: "error", title: error.message ?? "Payment failed." });
      return;
    }
    toast.add({ type: "success", title: "Payment received — thank you!" });
    onOpenChange(false);
    onPaid();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <PaymentElement />
      <Button
        type="submit"
        variant="brand"
        disabled={!stripe || submitting}
        className="w-full"
      >
        {submitting ? "Processing…" : "Pay now"}
      </Button>
    </form>
  );
}
