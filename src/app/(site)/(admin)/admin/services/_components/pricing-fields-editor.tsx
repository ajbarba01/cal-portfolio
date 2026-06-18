"use client";

import {
  deriveEditableFields,
  setLeaf,
  type PricingEditField,
} from "@/features/admin";
import type { ServicePricingConfig } from "@/features/pricing";
import { PricingFieldInput } from "./pricing-field-input";

const SECTION_HEAD =
  "text-brand-strong text-xs font-semibold tracking-widest uppercase";

/**
 * Renders a service's editable pricing as two grouped sections — Rates &
 * discounts (modifier value leaves) and Booking limits (numeric constraints +
 * the column-backed default duration + read-only allowed species). The config
 * object is the source of truth: each input writes one leaf back via setLeaf.
 */
export function PricingFieldsEditor({
  config,
  defaultDurationMin,
  onConfigChange,
  onDefaultDurationChange,
  errors,
}: {
  config: ServicePricingConfig;
  defaultDurationMin: number | null;
  onConfigChange: (next: ServicePricingConfig) => void;
  onDefaultDurationChange: (value: number) => void;
  errors: Record<string, string>;
}) {
  const fields = deriveEditableFields(config);
  const rates = fields.filter((f) => f.group === "rates");
  const limits = fields.filter((f) => f.group === "limits");

  const durationField: PricingEditField = {
    path: "col.defaultDurationMin",
    label: "Default duration",
    kind: "minutes",
    value: defaultDurationMin ?? NaN,
    group: "limits",
    min: 1,
  };

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <p className={SECTION_HEAD}>Rates &amp; discounts</p>
        {rates.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">
            No priced fields for this service.
          </p>
        ) : (
          rates.map((f) => (
            <PricingFieldInput
              key={f.path}
              field={f}
              error={errors[f.path]}
              onChange={(v) => onConfigChange(setLeaf(config, f.path, v))}
            />
          ))
        )}
      </section>

      <section className="space-y-3">
        <p className={SECTION_HEAD}>Booking limits</p>
        {limits.map((f) => (
          <PricingFieldInput
            key={f.path}
            field={f}
            error={errors[f.path]}
            onChange={(v) => onConfigChange(setLeaf(config, f.path, v))}
          />
        ))}
        <PricingFieldInput
          field={durationField}
          error={errors["col.defaultDurationMin"]}
          onChange={onDefaultDurationChange}
        />
        <div className="space-y-1">
          <p className="text-foreground text-sm font-medium">Allowed species</p>
          <p className="text-muted-foreground text-sm">
            {config.constraints.allowedSpecies.join(", ")}
          </p>
        </div>
      </section>
    </div>
  );
}
