/**
 * The queries the Supabase booking repository actually issues.
 *
 * Row parsing is pinned next to the surfaces that break when it fails — the
 * calendars in busy-ranges.test.ts, the settings read in edit-booking.test.ts.
 * What is pinned here is the other half: every predicate that narrows a read or
 * a write. Dropping one is invisible against the real database (the query still
 * succeeds, it just answers about more rows than it should), and the hand-rolled
 * builder fakes these suites used to carry returned themselves from every filter
 * method and threw the arguments away, so a deleted `.in`, `.gte`, `.limit` or
 * `.neq` left the suite green.
 *
 * Each case therefore asserts the recorded call list, not just the result: an
 * added predicate has to be declared here, and a removed one fails.
 */

import { describe, it, expect, vi } from "vitest";

import { createFakeSupabase } from "@/test-stubs/fake-supabase";
import type {
  FakeResponse,
  FakeSupabaseClient,
} from "@/test-stubs/fake-supabase";
import { createSupabaseBookingRepository } from "./booking-repository";

/** The row ceiling the list reads share (booking-repository's MAX_LIST_ROWS). */
const MAX_LIST_ROWS = 2000;

const ACTIVE_STATUSES = ["pending_approval", "confirmed"];

function repoOver(tables: Record<string, FakeResponse | FakeResponse[]> = {}) {
  const client = createFakeSupabase({ tables });
  return { client, repo: createSupabaseBookingRepository(client) };
}

/**
 * The filters a table's chain applied, as `[method, ...args]` tuples. `select`
 * is dropped: which columns a read asks for is a separate contract, pinned by
 * the row schemas, and inlining the long projection strings here would bury the
 * predicates the case is about.
 */
function predicatesOn(client: FakeSupabaseClient, table: string): unknown[][] {
  return client
    .calls({ table })
    .filter((call) => call.method !== "select")
    .map((call) => [call.method, ...call.args]);
}

// ──────────────────────────────────────────────────────────────────────────────
// Busy ranges — the reads every overlap and drive-buffer guard is built on
// ──────────────────────────────────────────────────────────────────────────────

describe("getActiveBusyRanges", () => {
  const NOW = new Date("2026-07-01T15:00:00.000Z");

  it("reads only active, not-yet-ended bookings, nearest first, under the row cap", async () => {
    const { client, repo } = repoOver();

    await repo.getActiveBusyRanges(NOW, null);

    // Losing the status filter would let a cancelled booking block a slot;
    // losing the `gte` would drag the whole booking history into the guard.
    expect(predicatesOn(client, "bookings")).toEqual([
      ["in", "status", ACTIVE_STATUSES],
      ["gte", "ends_at", NOW.toISOString()],
      ["order", "starts_at", { ascending: true }],
      ["limit", MAX_LIST_ROWS],
    ]);
  });

  it("narrows to one concurrency class when the caller names one", async () => {
    const { client, repo } = repoOver();

    await repo.getActiveBusyRanges(NOW, "exclusive");

    expect(client.calls({ table: "bookings", method: "eq" })[0]?.args).toEqual([
      "concurrency",
      "exclusive",
    ]);
  });

  it("excludes the booking being edited from its own overlap check", async () => {
    const { client, repo } = repoOver();

    await repo.getActiveBusyRanges(NOW, null, "booking-1");

    // Without this the edit path finds the booking overlapping itself and
    // refuses every reschedule that keeps any part of the original window.
    expect(client.calls({ table: "bookings", method: "neq" })[0]?.args).toEqual(
      ["id", "booking-1"],
    );
  });

  it("excludes nothing when no booking id is given", async () => {
    const { client, repo } = repoOver();

    await repo.getActiveBusyRanges(NOW, null);

    expect(client.calls({ table: "bookings", method: "neq" })).toEqual([]);
  });

  it("reads the admin calendar with the same active-and-future window", async () => {
    const { client, repo } = repoOver();

    await repo.getActiveBusyRangesEnriched(NOW);

    expect(predicatesOn(client, "bookings")).toEqual([
      ["in", "status", ACTIVE_STATUSES],
      ["gte", "ends_at", NOW.toISOString()],
      ["order", "starts_at", { ascending: true }],
      ["limit", MAX_LIST_ROWS],
    ]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Availability reads
// ──────────────────────────────────────────────────────────────────────────────

describe("getOpenWindows", () => {
  it("keeps windows that have not ended yet, earliest first, under the row cap", async () => {
    const NOW = new Date("2026-07-01T15:00:00.000Z");
    const { client, repo } = repoOver();

    await repo.getOpenWindows(NOW);

    expect(predicatesOn(client, "availability_windows")).toEqual([
      ["gte", "ends_at", NOW.toISOString()],
      ["order", "starts_at", { ascending: true }],
      ["limit", MAX_LIST_ROWS],
    ]);
  });
});

describe("getOpenNights", () => {
  it("cuts at today in Denver, not today in UTC", async () => {
    // 22:00 on the 1st in Denver is already the 2nd in UTC. Comparing against
    // the UTC key would drop tonight — the night a late-evening visitor is most
    // likely to be booking.
    const { client, repo } = repoOver();

    await repo.getOpenNights(new Date("2026-07-02T04:00:00.000Z"));

    expect(predicatesOn(client, "overnight_nights")).toEqual([
      ["gte", "night", "2026-07-01"],
      ["order", "night", { ascending: true }],
      ["limit", MAX_LIST_ROWS],
    ]);
  });

  it("warns when a read comes back sitting exactly on the row cap", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const nights = Array.from({ length: MAX_LIST_ROWS }, (_, i) => ({
      night: `2026-07-${String((i % 28) + 1).padStart(2, "0")}`,
    }));
    const { repo } = repoOver({
      overnight_nights: { data: nights, error: null },
    });

    await repo.getOpenNights(new Date("2026-07-01T15:00:00.000Z"));

    expect(warned.mock.calls[0]?.[0]).toContain("getOpenNights");
    warned.mockRestore();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Ownership-scoped reads — a dropped scope leaks another client's rows
// ──────────────────────────────────────────────────────────────────────────────

describe("getPetsByIds", () => {
  it("scopes the read to the owner as well as the requested ids", async () => {
    const { client, repo } = repoOver();

    await repo.getPetsByIds("client-1", ["pet-1", "pet-2"]);

    // The id list arrives from the request body; without the owner filter a
    // client could attach someone else's pet to their booking.
    expect(predicatesOn(client, "pets")).toEqual([
      ["eq", "client_id", "client-1"],
      ["in", "id", ["pet-1", "pet-2"]],
    ]);
  });

  it("issues no query at all for an empty id list", async () => {
    const { client, repo } = repoOver();

    expect(await repo.getPetsByIds("client-1", [])).toEqual([]);
    expect(client._calls).toEqual([]);
  });
});

describe("getOutstandingDebtCents", () => {
  it("sums only this client's unsettled debits", async () => {
    const { client, repo } = repoOver({
      client_debits: {
        data: [{ amount_cents: 2500 }, { amount_cents: 1500 }],
        error: null,
      },
    });

    expect(await repo.getOutstandingDebtCents("client-1")).toBe(4000);
    // Losing the `is` would re-charge debts the client has already settled.
    expect(predicatesOn(client, "client_debits")).toEqual([
      ["eq", "client_id", "client-1"],
      ["is", "settled_at", null],
    ]);
  });
});

describe("hasActiveBookingForServiceSlug", () => {
  it("asks for one active booking of that service for that client", async () => {
    const { client, repo } = repoOver();

    expect(
      await repo.hasActiveBookingForServiceSlug("client-1", "meet-greet"),
    ).toBe(false);
    expect(predicatesOn(client, "bookings")).toEqual([
      ["eq", "client_id", "client-1"],
      ["eq", "services.slug", "meet-greet"],
      ["in", "status", ACTIVE_STATUSES],
      ["limit", 1],
    ]);
  });

  it("reports a match without needing the row to be parsed", async () => {
    const { repo } = repoOver({
      bookings: { data: [{ id: "b-1" }], error: null },
    });

    expect(
      await repo.hasActiveBookingForServiceSlug("client-1", "meet-greet"),
    ).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Service lookup
// ──────────────────────────────────────────────────────────────────────────────

describe("getServiceBySlug", () => {
  const serviceRow = {
    id: "svc-1",
    slug: "dog-walk",
    pricing_type: "walk",
    pricing_config: { perVisitCents: 2000 },
    concurrency: "exclusive",
    requires_approval: false,
    form_key: null,
  };

  it("requires the service to be active as well as matching the slug", async () => {
    const { client, repo } = repoOver({
      services: { data: serviceRow, error: null },
    });

    await repo.getServiceBySlug("dog-walk");

    // Cal deactivates a service to take it off the site; without this filter it
    // stays bookable by anyone who knows the URL.
    expect(predicatesOn(client, "services")).toEqual([
      ["eq", "slug", "dog-walk"],
      ["eq", "active", true],
      ["single"],
    ]);
  });

  it("returns null for a slug with no row rather than throwing", async () => {
    const { repo } = repoOver({
      services: { data: null, error: { code: "PGRST116", message: "no rows" } },
    });

    expect(await repo.getServiceBySlug("nope")).toBeNull();
  });

  it("throws on any other query failure", async () => {
    const { repo } = repoOver({
      services: {
        data: null,
        error: { code: "57014", message: "statement timeout" },
      },
    });

    await expect(repo.getServiceBySlug("dog-walk")).rejects.toThrow(
      /statement timeout/,
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Pet writes
// ──────────────────────────────────────────────────────────────────────────────

describe("booking_pets writes", () => {
  it("inserts one row per booking-and-pet pair", async () => {
    const { client, repo } = repoOver();

    await repo.insertBookingPets(["b-1", "b-2"], ["p-1", "p-2"]);

    expect(
      client.calls({ table: "booking_pets", method: "insert" })[0]?.args[0],
    ).toEqual([
      { booking_id: "b-1", pet_id: "p-1" },
      { booking_id: "b-1", pet_id: "p-2" },
      { booking_id: "b-2", pet_id: "p-1" },
      { booking_id: "b-2", pet_id: "p-2" },
    ]);
  });

  it("writes nothing when either side of the pairing is empty", async () => {
    const { client, repo } = repoOver();

    await repo.insertBookingPets([], ["p-1"]);
    await repo.insertBookingPets(["b-1"], []);

    expect(client._calls).toEqual([]);
  });

  it("clears one booking's pets before re-inserting them", async () => {
    const { client, repo } = repoOver();

    await repo.swapBookingPets("b-1", ["p-9"]);

    // The delete must be scoped to the booking: unscoped it would empty the
    // join table for every booking in the database.
    expect(predicatesOn(client, "booking_pets")).toEqual([
      ["delete"],
      ["eq", "booking_id", "b-1"],
      ["insert", [{ booking_id: "b-1", pet_id: "p-9" }]],
    ]);
  });

  it("clears the pets and stops when the edit leaves none", async () => {
    const { client, repo } = repoOver();

    await repo.swapBookingPets("b-1", []);

    expect(client.calls({ table: "booking_pets", method: "insert" })).toEqual(
      [],
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Series skips — a read-modify-write whose comparison has to survive the DB's
// timestamp notation
// ──────────────────────────────────────────────────────────────────────────────

describe("appendSeriesSkip", () => {
  const seriesReturning = (skipped: string[]) => ({
    booking_series: { data: { skipped_starts: skipped }, error: null },
  });

  it("appends the skipped start to the stored list", async () => {
    const { client, repo } = repoOver(
      seriesReturning(["2026-07-01T15:00:00.000Z"]),
    );

    await repo.appendSeriesSkip("series-1", "2026-07-08T15:00:00.000Z");

    expect(
      client.calls({ table: "booking_series", method: "update" })[0]?.args[0],
    ).toEqual({
      skipped_starts: ["2026-07-01T15:00:00.000Z", "2026-07-08T15:00:00.000Z"],
    });
  });

  it("does not re-add a start the DB already returns in +00:00 notation", async () => {
    // Postgres hands timestamptz back as "+00:00"; the caller always passes a
    // JS ".000Z" string. Comparing them as strings would append a duplicate on
    // every skip and grow the column without bound.
    const { client, repo } = repoOver(
      seriesReturning(["2026-07-08T15:00:00+00:00"]),
    );

    await repo.appendSeriesSkip("series-1", "2026-07-08T15:00:00.000Z");

    expect(
      client.calls({ table: "booking_series", method: "update" })[0]?.args[0],
    ).toEqual({ skipped_starts: ["2026-07-08T15:00:00+00:00"] });
  });

  it("scopes both halves of the read-modify-write to the series", async () => {
    const { client, repo } = repoOver(seriesReturning([]));

    await repo.appendSeriesSkip("series-1", "2026-07-08T15:00:00.000Z");

    expect(
      client.calls({ table: "booking_series", method: "eq" }),
    ).toHaveLength(2);
    for (const call of client.calls({
      table: "booking_series",
      method: "eq",
    })) {
      expect(call.args).toEqual(["id", "series-1"]);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Recurrence reads
// ──────────────────────────────────────────────────────────────────────────────

describe("getActiveSeries", () => {
  it("reads only active series, earliest template first, under the row cap", async () => {
    const { client, repo } = repoOver();

    await repo.getActiveSeries();

    expect(predicatesOn(client, "booking_series")).toEqual([
      ["eq", "active", true],
      ["order", "template_starts_at", { ascending: true }],
      ["limit", MAX_LIST_ROWS],
    ]);
  });
});

describe("getMaterializedOccurrenceStarts", () => {
  it("reads the starts already written for one series", async () => {
    const { client, repo } = repoOver({
      bookings: {
        data: [{ starts_at: "2026-07-08T15:00:00.000Z" }],
        error: null,
      },
    });

    expect(await repo.getMaterializedOccurrenceStarts("series-1")).toEqual([
      Date.parse("2026-07-08T15:00:00.000Z"),
    ]);
    expect(predicatesOn(client, "bookings")).toEqual([
      ["eq", "series_id", "series-1"],
    ]);
  });
});
