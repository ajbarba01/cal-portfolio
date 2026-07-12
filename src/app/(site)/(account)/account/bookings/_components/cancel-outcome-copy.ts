import type { CancellationOutcome } from "@/features/booking/index.client";

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Human-readable outcome shown in the cancel confirm dialog. */
export function cancelOutcomeCopy(outcome: CancellationOutcome): string {
  if (outcome.tier === "late") {
    return `You'll be refunded ${dollars(outcome.refundCents)} now. Cal may refund the remaining ${dollars(outcome.remainderCents)}.`;
  }
  if (outcome.debtCents > 0) {
    return `A ${dollars(outcome.debtCents)} late-cancellation fee will apply.`;
  }
  if (outcome.refundCents > 0) {
    return `You'll be refunded ${dollars(outcome.refundCents)}.`;
  }
  return "No charge.";
}
