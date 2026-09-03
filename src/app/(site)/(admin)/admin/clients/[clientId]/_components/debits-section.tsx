import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import type { ClientDetailView } from "@/features/admin/index.client";
import { centsToDollars } from "@/features/pricing";
import { denverDateTime } from "@/lib/time-of-day";
import { SECTION, LEGEND } from "./shared";

type ClientDebitRow = ClientDetailView["debits"][number];

const DEBIT_REASON_LABELS: Record<string, string> = {
  no_show: "No-show charge",
  late_cancel: "Late cancellation",
  damage: "Damage charge",
  other: "Other charge",
};

function debitReasonLabel(reason: string): string {
  const label = DEBIT_REASON_LABELS[reason];
  if (label !== undefined) return label;
  // Title-case fallback
  return reason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const DEBIT_RESOLUTION_LABELS: Record<string, string> = {
  paid: "paid",
  waived: "waived",
  adjusted: "adjusted",
};

function debitResolutionLabel(resolution: string | null): string {
  if (!resolution) return "paid";
  return DEBIT_RESOLUTION_LABELS[resolution] ?? resolution;
}

interface ClientDebitsProps {
  outstandingCents: number;
  debits: ClientDebitRow[];
  isPending: boolean;
  onWaive: (debit: ClientDebitRow) => void;
  onSettle: (debit: ClientDebitRow) => void;
  onAdjustClick: (debitId: string) => void;
}

/** The client's outstanding balance and per-charge debit history. */
export function ClientDebits({
  outstandingCents,
  debits,
  isPending,
  onWaive,
  onSettle,
  onAdjustClick,
}: ClientDebitsProps) {
  return (
    <Surface as="section" variant="emphasis" className={SECTION}>
      <p className={LEGEND}>Balance</p>
      <p className="text-sm">
        Outstanding:{" "}
        <span
          className={
            outstandingCents > 0
              ? "text-destructive font-semibold"
              : "font-semibold"
          }
        >
          {centsToDollars(outstandingCents)}
        </span>
      </p>
      {debits.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {debits.map((debit) => (
            <li
              key={debit.id}
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <span>{centsToDollars(debit.amount_cents)}</span>
              <Badge>{debitReasonLabel(debit.reason)}</Badge>
              <span className="text-muted-foreground">
                {denverDateTime(new Date(debit.created_at))}
              </span>
              {debit.settled_at ? (
                <span className="text-muted-foreground ml-auto">
                  settled &middot; {debitResolutionLabel(debit.resolution)}
                </span>
              ) : (
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => onAdjustClick(debit.id)}
                  >
                    Adjust
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => onWaive(debit)}
                  >
                    Waive
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => onSettle(debit)}
                  >
                    Mark settled
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </Surface>
  );
}
