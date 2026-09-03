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
import { settingsColumns, settingsRowSchema } from "./settings-schema";
import type { SettingsDeps, SettingsResult } from "./settings-actions";

/** What a failed read tells the operator; the cause goes to the server log. */
const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * The two columns a toggle touches. `holiday_dates` is a jsonb column, so the
 * day list is parsed rather than asserted: writing a toggle back over a value
 * that is not a list of day keys would erase every premium day on the row.
 */
const premiumDaysRowSchema = settingsRowSchema.pick({
  id: true,
  holiday_dates: true,
});

const PREMIUM_DAYS_COLUMNS = settingsColumns(premiumDaysRowSchema);

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
    .select(PREMIUM_DAYS_COLUMNS)
    .limit(1)
    .single();

  if (rowErr || !row) return { kind: "not_found" };

  const parsed = premiumDaysRowSchema.safeParse(row);
  if (!parsed.success) {
    console.error("premium days: unexpected settings row", parsed.error.issues);
    return { kind: "error", message: GENERIC_ERROR };
  }

  const next = togglePremiumDate(parsed.data.holiday_dates, dateKey, on);

  const { error } = await deps.serviceClient
    .from("settings")
    .update({ holiday_dates: next })
    .eq("id", parsed.data.id);

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
    .select(PREMIUM_DAYS_COLUMNS)
    .limit(1)
    .single();

  if (rowErr || !row) return { kind: "not_found" };

  const parsed = premiumDaysRowSchema.safeParse(row);
  if (!parsed.success) {
    console.error("premium days: unexpected settings row", parsed.error.issues);
    return { kind: "error", message: GENERIC_ERROR };
  }

  const next = dayKeys.reduce(
    (acc, key) => togglePremiumDate(acc, key, on),
    parsed.data.holiday_dates,
  );

  const { error } = await deps.serviceClient
    .from("settings")
    .update({ holiday_dates: next })
    .eq("id", parsed.data.id);

  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

// ──────────────────────────────────────────────────────────────────────────────
// "use server" wrappers
// ──────────────────────────────────────────────────────────────────────────────

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
