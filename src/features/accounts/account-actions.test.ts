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
  runCreatePet,
  runUpdatePet,
  runDeletePet,
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
  // Clean up — auth.admin.deleteUser cascades to profiles, pets, form_responses.
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

// ─── 3. Pets CRUD round-trip ──────────────────────────────────────────────────

describe("pets CRUD via session client", () => {
  let createdPetId: string;

  it("creates a pet and returns the inserted row", async () => {
    const result = await runCreatePet(sessionClient1, userId, {
      name: "Biscuit",
      species: "dog",
      breed: "Labrador",
      notes: "Loves fetch",
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.pet.name).toBe("Biscuit");
    expect(result.pet.species).toBe("dog");
    createdPetId = result.pet.id;

    const { data: pets } = await serviceClient
      .from("pets")
      .select("id, name, species")
      .eq("client_id", userId);
    expect(pets).toHaveLength(1);
  });

  it("creates a cat (species persisted)", async () => {
    const result = await runCreatePet(sessionClient1, userId, {
      name: "Mittens",
      species: "cat",
    });
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.pet.species).toBe("cat");
    await serviceClient.from("pets").delete().eq("id", result.pet.id);
  });

  it("updates the pet", async () => {
    const result = await runUpdatePet(sessionClient1, userId, createdPetId, {
      name: "Biscuit Jr.",
      species: "dog",
      breed: "Labrador Mix",
      notes: "Still loves fetch",
    });

    expect(result.kind).toBe("success");

    const { data: pet } = await serviceClient
      .from("pets")
      .select("name, breed, notes")
      .eq("id", createdPetId)
      .single();

    expect(pet?.name).toBe("Biscuit Jr.");
    expect(pet?.breed).toBe("Labrador Mix");
  });

  it("deletes the pet", async () => {
    const result = await runDeletePet(sessionClient1, userId, createdPetId);
    expect(result.kind).toBe("success");

    const { data: pets } = await serviceClient
      .from("pets")
      .select("id")
      .eq("client_id", userId);

    expect(pets).toHaveLength(0);
  });
});

// ─── 4. RLS isolation ─────────────────────────────────────────────────────────

describe("RLS isolation: user2 cannot see user1's data", () => {
  let dogId: string;

  beforeAll(async () => {
    // Create a pet for user1 via service role.
    const { data } = await serviceClient
      .from("pets")
      .insert({
        client_id: userId,
        name: "Shadow",
        species: "dog",
        breed: "Husky",
      })
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
    await serviceClient.from("pets").delete().eq("id", dogId);
    await serviceClient.from("form_responses").delete().eq("client_id", userId);
  });

  it("user2 sees 0 rows of user1's pets", async () => {
    const { data, error } = await sessionClient2
      .from("pets")
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
