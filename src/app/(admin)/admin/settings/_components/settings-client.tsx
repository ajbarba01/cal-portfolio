"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSettings } from "@/features/admin/settings-actions";
import type { SettingsRow } from "@/features/admin/settings-actions";

export function SettingsClient({
  initialSettings,
}: {
  initialSettings: SettingsRow;
}) {
  const s = initialSettings;
  const [originLabel, setOriginLabel] = useState(s.origin_label);
  const [originLat, setOriginLat] = useState(String(s.origin_lat));
  const [originLng, setOriginLng] = useState(String(s.origin_lng));
  const [roadFactor, setRoadFactor] = useState(String(s.road_factor));
  const [avgSpeed, setAvgSpeed] = useState(String(s.avg_speed_mph));
  const [autoApprove, setAutoApprove] = useState(
    String(s.auto_approve_threshold_miles),
  );
  const [hardCutoff, setHardCutoff] = useState(String(s.hard_cutoff_miles));
  const [useRoadMiles, setUseRoadMiles] = useState(s.gate_use_road_miles);
  const [openMinute, setOpenMinute] = useState(String(s.booking_open_minute));
  const [closeMinute, setCloseMinute] = useState(
    String(s.booking_close_minute),
  );
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
  const [discountPct, setDiscountPct] = useState(
    String(s.recurring_discount_pct),
  );
  const [discountMin, setDiscountMin] = useState(
    String(s.recurring_min_occurrences),
  );
  const [holidaySurcharge, setHolidaySurcharge] = useState(
    String(s.holiday_surcharge_cents),
  );
  const [holidayDates, setHolidayDates] = useState(
    (s.holiday_dates ?? []).join("\n"),
  );
  const [reminderLeadHours, setReminderLeadHours] = useState(
    String(s.reminder_lead_hours),
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
        booking_open_minute: parseInt(openMinute, 10),
        booking_close_minute: parseInt(closeMinute, 10),
        min_lead_time_hours: parseInt(minLead, 10),
        auto_confirm_horizon_days: parseInt(autoConfirmHorizon, 10),
        hard_max_advance_days: parseInt(hardMaxAdvance, 10),
        recurrence_generation_horizon_days: parseInt(recurrenceGenHorizon, 10),
        recurring_discount_pct: parseFloat(discountPct),
        recurring_min_occurrences: parseInt(discountMin, 10),
        holiday_surcharge_cents: parseInt(holidaySurcharge, 10),
        holiday_dates: holidayDates
          .split("\n")
          .map((d) => d.trim())
          .filter(Boolean),
        reminder_lead_hours: parseInt(reminderLeadHours, 10),
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

  function field(
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    type = "text",
  ) {
    return (
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-md border p-6">
      <fieldset className="space-y-4">
        <legend className="text-base font-medium">Origin</legend>
        {field("origin-label", "Origin Label", originLabel, setOriginLabel)}
        {field("origin-lat", "Latitude", originLat, setOriginLat, "number")}
        {field("origin-lng", "Longitude", originLng, setOriginLng, "number")}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-base font-medium">Distance & Approval</legend>
        {field(
          "road-factor",
          "Road Factor",
          roadFactor,
          setRoadFactor,
          "number",
        )}
        {field("avg-speed", "Avg Speed (mph)", avgSpeed, setAvgSpeed, "number")}
        {field(
          "auto-approve",
          "Auto-Approve Threshold (miles)",
          autoApprove,
          setAutoApprove,
          "number",
        )}
        {field(
          "hard-cutoff",
          "Hard Cutoff (miles)",
          hardCutoff,
          setHardCutoff,
          "number",
        )}
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

      <fieldset className="space-y-4">
        <legend className="text-base font-medium">Booking Hours</legend>
        {field(
          "open-minute",
          "Open (minutes since midnight, Denver — 390 = 6:30am)",
          openMinute,
          setOpenMinute,
          "number",
        )}
        {field(
          "close-minute",
          "Close (minutes since midnight, Denver — 1320 = 10:00pm)",
          closeMinute,
          setCloseMinute,
          "number",
        )}
        {field(
          "min-lead",
          "Min Lead Time (hours)",
          minLead,
          setMinLead,
          "number",
        )}
        {field(
          "auto-confirm-horizon",
          "Auto-Confirm Horizon (days — beyond this, bookings pend)",
          autoConfirmHorizon,
          setAutoConfirmHorizon,
          "number",
        )}
        {field(
          "hard-max-advance",
          "Hard Max Advance (days — beyond this, refused)",
          hardMaxAdvance,
          setHardMaxAdvance,
          "number",
        )}
        {field(
          "recurrence-gen-horizon",
          "Recurrence Generation Horizon (days — how far ahead series rows are created)",
          recurrenceGenHorizon,
          setRecurrenceGenHorizon,
          "number",
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-base font-medium">Recurring Discount</legend>
        {field(
          "discount-pct",
          "Discount %",
          discountPct,
          setDiscountPct,
          "number",
        )}
        {field(
          "discount-min",
          "Min Occurrences",
          discountMin,
          setDiscountMin,
          "number",
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-base font-medium">Email Reminders</legend>
        {field(
          "reminder-lead-hours",
          "Reminder Lead Time (hours)",
          reminderLeadHours,
          setReminderLeadHours,
          "number",
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-base font-medium">Holiday Surcharge</legend>
        {field(
          "holiday-surcharge",
          "Surcharge (cents)",
          holidaySurcharge,
          setHolidaySurcharge,
          "number",
        )}
        <div className="space-y-1">
          <Label htmlFor="holiday-dates">
            Holiday Dates (one YYYY-MM-DD per line)
          </Label>
          <textarea
            id="holiday-dates"
            className="bg-background w-full rounded-md border px-3 py-2 font-mono text-sm focus-visible:outline-2"
            rows={5}
            value={holidayDates}
            onChange={(e) => setHolidayDates(e.target.value)}
          />
        </div>
      </fieldset>

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
        {isPending ? "Saving…" : "Save Settings"}
      </Button>
    </div>
  );
}
