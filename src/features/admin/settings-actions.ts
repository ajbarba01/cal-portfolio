"use server";

/**
 * Admin server actions for the settings editor.
 *
 * SECURITY: service-role after admin check. Input validated by settingsUpdateSchema.
 * The settings table has a single row; we update it by selecting limit(1).
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "./admin-guard";
import { getActorOrRedirect } from "./admin-session";
import { settingsUpdateSchema } from "./settings-schema";
import type { SettingsUpdate } from "./settings-schema";
import type { SupabaseClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────────────────────
// Row shape (full settings row for the editor)
// ──────────────────────────────────────────────────────────────────────────────

/** Full settings row for the editor, parsed at the DB edge (ENGINEERING #11). */
const settingsRowSchema = z.object({
  id: z.string(),
  origin_label: z.string(),
  origin_lat: z.number(),
  origin_lng: z.number(),
  road_factor: z.number(),
  avg_speed_mph: z.number(),
  auto_approve_threshold_min: z.number(),
  hard_cutoff_min: z.number(),
  booking_open_hour: z.number(),
  booking_close_hour: z.number(),
  min_lead_time_hours: z.number(),
  max_advance_days: z.number(),
  recurring_discount_pct: z.number(),
  recurring_min_occurrences: z.number(),
  holiday_surcharge_cents: z.number(),
  holiday_dates: z.array(z.string()),
});

export type SettingsRow = z.infer<typeof settingsRowSchema>;

// ──────────────────────────────────────────────────────────────────────────────
// Result types
// ──────────────────────────────────────────────────────────────────────────────

export type SettingsResult =
  | { kind: "success" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

export type GetSettingsResult =
  | { kind: "success"; settings: SettingsRow }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

// ──────────────────────────────────────────────────────────────────────────────
// Deps
// ──────────────────────────────────────────────────────────────────────────────

export interface SettingsDeps {
  serviceClient: SupabaseClient;
  actorUserId: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Core functions
// ──────────────────────────────────────────────────────────────────────────────

export async function getSettingsCore(
  deps: SettingsDeps,
): Promise<GetSettingsResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const { data, error } = await deps.serviceClient
    .from("settings")
    .select(
      "id, origin_label, origin_lat, origin_lng, road_factor, avg_speed_mph, " +
        "auto_approve_threshold_min, hard_cutoff_min, booking_open_hour, " +
        "booking_close_hour, min_lead_time_hours, max_advance_days, " +
        "recurring_discount_pct, recurring_min_occurrences, " +
        "holiday_surcharge_cents, holiday_dates",
    )
    .limit(1)
    .single();

  if (error) return { kind: "error", message: error.message };

  const parsed = settingsRowSchema.safeParse(data);
  if (!parsed.success)
    return {
      kind: "error",
      message: `Unexpected settings row shape: ${parsed.error.message}`,
    };

  return { kind: "success", settings: parsed.data };
}

/**
 * Core: update the singleton settings row.
 *
 * Validates input via settingsUpdateSchema. Returns validation_error on bad values.
 */
export async function updateSettingsCore(
  deps: SettingsDeps,
  rawInput: SettingsUpdate,
): Promise<SettingsResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const parsed = settingsUpdateSchema.safeParse(rawInput);
  if (!parsed.success)
    return { kind: "validation_error", message: parsed.error.message };

  const update = parsed.data;

  if (Object.keys(update).length === 0)
    return { kind: "validation_error", message: "No fields to update" };

  // Load the settings row id (single-row table; update by id for safety).
  const { data: row, error: rowErr } = await deps.serviceClient
    .from("settings")
    .select("id")
    .limit(1)
    .single();

  if (rowErr || !row) return { kind: "not_found" };

  const { error } = await deps.serviceClient
    .from("settings")
    .update(update)
    .eq("id", row.id);

  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

// ──────────────────────────────────────────────────────────────────────────────
// "use server" wrappers
// ──────────────────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<GetSettingsResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  return getSettingsCore({ serviceClient, actorUserId });
}

export async function updateSettings(
  input: SettingsUpdate,
): Promise<SettingsResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const result = await updateSettingsCore(
    { serviceClient, actorUserId },
    input,
  );
  if (result.kind === "success") revalidatePath("/admin/settings");
  return result;
}
