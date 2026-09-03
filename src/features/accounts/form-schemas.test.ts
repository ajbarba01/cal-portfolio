/**
 * The intake-form registry and the schemas behind it.
 *
 * These schemas are the only validation a form response passes on its way into
 * `form_responses`, and the registry's `scope` is what the booking requirement
 * gate counts rows against — a pet-scoped form needs one row per assigned pet,
 * an account-scoped one needs a single row. Both had no coverage at all, so a
 * field losing its `.min(1)` or an entry flipping scope was a silent change.
 *
 * The tables below are the contract: which fields a form insists on, which it
 * merely accepts, and what the registry says each form is keyed to.
 */

import { describe, expect, it } from "vitest";

import { FIELD_LIMITS } from "@/lib/field-limits";

import { formRegistry, type FormKey } from "./form-registry";

const VALID_PHONE = "303-555-0142";

/**
 * The smallest input each form accepts. Every key here is required: the
 * required-field table below drops them one at a time and expects a failure.
 */
const MINIMAL_VALID: Record<FormKey, Record<string, string>> = {
  emergency: {
    contact_name: "Dana Ruiz",
    contact_phone: VALID_PHONE,
    contact_relationship: "Sister",
    vet_name: "Front Range Veterinary",
    vet_phone: VALID_PHONE,
  },
  owner: {
    owner_name: "Sam Reyes",
    owner_phone: VALID_PHONE,
    emergency1_name: "Dana Ruiz",
    emergency1_phone: VALID_PHONE,
    emergency1_relationship: "Sister",
    vet_name: "Front Range Veterinary",
    vet_phone: VALID_PHONE,
  },
  home_access: {
    address: "1200 Pearl St",
    entry_instructions: "Lockbox on the side gate, code 4417.",
  },
  home_sitting: {},
  pet_care: {},
  pet_walk: {},
};

const FORM_KEYS = Object.keys(formRegistry) as FormKey[];

/** One `[form, field]` row per required field across every form. */
const REQUIRED_FIELDS = FORM_KEYS.flatMap((key) =>
  Object.keys(MINIMAL_VALID[key]).map((field) => [key, field] as const),
);

/** The forms whose fields are all optional — a saved blank row is complete. */
const ALL_OPTIONAL_FORMS = FORM_KEYS.filter(
  (key) => Object.keys(MINIMAL_VALID[key]).length === 0,
);

describe("formRegistry", () => {
  it("keys pet detail to the pet and everything else to the account", () => {
    // The gate multiplies a pet-scoped form by the assigned pets; miscounting
    // here either blocks a complete profile or lets an incomplete one book.
    const scopes = Object.fromEntries(
      FORM_KEYS.map((key) => [key, formRegistry[key].scope]),
    );

    expect(scopes).toEqual({
      emergency: "account",
      owner: "account",
      home_access: "account",
      home_sitting: "account",
      pet_care: "pet",
      pet_walk: "pet",
    });
  });

  it.each(FORM_KEYS)("gives %s a card title for the admin view", (key) => {
    expect(formRegistry[key].title.trim()).not.toBe("");
  });

  it.each(FORM_KEYS)("accepts the minimal %s response", (key) => {
    expect(formRegistry[key].schema.safeParse(MINIMAL_VALID[key]).success).toBe(
      true,
    );
  });

  it.each(ALL_OPTIONAL_FORMS)("treats an empty %s response as valid", (key) => {
    // These forms are narrative detail: the gate counts a saved row, not fields.
    expect(formRegistry[key].schema.safeParse({}).success).toBe(true);
  });

  it.each(FORM_KEYS)("drops keys %s does not declare", (key) => {
    const parsed = formRegistry[key].schema.safeParse({
      ...MINIMAL_VALID[key],
      role: "admin",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data : null).not.toHaveProperty("role");
  });
});

describe("required fields", () => {
  it.each(REQUIRED_FIELDS)("%s rejects a response missing %s", (key, field) => {
    const { [field]: _omitted, ...withoutField } = MINIMAL_VALID[key];

    const parsed = formRegistry[key].schema.safeParse(withoutField);

    expect(parsed.success).toBe(false);
    expect(
      !parsed.success &&
        parsed.error.issues.map((issue) => issue.path.join(".")),
    ).toContain(field);
  });

  it.each(REQUIRED_FIELDS)("%s rejects an empty %s", (key, field) => {
    const parsed = formRegistry[key].schema.safeParse({
      ...MINIMAL_VALID[key],
      [field]: "",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("phone fields", () => {
  it.each([
    ["owner", "owner_phone"],
    ["owner", "emergency1_phone"],
    ["owner", "vet_phone"],
    ["emergency", "contact_phone"],
    ["emergency", "vet_phone"],
  ] as const)("%s rejects a %s that cannot be dialled", (key, field) => {
    const parsed = formRegistry[key].schema.safeParse({
      ...MINIMAL_VALID[key],
      [field]: "call the front desk",
    });

    expect(parsed.success).toBe(false);
  });

  it.each(["second_owner_phone", "third_owner_phone", "emergency2_phone"])(
    "lets the optional owner field %s stay blank",
    (field) => {
      // The form posts every input it renders, so an untouched optional phone
      // arrives as "" rather than absent — rejecting it would block a save.
      const parsed = formRegistry.owner.schema.safeParse({
        ...MINIMAL_VALID.owner,
        [field]: "",
      });

      expect(parsed.success).toBe(true);
    },
  );

  it("still validates an optional owner phone that was filled in", () => {
    const parsed = formRegistry.owner.schema.safeParse({
      ...MINIMAL_VALID.owner,
      second_owner_phone: "nope",
    });

    expect(parsed.success).toBe(false);
  });

  it.each(["+44 20 7946 0958", "(303) 555-0142", "303.555.0142"])(
    "accepts the real-world format %s",
    (phone) => {
      const parsed = formRegistry.owner.schema.safeParse({
        ...MINIMAL_VALID.owner,
        owner_phone: phone,
      });

      expect(parsed.success).toBe(true);
    },
  );
});

describe("length caps", () => {
  // The server `.max()` is the real wall; the input's maxLength is UX only, so
  // an oversized paste has to fail here.
  it.each([
    ["owner", "owner_name", FIELD_LIMITS.name],
    ["owner", "additional_notes", FIELD_LIMITS.note],
    ["home_access", "address", FIELD_LIMITS.addressLine],
    ["home_access", "wifi", FIELD_LIMITS.shortText],
    ["home_sitting", "house_rules", FIELD_LIMITS.note],
    ["pet_care", "feeding_schedule", FIELD_LIMITS.note],
    ["pet_walk", "walk_pace", FIELD_LIMITS.shortText],
  ] as const)("%s caps %s at its field limit", (key, field, limit) => {
    const schema = formRegistry[key].schema;
    const base = MINIMAL_VALID[key];

    expect(
      schema.safeParse({ ...base, [field]: "x".repeat(limit) }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ ...base, [field]: "x".repeat(limit + 1) }).success,
    ).toBe(false);
  });
});
