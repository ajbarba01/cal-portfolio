"use server";

/**
 * Admin server actions for the services editor.
 *
 * SECURITY: service-role after admin check. pricing_config validated by
 * parsePricingConfig (ZodError → validation_error result, never throws across boundary).
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "@/lib/admin-guard";
import { getActorOrRedirect } from "@/lib/admin-session";
import { parsePricingConfig } from "@/features/pricing";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PricingType } from "@/features/pricing";

// ──────────────────────────────────────────────────────────────────────────────
// Row shape
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Service row shape for the admin editor, parsed at the DB edge (ENGINEERING #11).
 * Nullable columns reflect the migration: default_duration_min, max_pets, and
 * form_key are nullable. pricing_config is opaque json validated per-type by
 * parsePricingConfig only when it is being written.
 */
const serviceAdminRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  pricing_type: z.enum([
    "house_sitting",
    "check_in",
    "walk",
    "training",
    "meet_greet",
  ]),
  pricing_config: z.unknown(),
  default_duration_min: z.number().nullable(),
  max_pets: z.number().nullable(),
  concurrency: z.enum(["exclusive", "resident"]),
  form_key: z.string().nullable(),
  requires_approval: z.boolean(),
  active: z.boolean(),
  sort_order: z.number(),
});

export type ServiceAdminRow = z.infer<typeof serviceAdminRowSchema>;

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

  const services: ServiceAdminRow[] = [];
  for (const row of data ?? []) {
    const parsed = serviceAdminRowSchema.safeParse(row);
    if (!parsed.success)
      return {
        kind: "error",
        message: `Unexpected service row shape: ${parsed.error.message}`,
      };
    services.push(parsed.data);
  }

  return { kind: "success", services };
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
  if (result.kind === "success") {
    revalidatePath("/admin/services");
    // The public services page is static — refresh it after an edit.
    revalidatePath("/services");
  }
  return result;
}
