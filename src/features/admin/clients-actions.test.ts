/**
 * Unit tests for setOnboardingStatusCore and getClientDetailCore.
 *
 * setOnboardingStatusCore keeps its hand-rolled builder (it only asserts one
 * update payload); getClientDetailCore uses the recording double, which is the
 * only way to assert the columns and predicates its six reads actually send.
 * assertActorIsAdmin is vi.mock'd to control admin/non-admin without a real DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import type { DbClient } from "@/lib/supabase/db-client";
import {
  getClientDetailCore,
  setOnboardingStatusCore,
} from "./clients-actions";
import {
  createFakeSupabase,
  type FakeResponse,
} from "@/test-stubs/fake-supabase";

// ──────────────────────────────────────────────────────────────────────────────
// Mock assertActorIsAdmin
// ──────────────────────────────────────────────────────────────────────────────

const mockAssertActorIsAdmin = vi.fn<() => Promise<boolean>>();

vi.mock("@/lib/admin-guard", () => ({
  assertActorIsAdmin: () => mockAssertActorIsAdmin(),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Fake Supabase builder
// ──────────────────────────────────────────────────────────────────────────────

function makeFakeClient(updateResult: { error: unknown }) {
  const calls: { method: string; args: unknown[] }[] = [];

  const makeBuilder = () => {
    let capturedPayload: unknown = undefined;

    const builder: Record<string, unknown> = {};

    builder.update = (payload: unknown) => {
      calls.push({ method: "update", args: [payload] });
      capturedPayload = payload;
      return builder;
    };
    builder.eq = () => builder;
    builder.then = (
      resolve: (v: { data: unknown; error: unknown }) => void,
    ) => {
      void capturedPayload; // accessed to avoid lint warning
      resolve({ data: null, error: updateResult.error });
      return Promise.resolve({ data: null, error: updateResult.error });
    };

    return builder;
  };

  const client = {
    from: () => makeBuilder(),
    _calls: calls,
  };

  return client as unknown as DbClient & {
    _calls: typeof calls;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const ADMIN_ID = "a0000000-0000-4000-8000-000000000001";
const NON_ADMIN_ID = "a0000000-0000-4000-8000-000000000002";
const VALID_CLIENT_ID = "a0000000-0000-4000-8000-000000000003";
const INVALID_CLIENT_ID = "not-a-uuid";

beforeEach(() => {
  vi.clearAllMocks();
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. Non-admin guard
// ──────────────────────────────────────────────────────────────────────────────

describe("setOnboardingStatusCore — non-admin guard", () => {
  it("returns forbidden for non-admin actor", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(false);
    const client = makeFakeClient({ error: null });
    const result = await setOnboardingStatusCore(
      { serviceClient: client, actorUserId: NON_ADMIN_ID },
      VALID_CLIENT_ID,
      "approved",
    );
    expect(result.kind).toBe("forbidden");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Success paths
// ──────────────────────────────────────────────────────────────────────────────

describe("setOnboardingStatusCore — success paths", () => {
  it("admin sets approved — returns success and passes correct payload", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
    const client = makeFakeClient({ error: null });
    const result = await setOnboardingStatusCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      VALID_CLIENT_ID,
      "approved",
    );
    expect(result.kind).toBe("success");
    const updateCall = client._calls.find((c) => c.method === "update");
    expect(updateCall).toBeDefined();
    expect(updateCall?.args[0]).toEqual({ onboarding_status: "approved" });
  });

  it("admin sets declined — returns success (override direction allowed)", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
    const client = makeFakeClient({ error: null });
    const result = await setOnboardingStatusCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      VALID_CLIENT_ID,
      "declined",
    );
    expect(result.kind).toBe("success");
    const updateCall = client._calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toEqual({ onboarding_status: "declined" });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Validation errors
// ──────────────────────────────────────────────────────────────────────────────

describe("setOnboardingStatusCore — validation errors", () => {
  it("returns validation_error for invalid status string", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
    const client = makeFakeClient({ error: null });
    const result = await setOnboardingStatusCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      VALID_CLIENT_ID,
      "not_a_real_status",
    );
    expect(result.kind).toBe("validation_error");
  });

  it("returns validation_error for invalid clientId (not a uuid)", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
    const client = makeFakeClient({ error: null });
    const result = await setOnboardingStatusCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      INVALID_CLIENT_ID,
      "approved",
    );
    expect(result.kind).toBe("validation_error");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. getClientDetailCore
// ──────────────────────────────────────────────────────────────────────────────

const PROFILE_ROW = {
  id: VALID_CLIENT_ID,
  full_name: "Rae Mercer",
  email: "rae@test.com",
  phone: null,
  address: null,
  zip: null,
  avatar_url: null,
  onboarding_status: "approved",
  unclaimed: false,
  invited_at: null,
  claimed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  role: "client",
};

const FUTURE_ISO = "2999-01-01T17:00:00Z";

/** Builds the detail double; every table defaults to an empty successful read. */
function makeDetailClient(tables: Record<string, FakeResponse> = {}) {
  return createFakeSupabase({
    tables: {
      profiles: { data: PROFILE_ROW, error: null },
      pets: { data: [], error: null },
      form_responses: { data: [], error: null },
      bookings: { data: [], error: null },
      payments: { data: [], error: null },
      client_debits: { data: [], error: null },
      ...tables,
    },
  });
}

describe("getClientDetailCore — guards", () => {
  it("returns forbidden for a non-admin actor", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(false);
    const client = makeDetailClient();
    const result = await getClientDetailCore(
      { serviceClient: client, actorUserId: NON_ADMIN_ID },
      VALID_CLIENT_ID,
    );
    expect(result.kind).toBe("forbidden");
    expect(client._calls).toHaveLength(0);
  });

  it("returns not_found when the profile read fails", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
    const client = makeDetailClient({
      profiles: { data: null, error: { message: "boom" } },
    });
    const result = await getClientDetailCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      VALID_CLIENT_ID,
    );
    expect(result.kind).toBe("not_found");
  });
});

describe("getClientDetailCore — failed reads", () => {
  beforeEach(() => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("fails the whole read when debits cannot be loaded", async () => {
    const client = makeDetailClient({
      client_debits: { data: null, error: { message: "debits down" } },
    });
    const result = await getClientDetailCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      VALID_CLIENT_ID,
    );
    // An empty debit list renders as a settled-up client — never show that on a guess.
    expect(result.kind).toBe("error");
  });

  it("logs a failed forms read instead of rendering it as none on file", async () => {
    const client = makeDetailClient({
      form_responses: { data: null, error: { message: "forms down" } },
    });
    const result = await getClientDetailCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      VALID_CLIENT_ID,
    );
    expect(result.kind).toBe("success");
    expect(console.error).toHaveBeenCalled();
  });
});

describe("getClientDetailCore — reads", () => {
  beforeEach(() => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
  });

  it("loads pets through the shared repository: birthdate kept, photos signed in one call", async () => {
    const client = makeDetailClient({
      pets: {
        data: [
          {
            id: "pet-1",
            name: "Biscuit",
            species: "dog",
            breed: null,
            notes: null,
            birthdate: "2020-05-05",
            photo_url: "client/pet-1/photo.jpg",
          },
          {
            id: "pet-2",
            name: "Nutmeg",
            species: "cat",
            breed: null,
            notes: null,
            birthdate: null,
            photo_url: "client/pet-2/photo.jpg",
          },
        ],
        error: null,
      },
    });

    const result = await getClientDetailCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      VALID_CLIENT_ID,
    );

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.client.pets[0]?.birthdate).toBe("2020-05-05");
    expect(result.client.pets[0]?.photoUrl).toContain("client/pet-1/photo.jpg");
    // Two pets, one signing round trip — not one per pet.
    expect(client.calls({ method: "createSignedUrls" })).toHaveLength(1);
    expect(client.calls({ method: "createSignedUrl" })).toHaveLength(0);
  });

  it("drops form rows whose key the registry no longer knows", async () => {
    const client = makeDetailClient({
      form_responses: {
        data: [
          {
            id: "form-1",
            form_key: "owner",
            pet_id: null,
            booking_id: null,
            data: {},
            submitted_at: "2026-01-02T00:00:00Z",
          },
          {
            id: "form-2",
            form_key: "home",
            pet_id: null,
            booking_id: null,
            data: {},
            submitted_at: "2026-01-01T00:00:00Z",
          },
        ],
        error: null,
      },
    });

    const result = await getClientDetailCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      VALID_CLIENT_ID,
    );

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    // The legacy `home` row has no schema to render, so the count must not see it.
    expect(result.client.forms.map((form) => form.form_key)).toEqual(["owner"]);
  });

  it("detects an upcoming meet and greet by slug after the service is renamed", async () => {
    const client = makeDetailClient({
      bookings: {
        data: [
          {
            id: "booking-1",
            status: "pending_approval",
            starts_at: FUTURE_ISO,
            ends_at: FUTURE_ISO,
            final_cents: 0,
            payment_status: "unpaid",
            services: { name: "Intro visit", slug: "meet-greet" },
          },
        ],
        error: null,
      },
    });

    const result = await getClientDetailCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      VALID_CLIENT_ID,
    );

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.client.meetGreetUpcoming).toBe(true);
    expect(result.client.bookings[0]?.service_slug).toBe("meet-greet");
    const bookingSelect = client.calls({ table: "bookings", method: "select" });
    expect(String(bookingSelect[0]?.args[0])).toContain("slug");
  });

  it("totals every payment row of a booking into its refunded amount", async () => {
    const client = makeDetailClient({
      bookings: {
        data: [
          {
            id: "booking-1",
            status: "completed",
            starts_at: "2026-02-01T17:00:00Z",
            ends_at: "2026-02-01T18:00:00Z",
            final_cents: 20000,
            payment_status: "partially_refunded",
            services: { name: "House Sitting", slug: "house-sitting" },
          },
        ],
        error: null,
      },
      payments: {
        data: [
          {
            booking_id: "booking-1",
            stripe_payment_intent_id: "pi_2",
            status: "succeeded",
            refunded_cents: 4000,
            disputed_at: null,
            dispute_status: null,
          },
          {
            booking_id: "booking-1",
            stripe_payment_intent_id: "pi_1",
            status: "succeeded",
            refunded_cents: 6000,
            disputed_at: null,
            dispute_status: null,
          },
        ],
        error: null,
      },
    });

    const result = await getClientDetailCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      VALID_CLIENT_ID,
    );

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.client.bookings[0]?.refunded_cents).toBe(10000);
    expect(result.client.bookings[0]?.payment_intent_id).toBe("pi_2");
  });

  it("skips the payments read when the client has no bookings", async () => {
    const client = makeDetailClient();
    await getClientDetailCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      VALID_CLIENT_ID,
    );
    expect(client.calls({ table: "payments" })).toHaveLength(0);
  });
});
