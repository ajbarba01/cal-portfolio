"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertCircle, CalendarDays, ChevronDown } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Surface, surfaceVariants } from "@/components/ui/surface";
import { TimePicker } from "@/components/ui/time-picker";
import { UnitInput } from "@/components/ui/unit-input";
import {
  updateSettings,
  type SettingsRow,
} from "@/features/admin/index.client";
import { FIELD_LIMITS } from "@/lib/field-limits";
import { cn } from "@/lib/utils";

/** The form-level error Alert, which every rejected field points at. */
const FORM_ERROR_ID = "settings-form-error";

/** Columns that live inside the collapsed Advanced section. */
const ADVANCED_COLUMNS = [
  "origin_label",
  "origin_lat",
  "origin_lng",
  "road_factor",
  "avg_speed_mph",
];

// ── Local helpers ──────────────────────────────────────────────────────────────

interface UnitFieldProps {
  id: string;
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  /** Unit adornment; omitted for a plain field such as the origin label. */
  unit?: string;
  /** Position the unit label. "trailing" (default) sits after the input; "leading" before. */
  unitPosition?: "trailing" | "leading";
  /** True when the server rejected this column's value on the last save. */
  invalid?: boolean;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}

/**
 * Input with a visible unit label rendered flush-right INSIDE the bordered
 * control box (mockup: "50  % of the booking", "$ 15.00  per booking").
 */
function UnitField({
  id,
  label,
  value,
  onChange,
  unit,
  unitPosition = "trailing",
  invalid = false,
  inputProps,
}: UnitFieldProps) {
  const controlProps = {
    id,
    type: "number",
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange(e.target.value),
    // A rejected field is marked three ways so none of them carries the news
    // alone: the icon beside the label, the destructive track, and the
    // description pointing at the form-level Alert that says what to do.
    "aria-invalid": invalid || undefined,
    "aria-describedby": invalid ? FORM_ERROR_ID : undefined,
    ...inputProps,
  };
  // Input paints its own aria-invalid track; UnitInput puts the border on the
  // wrapper, which the control's aria-invalid variant cannot reach.
  const invalidTrack =
    invalid && unit !== undefined
      ? "border-destructive ring-destructive/20 ring-3"
      : undefined;
  return (
    <div className="space-y-1">
      <Label
        htmlFor={id}
        className="text-muted-foreground flex items-center gap-1 text-xs font-medium"
      >
        {label}
        {invalid ? (
          <AlertCircle
            className="text-destructive size-3.5 shrink-0"
            aria-hidden
          />
        ) : null}
      </Label>
      {unit === undefined ? (
        <Input {...controlProps} />
      ) : (
        <UnitInput
          {...controlProps}
          unit={unit}
          unitPosition={unitPosition}
          className={invalidTrack}
        />
      )}
    </div>
  );
}

/** Small-caps, letter-spaced, bold, accent-gold group legend. */
function GroupLegend({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-brand-strong text-xs font-semibold tracking-wide uppercase">
      {children}
    </p>
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

  // Recurring discount — only the qualifying threshold is editable here; the
  // rate itself is a modifier in each service's pricing_config.
  const [discountMin, setDiscountMin] = useState(
    String(s.recurring_min_occurrences),
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

  // Drive-time buffer
  const [driveBufferPct, setDriveBufferPct] = useState(
    String(s.drive_buffer_pct),
  );

  const [error, setError] = useState<string | null>(null);
  /**
   * Settings columns the last save rejected. updateSettings returns a message
   * per column too, but those come straight from zod and read like
   * "Invalid input: expected number, received NaN" — developer prose with
   * column names in it. Until the schema carries sentences written for Cal, the
   * keys mark the fields and the form-level Alert says what to do.
   */
  const [invalidColumns, setInvalidColumns] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSave() {
    setError(null);
    setInvalidColumns(new Set());
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
        recurring_min_occurrences: parseInt(discountMin, 10),
        // holiday_dates is owned by the Availability calendar — omit from payload
        reminder_lead_hours: parseInt(reminderLeadHours, 10),
        cancellation_full_refund_hours: parseInt(fullRefundHours, 10),
        late_cancel_refund_pct: parseInt(lateRefundPct, 10),
        // no_show_charge_pct intentionally excluded (UI removed; column retained in DB)
        drive_buffer_pct: parseInt(driveBufferPct, 10),
      });
      if (result.kind === "success") {
        setSuccess(true);
      } else {
        if (result.kind === "validation_error" && result.fieldErrors)
          setInvalidColumns(new Set(Object.keys(result.fieldErrors)));
        setError(
          "message" in result
            ? result.message
            : `Action failed: ${result.kind}`,
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── When can clients book? ─────────────────────────────────────── */}
      <Surface variant="plain" className="flex flex-col gap-4 p-5">
        <GroupLegend>When can clients book?</GroupLegend>
        <div className="flex flex-col gap-4">
          {/*
            No per-field marker on the two pickers: they can only emit a real
            minute of the day, so the one settings rule they can break is the
            cross-field "open before close", which the form-level Alert owns.
          */}
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
            invalid={invalidColumns.has("min_lead_time_hours")}
          />
          <UnitField
            id="auto-confirm-horizon"
            label="Auto-confirm bookings within"
            value={autoConfirmHorizon}
            onChange={setAutoConfirmHorizon}
            unit="days out"
            invalid={invalidColumns.has("auto_confirm_horizon_days")}
          />
          <UnitField
            id="hard-max-advance"
            label="Furthest advance booking allowed"
            value={hardMaxAdvance}
            onChange={setHardMaxAdvance}
            unit="days"
            invalid={invalidColumns.has("hard_max_advance_days")}
          />
          <UnitField
            id="recurrence-gen-horizon"
            label="Generate recurring series up to"
            value={recurrenceGenHorizon}
            onChange={setRecurrenceGenHorizon}
            unit="days ahead"
            invalid={invalidColumns.has("recurrence_generation_horizon_days")}
          />
        </div>
      </Surface>

      {/* ── Cancellations ──────────────────────────────────────────────── */}
      <Surface variant="plain" className="flex flex-col gap-4 p-5">
        <GroupLegend>Cancellations</GroupLegend>
        <div className="flex flex-col gap-4">
          <UnitField
            id="full-refund-hours"
            label="Full refund if cancelled at least"
            value={fullRefundHours}
            onChange={setFullRefundHours}
            unit="hours before start"
            invalid={invalidColumns.has("cancellation_full_refund_hours")}
          />
          <UnitField
            id="late-refund-pct"
            label="Refund for a late cancellation"
            value={lateRefundPct}
            onChange={setLateRefundPct}
            unit="% of the booking"
            invalid={invalidColumns.has("late_cancel_refund_pct")}
          />
        </div>
      </Surface>

      {/* ── Recurring discount ─────────────────────────────────────────── */}
      <Surface variant="plain" className="flex flex-col gap-4 p-5">
        <GroupLegend>Recurring discount</GroupLegend>
        <div className="flex flex-col gap-4">
          <UnitField
            id="discount-min"
            label="Minimum recurring occurrences to qualify"
            value={discountMin}
            onChange={setDiscountMin}
            unit="bookings"
            invalid={invalidColumns.has("recurring_min_occurrences")}
          />
        </div>
      </Surface>

      {/* ── Premium days ───────────────────────────────────────────────── */}
      <Surface variant="plain" className="flex flex-col gap-4 p-5">
        <GroupLegend>Premium days</GroupLegend>
        <div className="flex flex-col gap-4">
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
        </div>
      </Surface>

      {/* ── Email reminders ────────────────────────────────────────────── */}
      <Surface variant="plain" className="flex flex-col gap-4 p-5">
        <GroupLegend>Email reminders</GroupLegend>
        <UnitField
          id="reminder-lead-hours"
          label="Send reminder"
          value={reminderLeadHours}
          onChange={setReminderLeadHours}
          unit="hours before start"
          invalid={invalidColumns.has("reminder_lead_hours")}
        />
      </Surface>

      {/* ── Scheduling ─────────────────────────────────────────────────── */}
      <Surface variant="plain" className="flex flex-col gap-4 p-5">
        <GroupLegend>Scheduling</GroupLegend>
        <div className="flex flex-col gap-4">
          <UnitField
            id="drive-buffer-pct"
            label="Drive-time buffer (%)"
            value={driveBufferPct}
            onChange={setDriveBufferPct}
            unit="%"
            inputProps={{ min: "0", max: "1000", step: "1" }}
            invalid={invalidColumns.has("drive_buffer_pct")}
          />
          <p className="text-muted-foreground text-xs">
            Calendar space reserved for driving around each booking. 120 = 1.2×
            the estimate.
          </p>
        </div>
      </Surface>

      {/* ── Distance & approval ────────────────────────────────────────── */}
      <Surface variant="plain" className="flex flex-col gap-4 p-5">
        <GroupLegend>Distance &amp; approval</GroupLegend>
        <div className="flex flex-col gap-4">
          <UnitField
            id="auto-approve"
            label="Auto-approve clients within"
            value={autoApprove}
            onChange={setAutoApprove}
            unit="miles"
            invalid={invalidColumns.has("auto_approve_threshold_miles")}
          />
          <UnitField
            id="hard-cutoff"
            label="Hard cutoff — refuse bookings beyond"
            value={hardCutoff}
            onChange={setHardCutoff}
            unit="miles"
            invalid={invalidColumns.has("hard_cutoff_miles")}
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
        </div>
      </Surface>

      {/* ── Advanced (collapsed until it holds a rejected field) ──── */}
      {/*
        A plain <details> wearing the surface, not <Surface as="details">:
        Surface takes div props, which have no `open`, and a rejected field
        inside a collapsed section is a field Cal cannot find.
      */}
      <details
        open={ADVANCED_COLUMNS.some((c) => invalidColumns.has(c))}
        className={cn(
          surfaceVariants({ variant: "plain" }),
          "group border-dashed",
        )}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between p-5">
          <span className="flex items-center gap-2">
            <GroupLegend>Advanced</GroupLegend>
            <span className="text-muted-foreground bg-muted rounded-md px-1.5 py-0.5 text-[10px] font-medium">
              rarely changed
            </span>
          </span>
          <ChevronDown
            className="text-muted-foreground h-4 w-4 transition-transform duration-200 group-open:rotate-180"
            aria-hidden
          />
        </summary>

        <div className="flex flex-col gap-4 px-5 pt-1 pb-5">
          <UnitField
            id="origin-label"
            label="Origin label"
            value={originLabel}
            onChange={setOriginLabel}
            inputProps={{ type: "text", maxLength: FIELD_LIMITS.shortText }}
            invalid={invalidColumns.has("origin_label")}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <UnitField
              id="origin-lat"
              label="Latitude"
              value={originLat}
              onChange={setOriginLat}
              invalid={invalidColumns.has("origin_lat")}
            />
            <UnitField
              id="origin-lng"
              label="Longitude"
              value={originLng}
              onChange={setOriginLng}
              invalid={invalidColumns.has("origin_lng")}
            />
            <UnitField
              id="road-factor"
              label="Road factor"
              value={roadFactor}
              onChange={setRoadFactor}
              invalid={invalidColumns.has("road_factor")}
            />
            <UnitField
              id="avg-speed"
              label={
                <>
                  Avg speed <span className="font-normal">mph</span>
                </>
              }
              value={avgSpeed}
              onChange={setAvgSpeed}
              invalid={invalidColumns.has("avg_speed_mph")}
            />
          </div>
        </div>
      </details>

      {error && (
        <Alert id={FORM_ERROR_ID} variant="error" role="alert">
          {error}
        </Alert>
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
