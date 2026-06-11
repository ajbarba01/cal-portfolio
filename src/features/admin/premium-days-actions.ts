"use server";

/**
 * Admin server actions for toggling premium (holiday) days.
 *
 * SECURITY: service-role after admin check. Writes to the existing
 * `holiday_dates` column on the singleton settings row — no schema change.
 * The UI labels these "premium days"; the storage column stays `holiday_dates`.
 *
 * Pure toggle helper lives in premium-days-pure.ts (no "use server" context).
 */

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "@/lib/admin-guard";
import { getActorOrRedirect } from "@/lib/admin-session";
import { togglePremiumDate } from "./premium-days-pure";
import type { SettingsDeps, SettingsResult } from "./settings-actions";

// ──────────────────────────────────────────────────────────────────────────────
// Core (injectable deps — testable without Next.js runtime)
// ──────────────────────────────────────────────────────────────────────────────

/** Toggle a premium day on the singleton settings row. */
export async function setPremiumDayCore(
  deps: SettingsDeps,
  dateKey: string,
  on: boolean,
): Promise<SettingsResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const { data: row, error: rowErr } = await deps.serviceClient
    .from("settings")
    .select("id, holiday_dates")
    .limit(1)
    .single();

  if (rowErr || !row) return { kind: "not_found" };

  const next = togglePremiumDate(
    (row.holiday_dates as string[]) ?? [],
    dateKey,
    on,
  );

  const { error } = await deps.serviceClient
    .from("settings")
    .update({ holiday_dates: next })
    .eq("id", row.id as string);

  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

/**
 * Toggle multiple premium days in a single read+write cycle.
 *
 * Reads `holiday_dates` once, folds all `dayKeys` through `togglePremiumDate`
 * (reduce), then writes once — avoids N round-trips / races for multi-day
 * selections.
 */
export async function setPremiumDaysBatchCore(
  deps: SettingsDeps,
  dayKeys: string[],
  on: boolean,
): Promise<SettingsResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  if (dayKeys.length === 0)
    return { kind: "validation_error", message: "dayKeys must not be empty" };

  const { data: row, error: rowErr } = await deps.serviceClient
    .from("settings")
    .select("id, holiday_dates")
    .limit(1)
    .single();

  if (rowErr || !row) return { kind: "not_found" };

  const next = dayKeys.reduce(
    (acc, key) => togglePremiumDate(acc, key, on),
    (row.holiday_dates as string[]) ?? [],
  );

  const { error } = await deps.serviceClient
    .from("settings")
    .update({ holiday_dates: next })
    .eq("id", row.id as string);

  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

// ──────────────────────────────────────────────────────────────────────────────
// "use server" wrappers
// ──────────────────────────────────────────────────────────────────────────────

/** Admin server action: toggle a premium (holiday) date in settings. */
export async function setPremiumDay(
  dateKey: string,
  on: boolean,
): Promise<SettingsResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const result = await setPremiumDayCore(
    { serviceClient, actorUserId },
    dateKey,
    on,
  );
  if (result.kind === "success") revalidatePath("/admin/availability");
  return result;
}

/** Admin server action: toggle multiple premium (holiday) dates in one round-trip. */
export async function setPremiumDaysBatch(
  dayKeys: string[],
  on: boolean,
): Promise<SettingsResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const result = await setPremiumDaysBatchCore(
    { serviceClient, actorUserId },
    dayKeys,
    on,
  );
  if (result.kind === "success") revalidatePath("/admin/availability");
  return result;
}
