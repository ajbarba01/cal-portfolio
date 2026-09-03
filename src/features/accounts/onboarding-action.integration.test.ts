/**
 * Integration tests for runOnboarding() against the local Supabase stack.
 *
 * Uses dependency injection: tests call runOnboarding(deps, input) directly,
 * passing a service-role client and a pre-created test user ID. This decouples
 * the test from Next.js server-action machinery (headers, cookies, redirects)
 * while still hitting the real DB schema and RLS policies.
 *
 * Prerequisites: local Supabase stack running (`npx supabase start`).
 * Credentials loaded from .env.test (gitignored).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { runOnboarding } from "./onboarding-action";
import type { Geocoder } from "@/features/pricing/geocoding/geocoder";

const url = process.env.SUPABASE_TEST_URL!;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY!;

if (!url || !serviceKey || !anonKey) {
  throw new Error("Missing SUPABASE_TEST_* env vars — is .env.test present?");
}

/** Service-role client — bypasses RLS, used for fixture setup and verification. */
const serviceClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_EMAIL = `test-onboarding-${Date.now()}@example.invalid`;
const TEST_PASSWORD = "Test1234!";

let testUserId: string;

beforeAll(async () => {
  // Create a fixture auth user via service role; the DB trigger creates its profiles row.
  const { data, error } = await serviceClient.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`Failed to create test user: ${error?.message}`);
  }

  testUserId = data.user.id;
});

afterAll(async () => {
  // Clean up: delete the test user (cascades to profiles and form_responses).
  await serviceClient.auth.admin.deleteUser(testUserId);
});

/**
 * Stub geocoder — 80301 is a Boulder centroid inside the seeded service area,
 * 81301 a Durango one far outside it. Everything else is unknown.
 */
const stubGeocoder: Geocoder = {
  geocode: async (zip: string) => {
    if (zip === "80301") return { lat: 40.0481, lng: -105.2527 };
    if (zip === "81301") return { lat: 37.2753, lng: -107.8801 };
    return null;
  },
};

describe("runOnboarding", () => {
  const validInput = {
    full_name: "Test User",
    phone: "303-555-0100",
    address: "123 Main St",
    zip: "80301",
  };

  it("advances onboarding_status to meet_greet_pending", async () => {
    const result = await runOnboarding(
      { serviceClient, userId: testUserId, geocoder: stubGeocoder },
      validInput,
    );

    expect(result).toEqual({ ok: true });

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("onboarding_status")
      .eq("id", testUserId)
      .single();

    expect(profile?.onboarding_status).toBe("meet_greet_pending");
  });

  // Signup no longer collects emergency/vet info, so it must not write a
  // form_responses row: the write-once unique index made a retry after a
  // partial failure fail on a duplicate key.
  it("writes no form_responses row", async () => {
    const { data: rows, error } = await serviceClient
      .from("form_responses")
      .select("id")
      .eq("client_id", testUserId);

    expect(error).toBeNull();
    expect(rows).toHaveLength(0);
  });

  it("writes the profile fields including geocoded lat/lng", async () => {
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("full_name, phone, address, zip, lat, lng")
      .eq("id", testUserId)
      .single();

    expect(profile).toMatchObject({
      full_name: "Test User",
      phone: "303-555-0100",
      address: "123 Main St",
      zip: "80301",
    });
    // Stub geocoder returns known centroid for 80301
    expect(profile?.lat).toBeCloseTo(40.0481, 2);
    expect(profile?.lng).toBeCloseTo(-105.2527, 2);
  });

  it("rejects invalid input with a Zod error (profile missing zip)", async () => {
    await expect(
      runOnboarding(
        { serviceClient, userId: testUserId, geocoder: stubGeocoder },
        { ...validInput, zip: "" },
      ),
    ).rejects.toThrow();
  });

  // Signup is the first place an out-of-area client can be turned away, and it
  // has to be a field error rather than a throw: the wizard shows it at the ZIP
  // and keeps everything already typed.
  it.each([
    ["a ZIP beyond the service area", "81301"],
    ["a ZIP the geocoder cannot place", "99999"],
  ])("refuses %s without advancing onboarding", async (_label, zip) => {
    const { data: before } = await serviceClient
      .from("profiles")
      .select("zip, onboarding_status")
      .eq("id", testUserId)
      .single();

    const result = await runOnboarding(
      { serviceClient, userId: testUserId, geocoder: stubGeocoder },
      { ...validInput, zip },
    );

    expect(result).toEqual({
      ok: false,
      fieldErrors: { zip: "That address is outside Cal's service area." },
    });

    const { data: after } = await serviceClient
      .from("profiles")
      .select("zip, onboarding_status")
      .eq("id", testUserId)
      .single();
    expect(after).toEqual(before);
  });

  it("RLS isolation: a different client cannot read the first user's form_responses", async () => {
    // Sign in as a second test user to get an authenticated session.
    const secondEmail = `test-rls-${Date.now()}@example.invalid`;
    const { data: secondUser } = await serviceClient.auth.admin.createUser({
      email: secondEmail,
      password: TEST_PASSWORD,
      email_confirm: true,
    });

    const secondUserId = secondUser.user!.id;

    // runOnboarding no longer writes form_responses, so seed one directly:
    // without a row the read below would return zero for want of data rather
    // than because RLS blocked it.
    const { error: seedError } = await serviceClient
      .from("form_responses")
      .insert({
        client_id: testUserId,
        form_key: "owner",
        booking_id: null,
        data: { owner_name: "Test User" },
      });
    expect(seedError).toBeNull();

    try {
      // Sign in as the second user with a user-scoped client.
      const secondClient = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await secondClient.auth.signInWithPassword({
        email: secondEmail,
        password: TEST_PASSWORD,
      });

      // The second user must see 0 rows of the first user's form_responses.
      const { data: rows, error } = await secondClient
        .from("form_responses")
        .select("id")
        .eq("client_id", testUserId);

      expect(error).toBeNull();
      expect(rows).toHaveLength(0);
    } finally {
      await serviceClient.auth.admin.deleteUser(secondUserId);
    }
  });
});
