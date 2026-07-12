"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/feedback/confirm-dialog";
import { useToast } from "@/components/feedback/toast";
import {
  clientCanCancelBooking,
  cancelLockCopy,
  cancelBooking,
  previewBookingCancellation,
  type CancellabilityInput,
} from "@/features/booking/index.client";
import { cancelOutcomeCopy } from "./cancel-outcome-copy";

export function CancelCell({
  bookingId,
  booking,
  now,
}: {
  bookingId: string;
  booking: CancellabilityInput;
  now: Date;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [, startTransition] = useTransition();

  const result = clientCanCancelBooking(booking, now);
  if (!result.cancellable) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
        <span aria-hidden="true">🔒</span>
        {cancelLockCopy(result.reason)}
      </span>
    );
  }

  async function onClick() {
    setLoadingPreview(true);
    const preview = await previewBookingCancellation(bookingId);
    setLoadingPreview(false);
    if (preview.kind !== "ok") {
      toast.add({
        type: "error",
        title: "Couldn't load cancellation details.",
      });
      return;
    }
    await confirm({
      title: "Cancel this booking?",
      description: cancelOutcomeCopy(preview.outcome),
      confirmLabel: "Cancel booking",
      cancelLabel: "Keep booking",
      destructive: true,
      onConfirm: async () => {
        const res = await cancelBooking({ bookingId });
        if (res.kind === "success") {
          toast.add({ type: "success", title: "Booking cancelled." });
          startTransition(() => router.refresh());
          return true;
        }
        toast.add({
          type: "error",
          title: "Couldn't cancel. Please try again.",
        });
        return false;
      },
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={loadingPreview}
        onClick={onClick}
        aria-label="Cancel this booking"
      >
        {loadingPreview ? "Loading…" : "Cancel"}
      </Button>
      {dialog}
    </>
  );
}
