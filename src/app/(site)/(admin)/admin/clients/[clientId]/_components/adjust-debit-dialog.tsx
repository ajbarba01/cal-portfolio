"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Presentational dialog for adjusting a debit's amount. Prefilled with the
 * debit's current amount in dollars; converts to cents on save. Parent owns
 * open state and wires the actual `adjustDebit` mutation.
 */
export function AdjustDebitDialog({
  open,
  onOpenChange,
  currentAmountCents,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentAmountCents: number;
  pending: boolean;
  onSave: (newAmountCents: number) => void;
}) {
  // The parent only mounts this component while a debit is being adjusted
  // (see the `adjustingDebitId ? <AdjustDebitDialog ... /> : null` guard in
  // client-detail-client.tsx), so a fresh mount happens per debit — no effect
  // needed to resync this on open/id changes.
  const [value, setValue] = React.useState(
    (currentAmountCents / 100).toFixed(2),
  );

  const dollars = Number(value);
  const canSave =
    value.trim().length > 0 && Number.isFinite(dollars) && dollars > 0;

  function handleSave() {
    if (!canSave) return;
    onSave(Math.round(dollars * 100));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Adjust balance"
      description="Change the amount owed for this charge."
      className="max-w-sm"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="adjust-debit-amount">New amount</Label>
        <Input
          id="adjust-debit-amount"
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>

      <div className="mt-2 flex justify-end gap-2">
        <Button
          variant="outline"
          size="lg"
          disabled={pending}
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button
          variant="default"
          size="lg"
          disabled={!canSave || pending}
          onClick={handleSave}
        >
          {pending ? "Working…" : "Save"}
        </Button>
      </div>
    </Dialog>
  );
}
