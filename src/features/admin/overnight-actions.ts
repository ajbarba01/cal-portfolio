"use server";

/**
 * Admin server actions for overnight_nights CRUD.
 *
 * SECURITY: All mutations use the service-role client AFTER verifying the actor
 * is an admin. Identity comes from the session; role is re-checked from DB.
 *
 * Un-toggling a night refuses (returns conflict) if an active resident booking
 * overlaps that night — it never cancels bookings unilaterally.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { assertActorIsAdmin } from "./admin-guard";
import { getActorOrRedirect } from "./admin-session";
import { denverMidnight, denverDayKey } from "@/features/booking/availability";
import type { SupabaseClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────────────────────
// Deps
// ──────────────────────────────────────────────────────────────────────────────

export interface OvernightDeps {
  serviceClient: SupabaseClient;
  actorUserId: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Result types
// ──────────────────────────────────────────────────────────────────────────────

export type ConflictBooking = { id: string; startsAt: string; endsAt: string };

export type ListOvernightNightsResult =
  | { kind: "success"; nights: string[] }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

export type SetOvernightNightsResult =
  | { kind: "success" }
  | { kind: "forbidden" }
  | { kind: "validation_error"; message: string }
  | { kind: "conflict"; bookings: ConflictBooking[] }
  | { kind: "error"; message: string };

// ──────────────────────────────────────────────────────────────────────────────
// Validation schema
// ──────────────────────────────────────────────────────────────────────────────

const nightStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Each night must be a YYYY-MM-DD date string");

const batchInputSchema = z.object({
  nights: z
    .array(nightStringSchema)
    .nonempty("nights must be a non-empty array"),
  on: z.boolean(),
});

// ──────────────────────────────────────────────────────────────────────────────
// Private helper: resident-booking conflict detector (read-only)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns active resident bookings that overlap any of the given nights.
 *
 * For each night D, the blocked instant range is [denverMidnight(D), denverMidnight(nextDay(D))).
 * Using the next day's true Denver midnight (rather than start + 24h) is DST-correct:
 * a fall-back night is 25h long; adding a fixed 24h would miss bookings in that
 * extra hour. nextDayKey derives the successor date via a 36h offset past midnight
 * (always lands in the next calendar day regardless of DST) then snaps back to a
 * day key via denverDayKey.
 * Overlap: booking.starts_at < nightEnd AND booking.ends_at > nightStart.
 * Uses the union span across all nights for a single DB round-trip, then
 * post-filters to only rows that actually overlap at least one specific night
 * (guards against false positives in non-contiguous batches).
 *
 * Does NOT mutate anything.
 */

/** Returns the YYYY-MM-DD key for the calendar day after `dayKey` (DST-safe). */
function nextDayKey(dayKey: string): string {
  // Add 36h to midnight so we always land in the next calendar day regardless
  // of DST transitions, then snap back to the wall-clock date in Denver.
  return denverDayKey(
    new Date(denverMidnight(dayKey).getTime() + 36 * 3600 * 1000),
  );
}

async function findConflictingResidentBookings(
  serviceClient: SupabaseClient,
  nights: string[],
): Promise<
  | { kind: "success"; bookings: ConflictBooking[] }
  | { kind: "error"; message: string }
> {
  // Precompute per-night [start, end) instant ranges — DST-correct end via
  // next day's true Denver midnight rather than a fixed 24h offset.
  const nightRanges = nights.map((d) => ({
    start: denverMidnight(d).getTime(),
    end: denverMidnight(nextDayKey(d)).getTime(),
  }));

  // Union span for a single DB query.
  const rangeStart = new Date(Math.min(...nightRanges.map((r) => r.start)));
  const rangeEnd = new Date(Math.max(...nightRanges.map((r) => r.end)));

  const { data, error } = await serviceClient
    .from("bookings")
    .select("id, starts_at, ends_at")
    .lt("starts_at", rangeEnd.toISOString())
    .gt("ends_at", rangeStart.toISOString())
    .eq("concurrency", "resident")
    .in("status", ["pending_approval", "confirmed"]);

  if (error)
    return {
      kind: "error",
      message: `Conflict query failed: ${error.message}`,
    };

  // Post-filter: keep only rows that overlap at least one actual night.
  const bookings: ConflictBooking[] = (data ?? [])
    .filter((row) => {
      const bStart = new Date(row.starts_at as string).getTime();
      const bEnd = new Date(row.ends_at as string).getTime();
      return nightRanges.some((r) => bStart < r.end && bEnd > r.start);
    })
    .map((row) => ({
      id: row.id as string,
      startsAt: row.starts_at as string,
      endsAt: row.ends_at as string,
    }));

  return { kind: "success", bookings };
}

// ──────────────────────────────────────────────────────────────────────────────
// Core functions (no Next.js imports — testable via DI)
// ──────────────────────────────────────────────────────────────────────────────

export async function listOvernightNightsCore(
  deps: OvernightDeps,
): Promise<ListOvernightNightsResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const { data, error } = await deps.serviceClient
    .from("overnight_nights")
    .select("night")
    .order("night", { ascending: true });

  if (error) return { kind: "error", message: error.message };

  const nights = (data ?? []).map((row) => row.night as string);
  return { kind: "success", nights };
}

export async function setOvernightNightsBatchCore(
  deps: OvernightDeps,
  input: { nights: string[]; on: boolean },
): Promise<SetOvernightNightsResult> {
  const isAdmin = await assertActorIsAdmin(
    deps.serviceClient,
    deps.actorUserId,
  );
  if (!isAdmin) return { kind: "forbidden" };

  const parsed = batchInputSchema.safeParse(input);
  if (!parsed.success)
    return { kind: "validation_error", message: parsed.error.message };

  const { nights, on } = parsed.data;

  if (on) {
    // Adding availability is always safe — upsert, conflict target = night, do nothing.
    const rows = nights.map((night) => ({ night }));
    const { error } = await deps.serviceClient
      .from("overnight_nights")
      .upsert(rows, { onConflict: "night", ignoreDuplicates: true });

    if (error) return { kind: "error", message: error.message };
    return { kind: "success" };
  }

  // on = false: check for resident-booking conflicts first.
  const conflictResult = await findConflictingResidentBookings(
    deps.serviceClient,
    nights,
  );
  if (conflictResult.kind === "error") return conflictResult;

  if (conflictResult.bookings.length > 0) {
    // Refuse — do NOT delete anything and do NOT cancel any booking.
    return { kind: "conflict", bookings: conflictResult.bookings };
  }

  const { error } = await deps.serviceClient
    .from("overnight_nights")
    .delete()
    .in("night", nights);

  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

// ──────────────────────────────────────────────────────────────────────────────
// "use server" wrappers
// ──────────────────────────────────────────────────────────────────────────────

export async function listOvernightNights(): Promise<ListOvernightNightsResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  return listOvernightNightsCore({ serviceClient, actorUserId });
}

export async function setOvernightNightsBatch(input: {
  nights: string[];
  on: boolean;
}): Promise<SetOvernightNightsResult> {
  const actorUserId = await getActorOrRedirect();
  const serviceClient = createServiceClient();
  const result = await setOvernightNightsBatchCore(
    { serviceClient, actorUserId },
    input,
  );
  if (result.kind === "success") revalidatePath("/admin/availability");
  return result;
}
