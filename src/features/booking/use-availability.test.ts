/**
 * Unit tests for the two reads the client availability hooks wrap.
 *
 * WHY NOT TESTING THE HOOKS THEMSELVES
 * -------------------------------------
 * useAvailability and useOvernightNights require a live Supabase Realtime
 * channel (websocket). Vitest runs in a Node environment without browser or
 * realtime support, and mocking the channel lifecycle would test the mock. What
 * can regress silently is the query each hook issues — a dropped bound reads
 * the whole table and nothing fails — so the reads are separate functions and
 * the assertions below are on the arguments they hand Supabase.
 */

import { describe, it, expect } from "vitest";
import { createFakeSupabase } from "@/test-stubs/fake-supabase";
import { fetchOpenWindows } from "./use-availability";
import { fetchOvernightNights } from "./use-overnight-nights";

const NOW = new Date("2026-07-01T07:00:00Z");

describe("fetchOpenWindows", () => {
  it("asks only for windows that have not ended and start inside the horizon", async () => {
    const client = createFakeSupabase();

    await fetchOpenWindows(client, NOW, 90);

    expect(client.calls({ method: "gte" })).toEqual([
      {
        table: "availability_windows",
        method: "gte",
        args: ["ends_at", "2026-07-01T07:00:00.000Z"],
      },
    ]);
    expect(client.calls({ method: "lte" })).toEqual([
      {
        table: "availability_windows",
        method: "lte",
        args: ["starts_at", "2026-09-29T07:00:00.000Z"],
      },
    ]);
  });

  it("maps rows to instants", async () => {
    const client = createFakeSupabase({
      tables: {
        availability_windows: {
          data: [
            {
              starts_at: "2026-07-03T17:00:00Z",
              ends_at: "2026-07-03T21:00:00Z",
            },
          ],
          error: null,
        },
      },
    });

    const windows = await fetchOpenWindows(client, NOW, 90);

    expect(windows).toEqual([
      {
        startsAt: new Date("2026-07-03T17:00:00Z"),
        endsAt: new Date("2026-07-03T21:00:00Z"),
      },
    ]);
  });

  it("throws the read error rather than reporting an empty calendar", async () => {
    const client = createFakeSupabase({
      tables: {
        availability_windows: { data: null, error: { message: "no route" } },
      },
    });

    await expect(fetchOpenWindows(client, NOW, 90)).rejects.toThrow("no route");
  });
});

describe("fetchOvernightNights", () => {
  it("asks only for nights from the given day onward", async () => {
    const client = createFakeSupabase();

    await fetchOvernightNights(client, "2026-07-01");

    expect(client.calls({ method: "gte" })).toEqual([
      {
        table: "overnight_nights",
        method: "gte",
        args: ["night", "2026-07-01"],
      },
    ]);
  });

  it("collects the night keys into a set", async () => {
    const client = createFakeSupabase({
      tables: {
        overnight_nights: {
          data: [{ night: "2026-07-02" }, { night: "2026-07-03" }],
          error: null,
        },
      },
    });

    const nights = await fetchOvernightNights(client, "2026-07-01");

    expect(nights).toEqual(new Set(["2026-07-02", "2026-07-03"]));
  });

  it("throws the read error rather than reporting no overnight availability", async () => {
    const client = createFakeSupabase({
      tables: {
        overnight_nights: { data: null, error: { message: "no route" } },
      },
    });

    await expect(fetchOvernightNights(client, "2026-07-01")).rejects.toThrow(
      "no route",
    );
  });
});
