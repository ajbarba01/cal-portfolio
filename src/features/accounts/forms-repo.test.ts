import { describe, it, expect } from "vitest";

import { createFakeSupabase } from "@/test-stubs/fake-supabase";

import {
  FORM_RESPONSE_COLUMNS,
  formResponseKey,
  keyFormResponses,
  listClientForms,
  type FormResponseRow,
} from "./forms-repo";

function row(
  formKey: string,
  petId: string | null = null,
  data: Record<string, unknown> = {},
): FormResponseRow {
  return {
    id: `${formKey}-${petId ?? "account"}`,
    form_key: formKey,
    pet_id: petId,
    data,
    submitted_at: "2026-08-01T12:00:00.000Z",
  };
}

// ─── The keying rule ──────────────────────────────────────────────────────────

describe("formResponseKey", () => {
  it("keys an account-scoped row by its form key alone", () => {
    expect(formResponseKey(row("owner"))).toBe("owner");
    expect(formResponseKey(row("home_access"))).toBe("home_access");
    expect(formResponseKey(row("home_sitting"))).toBe("home_sitting");
  });

  it("keys a pet-scoped row by form key and pet", () => {
    expect(formResponseKey(row("pet_care", "pet-1"))).toBe("pet_care:pet-1");
    expect(formResponseKey(row("pet_walk", "pet-1"))).toBe("pet_walk:pet-1");
  });

  it("refuses a row whose pet scope contradicts the registry", () => {
    // The write path rejects both shapes; a stored row in either shape has no
    // scope, so it must not shadow the coherent row for the same form.
    expect(formResponseKey(row("owner", "pet-1"))).toBeNull();
    expect(formResponseKey(row("pet_care", null))).toBeNull();
  });

  it("refuses a form key the registry does not know", () => {
    // "home" and "pet" are pre-split keys that may still sit in the table.
    expect(formResponseKey(row("home"))).toBeNull();
    expect(formResponseKey(row("pet", "pet-1"))).toBeNull();
  });

  it("refuses an inherited object property posing as a form key", () => {
    expect(formResponseKey(row("constructor"))).toBeNull();
    expect(formResponseKey(row("toString"))).toBeNull();
  });
});

describe("keyFormResponses", () => {
  it("indexes account and pet rows into one lookup", () => {
    const owner = row("owner", null, { full_name: "Sam" });
    const careA = row("pet_care", "pet-a");
    const careB = row("pet_care", "pet-b");

    expect(keyFormResponses([owner, careA, careB])).toEqual({
      owner,
      "pet_care:pet-a": careA,
      "pet_care:pet-b": careB,
    });
  });

  it("drops unkeyable rows instead of inventing a key for them", () => {
    expect(keyFormResponses([row("home"), row("pet_walk", null)])).toEqual({});
  });
});

// ─── The read ─────────────────────────────────────────────────────────────────

describe("listClientForms", () => {
  it("reads the canonical columns for one client", async () => {
    const client = createFakeSupabase();

    await listClientForms(client, "client-1");

    expect(client.calls({ table: "form_responses", method: "select" })).toEqual(
      [
        {
          table: "form_responses",
          method: "select",
          args: [FORM_RESPONSE_COLUMNS],
        },
      ],
    );
    expect(client.calls({ table: "form_responses", method: "eq" })).toEqual([
      {
        table: "form_responses",
        method: "eq",
        args: ["client_id", "client-1"],
      },
    ]);
  });

  it("returns the rows keyed by scope", async () => {
    const owner = row("owner");
    const care = row("pet_care", "pet-a");
    const client = createFakeSupabase({
      tables: { form_responses: { data: [owner, care], error: null } },
    });

    const { data, error } = await listClientForms(client, "client-1");

    expect(error).toBeNull();
    expect(data).toEqual({ owner, "pet_care:pet-a": care });
  });

  it("returns the read error rather than an empty lookup that reads as unfilled forms", async () => {
    const client = createFakeSupabase({
      tables: {
        form_responses: { data: null, error: { message: "connection reset" } },
      },
    });

    const { data, error } = await listClientForms(client, "client-1");

    expect(error).toEqual({ message: "connection reset" });
    expect(data).toEqual({});
  });
});
