import { describe, expect, it } from "vitest";
import {
  SETTINGS_COLUMNS,
  settingsColumns,
  settingsRowSchema,
  settingsUpdateSchema,
} from "./settings-schema";
import type { SettingsRow } from "./settings-schema";
import { FIELD_LIMITS } from "@/lib/field-limits";

/**
 * Every column of the settings table, in schema order. Hardcoded on purpose:
 * this is the assertion that the schema still mirrors the table, so a column
 * added to one has to be added to the other.
 */
const EXPECTED_COLUMNS = [
  "id",
  "origin_label",
  "origin_lat",
  "origin_lng",
  "road_factor",
  "avg_speed_mph",
  "auto_approve_threshold_miles",
  "hard_cutoff_miles",
  "gate_use_road_miles",
  "booking_open_minute",
  "booking_close_minute",
  "min_lead_time_hours",
  "auto_confirm_horizon_days",
  "hard_max_advance_days",
  "recurrence_generation_horizon_days",
  "recurring_discount_pct",
  "recurring_min_occurrences",
  "cancellation_full_refund_hours",
  "late_cancel_refund_pct",
  "no_show_charge_pct",
  "holiday_surcharge_cents",
  "holiday_dates",
  "reminder_lead_hours",
  "drive_buffer_pct",
];

/**
 * Columns the row schema still parses but the update schema refuses: the PK,
 * plus the two pricing columns whose rates moved into each service's
 * `pricing_config` and which therefore have no reader left.
 */
const READ_ONLY_COLUMNS = [
  "id",
  "recurring_discount_pct",
  "holiday_surcharge_cents",
];

/** The seeded row, i.e. the DB defaults every migration ships. */
const VALID_ROW: SettingsRow = {
  id: "11111111-1111-1111-1111-111111111111",
  origin_label: "Boulder",
  origin_lat: 40.015,
  origin_lng: -105.27,
  road_factor: 1.3,
  avg_speed_mph: 40,
  auto_approve_threshold_miles: 8,
  hard_cutoff_miles: 50,
  gate_use_road_miles: false,
  booking_open_minute: 390,
  booking_close_minute: 1320,
  min_lead_time_hours: 24,
  auto_confirm_horizon_days: 30,
  hard_max_advance_days: 365,
  recurrence_generation_horizon_days: 42,
  recurring_discount_pct: 10,
  recurring_min_occurrences: 3,
  cancellation_full_refund_hours: 48,
  late_cancel_refund_pct: 50,
  no_show_charge_pct: 100,
  holiday_surcharge_cents: 1000,
  holiday_dates: ["2026-12-25"],
  reminder_lead_hours: 24,
  drive_buffer_pct: 120,
};

function rowWithout(column: keyof SettingsRow): Record<string, unknown> {
  const row: Record<string, unknown> = { ...VALID_ROW };
  delete row[column];
  return row;
}

describe("settingsRowSchema", () => {
  it("accepts the seeded row", () => {
    expect(settingsRowSchema.safeParse(VALID_ROW).success).toBe(true);
  });

  it("drops a column the schema does not declare", () => {
    const parsed = settingsRowSchema.safeParse({
      ...VALID_ROW,
      legacy_column: 7,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "legacy_column" in parsed.data).toBe(false);
  });

  it("accepts a value outside the editor's bounds", () => {
    // Reads stay permissive: a value the editor would refuse must never take a
    // booking page down after it is somehow in the table.
    expect(
      settingsRowSchema.safeParse({ ...VALID_ROW, drive_buffer_pct: 5000 })
        .success,
    ).toBe(true);
  });

  const rejectedRows: Array<{ name: string; row: Record<string, unknown> }> = [
    { name: "a missing column", row: rowWithout("drive_buffer_pct") },
    { name: "a null number", row: { ...VALID_ROW, avg_speed_mph: null } },
    {
      name: "a number arriving as a string",
      row: { ...VALID_ROW, origin_lat: "40.015" },
    },
    {
      name: "a boolean arriving as a string",
      row: { ...VALID_ROW, gate_use_road_miles: "false" },
    },
    {
      name: "a holiday date that is not a string",
      row: { ...VALID_ROW, holiday_dates: [20261225] },
    },
    {
      name: "null holiday dates",
      row: { ...VALID_ROW, holiday_dates: null },
    },
  ];

  it.each(rejectedRows)("rejects $name", ({ row }) => {
    expect(settingsRowSchema.safeParse(row).success).toBe(false);
  });
});

describe("settingsUpdateSchema", () => {
  const accepted: Array<{ name: string; patch: Record<string, unknown> }> = [
    { name: "an empty patch", patch: {} },
    {
      name: "an open minute before the close minute",
      patch: { booking_open_minute: 390, booking_close_minute: 1320 },
    },
    {
      name: "an open minute sent without a close minute",
      patch: { booking_open_minute: 1320 },
    },
    { name: "an ISO holiday date", patch: { holiday_dates: ["2026-12-25"] } },
    {
      name: "a percentage at the bound",
      patch: { late_cancel_refund_pct: 100 },
    },
    { name: "midnight as a minute of day", patch: { booking_open_minute: 0 } },
  ];

  it.each(accepted)("accepts $name", ({ patch }) => {
    expect(settingsUpdateSchema.safeParse(patch).success).toBe(true);
  });

  const rejected: Array<{ name: string; patch: Record<string, unknown> }> = [
    {
      name: "an open minute equal to the close minute",
      patch: { booking_open_minute: 600, booking_close_minute: 600 },
    },
    {
      name: "an open minute after the close minute",
      patch: { booking_open_minute: 1320, booking_close_minute: 390 },
    },
    {
      name: "a minute past the end of the day",
      patch: { booking_open_minute: 1441 },
    },
    { name: "a negative lead time", patch: { min_lead_time_hours: -1 } },
    { name: "a fractional lead time", patch: { min_lead_time_hours: 1.5 } },
    { name: "a percentage above 100", patch: { no_show_charge_pct: 101 } },
    { name: "a latitude off the globe", patch: { origin_lat: 91 } },
    { name: "an empty origin label", patch: { origin_label: "" } },
    {
      name: "an origin label past the field limit",
      patch: { origin_label: "x".repeat(FIELD_LIMITS.shortText + 1) },
    },
    {
      name: "a holiday date that is not ISO",
      patch: { holiday_dates: ["12/25/2026"] },
    },
    { name: "a drive buffer above 1000", patch: { drive_buffer_pct: 1001 } },
  ];

  it.each(rejected)("rejects $name", ({ patch }) => {
    expect(settingsUpdateSchema.safeParse(patch).success).toBe(false);
  });

  it("reports an inverted booking window on the close minute", () => {
    const parsed = settingsUpdateSchema.safeParse({
      booking_open_minute: 1320,
      booking_close_minute: 390,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(["booking_close_minute"]);
    }
  });

  it("offers every column of the settings table except the read-only ones", () => {
    expect(Object.keys(settingsUpdateSchema.shape).sort()).toEqual(
      EXPECTED_COLUMNS.filter(
        (column) => !READ_ONLY_COLUMNS.includes(column),
      ).sort(),
    );
  });
});

describe("settingsColumns", () => {
  it("lists every column of the settings table", () => {
    expect(SETTINGS_COLUMNS.split(", ")).toEqual(EXPECTED_COLUMNS);
  });

  it("includes the column added most recently", () => {
    expect(SETTINGS_COLUMNS).toContain("drive_buffer_pct");
  });

  it("derives a narrow select from a picked schema", () => {
    const narrow = settingsRowSchema.pick({
      booking_open_minute: true,
      holiday_dates: true,
    });
    expect(settingsColumns(narrow)).toBe("booking_open_minute, holiday_dates");
  });
});
