"use client";

/**
 * Per-pricing-type quantity inputs. Pet counts (dogs/cats) are NOT collected
 * here — they are derived server-side from the assigned pets (see pet-assignment).
 * House-sitting `nights` is derived from the selected check-in/out range, so the
 * house-sitting form collects only the per-day add-ons.
 */

import { NumberStepper } from "@/components/ui/number-stepper";
import type { PricingType } from "@/features/pricing";

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
  | { type: "training"; qty: HoursQty }
  | { type: "meet_greet"; qty: Record<never, never> };

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
    case "meet_greet":
      return { type: "meet_greet", qty: {} };
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
    case "meet_greet":
      return {};
  }
}

// ── Field primitive ──────────────────────────────────────────────────────────

function StepperField({
  id,
  label,
  sub,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  id: string;
  label: string;
  sub?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-foreground text-sm font-medium">
        {label}
        {sub && (
          <span className="text-muted-foreground ml-1 text-xs font-normal">
            {sub}
          </span>
        )}
      </label>
      <NumberStepper
        id={id}
        ariaLabel={label}
        value={value}
        min={min ?? 0}
        max={max}
        step={step ?? 1}
        unit={unit}
        onChange={onChange}
      />
    </div>
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
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="col-span-full mb-2 text-sm font-medium">
          Stay add-ons
        </legend>
        <StepperField
          id="hs-cant-alone"
          label="Can't-be-left-alone days"
          value={qty.cantBeLeftAloneDays}
          min={0}
          unit="days"
          onChange={(v) => set({ cantBeLeftAloneDays: Math.round(v) })}
        />
        <StepperField
          id="hs-walk-min"
          label="Walk time/day"
          sub="(15-min steps)"
          value={qty.walkMinutesPerDay}
          min={0}
          step={15}
          unit="min"
          onChange={(v) => set({ walkMinutesPerDay: v })}
        />
        <StepperField
          id="hs-holiday"
          label="Holiday days"
          value={qty.holidayDays}
          min={0}
          unit="days"
          onChange={(v) => set({ holidayDays: Math.round(v) })}
        />
      </fieldset>
    );
  }

  // meet_greet has no quantity inputs — it is a free, unpriced service.
  if (state.type === "meet_greet") {
    return null;
  }

  // Hours-based services (check_in / walk / training).
  const idMap: Record<"check_in" | "walk" | "training", string> = {
    check_in: "checkin-hours",
    walk: "walk-hours",
    training: "training-hours",
  };
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Duration</legend>
      <StepperField
        id={idMap[state.type]}
        label="Hours"
        sub="(15-min steps)"
        value={state.qty.hours}
        min={0.25}
        step={0.25}
        unit="hr"
        onChange={(v) => onChange({ type: state.type, qty: { hours: v } })}
      />
    </fieldset>
  );
}
