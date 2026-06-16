"use client";

/**
 * Per-pricing-type quantity inputs. Pet counts (dogs/cats) are NOT collected
 * here — they are derived server-side from the assigned pets (see pet-assignment).
 * House-sitting `nights` is derived from the selected check-in/out range, so the
 * house-sitting form collects only the per-day add-ons.
 */

import { NumberStepper } from "@/components/ui/number-stepper";
import { Switch } from "@/components/ui/switch";
import type { PricingType } from "@/features/pricing";

// ── State shapes ────────────────────────────────────────────────────────────

export interface HouseSittingExtras {
  cantBeLeftAloneDays: number;
  walkMinutesPerDay: number;
  /**
   * @deprecated Server-derived from booking dates + settings.holiday_dates.
   * Kept in the type for back-compat with stored quote_inputs. The UI no longer
   * collects this — the server overrides any client-supplied value.
   */
  holidayDays?: number;
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
        qty: { cantBeLeftAloneDays: 0, walkMinutesPerDay: 0 },
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
      // holidayDays intentionally omitted — server derives from dates.
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
  description,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  id: string;
  label: string;
  /** Always-visible one-line helper under the title (no hover-only tooltip → mobile parity). */
  description: string;
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
      </label>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {description}
      </p>
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

/**
 * The client "Is Kiche welcome?" consent toggle. Consent only — it never changes
 * the price; Cal separately decides per booking whether Kiche actually comes
 * (which applies the discount). Shown only for house-sitting / walk bookings.
 */
function KicheWelcomeRow({
  welcome,
  onChange,
}: {
  welcome: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="border-border col-span-full flex items-start justify-between gap-4 border-t pt-4">
      <div>
        <p className="text-foreground text-sm font-medium">Is Kiche welcome?</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          OK for Cal&apos;s dog Kiche to tag along. You&apos;ll get a discount
          if she joins.
        </p>
      </div>
      <Switch
        checked={welcome}
        onCheckedChange={onChange}
        aria-label="Is Kiche welcome on this booking"
      />
    </div>
  );
}

// ── Forms ─────────────────────────────────────────────────────────────────────

export function QuantityForm({
  state,
  onChange,
  kiche,
}: {
  state: QuantityState;
  onChange: (s: QuantityState) => void;
  /**
   * When provided AND the service supports Kiche (house-sitting / walk), renders
   * the "Is Kiche welcome?" consent toggle. Omit on surfaces that don't collect
   * consent (e.g. the edit flow, where consent is fixed at booking time).
   */
  kiche?: { welcome: boolean; onChange: (v: boolean) => void };
}) {
  if (state.type === "house_sitting") {
    const qty = state.qty;
    const set = (patch: Partial<HouseSittingExtras>) =>
      onChange({ type: "house_sitting", qty: { ...qty, ...patch } });
    return (
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="col-span-full mb-2 text-sm font-medium">
          Stay add-ons
        </legend>
        <StepperField
          id="hs-cant-alone"
          label="Can't-be-left-alone days"
          description="Days your pet shouldn't be left alone — Cal stays on-site those days."
          value={qty.cantBeLeftAloneDays}
          min={0}
          unit="days"
          onChange={(v) => set({ cantBeLeftAloneDays: Math.round(v) })}
        />
        <StepperField
          id="hs-walk-min"
          label="Walk time per day"
          description="Daily walk time, in 15-min steps. The first 45 min/day are included."
          value={qty.walkMinutesPerDay}
          min={0}
          step={15}
          unit="min"
          onChange={(v) => set({ walkMinutesPerDay: v })}
        />
        {/* Premium days (holiday surcharge) are server-derived from booking
            dates + admin-configured premium day settings — no manual input. */}
        {kiche && (
          <KicheWelcomeRow welcome={kiche.welcome} onChange={kiche.onChange} />
        )}
      </fieldset>
    );
  }

  // meet_greet has no quantity inputs — it is a free, unpriced service.
  if (state.type === "meet_greet") {
    return null;
  }

  // Hours-based services (check_in / walk / training). Each frames the single
  // duration field in the language of that service.
  const HOURS_COPY: Record<
    "check_in" | "walk" | "training",
    { id: string; label: string; description: string }
  > = {
    check_in: {
      id: "checkin-hours",
      label: "Visit length",
      description: "How long each drop-in visit lasts, in 15-min steps.",
    },
    walk: {
      id: "walk-hours",
      label: "Walk length",
      description: "How long each walk lasts, in 15-min steps.",
    },
    training: {
      id: "training-hours",
      label: "Session length",
      description: "How long each training session lasts, in 15-min steps.",
    },
  };
  const copy = HOURS_COPY[state.type];
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-2 text-sm font-medium">Duration</legend>
      <StepperField
        id={copy.id}
        label={copy.label}
        description={copy.description}
        value={state.qty.hours}
        min={0.25}
        step={0.25}
        unit="hr"
        onChange={(v) => onChange({ type: state.type, qty: { hours: v } })}
      />
      {/* walk supports Kiche; check_in / training never carry a Kiche rate. */}
      {kiche && state.type === "walk" && (
        <KicheWelcomeRow welcome={kiche.welcome} onChange={kiche.onChange} />
      )}
    </fieldset>
  );
}
