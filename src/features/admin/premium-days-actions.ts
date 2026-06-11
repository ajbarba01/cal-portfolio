"use server";

/**
 * Admin server actions for toggling premium (holiday) days.
 *
 * SECURITY: service-role after admin check. Writes to the existing
 * `holiday_dates` column on the singleton settings row — no schema change.
 * The UI labels these "premium days"; the storage column stays `holiday_dates`.
 */

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "@/lib/admin-guard";
import { getActorOrRedirect } from "@/lib/admin-session";
import type { SettingsDeps, SettingsResult } from "./settings-actions";

// ──────────────────────────────────────────────────────────────────────────────
// Pure helper
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns a sorted, de-duplicated copy of `dates` with `key` added or removed.
 *
 * @param dates - Current list of YYYY-MM-DD date strings.
 * @param key   - The date to toggle.
 * @param on    - `true` to add, `false` to remove.
 */
export function togglePremiumDate(
  dates: string[],
  key: string,
  on: boolean,
): string[] {
  const set = new Set(dates);
  if (on) {
    set.add(key);
  } else {
    set.delete(key);
  }
  return [...set].sort();
}

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

// ──────────────────────────────────────────────────────────────────────────────
// "use server" wrapper
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
