"use client";

/**
 * Per-pricing-type quantity inputs. Pet counts (dogs/cats) are NOT collected
 * here — they are derived server-side from the assigned pets (see pet-assignment).
 * House-sitting `nights` is derived from the selected check-in/out range, so the
 * house-sitting form collects only the per-day add-ons.
 */

import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { PricingType } from "@/features/pricing/types";

// ── State shapes ────────────────────────────────────────────────────────────

export interface HouseSittingExtras {
  cantBeLeftAloneDays: number;
  walkMinutesPerDay: number;
  holidayDays: number;
}

export interface HoursQty {
  hours: number;
}

export type QuantityState =
  | { type: "house_sitting"; qty: HouseSittingExtras }
  | { type: "check_in"; qty: HoursQty }
  | { type: "walk"; qty: HoursQty }
  | { type: "training"; qty: HoursQty };

export function defaultQuantities(pricingType: PricingType): QuantityState {
  switch (pricingType) {
    case "house_sitting":
      return {
        type: "house_sitting",
        qty: { cantBeLeftAloneDays: 0, walkMinutesPerDay: 0, holidayDays: 0 },
      };
    case "check_in":
      return { type: "check_in", qty: { hours: 1 } };
    case "walk":
      return { type: "walk", qty: { hours: 1 } };
    case "training":
      return { type: "training", qty: { hours: 1 } };
  }
}

/**
 * Converts quantity state to the wire record. `nights` (house-sitting) is passed
 * in from the resolved stay range. Pet counts are intentionally absent — the
 * server derives them from the assigned pets.
 */
export function quantitiesToRecord(
  qs: QuantityState,
  nights: number | null,
): Record<string, unknown> {
  switch (qs.type) {
    case "house_sitting": {
      const rec: Record<string, unknown> = { nights: nights ?? 0 };
      if (qs.qty.cantBeLeftAloneDays > 0)
        rec.cantBeLeftAloneDays = qs.qty.cantBeLeftAloneDays;
      if (qs.qty.walkMinutesPerDay > 0)
        rec.walkMinutesPerDay = qs.qty.walkMinutesPerDay;
      if (qs.qty.holidayDays > 0) rec.holidayDays = qs.qty.holidayDays;
      return rec;
    }
    case "check_in":
    case "training":
    case "walk":
      return { hours: qs.qty.hours };
  }
}

// ── Field primitive ──────────────────────────────────────────────────────────

function NumberField({
  id,
  label,
  value,
  min,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <FormField label={label} name={id}>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        value={value}
        min={min ?? 0}
        step={step ?? 1}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onChange(n);
        }}
        className="w-28"
      />
    </FormField>
  );
}

// ── Forms ─────────────────────────────────────────────────────────────────────

export function QuantityForm({
  state,
  onChange,
}: {
  state: QuantityState;
  onChange: (s: QuantityState) => void;
}) {
  if (state.type === "house_sitting") {
    const qty = state.qty;
    const set = (patch: Partial<HouseSittingExtras>) =>
      onChange({ type: "house_sitting", qty: { ...qty, ...patch } });
    return (
      <fieldset className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <legend className="col-span-full mb-2 text-sm font-medium">
          Stay add-ons
        </legend>
        <NumberField
          id="hs-cant-alone"
          label="Can't-be-left-alone days"
          value={qty.cantBeLeftAloneDays}
          min={0}
          onChange={(v) => set({ cantBeLeftAloneDays: Math.round(v) })}
        />
        <NumberField
          id="hs-walk-min"
          label="Walk min/day"
          value={qty.walkMinutesPerDay}
          min={0}
          step={15}
          onChange={(v) => set({ walkMinutesPerDay: v })}
        />
        <NumberField
          id="hs-holiday"
          label="Holiday days"
          value={qty.holidayDays}
          min={0}
          onChange={(v) => set({ holidayDays: Math.round(v) })}
        />
      </fieldset>
    );
  }

  // Hours-based services (check_in / walk / training).
  const idMap: Record<typeof state.type, string> = {
    check_in: "checkin-hours",
    walk: "walk-hours",
    training: "training-hours",
  };
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Duration</legend>
      <NumberField
        id={idMap[state.type]}
        label="Hours"
        value={state.qty.hours}
        min={0.25}
        step={0.25}
        onChange={(v) => onChange({ type: state.type, qty: { hours: v } })}
      />
    </fieldset>
  );
}
