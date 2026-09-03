/**
 * Integration tests for account self-service actions against the local Supabase stack.
 *
 * Uses DI pattern from onboarding-action.integration.test.ts:
 *   - Service-role client: fixture setup + verification (bypasses RLS)
 *   - Anon+session client: RLS assertions (signInWithPassword → session client)
 *
 * Prerequisites: local Supabase running (`npx supabase start`).
 * Credentials from .env.test (gitignored).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Geocoder } from "@/features/pricing";
import {
  runUpdateProfile,
  runCreatePet,
  runUpdatePet,
  runDeletePet,
  runSubmitForm,
  runConfirmForm,
  runAcceptAuthorization,
  runUploadPetPhoto,
  type UpdateProfileDeps,
} from "./account-actions";
import { EXPENSE_AUTH_KIND, EXPENSE_AUTH_VERSION } from "./authorizations";
import type { FormKey } from "./form-registry";

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

const KNOWN_ZIP = "80302";
const KNOWN_COORDS = { lat: 40.0274, lng: -105.2519 };

/** Durango — in the dataset, far past the seeded 50 mi cutoff from Boulder. */
const FAR_ZIP = "81301";
const FAR_COORDS = { lat: 37.2753, lng: -107.8801 };

/** Resolves two ZIPs; every other ZIP is unknown, like a far or mistyped one. */
const fakeGeocoder: Geocoder = {
  geocode: async (zip) =>
    ({ [KNOWN_ZIP]: KNOWN_COORDS, [FAR_ZIP]: FAR_COORDS })[zip.trim()] ?? null,
};

const throwingGeocoder: Geocoder = {
  geocode: async () => {
    throw new Error("geocoder unavailable");
  },
};

/** userId is only known after beforeAll, so deps are built per call. */
function profileDeps(geocoder: Geocoder): UpdateProfileDeps {
  return { sessionClient: sessionClient1, serviceClient, userId, geocoder };
}

/** Puts a known-good address on file, so a refusal below has something to leave alone. */
function saveKnownAddress() {
  return runUpdateProfile(profileDeps(fakeGeocoder), {
    full_name: "Cal Barba",
    phone: "303-555-0200",
    address: "456 Pine Ave",
    zip: KNOWN_ZIP,
  });
}

function readCoordinates() {
  return serviceClient
    .from("profiles")
    .select("lat, lng, address, zip")
    .eq("id", userId)
    .single();
}

describe("updateProfile via session client", () => {
  it("persists full_name, phone, address, zip", async () => {
    const result = await runUpdateProfile(profileDeps(fakeGeocoder), {
      full_name: "Cal Barba",
      phone: "303-555-0200",
      address: "456 Pine Ave",
      zip: KNOWN_ZIP,
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
      zip: KNOWN_ZIP,
    });
  });

  it("returns validation_error for invalid input (empty zip)", async () => {
    const result = await runUpdateProfile(profileDeps(fakeGeocoder), {
      full_name: "Cal Barba",
      phone: "303-555-0200",
      address: "456 Pine Ave",
      zip: "",
    });

    expect(result.kind).toBe("validation_error");
  });

  it("stores the coordinates the geocoder resolves for the saved ZIP", async () => {
    // Wipe the coordinates and put a different ZIP on file first, so this is a
    // real move and a skipped write would show up as a null.
    await serviceClient
      .from("profiles")
      .update({ lat: null, lng: null, zip: FAR_ZIP })
      .eq("id", userId);

    const result = await runUpdateProfile(profileDeps(fakeGeocoder), {
      full_name: "Cal Barba",
      phone: "303-555-0200",
      address: "456 Pine Ave",
      zip: KNOWN_ZIP,
    });
    expect(result.kind).toBe("success");

    const { data: profile } = await readCoordinates();
    expect(profile?.lat).toBeCloseTo(KNOWN_COORDS.lat);
    expect(profile?.lng).toBeCloseTo(KNOWN_COORDS.lng);
  });

  // Both refusals must land before the write, or the profile would end up
  // holding an address Cal cannot serve.
  it("refuses a ZIP the geocoder cannot place and writes nothing", async () => {
    await saveKnownAddress();

    const result = await runUpdateProfile(profileDeps(fakeGeocoder), {
      full_name: "Cal Barba",
      phone: "303-555-0200",
      address: "9 Elsewhere Rd",
      zip: "99999",
    });

    expect(result).toEqual({
      kind: "validation_error",
      message: "That address is outside Cal's service area.",
      fieldErrors: { zip: "That address is outside Cal's service area." },
    });

    const { data: profile } = await readCoordinates();
    expect(profile?.address).toBe("456 Pine Ave");
    expect(profile?.zip).toBe(KNOWN_ZIP);
  });

  it("refuses a known ZIP beyond the service-area cutoff", async () => {
    await saveKnownAddress();

    const result = await runUpdateProfile(profileDeps(fakeGeocoder), {
      full_name: "Cal Barba",
      phone: "303-555-0200",
      address: "1 Far Away Ln",
      zip: FAR_ZIP,
    });

    expect(result.kind).toBe("validation_error");

    const { data: profile } = await readCoordinates();
    expect(profile?.zip).toBe(KNOWN_ZIP);
  });

  // Admin client creation warns rather than refuses, so a profile can already
  // hold a ZIP the gate would reject. Gating an unchanged ZIP would strand that
  // client: no admin screen writes profiles.zip, so they could never save a
  // corrected name or phone again.
  it("saves the other fields when the stored ZIP is out of area and unchanged", async () => {
    await serviceClient
      .from("profiles")
      .update({ address: "1 Far Away Ln", zip: FAR_ZIP })
      .eq("id", userId);

    const result = await runUpdateProfile(profileDeps(fakeGeocoder), {
      full_name: "Cal B. Barba",
      phone: "303-555-0300",
      address: "1 Far Away Ln",
      zip: FAR_ZIP,
    });

    expect(result.kind).toBe("success");

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("full_name, phone, zip")
      .eq("id", userId)
      .single();

    expect(profile).toMatchObject({
      full_name: "Cal B. Barba",
      phone: "303-555-0300",
      zip: FAR_ZIP,
    });
  });

  it("saves the address and logs when the geocoder fails, keeping the stored coordinates", async () => {
    // Seed known coordinates so a wiped value would be visible. The ZIP then
    // changes, because an unchanged one skips the geocode altogether.
    await saveKnownAddress();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runUpdateProfile(profileDeps(throwingGeocoder), {
      full_name: "Cal Barba",
      phone: "303-555-0200",
      address: "12 Later St",
      zip: FAR_ZIP,
    });

    expect(result.kind).toBe("success");
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();

    const { data: profile } = await readCoordinates();
    expect(profile?.address).toBe("12 Later St");
    expect(profile?.lat).toBeCloseTo(KNOWN_COORDS.lat);
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

// ─── 3b. Pet photo upload ─────────────────────────────────────────────────────

/** A well-formed uuid that belongs to no pet — stands in for a deleted or foreign one. */
const STRANGER_PET_ID = "11111111-2222-3333-4444-555555555555";

describe("runUploadPetPhoto", () => {
  let petId: string;

  function uploadDeps() {
    return { sessionClient: sessionClient1, serviceClient, userId };
  }

  function form(id: string, file: File): FormData {
    const fd = new FormData();
    fd.set("petId", id);
    fd.set("file", file);
    return fd;
  }

  function jpeg(bytes = 64): File {
    return new File([new Uint8Array(bytes)], "photo.jpg", {
      type: "image/jpeg",
    });
  }

  beforeAll(async () => {
    const { data } = await serviceClient
      .from("pets")
      .insert({ client_id: userId, name: "Pixel", species: "dog" })
      .select("id")
      .single();
    petId = data!.id as string;
  });

  afterAll(async () => {
    await serviceClient.storage
      .from("pet-photos")
      .remove([
        `${userId}/${petId}/photo.jpg`,
        `${userId}/${STRANGER_PET_ID}/photo.jpg`,
      ]);
    await serviceClient.from("pets").delete().eq("id", petId);
  });

  it("rejects a petId that is not a uuid", async () => {
    const result = await runUploadPetPhoto(
      uploadDeps(),
      form("../other-client", jpeg()),
    );
    expect(result.kind).toBe("validation_error");
  });

  it("rejects a file whose type is not an accepted image", async () => {
    const svg = new File(["<svg />"], "photo.svg", { type: "image/svg+xml" });
    const result = await runUploadPetPhoto(uploadDeps(), form(petId, svg));
    expect(result.kind).toBe("validation_error");
  });

  it("rejects a file whose type names a property of Object.prototype", async () => {
    const spoofed = new File([new Uint8Array(8)], "photo.jpg", {
      type: "constructor",
    });
    const result = await runUploadPetPhoto(uploadDeps(), form(petId, spoofed));
    expect(result.kind).toBe("validation_error");
  });

  it("rejects a file over the size cap", async () => {
    // One byte past the 5 MB cap the action enforces.
    const result = await runUploadPetPhoto(
      uploadDeps(),
      form(petId, jpeg(5 * 1024 * 1024 + 1)),
    );
    expect(result.kind).toBe("validation_error");
  });

  it("stores the object and records its path on the pet", async () => {
    const result = await runUploadPetPhoto(uploadDeps(), form(petId, jpeg()));
    expect(result.kind).toBe("success");

    const { data: pet } = await serviceClient
      .from("pets")
      .select("photo_url")
      .eq("id", petId)
      .single();
    expect(pet?.photo_url).toBe(`${userId}/${petId}/photo.jpg`);
  });

  it("does not report success for a pet the caller does not own", async () => {
    const result = await runUploadPetPhoto(
      uploadDeps(),
      form(STRANGER_PET_ID, jpeg()),
    );
    expect(result.kind).toBe("validation_error");
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
    expect(rows?.[0]?.data).toMatchObject({ contact_name: "Alex" });
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
    expect(rows?.[0]?.data).toMatchObject({ contact_name: "Alex Updated" });
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

  it("rejects a form key that names a property of Object.prototype", async () => {
    const result = await runSubmitForm(
      sessionClient1,
      userId,
      "constructor" as FormKey,
      {},
    );

    expect(result.kind).toBe("validation_error");
  });
});

// ─── 6. Pet-scoped forms ──────────────────────────────────────────────────────

describe("runSubmitForm — pet scope", () => {
  let petA: string;
  let petB: string;

  beforeAll(async () => {
    const { data } = await serviceClient
      .from("pets")
      .insert([
        { client_id: userId, name: "Rex", species: "dog" },
        { client_id: userId, name: "Milo", species: "dog" },
      ])
      .select("id");
    const [firstPet, secondPet] = data ?? [];
    if (!firstPet || !secondPet)
      throw new Error("expected both pet fixtures to be inserted");
    petA = firstPet.id as string;
    petB = secondPet.id as string;
  });

  afterAll(async () => {
    await serviceClient.from("form_responses").delete().eq("client_id", userId);
    await serviceClient.from("pets").delete().eq("client_id", userId);
  });

  it("inserts a pet-scoped row carrying pet_id", async () => {
    const result = await runSubmitForm(
      sessionClient1,
      userId,
      "pet_care",
      { feeding_schedule: "Twice daily" },
      petA,
    );
    expect(result.kind).toBe("success");

    const { data: rows } = await serviceClient
      .from("form_responses")
      .select("id, pet_id, data")
      .eq("client_id", userId)
      .eq("form_key", "pet_care");
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.pet_id).toBe(petA);
  });

  it("upserts the same pet's row in place (one row per pet)", async () => {
    await runSubmitForm(
      sessionClient1,
      userId,
      "pet_care",
      { feeding_schedule: "Three times daily" },
      petA,
    );
    const { data: rows } = await serviceClient
      .from("form_responses")
      .select("id, data")
      .eq("client_id", userId)
      .eq("form_key", "pet_care")
      .eq("pet_id", petA);
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.data).toMatchObject({
      feeding_schedule: "Three times daily",
    });
  });

  it("keeps a separate row per pet", async () => {
    await runSubmitForm(
      sessionClient1,
      userId,
      "pet_care",
      { feeding_schedule: "Once daily" },
      petB,
    );
    const { data: rows } = await serviceClient
      .from("form_responses")
      .select("pet_id")
      .eq("client_id", userId)
      .eq("form_key", "pet_care");
    expect(rows).toHaveLength(2);
  });

  it("rejects a pet-scoped form without a pet", async () => {
    const result = await runSubmitForm(sessionClient1, userId, "pet_care", {
      feeding_schedule: "x",
    });
    expect(result.kind).toBe("validation_error");
  });

  it("rejects an account-scoped form targeting a pet", async () => {
    const result = await runSubmitForm(
      sessionClient1,
      userId,
      "home_access",
      { address: "1 St", entry_instructions: "Key" },
      petA,
    );
    expect(result.kind).toBe("validation_error");
  });

  it("rejects a pet the caller does not own", async () => {
    const { data: otherPet } = await serviceClient
      .from("pets")
      .insert({ client_id: userId2, name: "Notyours", species: "dog" })
      .select("id")
      .single();
    const result = await runSubmitForm(
      sessionClient1,
      userId,
      "pet_care",
      { feeding_schedule: "x" },
      otherPet!.id as string,
    );
    expect(result.kind).toBe("validation_error");
    await serviceClient.from("pets").delete().eq("id", otherPet!.id);
  });

  it("confirmForm bumps submitted_at without changing data", async () => {
    const { data: before } = await serviceClient
      .from("form_responses")
      .select("submitted_at, data")
      .eq("client_id", userId)
      .eq("form_key", "pet_care")
      .eq("pet_id", petB)
      .single();

    await new Promise((r) => setTimeout(r, 10));
    const result = await runConfirmForm(
      sessionClient1,
      userId,
      "pet_care",
      petB,
    );
    expect(result.kind).toBe("success");

    const { data: after } = await serviceClient
      .from("form_responses")
      .select("submitted_at, data")
      .eq("client_id", userId)
      .eq("form_key", "pet_care")
      .eq("pet_id", petB)
      .single();
    expect(new Date(after!.submitted_at).getTime()).toBeGreaterThan(
      new Date(before!.submitted_at).getTime(),
    );
    expect(after!.data).toEqual(before!.data);
  });
});

// ─── 7. Expense-authorization e-sign ──────────────────────────────────────────

describe("runAcceptAuthorization", () => {
  afterAll(async () => {
    await serviceClient.from("authorizations").delete().eq("client_id", userId);
  });

  it("records the server's kind and version, ignoring the ones sent", async () => {
    const result = await runAcceptAuthorization(sessionClient1, userId, {
      kind: "something_else",
      version: "1999-01-01",
      acceptedName: "Cal Barba",
    });
    expect(result.kind).toBe("success");

    const { data: rows } = await serviceClient
      .from("authorizations")
      .select("kind, version, accepted_name")
      .eq("client_id", userId);
    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({
      kind: EXPENSE_AUTH_KIND,
      version: EXPENSE_AUTH_VERSION,
      accepted_name: "Cal Barba",
    });
  });

  it("does not append a second row for terms already accepted", async () => {
    const result = await runAcceptAuthorization(sessionClient1, userId, {
      acceptedName: "Cal Barba",
    });
    expect(result.kind).toBe("success");

    const { data: rows } = await serviceClient
      .from("authorizations")
      .select("version")
      .eq("client_id", userId);
    expect(rows).toHaveLength(1);
  });

  it("appends (never overwrites) when the accepted version is out of date", async () => {
    await serviceClient
      .from("authorizations")
      .update({ version: "2025-01-01" })
      .eq("client_id", userId);

    const result = await runAcceptAuthorization(sessionClient1, userId, {
      acceptedName: "Cal Barba",
    });
    expect(result.kind).toBe("success");

    const { data: rows } = await serviceClient
      .from("authorizations")
      .select("version")
      .eq("client_id", userId);
    expect(rows).toHaveLength(2);
    expect(rows?.map((r) => r.version)).toContain("2025-01-01");
  });

  it("rejects an empty typed name", async () => {
    const result = await runAcceptAuthorization(sessionClient1, userId, {
      acceptedName: "   ",
    });
    expect(result.kind).toBe("validation_error");
  });
});
