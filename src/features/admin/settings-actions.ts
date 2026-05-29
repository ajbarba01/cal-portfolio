"use server";

/**
 * Admin server actions for the settings editor.
 *
 * SECURITY: service-role after admin check. Input validated by settingsUpdateSchema.
 * The settings table has a single row; we update it by selecting limit(1).
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "./admin-guard";
import { settingsUpdateSchema } from "./settings-schema";
import type { SettingsUpdate } from "./settings-schema";
import type { SupabaseClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────────────────────
// Row shape (full settings row for the editor)
// ──────────────────────────────────────────────────────────────────────────────

export interface SettingsRow {
  id: string;
  origin_label: string;
  origin_lat: number;
  origin_lng: number;
  road_factor: number;
  avg_speed_mph: number;
  auto_approve_threshold_min: number;
  hard_cutoff_min: number;
  booking_open_hour: number;
  booking_close_hour: number;
  min_lead_time_hours: number;
  max_advance_days: number;
  recurring_discount_pct: number;
  recurring_min_occurrences: number;
  holiday_surcharge_cents: number;
  holiday_dates: string[];
}

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

  return { kind: "success", settings: data as unknown as SettingsRow };
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

async function getActorOrRedirect() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

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
