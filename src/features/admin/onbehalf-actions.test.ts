/**
 * Unit tests for admin on-behalf pet and form actions.
 *
 * These tests mock the Supabase client — no local Supabase stack required.
 * They verify:
 *   1. Non-admin actor → forbidden (admin check fires before any write).
 *   2. Admin actor → write uses the target clientId (never the actor's id).
 *   3. Validation errors are surfaced before any DB call.
 *
 * Mock pattern: build a minimal SupabaseClient mock that simulates the
 * fluent query builder and records what was written.
 */

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminCreatePetCore,
  adminUpdatePetCore,
  adminSubmitFormCore,
  adminUploadPetPhotoCore,
} from "./onbehalf-actions";
import type { AdminDeps } from "./clients-actions";
import type { PetInput } from "@/features/accounts";

// ─── Mock helpers ────────────────────────────────────────────────────────────

/**
 * Build a mock SupabaseClient whose `from` / storage methods are configurable.
 * We only mock the surfaces used by the cores under test.
 */
function makeMockClient({
  role = "admin",
  insertData = {
    id: "pet-1",
    name: "Biscuit",
    species: "dog",
    breed: null,
    notes: null,
    photo_url: null,
  },
  insertError = null as string | null,
  updateError = null as string | null,
  selectExisting = null as { id: string } | null,
  selectExistingError = null as string | null,
  uploadError = null as string | null,
}: {
  role?: string;
  insertData?: object;
  insertError?: string | null;
  updateError?: string | null;
  selectExisting?: { id: string } | null;
  selectExistingError?: string | null;
  uploadError?: string | null;
} = {}) {
  /** Tracks the last payload passed to .insert() or .update() */
  const writes = {
    insert: null as Record<string, unknown> | null,
    update: null as Record<string, unknown> | null,
    updateFilters: [] as Array<{ col: string; val: unknown }>,
    storagePath: null as string | null,
    storageClientId: null as string | null,
  };

  // Fluent builder for storage.upload
  const storageBucket = {
    upload: vi.fn(async (path: string) => {
      writes.storagePath = path;
      writes.storageClientId = path.split("/")[0] ?? null;
      if (uploadError) return { data: null, error: { message: uploadError } };
      return { data: { path }, error: null };
    }),
    from: vi.fn(),
  };

  const storage = {
    from: vi.fn(() => storageBucket),
  };

  // Fluent builder for `.from("table").select/insert/update.eq.eq.single`
  function makeBuilder(table: string) {
    const filters: Array<{ col: string; val: unknown }> = [];
    let pendingInsert: Record<string, unknown> | null = null;
    let pendingUpdate: Record<string, unknown> | null = null;

    const builder: Record<string, unknown> = {};

    // select chain
    builder.select = vi.fn((_cols?: string) => {
      return builder;
    });

    // insert chain
    builder.insert = vi.fn((payload: Record<string, unknown>) => {
      pendingInsert = payload;
      writes.insert = payload;
      return builder;
    });

    // update chain
    builder.update = vi.fn((payload: Record<string, unknown>) => {
      pendingUpdate = payload;
      writes.update = payload;
      return builder;
    });

    // eq chain — accumulate filters
    builder.eq = vi.fn((_col: string, _val: unknown) => {
      filters.push({ col: _col, val: _val });
      writes.updateFilters = filters;
      return builder;
    });

    // is chain (for null checks)
    builder.is = vi.fn(() => builder);

    // maybeSingle — used by submitForm to check for existing row
    builder.maybeSingle = vi.fn(async () => {
      if (table === "form_responses") {
        if (selectExistingError)
          return { data: null, error: { message: selectExistingError } };
        return { data: selectExisting, error: null };
      }
      return { data: null, error: null };
    });

    // single — resolves insert/update for profiles (admin guard) and pets
    builder.single = vi.fn(async () => {
      if (table === "profiles") {
        // Admin guard reads profile role.
        return { data: { role }, error: null };
      }
      if (table === "pets" && pendingInsert) {
        if (insertError) return { data: null, error: { message: insertError } };
        return { data: insertData, error: null };
      }
      return { data: null, error: null };
    });

    // Make the builder awaitable — the fluent `.update(...).eq(...).eq(...)` chain
    // is awaited; adding `.then` makes TypeScript treat it as a thenable.
    builder.then = vi.fn(
      (
        resolve: (v: {
          data: unknown;
          error: { message: string } | null;
        }) => void,
      ) => {
        const decide = async () => {
          if (table === "pets" && pendingUpdate !== null) {
            if (updateError)
              return { data: null, error: { message: updateError } };
            return { data: null, error: null };
          }
          if (table === "form_responses" && pendingUpdate !== null) {
            if (updateError)
              return { data: null, error: { message: updateError } };
            return { data: null, error: null };
          }
          if (table === "form_responses" && pendingInsert !== null) {
            if (insertError)
              return { data: null, error: { message: insertError } };
            return { data: null, error: null };
          }
          return { data: null, error: null };
        };
        decide().then(resolve);
        return builder; // chainable
      },
    );

    return builder;
  }

  const client = {
    from: vi.fn((table: string) => makeBuilder(table)),
    storage,
    auth: { getUser: vi.fn() },
  } as unknown as SupabaseClient;

  return { client, writes };
}

function adminDeps(client: SupabaseClient): AdminDeps {
  return { serviceClient: client, actorUserId: "actor-admin" };
}

function nonAdminDeps(client: SupabaseClient): AdminDeps {
  return { serviceClient: client, actorUserId: "actor-nonadmin" };
}

const TARGET_CLIENT = "client-uuid-target";

const validPetInput: PetInput = {
  name: "Biscuit",
  species: "dog",
  breed: "Labrador",
  notes: "Loves fetch",
};

// ─── adminCreatePetCore ───────────────────────────────────────────────────────

describe("adminCreatePetCore", () => {
  it("non-admin actor → forbidden, no write", async () => {
    const { client, writes } = makeMockClient({ role: "client" });
    const result = await adminCreatePetCore(
      nonAdminDeps(client),
      TARGET_CLIENT,
      validPetInput,
    );
    expect(result.kind).toBe("forbidden");
    expect(writes.insert).toBeNull();
  });

  it("admin actor → inserts with client_id = TARGET_CLIENT (not actor id)", async () => {
    const { client, writes } = makeMockClient({ role: "admin" });
    const result = await adminCreatePetCore(
      adminDeps(client),
      TARGET_CLIENT,
      validPetInput,
    );
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.pet.name).toBe("Biscuit");
    // The inserted payload must carry the target client's id, not the actor's.
    expect(writes.insert?.client_id).toBe(TARGET_CLIENT);
    expect(writes.insert?.client_id).not.toBe("actor-admin");
  });

  it("validation error for empty name → no write", async () => {
    const { client, writes } = makeMockClient({ role: "admin" });
    const result = await adminCreatePetCore(adminDeps(client), TARGET_CLIENT, {
      ...validPetInput,
      name: "",
    });
    expect(result.kind).toBe("validation_error");
    expect(writes.insert).toBeNull();
  });

  it("DB insert error → error result", async () => {
    const { client } = makeMockClient({
      role: "admin",
      insertError: "DB insert failed",
    });
    const result = await adminCreatePetCore(
      adminDeps(client),
      TARGET_CLIENT,
      validPetInput,
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.message).toContain("DB insert failed");
  });
});

// ─── adminUpdatePetCore ───────────────────────────────────────────────────────

describe("adminUpdatePetCore", () => {
  const PET_ID = "pet-uuid-1";

  it("non-admin actor → forbidden, no write", async () => {
    const { client, writes } = makeMockClient({ role: "client" });
    const result = await adminUpdatePetCore(
      nonAdminDeps(client),
      TARGET_CLIENT,
      PET_ID,
      validPetInput,
    );
    expect(result.kind).toBe("forbidden");
    expect(writes.update).toBeNull();
  });

  it("admin actor → update scoped to petId AND clientId (belt-and-suspenders)", async () => {
    const { client, writes } = makeMockClient({ role: "admin" });
    const result = await adminUpdatePetCore(
      adminDeps(client),
      TARGET_CLIENT,
      PET_ID,
      validPetInput,
    );
    expect(result.kind).toBe("success");
    // Filters must include both id=petId and client_id=targetClient.
    const colNames = writes.updateFilters.map((f) => f.col);
    const colValues = Object.fromEntries(
      writes.updateFilters.map((f) => [f.col, f.val]),
    );
    expect(colNames).toContain("id");
    expect(colNames).toContain("client_id");
    expect(colValues.id).toBe(PET_ID);
    expect(colValues.client_id).toBe(TARGET_CLIENT);
    // Must NOT be scoped to actor.
    expect(colValues.client_id).not.toBe("actor-admin");
  });

  it("validation error for empty name → no write", async () => {
    const { client, writes } = makeMockClient({ role: "admin" });
    const result = await adminUpdatePetCore(
      adminDeps(client),
      TARGET_CLIENT,
      PET_ID,
      { ...validPetInput, name: "" },
    );
    expect(result.kind).toBe("validation_error");
    expect(writes.update).toBeNull();
  });
});

// ─── adminSubmitFormCore ──────────────────────────────────────────────────────

const validEmergencyData = {
  contact_name: "Jane",
  contact_phone: "303-555-0001",
  contact_relationship: "Spouse",
  vet_name: "Boulder Vet",
  vet_phone: "303-555-0002",
};

describe("adminSubmitFormCore", () => {
  it("non-admin actor → forbidden, no write", async () => {
    const { client, writes } = makeMockClient({ role: "client" });
    const result = await adminSubmitFormCore(
      nonAdminDeps(client),
      TARGET_CLIENT,
      "emergency",
      validEmergencyData,
    );
    expect(result.kind).toBe("forbidden");
    expect(writes.insert).toBeNull();
  });

  it("admin actor, no existing row → insert with client_id = TARGET_CLIENT", async () => {
    const { client, writes } = makeMockClient({
      role: "admin",
      selectExisting: null,
    });
    const result = await adminSubmitFormCore(
      adminDeps(client),
      TARGET_CLIENT,
      "emergency",
      validEmergencyData,
    );
    expect(result.kind).toBe("success");
    // Insert payload must carry target client id.
    expect(writes.insert?.client_id).toBe(TARGET_CLIENT);
    expect(writes.insert?.client_id).not.toBe("actor-admin");
  });

  it("admin actor, existing row → update (not second insert)", async () => {
    const { client, writes } = makeMockClient({
      role: "admin",
      selectExisting: { id: "existing-form-row" },
    });
    const result = await adminSubmitFormCore(
      adminDeps(client),
      TARGET_CLIENT,
      "emergency",
      validEmergencyData,
    );
    expect(result.kind).toBe("success");
    // update path: writes.update should be set, insert should be null for forms
    expect(writes.update).not.toBeNull();
  });

  it("validation error for invalid form data → no write", async () => {
    const { client, writes } = makeMockClient({ role: "admin" });
    const result = await adminSubmitFormCore(
      adminDeps(client),
      TARGET_CLIENT,
      "emergency",
      {
        contact_name: "",
        contact_phone: "",
        contact_relationship: "",
        vet_name: "",
        vet_phone: "",
      },
    );
    expect(result.kind).toBe("validation_error");
    expect(writes.insert).toBeNull();
  });

  it("unknown form_key → validation_error", async () => {
    const { client } = makeMockClient({ role: "admin" });
    const result = await adminSubmitFormCore(
      adminDeps(client),
      TARGET_CLIENT,
      // @ts-expect-error — intentionally passing an invalid key for the test
      "unknown_key",
      {},
    );
    expect(result.kind).toBe("validation_error");
  });
});

// ─── adminUploadPetPhotoCore ──────────────────────────────────────────────────

describe("adminUploadPetPhotoCore", () => {
  const PET_ID = "pet-photo-uuid";

  function makeFile(size = 100): File {
    return new File([new Uint8Array(size)], "photo.jpg", {
      type: "image/jpeg",
    });
  }

  it("non-admin actor → forbidden, no upload", async () => {
    const { client, writes } = makeMockClient({ role: "client" });
    const result = await adminUploadPetPhotoCore(
      nonAdminDeps(client),
      TARGET_CLIENT,
      PET_ID,
      makeFile(),
    );
    expect(result.kind).toBe("forbidden");
    expect(writes.storagePath).toBeNull();
  });

  it("admin actor → uploads to TARGET_CLIENT storage path (not actor path)", async () => {
    const { client, writes } = makeMockClient({ role: "admin" });
    const result = await adminUploadPetPhotoCore(
      adminDeps(client),
      TARGET_CLIENT,
      PET_ID,
      makeFile(),
    );
    expect(result.kind).toBe("success");
    // Path must start with the target client id.
    expect(writes.storageClientId).toBe(TARGET_CLIENT);
    expect(writes.storageClientId).not.toBe("actor-admin");
    // And the update must be scoped to the target client.
    const colValues = Object.fromEntries(
      writes.updateFilters.map((f) => [f.col, f.val]),
    );
    expect(colValues.client_id).toBe(TARGET_CLIENT);
  });

  it("zero-byte file → validation_error, no upload", async () => {
    const { client, writes } = makeMockClient({ role: "admin" });
    const result = await adminUploadPetPhotoCore(
      adminDeps(client),
      TARGET_CLIENT,
      PET_ID,
      makeFile(0),
    );
    expect(result.kind).toBe("validation_error");
    expect(writes.storagePath).toBeNull();
  });

  it("storage error → error result", async () => {
    const { client } = makeMockClient({
      role: "admin",
      uploadError: "bucket full",
    });
    const result = await adminUploadPetPhotoCore(
      adminDeps(client),
      TARGET_CLIENT,
      PET_ID,
      makeFile(),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.message).toContain("bucket full");
  });
});
