"use server";

/**
 * Claim flow: a Cal-created (unclaimed) account sets a password and becomes a
 * normal self-owned account. Runs under the invite session established by the
 * claim link (routed through /auth/callback). Clearing `unclaimed` hands routing
 * back to the onboarding-status middleware.
 */

import { z } from "zod";
import type { DbClient } from "@/lib/supabase/db-client";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { FIELD_LIMITS } from "@/lib/field-limits";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(FIELD_LIMITS.password, "Password is too long");

export type ClaimResult =
  | { kind: "success" }
  | { kind: "unauthenticated" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

export interface ClaimDeps {
  sessionClient: DbClient;
  serviceClient: DbClient;
}

export async function claimAccountCore(
  deps: ClaimDeps,
  newPassword: string,
): Promise<ClaimResult> {
  const { sessionClient, serviceClient } = deps;

  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) return { kind: "unauthenticated" };

  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) {
    return {
      kind: "validation_error",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const { error: pwErr } = await sessionClient.auth.updateUser({
    password: parsed.data,
  });
  if (pwErr) return { kind: "error", message: pwErr.message };

  const { error: flagErr } = await serviceClient
    .from("profiles")
    .update({ unclaimed: false, claimed_at: new Date().toISOString() })
    .eq("id", user.id);
  if (flagErr) return { kind: "error", message: flagErr.message };

  return { kind: "success" };
}

export async function claimAccount(newPassword: string): Promise<ClaimResult> {
  const sessionClient = await createClient();
  const serviceClient = createServiceClient();
  return claimAccountCore({ sessionClient, serviceClient }, newPassword);
}
