"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToDollarsNumber, dollarsToCents } from "@/features/pricing";
import type { PricingEditField } from "@/features/admin";

/**
 * One editable numeric pricing field. cents render as a $-adorned dollar input
 * (round-tripped to integer cents on change); pct/minutes show their unit;
 * int is a plain number. Conveys errors by text + aria, never color alone.
 */
export function PricingFieldInput({
  field,
  onChange,
  error,
}: {
  field: PricingEditField;
  onChange: (value: number) => void;
  error?: string;
}) {
  const id = `pf-${field.path}`;
  const errId = `${id}-err`;
  const display =
    field.kind === "cents" ? centsToDollarsNumber(field.value) : field.value;
  const suffix =
    field.kind === "pct" ? "%" : field.kind === "minutes" ? "min" : null;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw === "") {
      onChange(NaN);
      return;
    }
    const num = Number(raw);
    if (Number.isNaN(num)) return;
    onChange(field.kind === "cents" ? dollarsToCents(num) : num);
  }

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{field.label}</Label>
      <div className="flex items-center gap-2">
        {field.kind === "cents" && (
          <span className="text-muted-foreground text-sm">$</span>
        )}
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={field.kind === "cents" ? "0.01" : "1"}
          min={field.allowNegative ? undefined : field.min}
          max={field.max}
          value={Number.isNaN(display) ? "" : display}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          onChange={handleChange}
          className="max-w-40"
        />
        {suffix && (
          <span className="text-muted-foreground text-sm">{suffix}</span>
        )}
      </div>
      {error && (
        <p id={errId} role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
