import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase } from "@/test-stubs/fake-supabase";
import type { FakeResponse } from "@/test-stubs/fake-supabase";
import type { BookingFormData } from "./booking-form-data";

// The settings/busy-range loader creates its own service client, so it is the
// one collaborator this suite stubs; everything else runs against the fake.
const { loadBookingFormData } = vi.hoisted(() => ({
  loadBookingFormData: vi.fn(),
}));
vi.mock("./booking-form-data", () => ({ loadBookingFormData }));

import { loadServiceBookingPage } from "./load-service-booking-page";

const FORM_DATA: BookingFormData = {
  rules: {
    bookingOpenMinute: 480,
    bookingCloseMinute: 1200,
    minLeadTimeHours: 12,
    hardMaxAdvanceDays: 180,
  },
  initialBusy: [],
  initialPremiumDays: [],
  driveBuffer: {
    origin: { lat: 39.7, lng: -104.9 },
    config: { roadFactor: 1.3, avgSpeedMph: 30, pct: 120 },
  },
};

const SERVICE_ROW = {
  id: "service-1",
  slug: "walk",
  name: "Dog Walk",
  description: "A walk",
  pricing_type: "walk",
  pricing_config: {
    modifiers: [],
    constraints: { intervalMin: 30, allowedSpecies: ["dog"] },
  },
  default_duration_min: 30,
};

/** The `services` reads, in the order the loader opens them: detail, then siblings. */
function services(detail: FakeResponse): FakeResponse[] {
  return [detail, { data: [], error: null }];
}

function approvedProfile(): FakeResponse {
  return {
    data: { onboarding_status: "approved", lat: 39.75, lng: -105.0 },
    error: null,
  };
}

beforeEach(() => {
  loadBookingFormData.mockResolvedValue({ ok: true, data: FORM_DATA });
});

describe("loadServiceBookingPage", () => {
  it("reads only the active service with that slug", async () => {
    const client = createFakeSupabase({
      tables: { services: services({ data: SERVICE_ROW, error: null }) },
    });

    await loadServiceBookingPage(client, "walk", Promise.resolve(null));

    expect(client._queries[0]?._calls.map((c) => c.args)).toEqual(
      expect.arrayContaining([
        ["slug", "walk"],
        ["active", true],
      ]),
    );
  });

  it("distinguishes a failed service read from a service that does not exist", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = createFakeSupabase({
      tables: {
        services: services({ data: null, error: { message: "conn reset" } }),
      },
    });
    const missing = createFakeSupabase({
      tables: { services: services({ data: null, error: null }) },
    });

    expect(
      await loadServiceBookingPage(failed, "walk", Promise.resolve(null)),
    ).toEqual({ ok: false, reason: "unavailable" });
    expect(
      await loadServiceBookingPage(missing, "walk", Promise.resolve(null)),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("reports booking settings that will not load as unavailable", async () => {
    loadBookingFormData.mockResolvedValue({ ok: false });
    const client = createFakeSupabase({
      tables: { services: services({ data: SERVICE_ROW, error: null }) },
    });

    expect(
      await loadServiceBookingPage(client, "walk", Promise.resolve(null)),
    ).toEqual({ ok: false, reason: "unavailable" });
  });

  it("leaves a signed-out viewer a guest and reads nothing about them", async () => {
    const client = createFakeSupabase({
      tables: { services: services({ data: SERVICE_ROW, error: null }) },
    });

    const result = await loadServiceBookingPage(
      client,
      "walk",
      Promise.resolve(null),
    );

    expect(result.ok && result.data.viewer).toEqual({
      authState: "guest",
      pets: [],
      myBookingDayKeys: [],
      formResponses: {},
      acceptedAuthVersion: null,
      acceptedAuthAt: null,
      driveBufferMin: 0,
    });
    expect(client.calls({ table: "profiles" })).toEqual([]);
  });

  it("holds a viewer who has not finished onboarding back from their pets and forms", async () => {
    const client = createFakeSupabase({
      tables: {
        services: services({ data: SERVICE_ROW, error: null }),
        profiles: {
          data: { onboarding_status: "info_pending", lat: null, lng: null },
          error: null,
        },
      },
    });

    const result = await loadServiceBookingPage(
      client,
      "walk",
      Promise.resolve("client-1"),
    );

    expect(result.ok && result.data.viewer.authState).toBe("needs-info");
    expect(client.calls({ table: "pets" })).toEqual([]);
    expect(client.calls({ table: "form_responses" })).toEqual([]);
  });

  it("signs an approved viewer's pet photos in one batched request", async () => {
    const client = createFakeSupabase({
      tables: {
        services: services({ data: SERVICE_ROW, error: null }),
        profiles: approvedProfile(),
        pets: {
          data: [
            {
              id: "pet-1",
              name: "Rex",
              species: "dog",
              breed: null,
              notes: null,
              birthdate: null,
              photo_url: "client-1/rex.jpg",
            },
          ],
          error: null,
        },
      },
    });

    const result = await loadServiceBookingPage(
      client,
      "walk",
      Promise.resolve("client-1"),
    );

    expect(result.ok && result.data.viewer.pets).toEqual([
      {
        id: "pet-1",
        name: "Rex",
        species: "dog",
        breed: null,
        notes: null,
        photoUrl: "https://signed.test/client-1/rex.jpg",
      },
    ]);
    expect(client.calls({ method: "createSignedUrls" })).toHaveLength(1);
    expect(client.calls({ method: "createSignedUrl" })).toEqual([]);
  });

  it("keys pet-scoped form responses by form key and pet, account-scoped by key alone", async () => {
    const client = createFakeSupabase({
      tables: {
        services: services({ data: SERVICE_ROW, error: null }),
        profiles: approvedProfile(),
        form_responses: {
          data: [
            {
              id: "response-1",
              form_key: "owner",
              pet_id: null,
              data: { phone: "555" },
              submitted_at: "2026-01-01T00:00:00Z",
            },
            {
              id: "response-2",
              form_key: "pet_walk",
              pet_id: "pet-1",
              data: { leash: "front-clip" },
              submitted_at: null,
            },
            // Pet-scoped row with no pet: the write path forbids it, and an
            // impossible row must not shadow the real one.
            {
              id: "response-3",
              form_key: "pet_walk",
              pet_id: null,
              data: { leash: "impossible" },
              submitted_at: "2026-01-01T00:00:00Z",
            },
          ],
          error: null,
        },
      },
    });

    const result = await loadServiceBookingPage(
      client,
      "walk",
      Promise.resolve("client-1"),
    );

    expect(result.ok && result.data.viewer.formResponses).toEqual({
      owner: { data: { phone: "555" }, submittedAt: "2026-01-01T00:00:00Z" },
      "pet_walk:pet-1": { data: { leash: "front-clip" }, submittedAt: null },
    });
  });

  it("marks the days this viewer already has an active booking on this service", async () => {
    const client = createFakeSupabase({
      tables: {
        services: services({ data: SERVICE_ROW, error: null }),
        profiles: approvedProfile(),
        // Denver is UTC-7 in July, so this instant is still 2026-07-03 locally.
        bookings: {
          data: [{ starts_at: "2026-07-04T02:00:00Z" }],
          error: null,
        },
      },
    });

    const result = await loadServiceBookingPage(
      client,
      "walk",
      Promise.resolve("client-1"),
    );

    expect(result.ok && result.data.viewer.myBookingDayKeys).toEqual([
      "2026-07-03",
    ]);
    expect(client.calls({ table: "bookings", method: "eq" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ args: ["service_id", "service-1"] }),
      ]),
    );
  });

  it("derives the viewer's drive buffer from the settings the form loader already read", async () => {
    const client = createFakeSupabase({
      tables: {
        services: services({ data: SERVICE_ROW, error: null }),
        profiles: approvedProfile(),
      },
    });

    const result = await loadServiceBookingPage(
      client,
      "walk",
      Promise.resolve("client-1"),
    );

    expect(result.ok && result.data.viewer.driveBufferMin).toBeGreaterThan(0);
    // The buffer must not cost a second settings round trip.
    expect(client.calls({ table: "settings" })).toEqual([]);
  });
});
