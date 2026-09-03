import { describe, it, expect, vi } from "vitest";
import {
  createUnclaimedClientCore,
  generateClaimLinkCore,
} from "./create-client-actions";

/** Boulder origin with the shipped defaults, as the service-area gate reads them. */
const SETTINGS = {
  origin_lat: 40.015,
  origin_lng: -105.27,
  auto_approve_threshold_miles: 8,
  hard_cutoff_miles: 50,
  gate_use_road_miles: false,
  road_factor: 1.3,
};

// Minimal fake Supabase admin client. Only the methods the core touches.
function makeDeps(opts: {
  isAdmin?: boolean;
  createUserError?: { message: string; status?: number } | null;
  createdUserId?: string;
  existingClientId?: string | null;
}) {
  const {
    isAdmin = true,
    createUserError = null,
    createdUserId = "11111111-1111-1111-1111-111111111111",
    existingClientId = null,
  } = opts;

  const profileUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  const serviceClient = {
    // assertActorIsAdmin reads profiles(role); emulate via from().select().eq().single()
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { role: isAdmin ? "admin" : "client" },
                error: null,
              }),
              // collision lookup: find existing profile by email
              maybeSingle: vi.fn().mockResolvedValue({
                data: existingClientId ? { id: existingClientId } : null,
                error: null,
              }),
            })),
          })),
          update: profileUpdate,
        };
      }
      // The service-area gate reads its thresholds from `settings`.
      if (table === "settings") {
        return {
          select: vi.fn(() => ({
            limit: vi.fn(() => ({
              single: vi
                .fn()
                .mockResolvedValue({ data: SETTINGS, error: null }),
            })),
          })),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
    auth: {
      admin: {
        createUser: vi
          .fn()
          .mockResolvedValue(
            createUserError
              ? { data: { user: null }, error: createUserError }
              : { data: { user: { id: createdUserId } }, error: null },
          ),
      },
    },
  } as unknown as Parameters<
    typeof createUnclaimedClientCore
  >[0]["serviceClient"];

  return { serviceClient, profileUpdate };
}

const validInput = {
  email: "new@client.test",
  fullName: "New Client",
  onboardingStatus: "approved" as const,
};

describe("createUnclaimedClientCore", () => {
  it("returns forbidden for a non-admin actor", async () => {
    const { serviceClient } = makeDeps({ isAdmin: false });
    const r = await createUnclaimedClientCore(
      { serviceClient, actorUserId: "actor" },
      validInput,
    );
    expect(r.kind).toBe("forbidden");
  });

  it("rejects an invalid email", async () => {
    const { serviceClient } = makeDeps({});
    const r = await createUnclaimedClientCore(
      { serviceClient, actorUserId: "actor" },
      { ...validInput, email: "not-an-email" },
    );
    expect(r.kind).toBe("validation_error");
  });

  it("maps a duplicate-email auth error to email_exists with the existing id", async () => {
    const { serviceClient } = makeDeps({
      createUserError: {
        message: "A user with this email address has already been registered",
        status: 422,
      },
      existingClientId: "existing-id",
    });
    const r = await createUnclaimedClientCore(
      { serviceClient, actorUserId: "actor" },
      validInput,
    );
    expect(r).toEqual({ kind: "email_exists", clientId: "existing-id" });
  });

  it("creates the user, flags unclaimed, returns the new id", async () => {
    const { serviceClient, profileUpdate } = makeDeps({});
    const r = await createUnclaimedClientCore(
      {
        serviceClient,
        actorUserId: "actor",
        geocoder: { geocode: async () => null },
      },
      validInput,
    );
    expect(r).toEqual({
      kind: "success",
      clientId: "11111111-1111-1111-1111-111111111111",
      isOutsideServiceArea: false,
    });
    // Profile update must set unclaimed: true.
    expect(profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        unclaimed: true,
        onboarding_status: "approved",
      }),
    );
  });

  // Admin-side the service-area gate only reports: Cal pre-creates people he
  // has already agreed to serve, so an out-of-area ZIP warns and nothing more.
  it("still creates the client for an out-of-area ZIP, flagging it", async () => {
    const { serviceClient, profileUpdate } = makeDeps({});
    const r = await createUnclaimedClientCore(
      {
        serviceClient,
        actorUserId: "actor",
        // Durango — ~180 mi from the Boulder origin, past the 50 mi cutoff.
        geocoder: { geocode: async () => ({ lat: 37.2753, lng: -107.8801 }) },
      },
      { ...validInput, zip: "81301" },
    );
    expect(r).toEqual({
      kind: "success",
      clientId: "11111111-1111-1111-1111-111111111111",
      isOutsideServiceArea: true,
    });
    // The gated geocode is still what gets stored.
    expect(profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ zip: "81301", lat: 37.2753, lng: -107.8801 }),
    );
  });
});

function makeLinkDeps(opts: {
  isAdmin?: boolean;
  unclaimed?: boolean;
  actionLink?: string;
  generateError?: { message: string } | null;
}) {
  const {
    isAdmin = true,
    unclaimed = true,
    actionLink = "https://supabase.example/auth/v1/verify?token=abc&type=invite",
    generateError = null,
  } = opts;
  const update = vi
    .fn()
    .mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const serviceClient = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { role: isAdmin ? "admin" : "client" },
            error: null,
          }),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { email: "x@y.test", unclaimed },
            error: null,
          }),
        })),
      })),
      update,
    })),
    auth: {
      admin: {
        generateLink: vi.fn().mockResolvedValue(
          generateError
            ? { data: { properties: null }, error: generateError }
            : {
                data: { properties: { action_link: actionLink } },
                error: null,
              },
        ),
      },
    },
  } as unknown as Parameters<typeof generateClaimLinkCore>[0]["serviceClient"];
  return { serviceClient, update };
}

describe("generateClaimLinkCore", () => {
  it("forbids non-admins", async () => {
    const { serviceClient } = makeLinkDeps({ isAdmin: false });
    const r = await generateClaimLinkCore(
      { serviceClient, actorUserId: "a", origin: "https://app.test" },
      "cid",
    );
    expect(r.kind).toBe("forbidden");
  });
  it("refuses an already-claimed client", async () => {
    const { serviceClient } = makeLinkDeps({ unclaimed: false });
    const r = await generateClaimLinkCore(
      { serviceClient, actorUserId: "a", origin: "https://app.test" },
      "cid",
    );
    expect(r.kind).toBe("not_unclaimed");
  });
  it("returns the action_link and stamps invited_at", async () => {
    const { serviceClient, update } = makeLinkDeps({});
    const r = await generateClaimLinkCore(
      { serviceClient, actorUserId: "a", origin: "https://app.test" },
      "cid",
    );
    expect(r).toEqual({
      kind: "success",
      url: "https://supabase.example/auth/v1/verify?token=abc&type=invite",
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ invited_at: expect.any(String) }),
    );
  });
});
