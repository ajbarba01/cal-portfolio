"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimePicker } from "@/components/ui/time-picker";
import { updateSettings, type SettingsRow } from "@/features/admin";

// ── Local helpers ──────────────────────────────────────────────────────────────

interface UnitFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  /** Position the unit label. "trailing" (default) sits after the input; "leading" before. */
  unitPosition?: "trailing" | "leading";
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}

/** Input wrapped with a visible unit label (e.g. "miles", "%", "hours"). */
function UnitField({
  id,
  label,
  value,
  onChange,
  unit,
  unitPosition = "trailing",
  inputProps,
}: UnitFieldProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        {unitPosition === "leading" && (
          <span className="text-muted-foreground text-sm select-none">
            {unit}
          </span>
        )}
        <Input
          id={id}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="max-w-40"
          {...inputProps}
        />
        {unitPosition === "trailing" && (
          <span className="text-muted-foreground text-sm select-none">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SettingsClient({
  initialSettings,
}: {
  initialSettings: SettingsRow;
}) {
  const s = initialSettings;

  // Advanced (origin / routing) fields
  const [originLabel, setOriginLabel] = useState(s.origin_label);
  const [originLat, setOriginLat] = useState(String(s.origin_lat));
  const [originLng, setOriginLng] = useState(String(s.origin_lng));
  const [roadFactor, setRoadFactor] = useState(String(s.road_factor));
  const [avgSpeed, setAvgSpeed] = useState(String(s.avg_speed_mph));

  // Distance & approval
  const [autoApprove, setAutoApprove] = useState(
    String(s.auto_approve_threshold_miles),
  );
  const [hardCutoff, setHardCutoff] = useState(String(s.hard_cutoff_miles));
  const [useRoadMiles, setUseRoadMiles] = useState(s.gate_use_road_miles);

  // Booking window — stored as minutes-since-midnight; TimePicker works in integers
  const [openMinute, setOpenMinute] = useState(s.booking_open_minute);
  const [closeMinute, setCloseMinute] = useState(s.booking_close_minute);

  // Booking horizons
  const [minLead, setMinLead] = useState(String(s.min_lead_time_hours));
  const [autoConfirmHorizon, setAutoConfirmHorizon] = useState(
    String(s.auto_confirm_horizon_days),
  );
  const [hardMaxAdvance, setHardMaxAdvance] = useState(
    String(s.hard_max_advance_days),
  );
  const [recurrenceGenHorizon, setRecurrenceGenHorizon] = useState(
    String(s.recurrence_generation_horizon_days),
  );

  // Recurring discount
  const [discountPct, setDiscountPct] = useState(
    String(s.recurring_discount_pct),
  );
  const [discountMin, setDiscountMin] = useState(
    String(s.recurring_min_occurrences),
  );

  // Premium days surcharge — displayed as dollars, stored as cents
  const [holidaySurchargeDollars, setHolidaySurchargeDollars] = useState(
    String((s.holiday_surcharge_cents / 100).toFixed(2)),
  );

  // Reminders & cancellations
  const [reminderLeadHours, setReminderLeadHours] = useState(
    String(s.reminder_lead_hours),
  );
  const [fullRefundHours, setFullRefundHours] = useState(
    String(s.cancellation_full_refund_hours),
  );
  const [lateRefundPct, setLateRefundPct] = useState(
    String(s.late_cancel_refund_pct),
  );

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSave() {
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await updateSettings({
        origin_label: originLabel,
        origin_lat: parseFloat(originLat),
        origin_lng: parseFloat(originLng),
        road_factor: parseFloat(roadFactor),
        avg_speed_mph: parseFloat(avgSpeed),
        auto_approve_threshold_miles: parseFloat(autoApprove),
        hard_cutoff_miles: parseFloat(hardCutoff),
        gate_use_road_miles: useRoadMiles,
        // TimePicker already yields integers; no string parsing needed
        booking_open_minute: openMinute,
        booking_close_minute: closeMinute,
        min_lead_time_hours: parseInt(minLead, 10),
        auto_confirm_horizon_days: parseInt(autoConfirmHorizon, 10),
        hard_max_advance_days: parseInt(hardMaxAdvance, 10),
        recurrence_generation_horizon_days: parseInt(recurrenceGenHorizon, 10),
        recurring_discount_pct: parseFloat(discountPct),
        recurring_min_occurrences: parseInt(discountMin, 10),
        // Convert dollars back to cents; round to avoid floating-point drift
        holiday_surcharge_cents: Math.round(
          parseFloat(holidaySurchargeDollars) * 100,
        ),
        // holiday_dates deferred to Availability (Task 5) — omit from payload
        reminder_lead_hours: parseInt(reminderLeadHours, 10),
        cancellation_full_refund_hours: parseInt(fullRefundHours, 10),
        late_cancel_refund_pct: parseInt(lateRefundPct, 10),
        // no_show_charge_pct intentionally excluded (UI removed; column retained in DB)
      });
      if (result.kind === "success") {
        setSuccess(true);
      } else {
        setError(
          "message" in result
            ? result.message
            : `Action failed: ${result.kind}`,
        );
      }
    });
  }

  return (
    <div className="space-y-6 rounded-md border p-6">
      {/* ── When can clients book? ─────────────────────────────────────── */}
      <fieldset className="space-y-4">
        <legend className="text-base font-medium">
          When can clients book?
        </legend>

        <TimePicker
          id="booking-open"
          label="Bookings open at"
          value={openMinute}
          onChange={setOpenMinute}
        />
        <TimePicker
          id="booking-close"
          label="Bookings close at"
          value={closeMinute}
          onChange={setCloseMinute}
        />
        <p className="text-muted-foreground text-xs">
          All times are Mountain (Denver). Stored internally as minutes since
          midnight.
        </p>

        <UnitField
          id="min-lead"
          label="Minimum notice required"
          value={minLead}
          onChange={setMinLead}
          unit="hours"
        />
        <UnitField
          id="auto-confirm-horizon"
          label="Auto-confirm bookings within"
          value={autoConfirmHorizon}
          onChange={setAutoConfirmHorizon}
          unit="days out"
        />
        <UnitField
          id="hard-max-advance"
          label="Furthest advance booking allowed"
          value={hardMaxAdvance}
          onChange={setHardMaxAdvance}
          unit="days"
        />
        <UnitField
          id="recurrence-gen-horizon"
          label="Generate recurring series up to"
          value={recurrenceGenHorizon}
          onChange={setRecurrenceGenHorizon}
          unit="days ahead"
        />
      </fieldset>

      {/* ── Cancellations ──────────────────────────────────────────────── */}
      <fieldset className="space-y-4">
        <legend className="text-base font-medium">Cancellations</legend>

        <UnitField
          id="full-refund-hours"
          label="Full refund if cancelled at least"
          value={fullRefundHours}
          onChange={setFullRefundHours}
          unit="hours before start"
        />
        <UnitField
          id="late-refund-pct"
          label="Refund for a late cancellation"
          value={lateRefundPct}
          onChange={setLateRefundPct}
          unit="% of the booking"
        />
      </fieldset>

      {/* ── Recurring discount ─────────────────────────────────────────── */}
      <fieldset className="space-y-4">
        <legend className="text-base font-medium">Recurring discount</legend>

        <UnitField
          id="discount-pct"
          label="Discount for recurring bookings"
          value={discountPct}
          onChange={setDiscountPct}
          unit="%"
        />
        <UnitField
          id="discount-min"
          label="Minimum recurring occurrences to qualify"
          value={discountMin}
          onChange={setDiscountMin}
          unit="bookings"
        />
      </fieldset>

      {/* ── Premium days ───────────────────────────────────────────────── */}
      <fieldset className="space-y-4">
        <legend className="text-base font-medium">
          Premium days surcharge
        </legend>

        <UnitField
          id="holiday-surcharge"
          label="Extra charge per booking"
          value={holidaySurchargeDollars}
          onChange={setHolidaySurchargeDollars}
          unit="$"
          unitPosition="leading"
          inputProps={{ step: "0.01", min: "0" }}
        />
        <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
          Premium days are set on the{" "}
          <Link
            href="/admin/availability"
            className="text-brand-strong underline-offset-2 hover:underline"
          >
            Availability calendar
          </Link>
          .
        </p>
      </fieldset>

      {/* ── Email reminders ────────────────────────────────────────────── */}
      <fieldset className="space-y-4">
        <legend className="text-base font-medium">Email reminders</legend>

        <UnitField
          id="reminder-lead-hours"
          label="Send reminder"
          value={reminderLeadHours}
          onChange={setReminderLeadHours}
          unit="hours before start"
        />
      </fieldset>

      {/* ── Distance & approval ────────────────────────────────────────── */}
      <fieldset className="space-y-4">
        <legend className="text-base font-medium">
          Distance &amp; approval
        </legend>

        <UnitField
          id="auto-approve"
          label="Auto-approve clients within"
          value={autoApprove}
          onChange={setAutoApprove}
          unit="miles"
        />
        <UnitField
          id="hard-cutoff"
          label="Hard cutoff — refuse bookings beyond"
          value={hardCutoff}
          onChange={setHardCutoff}
          unit="miles"
        />
        <div className="flex items-center gap-2">
          <input
            id="gate-use-road-miles"
            type="checkbox"
            checked={useRoadMiles}
            onChange={(e) => setUseRoadMiles(e.target.checked)}
          />
          <Label htmlFor="gate-use-road-miles">
            Gate on road miles (straight-line × road factor)
          </Label>
        </div>
      </fieldset>

      {/* ── Advanced (collapsed by default) ───────────────────────────── */}
      <details className="group border-border rounded-md border border-dashed">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
          <span>
            Advanced{" "}
            <span className="text-muted-foreground ml-1 text-xs font-normal">
              (origin, routing — rarely changed)
            </span>
          </span>
          <ChevronDown
            className="text-muted-foreground h-4 w-4 transition-transform duration-200 group-open:rotate-180"
            aria-hidden
          />
        </summary>

        <div className="space-y-4 px-4 pt-2 pb-4">
          <div className="space-y-1">
            <Label htmlFor="origin-label">Origin label</Label>
            <Input
              id="origin-label"
              type="text"
              value={originLabel}
              onChange={(e) => setOriginLabel(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="origin-lat">Latitude</Label>
              <Input
                id="origin-lat"
                type="number"
                value={originLat}
                onChange={(e) => setOriginLat(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="origin-lng">Longitude</Label>
              <Input
                id="origin-lng"
                type="number"
                value={originLng}
                onChange={(e) => setOriginLng(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="road-factor">Road factor</Label>
              <Input
                id="road-factor"
                type="number"
                value={roadFactor}
                onChange={(e) => setRoadFactor(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="avg-speed">
                Avg speed{" "}
                <span className="text-muted-foreground font-normal">mph</span>
              </Label>
              <Input
                id="avg-speed"
                type="number"
                value={avgSpeed}
                onChange={(e) => setAvgSpeed(e.target.value)}
              />
            </div>
          </div>
        </div>
      </details>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-muted-foreground text-sm">
          Settings saved.
        </p>
      )}
      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? "Saving…" : "Save settings"}
      </Button>
    </div>
  );
}
