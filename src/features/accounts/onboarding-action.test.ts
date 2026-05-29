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

describe("runOnboarding", () => {
  const validInput = {
    profile: {
      full_name: "Test User",
      phone: "303-555-0100",
      address: "123 Main St",
      zip: "80301",
    },
    emergency: {
      contact_name: "Jane Doe",
      contact_phone: "303-555-0101",
      contact_relationship: "Spouse",
      vet_name: "Boulder Vet Clinic",
      vet_phone: "303-555-0102",
    },
  };

  it("flips onboarding_complete to true", async () => {
    await runOnboarding({ serviceClient, userId: testUserId }, validInput);

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("onboarding_complete")
      .eq("id", testUserId)
      .single();

    expect(profile?.onboarding_complete).toBe(true);
  });

  it("inserts an emergency form_responses row", async () => {
    const { data: rows, error } = await serviceClient
      .from("form_responses")
      .select("id, form_key, data")
      .eq("client_id", testUserId)
      .eq("form_key", "emergency");

    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows?.[0].data).toMatchObject({
      contact_name: validInput.emergency.contact_name,
    });
  });

  it("writes the profile fields", async () => {
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("full_name, phone, address, zip")
      .eq("id", testUserId)
      .single();

    expect(profile).toMatchObject({
      full_name: "Test User",
      phone: "303-555-0100",
      address: "123 Main St",
      zip: "80301",
    });
  });

  it("rejects invalid input with a Zod error (profile missing zip)", async () => {
    await expect(
      runOnboarding(
        { serviceClient, userId: testUserId },
        {
          ...validInput,
          profile: { ...validInput.profile, zip: "" },
        },
      ),
    ).rejects.toThrow();
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

    try {
      // Sign in as the second user with a user-scoped client.
      const secondClient = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await secondClient.auth.signInWithPassword({
        email: secondEmail,
        password: TEST_PASSWORD,
      });

      // The second user should see 0 rows from the first user's form_responses.
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
