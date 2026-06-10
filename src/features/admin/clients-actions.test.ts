/**
 * Unit tests for setOnboardingStatusCore.
 *
 * Uses the same hand-rolled fake Supabase client pattern as overnight-actions.test.ts.
 * assertActorIsAdmin is vi.mock'd to control admin/non-admin without a real DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { setOnboardingStatusCore } from "./clients-actions";

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

  return client as unknown as import("@supabase/supabase-js").SupabaseClient & {
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
