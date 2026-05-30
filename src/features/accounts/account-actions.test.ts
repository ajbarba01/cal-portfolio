/**
 * Integration tests for account self-service actions against the local Supabase stack.
 *
 * Uses DI pattern from onboarding-action.test.ts:
 *   - Service-role client: fixture setup + verification (bypasses RLS)
 *   - Anon+session client: RLS assertions (signInWithPassword → session client)
 *
 * Prerequisites: local Supabase running (`npx supabase start`).
 * Credentials from .env.test (gitignored).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  runUpdateProfile,
  runCreateDog,
  runUpdateDog,
  runDeleteDog,
  runSubmitForm,
} from "./account-actions";

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

const TEST_PASSWORD = "Test1234!";
const userEmail = `test-account-${Date.now()}@example.invalid`;
const user2Email = `test-account2-${Date.now()}@example.invalid`;

let userId: string;
let userId2: string;

/** Session client for user1 (authenticated with anon key). */
const sessionClient1 = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Session client for user2 (authenticated with anon key). */
const sessionClient2 = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

beforeAll(async () => {
  // Create two fixture users.
  const { data: u1, error: e1 } = await serviceClient.auth.admin.createUser({
    email: userEmail,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (e1 || !u1.user) throw new Error(`Create user1 failed: ${e1?.message}`);
  userId = u1.user.id;

  const { data: u2, error: e2 } = await serviceClient.auth.admin.createUser({
    email: user2Email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (e2 || !u2.user) throw new Error(`Create user2 failed: ${e2?.message}`);
  userId2 = u2.user.id;

  // Sign in both sessions.
  await sessionClient1.auth.signInWithPassword({
    email: userEmail,
    password: TEST_PASSWORD,
  });

  await sessionClient2.auth.signInWithPassword({
    email: user2Email,
    password: TEST_PASSWORD,
  });
});

afterAll(async () => {
  // Clean up — auth.admin.deleteUser cascades to profiles, dogs, form_responses.
  await serviceClient.auth.admin.deleteUser(userId);
  await serviceClient.auth.admin.deleteUser(userId2);
});

// ─── 1. Profile self-edit ─────────────────────────────────────────────────────

describe("updateProfile via session client", () => {
  it("persists full_name, phone, address, zip", async () => {
    const result = await runUpdateProfile(sessionClient1, userId, {
      full_name: "Cal Barba",
      phone: "303-555-0200",
      address: "456 Pine Ave",
      zip: "80302",
    });

    expect(result.kind).toBe("success");

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("full_name, phone, address, zip")
      .eq("id", userId)
      .single();

    expect(profile).toMatchObject({
      full_name: "Cal Barba",
      phone: "303-555-0200",
      address: "456 Pine Ave",
      zip: "80302",
    });
  });

  it("returns validation_error for invalid input (empty zip)", async () => {
    const result = await runUpdateProfile(sessionClient1, userId, {
      full_name: "Cal Barba",
      phone: "303-555-0200",
      address: "456 Pine Ave",
      zip: "",
    });

    expect(result.kind).toBe("validation_error");
  });
});

// ─── 2. Column-guard (privilege escalation) ───────────────────────────────────

describe("column-guard: session client cannot escalate role or kiche_allowed", () => {
  it("attempting to write role='admin' through session client does NOT change it", async () => {
    // Read current role first.
    const { data: before } = await serviceClient
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();
    expect(before?.role).toBe("client");

    // Attempt raw update of role via session client (simulates a malicious payload).
    // The column-level grant blocks this — Supabase will silently ignore or error.
    await sessionClient1
      .from("profiles")
      .update({ role: "admin" } as never)
      .eq("id", userId);

    // Verify role unchanged.
    const { data: after } = await serviceClient
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();
    expect(after?.role).toBe("client");
  });

  it("attempting to write kiche_allowed=true through session client does NOT change it", async () => {
    const { data: before } = await serviceClient
      .from("profiles")
      .select("kiche_allowed")
      .eq("id", userId)
      .single();
    expect(before?.kiche_allowed).toBe(false);

    await sessionClient1
      .from("profiles")
      .update({ kiche_allowed: true } as never)
      .eq("id", userId);

    const { data: after } = await serviceClient
      .from("profiles")
      .select("kiche_allowed")
      .eq("id", userId)
      .single();
    expect(after?.kiche_allowed).toBe(false);
  });
});

// ─── 3. Dogs CRUD round-trip ──────────────────────────────────────────────────

describe("dogs CRUD via session client", () => {
  let createdDogId: string;

  it("creates a dog", async () => {
    const result = await runCreateDog(sessionClient1, userId, {
      name: "Biscuit",
      breed: "Labrador",
      notes: "Loves fetch",
    });

    expect(result.kind).toBe("success");

    const { data: dogs } = await serviceClient
      .from("dogs")
      .select("id, name, breed, notes")
      .eq("client_id", userId);

    expect(dogs).toHaveLength(1);
    expect(dogs?.[0].name).toBe("Biscuit");
    createdDogId = dogs![0].id as string;
  });

  it("updates the dog", async () => {
    const result = await runUpdateDog(sessionClient1, userId, createdDogId, {
      name: "Biscuit Jr.",
      breed: "Labrador Mix",
      notes: "Still loves fetch",
    });

    expect(result.kind).toBe("success");

    const { data: dog } = await serviceClient
      .from("dogs")
      .select("name, breed, notes")
      .eq("id", createdDogId)
      .single();

    expect(dog?.name).toBe("Biscuit Jr.");
    expect(dog?.breed).toBe("Labrador Mix");
  });

  it("deletes the dog", async () => {
    const result = await runDeleteDog(sessionClient1, userId, createdDogId);
    expect(result.kind).toBe("success");

    const { data: dogs } = await serviceClient
      .from("dogs")
      .select("id")
      .eq("client_id", userId);

    expect(dogs).toHaveLength(0);
  });
});

// ─── 4. RLS isolation ─────────────────────────────────────────────────────────

describe("RLS isolation: user2 cannot see user1's data", () => {
  let dogId: string;

  beforeAll(async () => {
    // Create a dog for user1 via service role.
    const { data } = await serviceClient
      .from("dogs")
      .insert({ client_id: userId, name: "Shadow", breed: "Husky" })
      .select("id")
      .single();
    dogId = data!.id as string;

    // Create a form_response for user1 via service role.
    await serviceClient.from("form_responses").insert({
      client_id: userId,
      form_key: "emergency",
      data: {
        contact_name: "Jane",
        contact_phone: "303-555-0001",
        contact_relationship: "Spouse",
        vet_name: "Boulder Vet",
        vet_phone: "303-555-0002",
      },
    });
  });

  afterAll(async () => {
    await serviceClient.from("dogs").delete().eq("id", dogId);
    await serviceClient.from("form_responses").delete().eq("client_id", userId);
  });

  it("user2 sees 0 rows of user1's dogs", async () => {
    const { data, error } = await sessionClient2
      .from("dogs")
      .select("id")
      .eq("client_id", userId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("user2 sees 0 rows of user1's form_responses", async () => {
    const { data, error } = await sessionClient2
      .from("form_responses")
      .select("id")
      .eq("client_id", userId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});

// ─── 5. Forms upsert ─────────────────────────────────────────────────────────

describe("submitForm", () => {
  afterAll(async () => {
    await serviceClient.from("form_responses").delete().eq("client_id", userId);
  });

  it("inserts a new form_response on first submit", async () => {
    const result = await runSubmitForm(sessionClient1, userId, "emergency", {
      contact_name: "Alex",
      contact_phone: "303-555-0300",
      contact_relationship: "Parent",
      vet_name: "Mountain Vet",
      vet_phone: "303-555-0301",
    });

    expect(result.kind).toBe("success");

    const { data: rows } = await serviceClient
      .from("form_responses")
      .select("id, data")
      .eq("client_id", userId)
      .eq("form_key", "emergency");

    expect(rows).toHaveLength(1);
    expect(rows?.[0].data).toMatchObject({ contact_name: "Alex" });
  });

  it("updates the existing row on second submit (upsert)", async () => {
    const result = await runSubmitForm(sessionClient1, userId, "emergency", {
      contact_name: "Alex Updated",
      contact_phone: "303-555-0300",
      contact_relationship: "Parent",
      vet_name: "Mountain Vet",
      vet_phone: "303-555-0301",
    });

    expect(result.kind).toBe("success");

    const { data: rows } = await serviceClient
      .from("form_responses")
      .select("id, data")
      .eq("client_id", userId)
      .eq("form_key", "emergency");

    // Still only one row — updated in place.
    expect(rows).toHaveLength(1);
    expect(rows?.[0].data).toMatchObject({ contact_name: "Alex Updated" });
  });

  it("returns validation_error for invalid form data", async () => {
    const result = await runSubmitForm(sessionClient1, userId, "emergency", {
      contact_name: "", // required — will fail Zod
      contact_phone: "303-555-0300",
      contact_relationship: "Parent",
      vet_name: "Mountain Vet",
      vet_phone: "303-555-0301",
    });

    expect(result.kind).toBe("validation_error");
  });
});
