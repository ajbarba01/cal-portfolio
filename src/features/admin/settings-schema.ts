/**
 * The two schemas for the single-row `settings` table: `settingsRowSchema` is
 * the shape the DB returns, `settingsUpdateSchema` the shape the admin editor
 * may write.
 *
 * They differ on purpose. A read is parsed only to keep nulls and garbage out
 * of arithmetic (ENGINEERING #11), so the row schema checks types and nothing
 * else — a value outside an editor bound must never take a booking page down.
 * A write is the place to enforce meaning, so the update schema carries the
 * semantic constraints: non-negative where sensible, minutes of day 0-1440,
 * percentages 0-100, holiday_dates an array of ISO date strings (YYYY-MM-DD).
 */

import { z } from "zod";
import { FIELD_LIMITS } from "@/lib/field-limits";

const minuteOfDaySchema = z.number().int().min(0).max(1440);
const nonNegIntSchema = z.number().int().nonnegative();
const nonNegFloatSchema = z.number().nonnegative();
const pct0to100Schema = z.number().nonnegative().max(100);
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD date string");

/**
 * Every column of the `settings` table, all of them NOT NULL in the DB. This is
 * the one declaration of the row shape; readers that need part of it `.pick()`
 * from here rather than restating their own.
 */
export const settingsRowSchema = z.object({
  id: z.string(),
  origin_label: z.string(),
  origin_lat: z.number(),
  origin_lng: z.number(),
  road_factor: z.number(),
  avg_speed_mph: z.number(),
  auto_approve_threshold_miles: z.number(),
  hard_cutoff_miles: z.number(),
  gate_use_road_miles: z.boolean(),
  booking_open_minute: z.number(),
  booking_close_minute: z.number(),
  min_lead_time_hours: z.number(),
  auto_confirm_horizon_days: z.number(),
  hard_max_advance_days: z.number(),
  recurrence_generation_horizon_days: z.number(),
  recurring_discount_pct: z.number(),
  recurring_min_occurrences: z.number(),
  cancellation_full_refund_hours: z.number(),
  late_cancel_refund_pct: z.number(),
  no_show_charge_pct: z.number(),
  holiday_surcharge_cents: z.number(),
  /** ISO "YYYY-MM-DD" day keys for premium (holiday) days. */
  holiday_dates: z.array(z.string()),
  reminder_lead_hours: z.number(),
  /** Percent of one-way drive time reserved as a scheduling buffer (120 = 1.2×). */
  drive_buffer_pct: z.number(),
});

export type SettingsRow = z.output<typeof settingsRowSchema>;

/**
 * The `select()` list for a settings read, derived from the schema that parses
 * the result — pass `settingsRowSchema` for the whole row or a `.pick()` of it
 * for a narrow one, and the two can never drift apart.
 */
export function settingsColumns<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
): string {
  return Object.keys(schema.shape).join(", ");
}

/** Every settings column, for reads that want the whole row. */
export const SETTINGS_COLUMNS = settingsColumns(settingsRowSchema);

/**
 * The admin-editable columns. Excludes `id` (PK, never edited) and the two
 * pricing columns no reader consumes any more — `recurring_discount_pct` and
 * `holiday_surcharge_cents`, whose rates live as modifiers in each service's
 * `pricing_config`. The columns stay in the row schema so a read still parses;
 * they are simply not writable from the settings editor.
 */
export const settingsUpdateSchema = z
  .object({
    origin_label: z.string().min(1).max(FIELD_LIMITS.shortText).optional(),
    origin_lat: z.number().min(-90).max(90).optional(),
    origin_lng: z.number().min(-180).max(180).optional(),
    road_factor: nonNegFloatSchema.optional(),
    avg_speed_mph: nonNegFloatSchema.optional(),
    auto_approve_threshold_miles: nonNegFloatSchema.optional(),
    hard_cutoff_miles: nonNegFloatSchema.optional(),
    gate_use_road_miles: z.boolean().optional(),
    booking_open_minute: minuteOfDaySchema.optional(),
    booking_close_minute: minuteOfDaySchema.optional(),
    min_lead_time_hours: nonNegIntSchema.optional(),
    auto_confirm_horizon_days: nonNegIntSchema.optional(),
    hard_max_advance_days: nonNegIntSchema.optional(),
    recurrence_generation_horizon_days: nonNegIntSchema.optional(),
    recurring_min_occurrences: nonNegIntSchema.optional(),
    cancellation_full_refund_hours: nonNegIntSchema.optional(),
    late_cancel_refund_pct: pct0to100Schema.optional(),
    no_show_charge_pct: pct0to100Schema.optional(),
    holiday_dates: z.array(isoDateSchema).optional(),
    reminder_lead_hours: nonNegIntSchema.optional(),
    drive_buffer_pct: z.number().int().nonnegative().max(1000).optional(),
  })
  .refine(
    (s) =>
      s.booking_open_minute === undefined ||
      s.booking_close_minute === undefined ||
      s.booking_open_minute < s.booking_close_minute,
    {
      message: "booking_open_minute must be less than booking_close_minute",
      path: ["booking_close_minute"],
    },
  );

export type SettingsUpdate = z.input<typeof settingsUpdateSchema>;
export type ParsedSettingsUpdate = z.output<typeof settingsUpdateSchema>;
