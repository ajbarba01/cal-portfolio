/**
 * Integration tests for the pre-created ("unclaimed") client flow.
 *
 * Exercises createUnclaimedClientCore + generateClaimLinkCore against the local
 * Supabase stack via a service-role client, plus an anon-key session to prove
 * the RLS column guard on profiles.unclaimed. The "use server" auth wrappers are
 * NOT exercised here — that is manual QA.
 *
 * Prerequisites: local Supabase stack running (`npx supabase start`).
 * Credentials loaded from .env.test (gitignored).
 *
 * All DB rows created here are cleaned up in afterAll — no pollution.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

import {
  createUnclaimedClientCore,
  generateClaimLinkCore,
} from "./create-client-actions";

const url = process.env.SUPABASE_TEST_URL!;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY!;

if (!url || !serviceKey || !anonKey) {
  throw new Error("Missing SUPABASE_TEST_* env vars — is .env.test present?");
}

/** Service-role client — bypasses RLS for fixture setup and verification. */
const serviceClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const TEST_PASS = "Unclaimed1234!";
const newClientEmail = `test-unclaimed-${ts}@example.invalid`;

let adminUserId: string;
let createdClientId: string; // the unclaimed client minted in test 1
const createdUserIds: string[] = [];

beforeAll(async () => {
  // An admin actor: assertActorIsAdmin reads profiles.role.
  const { data: admin, error: adminErr } =
    await serviceClient.auth.admin.createUser({
      email: `test-unclaimed-admin-${ts}@example.invalid`,
      password: TEST_PASS,
      email_confirm: true,
    });
  if (adminErr || !admin.user)
    throw new Error(`create admin: ${adminErr?.message}`);
  adminUserId = admin.user.id;
  createdUserIds.push(adminUserId);

  const { error: promoteErr } = await serviceClient
    .from("profiles")
    .update({ role: "admin", onboarding_status: "approved" })
    .eq("id", adminUserId);
  if (promoteErr) throw new Error(`promote admin: ${promoteErr.message}`);
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await serviceClient.auth.admin.deleteUser(id);
  }
});

describe("createUnclaimedClientCore (integration)", () => {
  it("mints an auth user + flagged profile for a fresh email", async () => {
    const result = await createUnclaimedClientCore(
      { serviceClient, actorUserId: adminUserId },
      {
        email: newClientEmail,
        fullName: "Offline Client",
        onboardingStatus: "approved",
      },
    );

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    createdClientId = result.clientId;
    createdUserIds.push(createdClientId);

    // profiles row: unclaimed=true + chosen onboarding_status.
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("unclaimed, onboarding_status, full_name")
      .eq("id", createdClientId)
      .single();
    expect(profile?.unclaimed).toBe(true);
    expect(profile?.onboarding_status).toBe("approved");
    expect(profile?.full_name).toBe("Offline Client");

    // Matching auth.users row exists.
    const { data: authUser } =
      await serviceClient.auth.admin.getUserById(createdClientId);
    expect(authUser.user?.email).toBe(newClientEmail);
  });

  it("returns email_exists with the existing id on a duplicate email", async () => {
    const result = await createUnclaimedClientCore(
      { serviceClient, actorUserId: adminUserId },
      {
        email: newClientEmail,
        fullName: "Duplicate Attempt",
        onboardingStatus: "approved",
      },
    );
    expect(result).toEqual({ kind: "email_exists", clientId: createdClientId });
  });

  it("RLS column guard: an authenticated client cannot write profiles.unclaimed", async () => {
    // A normal, self-owned client with a password, flagged unclaimed via service role.
    const guardEmail = `test-unclaimed-guard-${ts}@example.invalid`;
    const { data: guardUser, error: guardErr } =
      await serviceClient.auth.admin.createUser({
        email: guardEmail,
        password: TEST_PASS,
        email_confirm: true,
      });
    if (guardErr || !guardUser.user)
      throw new Error(`create guard user: ${guardErr?.message}`);
    const guardId = guardUser.user.id;
    createdUserIds.push(guardId);

    await serviceClient
      .from("profiles")
      .update({ unclaimed: true })
      .eq("id", guardId);

    // Sign in as the client with an anon-key (authenticated, RLS-enforced) session.
    const userClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await userClient.auth.signInWithPassword({
      email: guardEmail,
      password: TEST_PASS,
    });

    // Attempt to self-clear the flag — the column is absent from the client
    // UPDATE grant, so this must not change the stored value.
    await userClient
      .from("profiles")
      .update({ unclaimed: false })
      .eq("id", guardId);

    const { data: after } = await serviceClient
      .from("profiles")
      .select("unclaimed")
      .eq("id", guardId)
      .single();
    expect(after?.unclaimed).toBe(true);
  });
});

describe("generateClaimLinkCore (integration)", () => {
  it("returns a non-empty url and stamps invited_at for an unclaimed client", async () => {
    const result = await generateClaimLinkCore(
      {
        serviceClient,
        actorUserId: adminUserId,
        origin: "http://localhost:3000",
      },
      createdClientId,
    );

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.url.length).toBeGreaterThan(0);
    }

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("invited_at")
      .eq("id", createdClientId)
      .single();
    expect(profile?.invited_at).not.toBeNull();
  });

  it("refuses an already-claimed client", async () => {
    // Flip the flag via service role to simulate a completed claim.
    await serviceClient
      .from("profiles")
      .update({ unclaimed: false })
      .eq("id", createdClientId);

    const result = await generateClaimLinkCore(
      {
        serviceClient,
        actorUserId: adminUserId,
        origin: "http://localhost:3000",
      },
      createdClientId,
    );
    expect(result.kind).toBe("not_unclaimed");
  });
});
