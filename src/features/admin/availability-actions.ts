"use server";

/**
 * Admin server actions for availability window CRUD and block-out.
 *
 * SECURITY: All mutations use the service-role client AFTER verifying the actor
 * is an admin. Identity comes from the session; role is re-checked from DB.
 *
 * Block-out: deletes (or trims) a window and cancels any active booking that
 * falls inside the removed range by reusing cancelBookingCore (admin path).
 */

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "./admin-guard";
import { cancelBookingCore } from "@/features/booking/booking-service";
import { createSupabaseBookingRepository } from "@/features/booking/booking-repository";
import type { SupabaseClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────────────────────
// Row shape
// ──────────────────────────────────────────────────────────────────────────────

export interface AvailabilityWindow {
  id: string;
  starts_at: string; // ISO UTC
  ends_at: string; // ISO UTC
  note: string | null;
}

const availabilityWindowSchema = z.object({
  id: z.string().uuid(),
  starts_at: z.string(),
  ends_at: z.string(),
  note: z.string().nullable(),
});

// ──────────────────────────────────────────────────────────────────────────────
// Result types
// ──────────────────────────────────────────────────────────────────────────────

export type AvailabilityResult =
  | { kind: "success" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

export type ListWindowsResult =
  | { kind: "success"; windows: AvailabilityWindow[] }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

// ──────────────────────────────────────────────────────────────────────────────
// Deps
// ──────────────────────────────────────────────────────────────────────────────

export interface AvailabilityDeps {
  serviceClient: SupabaseClient;
  actorUserId: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Core functions (no Next.js imports — testable via DI)
// ──────────────────────────────────────────────────────────────────────────────

export async function listWindowsCore(
  deps: AvailabilityDeps,
): Promise<ListWindowsResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const { data, error } = await deps.serviceClient
    .from("availability_windows")
    .select("id, starts_at, ends_at, note")
    .order("starts_at", { ascending: true });

  if (error) return { kind: "error", message: error.message };

  const windows = (data ?? []).map((row) => {
    const parsed = availabilityWindowSchema.safeParse(row);
    if (!parsed.success)
      throw new Error(
        `Unexpected availability_window shape: ${parsed.error.message}`,
      );
    return parsed.data;
  });

  return { kind: "success", windows };
}

const createWindowInputSchema = z
  .object({
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    note: z.string().max(500).nullable().optional(),
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

export async function createWindowCore(
  deps: AvailabilityDeps,
  rawInput: { startsAt: string; endsAt: string; note?: string | null },
): Promise<AvailabilityResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const parsed = createWindowInputSchema.safeParse(rawInput);
  if (!parsed.success)
    return { kind: "validation_error", message: parsed.error.message };

  const { data: input } = parsed;

  const { error } = await deps.serviceClient
    .from("availability_windows")
    .insert({
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      note: input.note ?? null,
    });

  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

const trimWindowInputSchema = z
  .object({
    windowId: z.string().uuid(),
    newStartsAt: z.string().datetime({ offset: true }).optional(),
    newEndsAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine((d) => d.newStartsAt !== undefined || d.newEndsAt !== undefined, {
    message: "At least one of newStartsAt or newEndsAt must be provided",
  });

export async function trimWindowCore(
  deps: AvailabilityDeps,
  rawInput: {
    windowId: string;
    newStartsAt?: string;
    newEndsAt?: string;
  },
): Promise<AvailabilityResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const parsed = trimWindowInputSchema.safeParse(rawInput);
  if (!parsed.success)
    return { kind: "validation_error", message: parsed.error.message };

  const { data: input } = parsed;

  const update: Record<string, string> = {};
  if (input.newStartsAt) update.starts_at = input.newStartsAt;
  if (input.newEndsAt) update.ends_at = input.newEndsAt;

  const { error } = await deps.serviceClient
    .from("availability_windows")
    .update(update)
    .eq("id", input.windowId);

  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

/**
 * Block-out: delete window + cancel all active bookings that overlap it.
 *
 * Overlap condition: booking.starts_at < wEnd AND booking.ends_at > wStart
 * AND status IN ('pending_approval', 'confirmed').
 *
 * Reuses cancelBookingCore (admin path: pass booking's actual client_id as userId).
 */
export async function deleteWindowCore(
  deps: AvailabilityDeps & { now: Date },
  rawInput: { windowId: string },
): Promise<AvailabilityResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const parsed = z.object({ windowId: z.string().uuid() }).safeParse(rawInput);
  if (!parsed.success)
    return { kind: "validation_error", message: parsed.error.message };

  const { windowId } = parsed.data;

  // Load the window to get its time range.
  const { data: windowData, error: windowErr } = await deps.serviceClient
    .from("availability_windows")
    .select("id, starts_at, ends_at")
    .eq("id", windowId)
    .single();

  if (windowErr || !windowData) return { kind: "not_found" };

  const wStart = windowData.starts_at as string;
  const wEnd = windowData.ends_at as string;

  // Find overlapping active bookings.
  const { data: overlapping, error: overlapErr } = await deps.serviceClient
    .from("bookings")
    .select("id, client_id, status")
    .lt("starts_at", wEnd)
    .gt("ends_at", wStart)
    .in("status", ["pending_approval", "confirmed"]);

  if (overlapErr)
    return {
      kind: "error",
      message: `Overlap query failed: ${overlapErr.message}`,
    };

  // Cancel each overlapping booking via cancelBookingCore (admin path).
  const repo = createSupabaseBookingRepository(deps.serviceClient);
  for (const booking of overlapping ?? []) {
    await cancelBookingCore(
      { repo, now: deps.now },
      { userId: booking.client_id as string, bookingId: booking.id as string },
    );
  }

  // Delete the window.
  const { error: deleteErr } = await deps.serviceClient
    .from("availability_windows")
    .delete()
    .eq("id", windowId);

  if (deleteErr) return { kind: "error", message: deleteErr.message };
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

export async function listWindows(): Promise<ListWindowsResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  return listWindowsCore({ serviceClient, actorUserId });
}

export async function createWindow(input: {
  startsAt: string;
  endsAt: string;
  note?: string | null;
}): Promise<AvailabilityResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const result = await createWindowCore({ serviceClient, actorUserId }, input);
  if (result.kind === "success") revalidatePath("/admin/availability");
  return result;
}

export async function trimWindow(input: {
  windowId: string;
  newStartsAt?: string;
  newEndsAt?: string;
}): Promise<AvailabilityResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const result = await trimWindowCore({ serviceClient, actorUserId }, input);
  if (result.kind === "success") revalidatePath("/admin/availability");
  return result;
}

export async function deleteWindow(input: {
  windowId: string;
}): Promise<AvailabilityResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const result = await deleteWindowCore(
    { serviceClient, actorUserId, now: new Date() },
    input,
  );
  if (result.kind === "success") revalidatePath("/admin/availability");
  return result;
}
