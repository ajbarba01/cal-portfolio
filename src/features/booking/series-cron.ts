/**
 * Series-roll cron — the single horizon mechanism (DESIGN: Recurrence).
 *
 * Two jobs, run daily:
 *   1. PROMOTE — `pending_approval` bookings that pend ONLY because of the time
 *      horizon (distance auto + service not flagged) auto-confirm once their
 *      start crosses into the confirm horizon. This also covers far one-offs.
 *      A booking pending for distance/service reasons is left for Cal.
 *   2. EXTEND  — active series materialize their newly-in-horizon occurrences
 *      (open-ended series roll forward indefinitely; bounded ones stop at their
 *      count/until). A materialize insert that hits the exclusion constraint
 *      (23P01) is left unmaterialized and surfaced as a conflict, never dropped
 *      silently.
 *
 * Pure predicates (`shouldPromote`, `nextOccurrencesToMaterialize`) are
 * unit-testable without IO. `runSeriesRollCron` takes injected deps
 * (serviceClient, now), mirroring the completion/reminder crons.
 *
 * A promote is a status-only update on a row that ALREADY holds its slot (a
 * pending_approval booking participates in the no-overlap exclusion constraint),
 * so promotion cannot introduce a conflict — only EXTEND inserts can.
 *
 * SAFETY: never touches payment_status or any other projection column.
 */

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { haversineMiles } from "@/lib/haversine";
import { deriveApproval } from "@/features/pricing/distance";
import { quote } from "@/features/pricing/quote";
import type { QuoteInput } from "@/features/pricing/types";
import { transition } from "./state-machine";
import { expandOccurrences } from "./recurrence";
import { deriveTimeApproval } from "./time-gate";
import { createSupabaseBookingRepository } from "./booking-repository";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ──────────────────────────────────────────────────────────────────────────────
// Pure predicates
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns true iff a pending booking should be auto-promoted to confirmed:
 * it pends only because of the time horizon (`baseRequiresApproval` false — the
 * distance gate auto-approved and the service is not flagged) AND its start has
 * crossed into the auto-confirm horizon. A booking pending for distance/service
 * reasons is never auto-promoted — Cal approves those.
 */
export function shouldPromote(
  booking: { status: string; startsAt: Date; baseRequiresApproval: boolean },
  now: Date,
  autoConfirmHorizonDays: number,
): boolean {
  if (booking.status !== "pending_approval") return false;
  if (booking.baseRequiresApproval) return false;
  const daysAhead = (booking.startsAt.getTime() - now.getTime()) / MS_PER_DAY;
  return daysAhead <= autoConfirmHorizonDays;
}

/** The recurrence shape the cron needs to roll a series forward. */
export interface SeriesRule {
  templateStartsAt: Date;
  freq: "weekly";
  interval: number;
  count?: number;
  until?: Date;
  openEnded: boolean;
}

/**
 * Returns the occurrence starts that should be materialized now but are not yet
 * present, up to the generation horizon, respecting the series' own bound.
 * Already-materialized starts (by epoch ms) and starts at/in the past are
 * excluded. Epoch-ms instants in `skippedStarts` (a series' RFC 5545 EXDATE
 * set) are also excluded — used for occurrences whose slot was vacated by an
 * edit.
 */
export function nextOccurrencesToMaterialize(
  series: SeriesRule,
  existingStarts: number[],
  now: Date,
  generationHorizonDays: number,
  skippedStarts: number[] = [],
): Date[] {
  const excluded = new Set([...existingStarts, ...skippedStarts]);
  const materializeUntil = new Date(
    now.getTime() + generationHorizonDays * MS_PER_DAY,
  );
  const all = expandOccurrences(
    series.templateStartsAt,
    {
      freq: series.freq,
      interval: series.interval,
      count: series.count,
      until: series.until,
    },
    { materializeUntil },
  );
  return all.filter(
    (d) => !excluded.has(d.getTime()) && d.getTime() > now.getTime(),
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// DB row schema (promote query)
// ──────────────────────────────────────────────────────────────────────────────

const pendingRowSchema = z.object({
  id: z.string(),
  client_id: z.string(),
  starts_at: z.string(),
  distance_miles: z.number().nullable(),
  services: z.object({ requires_approval: z.boolean() }).nullable(),
});

// ──────────────────────────────────────────────────────────────────────────────
// Cron deps + core
// ──────────────────────────────────────────────────────────────────────────────

export interface SeriesRollCronDeps {
  serviceClient: SupabaseClient;
  now: Date;
}

export type SeriesRollCronResult =
  | { ok: true; promoted: number; materialized: number; conflicts: number }
  | { ok: false; error: string };

export async function runSeriesRollCron(
  deps: SeriesRollCronDeps,
): Promise<SeriesRollCronResult> {
  const { serviceClient, now } = deps;
  const repo = createSupabaseBookingRepository(serviceClient);

  const settings = await repo.getSettings();
  const milesCfg = {
    autoApproveMiles: settings.auto_approve_threshold_miles,
    hardCutoffMiles: settings.hard_cutoff_miles,
    useRoadMiles: settings.gate_use_road_miles,
    roadFactor: settings.road_factor,
  };
  const timeCfg = {
    autoConfirmHorizonDays: settings.auto_confirm_horizon_days,
    hardMaxAdvanceDays: settings.hard_max_advance_days,
  };
  const origin = { lat: settings.origin_lat, lng: settings.origin_lng };

  // A debtor's occurrences are never promoted or materialized (DESIGN: debt
  // gate). Cache the lookup per client across both passes.
  const debtByClient = new Map<string, boolean>();
  const hasDebt = async (clientId: string): Promise<boolean> => {
    const cached = debtByClient.get(clientId);
    if (cached !== undefined) return cached;
    const debt = (await repo.getOutstandingDebtCents(clientId)) > 0;
    debtByClient.set(clientId, debt);
    return debt;
  };

  // ── 1. PROMOTE ────────────────────────────────────────────────────────────
  const { data: pendingRows, error: pendingErr } = await serviceClient
    .from("bookings")
    .select(
      "id, client_id, starts_at, distance_miles, services(requires_approval)",
    )
    .eq("status", "pending_approval");

  if (pendingErr) {
    return {
      ok: false,
      error: `Failed to query pending: ${pendingErr.message}`,
    };
  }

  let promoted = 0;
  for (const raw of pendingRows ?? []) {
    const parsed = pendingRowSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(
        "series-roll: unexpected pending row",
        parsed.error.message,
      );
      continue;
    }
    const row = parsed.data;

    // Skip a debtor's occurrences until their balance is settled.
    if (await hasDebt(row.client_id)) continue;

    const baseRequiresApproval =
      row.distance_miles === null
        ? true
        : deriveApproval(row.distance_miles, milesCfg) === "manual" ||
          (row.services?.requires_approval ?? false);

    const promote = shouldPromote(
      {
        status: "pending_approval",
        startsAt: new Date(row.starts_at),
        baseRequiresApproval,
      },
      now,
      timeCfg.autoConfirmHorizonDays,
    );
    if (!promote) continue;

    const stat = transition("pending_approval", "approve", {
      requiresApproval: false,
    });
    if ("error" in stat) {
      console.error(
        `series-roll: promote transition error for ${row.id}: ${stat.error}`,
      );
      continue;
    }

    const { error: updateErr } = await serviceClient
      .from("bookings")
      .update({ status: stat.state })
      .eq("id", row.id);

    if (updateErr) {
      console.error(
        `series-roll: failed to promote ${row.id}: ${updateErr.message}`,
      );
    } else {
      promoted++;
    }
  }

  // ── 2. EXTEND ─────────────────────────────────────────────────────────────
  let materialized = 0;
  let conflicts = 0;

  const series = await repo.getActiveSeries();
  for (const s of series) {
    // Skip a debtor's series until their balance is settled.
    if (await hasDebt(s.client_id)) continue;

    const existing = await repo.getMaterializedOccurrenceStarts(s.id);
    const newStarts = nextOccurrencesToMaterialize(
      {
        templateStartsAt: new Date(s.template_starts_at),
        freq: s.freq,
        interval: s.step_interval,
        count: s.count ?? undefined,
        until: s.until ? new Date(s.until) : undefined,
        openEnded: s.open_ended,
      },
      existing,
      now,
      settings.recurrence_generation_horizon_days,
      s.skipped_starts.map((iso) => new Date(iso).getTime()),
    );
    if (newStarts.length === 0) continue;

    const [service, latLng] = await Promise.all([
      repo.getServiceById(s.service_id),
      repo.getProfileLatLng(s.client_id),
    ]);
    if (!service) {
      console.error(
        `series-roll: service ${s.service_id} missing for series ${s.id}`,
      );
      continue;
    }

    // Base approval (distance/service flag) — same for every occurrence of the
    // series; the time component is per-occurrence below.
    let distanceMiles: number | null = null;
    let baseRequiresApproval: boolean;
    if (latLng.lat === null || latLng.lng === null) {
      baseRequiresApproval = true;
    } else {
      distanceMiles = haversineMiles(origin, {
        lat: latLng.lat,
        lng: latLng.lng,
      });
      baseRequiresApproval =
        deriveApproval(distanceMiles, milesCfg) === "manual" ||
        service.requires_approval;
    }

    // Re-quote from the FROZEN series inputs → identical breakdown every time.
    let breakdown;
    try {
      breakdown = quote(s.quote_inputs as QuoteInput);
    } catch (e) {
      console.error(
        `series-roll: re-quote failed for series ${s.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
      continue;
    }

    const durationMs = s.duration_min * 60_000;
    for (const occStart of newStarts) {
      const timeDecision = deriveTimeApproval(occStart, now, timeCfg);
      if (timeDecision === "refuse") continue; // beyond hard cap — never materialize
      const requiresApproval =
        baseRequiresApproval || timeDecision === "pending";
      const stat = transition("draft", "submit", { requiresApproval });
      if ("error" in stat) {
        console.error(
          `series-roll: submit transition error for series ${s.id}: ${stat.error}`,
        );
        continue;
      }
      const occEnd = new Date(occStart.getTime() + durationMs);
      try {
        await repo.insertBookings([
          {
            client_id: s.client_id,
            service_id: s.service_id,
            starts_at: occStart.toISOString(),
            ends_at: occEnd.toISOString(),
            series_id: s.id,
            status: stat.state,
            concurrency: service.concurrency,
            distance_miles: distanceMiles,
            quote_inputs: s.quote_inputs,
            quote_breakdown: breakdown as unknown,
            final_cents: breakdown.finalCents,
            requires_approval: requiresApproval,
            discount_cents: 0,
          },
        ]);
        materialized++;
      } catch (e: unknown) {
        const code = (e as { code?: string }).code;
        if (code === "23P01") {
          conflicts++;
          console.error(
            `series-roll: occurrence ${occStart.toISOString()} for series ${s.id} conflicts; left unmaterialized for Cal`,
          );
        } else {
          throw e;
        }
      }
    }
  }

  return { ok: true, promoted, materialized, conflicts };
}
