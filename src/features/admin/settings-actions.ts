"use server";

/**
 * Admin server actions for the settings editor.
 *
 * SECURITY: service-role after admin check. Input validated by settingsUpdateSchema.
 * The settings table has a single row; we update it by selecting limit(1).
 */

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "@/lib/admin-guard";
import { getActorOrRedirect } from "@/lib/admin-session";
import { zodFieldErrors } from "@/lib/form-action-result";
import {
  SETTINGS_COLUMNS,
  settingsRowSchema,
  settingsUpdateSchema,
} from "./settings-schema";
import type { SettingsRow, SettingsUpdate } from "./settings-schema";
import type { DbClient } from "@/lib/supabase/db-client";

// The settings row shape is declared once, in settings-schema, and re-exported
// from the feature barrels — NOT from here. A `"use server"` module may only
// export async functions: Turbopack's action transform enumerates this file's
// exports before the type re-export is erased and registers `SettingsRow` as an
// action, then fails the build on every route that reaches it.

/** What the caller cannot act on is logged in full and reported as one sentence. */
const GENERIC_ERROR = "Something went wrong. Please try again.";
const VALIDATION_ERROR = "Please check your entries and try again.";

// ──────────────────────────────────────────────────────────────────────────────
// Result types
// ──────────────────────────────────────────────────────────────────────────────

export type SettingsResult =
  | { kind: "success" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | {
      kind: "validation_error";
      message: string;
      /** Keyed by settings column, so the editor can show each error at its field. */
      fieldErrors?: Record<string, string>;
    }
  | { kind: "error"; message: string };

export type GetSettingsResult =
  | { kind: "success"; settings: SettingsRow }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

// ──────────────────────────────────────────────────────────────────────────────
// Deps
// ──────────────────────────────────────────────────────────────────────────────

export interface SettingsDeps {
  serviceClient: DbClient;
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
    .select(SETTINGS_COLUMNS)
    .limit(1)
    .single();

  if (error) {
    console.error("settings action: read failed", error);
    return { kind: "error", message: GENERIC_ERROR };
  }

  const parsed = settingsRowSchema.safeParse(data);
  if (!parsed.success) {
    console.error("settings action: unexpected row shape", parsed.error.issues);
    return { kind: "error", message: GENERIC_ERROR };
  }

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
  if (!parsed.success) {
    console.error(
      "settings action: input validation failed",
      parsed.error.issues,
    );
    return {
      kind: "validation_error",
      message: VALIDATION_ERROR,
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }

  const update = parsed.data;

  if (Object.keys(update).length === 0)
    return { kind: "validation_error", message: "No fields to update" };

  // Load the settings row id (single-row table; update by id for safety).
  const { data: row, error: rowErr } = await deps.serviceClient
    .from("settings")
    .select("id")
    .limit(1)
    .single();

  if (rowErr || !row) {
    console.error("settings action: settings row unreadable", rowErr);
    return { kind: "not_found" };
  }

  const { error } = await deps.serviceClient
    .from("settings")
    .update(update)
    .eq("id", row.id);

  if (error) {
    console.error("settings action: update failed", error);
    return { kind: "error", message: GENERIC_ERROR };
  }
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
