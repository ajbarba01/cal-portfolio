import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  shouldPromote,
  nextOccurrencesToMaterialize,
  runSeriesRollCron,
} from "./series-cron";
import type { SeriesRule } from "./series-cron";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ──────────────────────────────────────────────────────────────────────────────
// Pure: shouldPromote
// ──────────────────────────────────────────────────────────────────────────────

describe("shouldPromote", () => {
  const now = new Date("2026-06-03T12:00:00Z");
  const horizon = 30;

  function at(days: number): Date {
    return new Date(now.getTime() + days * MS_PER_DAY);
  }

  it("promotes a time-only pending booking now inside the horizon", () => {
    expect(
      shouldPromote(
        {
          status: "pending_approval",
          startsAt: at(20),
          baseRequiresApproval: false,
        },
        now,
        horizon,
      ),
    ).toBe(true);
  });

  it("promotes at exactly the horizon boundary (inclusive)", () => {
    expect(
      shouldPromote(
        {
          status: "pending_approval",
          startsAt: at(30),
          baseRequiresApproval: false,
        },
        now,
        horizon,
      ),
    ).toBe(true);
  });

  it("does NOT promote while still beyond the horizon", () => {
    expect(
      shouldPromote(
        {
          status: "pending_approval",
          startsAt: at(31),
          baseRequiresApproval: false,
        },
        now,
        horizon,
      ),
    ).toBe(false);
  });

  it("does NOT promote a distance/service-flagged pending (Cal must decide)", () => {
    expect(
      shouldPromote(
        {
          status: "pending_approval",
          startsAt: at(10),
          baseRequiresApproval: true,
        },
        now,
        horizon,
      ),
    ).toBe(false);
  });

  it("ignores non-pending statuses", () => {
    expect(
      shouldPromote(
        { status: "confirmed", startsAt: at(10), baseRequiresApproval: false },
        now,
        horizon,
      ),
    ).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Pure: nextOccurrencesToMaterialize
// ──────────────────────────────────────────────────────────────────────────────

describe("nextOccurrencesToMaterialize", () => {
  const now = new Date("2026-06-03T12:00:00Z");
  const template = new Date("2026-06-04T15:00:00Z"); // 1 day out

  const openSeries: SeriesRule = {
    templateStartsAt: template,
    freq: "weekly",
    interval: 1,
    openEnded: true,
  };

  it("returns weekly occurrences up to the generation horizon", () => {
    const result = nextOccurrencesToMaterialize(openSeries, [], now, 42);
    // template at day+1, then +7 each: day 1,8,15,22,29,36 ≤ 43 (now+42) → 6
    expect(result.length).toBe(6);
  });

  it("skips already-materialized starts", () => {
    const all = nextOccurrencesToMaterialize(openSeries, [], now, 42);
    const existing = [all[0].getTime(), all[1].getTime()];
    const result = nextOccurrencesToMaterialize(openSeries, existing, now, 42);
    expect(result.length).toBe(all.length - 2);
    expect(result.some((d) => existing.includes(d.getTime()))).toBe(false);
  });

  it("excludes occurrences at or before now", () => {
    // now is AFTER the template start → that first occurrence is in the past.
    const laterNow = new Date(template.getTime() + 2 * MS_PER_DAY);
    const result = nextOccurrencesToMaterialize(openSeries, [], laterNow, 42);
    expect(result.every((d) => d.getTime() > laterNow.getTime())).toBe(true);
  });

  it("respects a bounded count", () => {
    const bounded: SeriesRule = { ...openSeries, count: 2, openEnded: false };
    const result = nextOccurrencesToMaterialize(bounded, [], now, 365);
    expect(result.length).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Integration: runSeriesRollCron
// ──────────────────────────────────────────────────────────────────────────────

const url = process.env.SUPABASE_TEST_URL!;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!;

if (!url || !serviceKey) {
  throw new Error("Missing SUPABASE_TEST_* env vars — is .env.test present?");
}

const serviceClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_PASS = "Test1234!";
const ts = Date.now();

// Near origin (~5 mi N of Boulder seed origin) → distance auto-approves.
const NEAR_LAT = 40.087;
const NEAR_LNG = -105.27;

let nearUserId: string;
let blockerUserId: string;
let walkServiceId: string;
let walkConcurrency: string;
const createdSeriesIds: string[] = [];

/** Frozen quote_inputs for a walk (matches seed config). */
const FROZEN_WALK_QUOTE_INPUT = {
  pricingType: "walk",
  pricingConfig: {
    rate_cents_per_hour: 2500,
    per_dog_cents: 1000,
    kiche_discount_pct: 25,
  },
  hours: 1,
  dogs: 1,
  recurringDiscountApplies: false,
  recurringDiscountPct: 10,
  applyKiche: false,
  roundTripDriveMinutes: 0,
};

async function createUser(
  email: string,
  lat: number,
  lng: number,
): Promise<string> {
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password: TEST_PASS,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(`createUser failed: ${error?.message}`);
  const userId = data.user.id;
  const { error: pErr } = await serviceClient
    .from("profiles")
    .update({ lat, lng })
    .eq("id", userId);
  if (pErr) throw new Error(`profile update failed: ${pErr.message}`);
  return userId;
}

beforeAll(async () => {
  const { data: svc, error } = await serviceClient
    .from("services")
    .select("id, concurrency")
    .eq("slug", "walk")
    .single();
  if (error || !svc)
    throw new Error(`walk service not found: ${error?.message}`);
  walkServiceId = svc.id;
  walkConcurrency = svc.concurrency;

  [nearUserId, blockerUserId] = await Promise.all([
    createUser(`series-near-${ts}@example.invalid`, NEAR_LAT, NEAR_LNG),
    createUser(`series-blocker-${ts}@example.invalid`, NEAR_LAT, NEAR_LNG),
  ]);
});

afterAll(async () => {
  const ids = [nearUserId, blockerUserId].filter(Boolean);
  await serviceClient.from("bookings").delete().in("client_id", ids);
  if (createdSeriesIds.length > 0) {
    await serviceClient
      .from("booking_series")
      .delete()
      .in("id", createdSeriesIds);
  }
  for (const id of ids) {
    await serviceClient.auth.admin.deleteUser(id);
  }
});

/** Insert a pending_approval booking directly (bypasses the service for setup). */
async function insertPending(opts: {
  startsAt: Date;
  durationMs?: number;
  distanceMiles: number | null;
}): Promise<string> {
  const end = new Date(
    opts.startsAt.getTime() + (opts.durationMs ?? 60 * 60 * 1000),
  );
  const { data, error } = await serviceClient
    .from("bookings")
    .insert({
      client_id: nearUserId,
      service_id: walkServiceId,
      starts_at: opts.startsAt.toISOString(),
      ends_at: end.toISOString(),
      status: "pending_approval",
      concurrency: walkConcurrency,
      distance_miles: opts.distanceMiles,
      requires_approval: true,
      final_cents: 2500,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(`insertPending failed: ${error?.message}`);
  return data.id as string;
}

describe("runSeriesRollCron — promote", () => {
  it("promotes a time-only pending booking now inside the horizon, leaves a distance-manual one pending", async () => {
    const now = new Date();
    // 10 days out at an odd minute to avoid colliding with other suites.
    const nearStart = new Date(now.getTime() + 10 * MS_PER_DAY);
    nearStart.setUTCHours(14, 23, 0, 0);
    const manualStart = new Date(now.getTime() + 11 * MS_PER_DAY);
    manualStart.setUTCHours(14, 23, 0, 0);

    const autoId = await insertPending({
      startsAt: nearStart,
      distanceMiles: 5,
    }); // auto distance
    const manualId = await insertPending({
      startsAt: manualStart,
      distanceMiles: 40,
    }); // manual distance

    const result = await runSeriesRollCron({ serviceClient, now });
    expect(result.ok).toBe(true);

    const { data: autoRow } = await serviceClient
      .from("bookings")
      .select("status")
      .eq("id", autoId)
      .single();
    expect(autoRow?.status).toBe("confirmed");

    const { data: manualRow } = await serviceClient
      .from("bookings")
      .select("status")
      .eq("id", manualId)
      .single();
    expect(manualRow?.status).toBe("pending_approval");
  });
});

describe("runSeriesRollCron — extend", () => {
  it("materializes an open-ended series' in-horizon occurrences and leaves a conflicting slot unmaterialized", async () => {
    const now = new Date();
    // Template 9 days out at an odd minute.
    const template = new Date(now.getTime() + 9 * MS_PER_DAY);
    template.setUTCHours(16, 41, 0, 0);

    // Open-ended weekly series (no count/until).
    const { data: seriesRow, error: sErr } = await serviceClient
      .from("booking_series")
      .insert({
        client_id: nearUserId,
        service_id: walkServiceId,
        freq: "weekly",
        step_interval: 1,
        open_ended: true,
        template_starts_at: template.toISOString(),
        duration_min: 60,
        quote_inputs: FROZEN_WALK_QUOTE_INPUT,
      })
      .select("id")
      .single();
    if (sErr || !seriesRow)
      throw new Error(`series insert failed: ${sErr?.message}`);
    const seriesId = seriesRow.id as string;
    createdSeriesIds.push(seriesId);

    // Manufacture a conflict at the SECOND occurrence (template + 7d): a confirmed
    // exclusive booking owned by a different user overlapping that slot.
    const conflictStart = new Date(template.getTime() + 7 * MS_PER_DAY);
    const conflictEnd = new Date(conflictStart.getTime() + 60 * 60 * 1000);
    const { error: blockErr } = await serviceClient.from("bookings").insert({
      client_id: blockerUserId,
      service_id: walkServiceId,
      starts_at: conflictStart.toISOString(),
      ends_at: conflictEnd.toISOString(),
      status: "confirmed",
      concurrency: walkConcurrency,
      distance_miles: 5,
      requires_approval: false,
      final_cents: 2500,
    });
    if (blockErr) throw new Error(`blocker insert failed: ${blockErr.message}`);

    const result = await runSeriesRollCron({ serviceClient, now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.conflicts).toBeGreaterThanOrEqual(1);

    // The series materialized at least the first occurrence (template).
    const { data: rows } = await serviceClient
      .from("bookings")
      .select("starts_at")
      .eq("series_id", seriesId);
    const starts = (rows ?? []).map((r) => new Date(r.starts_at).getTime());
    expect(starts).toContain(template.getTime());

    // The conflicting slot was NOT materialized into the series.
    expect(starts).not.toContain(conflictStart.getTime());
  });
});
