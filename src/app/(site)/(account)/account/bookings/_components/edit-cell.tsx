import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  clientCanEditBooking,
  editLockCopy,
  type EditabilityInput,
} from "@/features/booking/index.client";

export function EditCell({
  bookingId,
  booking,
  now,
  cancellationFullRefundHours,
}: {
  bookingId: string;
  booking: EditabilityInput;
  now: Date;
  cancellationFullRefundHours: number;
}) {
  const result = clientCanEditBooking(
    booking,
    now,
    cancellationFullRefundHours,
  );
  if (result.editable) {
    return (
      <Link
        href={`/account/bookings/${bookingId}/edit`}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        Edit
      </Link>
    );
  }
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
      <span aria-hidden="true">🔒</span>
      {editLockCopy(result.reason)}
    </span>
  );
}
