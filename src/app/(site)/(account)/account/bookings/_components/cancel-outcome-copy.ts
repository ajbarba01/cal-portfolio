import type { CancellationOutcome } from "@/features/booking/index.client";
import { centsToDollars } from "@/features/pricing";

/** Human-readable outcome shown in the cancel confirm dialog. */
export function cancelOutcomeCopy(outcome: CancellationOutcome): string {
  if (outcome.tier === "late") {
    return `You'll be refunded ${centsToDollars(outcome.refundCents)} now. Cal may refund the remaining ${centsToDollars(outcome.remainderCents)}.`;
  }
  if (outcome.debtCents > 0) {
    return `A ${centsToDollars(outcome.debtCents)} late-cancellation fee will apply.`;
  }
  if (outcome.refundCents > 0) {
    return `You'll be refunded ${centsToDollars(outcome.refundCents)}.`;
  }
  return "No charge.";
}
