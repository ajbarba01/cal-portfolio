/**
 * Zod schema for the admin-editable settings columns.
 *
 * Constraints are semantic: non-negative where sensible, hours 0-23,
 * percentages 0-100, holiday_dates an array of ISO date strings (YYYY-MM-DD).
 *
 * This schema does NOT include: id (PK, never edited) or columns not shown
 * in the settings editor UI.
 */

import { z } from "zod";

const hourSchema = z.number().int().min(0).max(23);
const nonNegIntSchema = z.number().int().nonnegative();
const nonNegFloatSchema = z.number().nonnegative();
const pct0to100Schema = z.number().nonnegative().max(100);
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD date string");

export const settingsUpdateSchema = z.object({
  origin_label: z.string().min(1).max(200).optional(),
  origin_lat: z.number().min(-90).max(90).optional(),
  origin_lng: z.number().min(-180).max(180).optional(),
  road_factor: nonNegFloatSchema.optional(),
  avg_speed_mph: nonNegFloatSchema.optional(),
  auto_approve_threshold_min: nonNegIntSchema.optional(),
  hard_cutoff_min: nonNegIntSchema.optional(),
  booking_open_hour: hourSchema.optional(),
  booking_close_hour: hourSchema.optional(),
  min_lead_time_hours: nonNegIntSchema.optional(),
  max_advance_days: nonNegIntSchema.optional(),
  recurring_discount_pct: pct0to100Schema.optional(),
  recurring_min_occurrences: nonNegIntSchema.optional(),
  holiday_surcharge_cents: nonNegIntSchema.optional(),
  holiday_dates: z.array(isoDateSchema).optional(),
  reminder_lead_hours: nonNegIntSchema.optional(),
});

export type SettingsUpdate = z.input<typeof settingsUpdateSchema>;
export type ParsedSettingsUpdate = z.output<typeof settingsUpdateSchema>;
