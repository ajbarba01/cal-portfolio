"use client";

/**
 * Per-pricing-type quantity inputs. Pet counts (dogs/cats) are NOT collected
 * here — they are derived server-side from the assigned pets (see pet-assignment).
 * House-sitting `nights` is derived from the selected check-in/out range, so the
 * house-sitting form collects only the per-day add-ons.
 *
 * The state shapes this form edits, and the conversion to the wire record,
 * are pure and live in quantities.ts so server code can reach them.
 */

import { useEffect } from "react";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Switch } from "@/components/ui/switch";
import type { HouseSittingExtras, QuantityState } from "../quantities";

/**
 * TEMPORARY re-export, kept so the tree stays buildable until
 * quantity-state-from-quote-inputs.test.ts is repointed at `../quantities`.
 * Delete it with that repoint — it is the last importer.
 */
export { quantitiesToRecord } from "../quantities";

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
    // h-full + bottom-pinned stepper: grid cells in the same row stretch to the
    // tallest, so the stepper sits at the bottom and lines up with its neighbors
    // regardless of how many lines each description wraps to.
    <div className="flex h-full flex-col gap-1.5">
      <label htmlFor={id} className="text-foreground text-sm font-medium">
        {label}
      </label>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {description}
      </p>
      <div className="mt-auto pt-0.5">
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
          OK for Cal&apos;s dog Kiche to tag along. A discount applies if she
          joins.
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

/** Zeroes leftover walk minutes once the stepper hides (no dog assigned). */
function ZeroWalkOnHide({ onZero }: { onZero: () => void }) {
  useEffect(onZero, [onZero]);
  return null;
}

export function QuantityForm({
  state,
  onChange,
  kiche,
  minHours,
  maxHours,
  hasDog = true,
}: {
  state: QuantityState;
  onChange: (s: QuantityState) => void;
  /**
   * When provided AND the service supports Kiche (house-sitting / walk), renders
   * the "Is Kiche welcome?" consent toggle. Omit on surfaces that don't collect
   * consent (e.g. the edit flow, where consent is fixed at booking time).
   */
  kiche?: { welcome: boolean; onChange: (v: boolean) => void };
  /** Duration bounds (hours) from the service constraints. Hours services only. */
  minHours?: number;
  maxHours?: number;
  /** House-sitting: whether ≥1 dog is assigned. Gates the walk-time stepper. */
  hasDog?: boolean;
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
        {hasDog ? (
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
        ) : (
          qty.walkMinutesPerDay !== 0 && (
            <ZeroWalkOnHide onZero={() => set({ walkMinutesPerDay: 0 })} />
          )
        )}
        <StepperField
          id="hs-max-away"
          label="Max hours Cal can be away"
          description="Longest stretch Cal can step out each day. Lower means more on-site attention — and a small needy-care surcharge."
          value={qty.maxHoursAway}
          min={0}
          // 12 is a sane daily ceiling — ≥8 already means "no surcharge", so
          // the 13–24 range carried no information.
          max={12}
          unit="hr"
          onChange={(v) => set({ maxHoursAway: Math.round(v) })}
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
        min={minHours ?? 0.25}
        max={maxHours}
        step={0.25}
        unit="hr"
        onChange={(v) => {
          const lo = minHours ?? 0.25;
          const clamped = Math.min(Math.max(v, lo), maxHours ?? v);
          if (state.type === "walk") {
            onChange({
              type: "walk",
              qty: { ...state.qty, hours: clamped },
            });
          } else {
            onChange({ type: state.type, qty: { hours: clamped } });
          }
        }}
      />
      {state.type === "walk" && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-foreground text-sm font-medium">Leash manners</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Focused leash-manners training during the walk (+$10/hr).
            </p>
          </div>
          <Switch
            checked={state.qty.leashManners}
            onCheckedChange={(v) =>
              onChange({
                type: "walk",
                qty: { ...state.qty, leashManners: v },
              })
            }
            aria-label="Add leash manners training"
          />
        </div>
      )}
      {/* walk supports Kiche; check_in / training never carry a Kiche rate. */}
      {kiche && state.type === "walk" && (
        <KicheWelcomeRow welcome={kiche.welcome} onChange={kiche.onChange} />
      )}
    </fieldset>
  );
}
