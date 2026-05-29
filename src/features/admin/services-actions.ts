"use server";

/**
 * Admin server actions for the services editor.
 *
 * SECURITY: service-role after admin check. pricing_config validated by
 * parsePricingConfig (ZodError → validation_error result, never throws across boundary).
 */

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "./admin-guard";
import { parsePricingConfig } from "@/features/pricing/config-schemas";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PricingType } from "@/features/pricing/types";

// ──────────────────────────────────────────────────────────────────────────────
// Row shape
// ──────────────────────────────────────────────────────────────────────────────

export interface ServiceAdminRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  pricing_type: PricingType;
  pricing_config: unknown;
  default_duration_min: number;
  max_pets: number;
  concurrency: string;
  form_key: string;
  requires_approval: boolean;
  active: boolean;
  sort_order: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Result types
// ──────────────────────────────────────────────────────────────────────────────

export type ServiceResult =
  | { kind: "success" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

export type ListServicesResult =
  | { kind: "success"; services: ServiceAdminRow[] }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

// ──────────────────────────────────────────────────────────────────────────────
// Deps
// ──────────────────────────────────────────────────────────────────────────────

export interface ServicesDeps {
  serviceClient: SupabaseClient;
  actorUserId: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Core functions
// ──────────────────────────────────────────────────────────────────────────────

export async function listServicesCore(
  deps: ServicesDeps,
): Promise<ListServicesResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const { data, error } = await deps.serviceClient
    .from("services")
    .select(
      "id, slug, name, description, pricing_type, pricing_config, " +
        "default_duration_min, max_pets, concurrency, form_key, " +
        "requires_approval, active, sort_order",
    )
    .order("sort_order", { ascending: true });

  if (error) return { kind: "error", message: error.message };

  return {
    kind: "success",
    services: (data ?? []) as unknown as ServiceAdminRow[],
  };
}

const updateServiceInputSchema = z.object({
  serviceId: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).nullable().optional(),
  pricing_config: z.record(z.string(), z.unknown()).optional(),
  default_duration_min: z.number().int().positive().optional(),
  max_pets: z.number().int().positive().optional(),
  requires_approval: z.boolean().optional(),
  active: z.boolean().optional(),
  sort_order: z.number().int().nonnegative().optional(),
});

export type UpdateServiceInput = z.input<typeof updateServiceInputSchema>;

/**
 * Core: update editable fields of a service.
 *
 * If pricing_config is supplied, it is validated against the service's current
 * pricing_type via parsePricingConfig. A ZodError returns validation_error.
 */
export async function updateServiceCore(
  deps: ServicesDeps,
  rawInput: UpdateServiceInput,
): Promise<ServiceResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const parsed = updateServiceInputSchema.safeParse(rawInput);
  if (!parsed.success)
    return { kind: "validation_error", message: parsed.error.message };

  const { serviceId, pricing_config, ...rest } = parsed.data;

  // Load the service's current pricing_type (needed if pricing_config is being updated).
  if (pricing_config !== undefined) {
    const { data: svc, error: svcErr } = await deps.serviceClient
      .from("services")
      .select("pricing_type")
      .eq("id", serviceId)
      .single();

    if (svcErr || !svc) return { kind: "not_found" };

    try {
      parsePricingConfig(svc.pricing_type as PricingType, pricing_config);
    } catch (e) {
      return {
        kind: "validation_error",
        message: `Invalid pricing_config: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  // Build update payload (exclude undefined keys).
  const update: Record<string, unknown> = {};
  if (rest.name !== undefined) update.name = rest.name;
  if (rest.description !== undefined) update.description = rest.description;
  if (pricing_config !== undefined) update.pricing_config = pricing_config;
  if (rest.default_duration_min !== undefined)
    update.default_duration_min = rest.default_duration_min;
  if (rest.max_pets !== undefined) update.max_pets = rest.max_pets;
  if (rest.requires_approval !== undefined)
    update.requires_approval = rest.requires_approval;
  if (rest.active !== undefined) update.active = rest.active;
  if (rest.sort_order !== undefined) update.sort_order = rest.sort_order;

  if (Object.keys(update).length === 0)
    return { kind: "validation_error", message: "No fields to update" };

  const { error } = await deps.serviceClient
    .from("services")
    .update(update)
    .eq("id", serviceId);

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

export async function listServices(): Promise<ListServicesResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  return listServicesCore({ serviceClient, actorUserId });
}

export async function updateService(
  input: UpdateServiceInput,
): Promise<ServiceResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const result = await updateServiceCore({ serviceClient, actorUserId }, input);
  if (result.kind === "success") revalidatePath("/admin/services");
  return result;
}
