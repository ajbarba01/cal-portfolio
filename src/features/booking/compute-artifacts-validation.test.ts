import { describe, expect, it, vi } from "vitest";
import {
  computeBookingArtifacts,
  deriveBookingRequirements,
  validateBookingInput,
} from "./booking-service-shared";
import { CLIENT_POLICY } from "./mutation-policy";
import type { CreateBookingInput } from "./booking-service-shared";
import type { FormStatusRow } from "./booking-repository-types";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const PET_ID = "22222222-2222-2222-2222-222222222222";

function validInput(): CreateBookingInput {
  return {
    userId: USER_ID,
    serviceSlug: "dog-walk",
    startsAt: "2026-09-10T15:00:00.000Z",
    endsAt: "2026-09-10T16:00:00.000Z",
    quantities: { hours: 1 },
    recurringRule: null,
  };
}

describe("validateBookingInput", () => {
  it("coerces a well-formed input and hands back the parsed shape", () => {
    const result = validateBookingInput(validInput());

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("wrong kind");
    expect(result.input.startsAt).toEqual(new Date("2026-09-10T15:00:00.000Z"));
    expect(result.input.endsAt).toEqual(new Date("2026-09-10T16:00:00.000Z"));
    // Consent defaults on; it is consent only and never changes the price.
    expect(result.input.kicheWelcome).toBe(true);
  });

  it("returns a static message and logs the raw issues when the input is malformed", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = validateBookingInput({} as CreateBookingInput);

    expect(result.kind).toBe("validation_error");
    if (result.kind !== "validation_error") throw new Error("wrong kind");
    expect(result.message).toBe(
      "Please check your booking details and try again.",
    );
    // The old bug leaked zod's serialized issues; assert those tokens are gone.
    expect(result.message).not.toMatch(/"code"|"path"|"pattern"|\[/);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("refuses a range that does not move forward", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = validateBookingInput({
      ...validInput(),
      endsAt: "2026-09-10T15:00:00.000Z",
    });

    expect(result.kind).toBe("validation_error");
    errorSpy.mockRestore();
  });
});

describe("deriveBookingRequirements", () => {
  const now = new Date("2026-09-02T12:00:00.000Z");
  const fresh = "2026-08-01T12:00:00.000Z";
  // Older than the 180-day freshness window, so the gate asks for a reconfirm.
  const old = "2025-01-01T12:00:00.000Z";

  it("asks for nothing on the meet and greet", () => {
    expect(
      deriveBookingRequirements({
        pricingType: "meet_greet",
        assignedPets: [{ id: PET_ID, species: "dog" }],
        formStatuses: [],
        now,
      }),
    ).toEqual([]);
  });

  it("reports every unsubmitted profile a walk needs as missing", () => {
    const requirements = deriveBookingRequirements({
      pricingType: "walk",
      assignedPets: [{ id: PET_ID, species: "dog" }],
      formStatuses: [],
      now,
    });

    expect(requirements).toEqual([
      { formKey: "owner", status: "missing" },
      { formKey: "pet_care", petId: PET_ID, petName: "", status: "missing" },
      { formKey: "pet_walk", petId: PET_ID, petName: "", status: "missing" },
    ]);
  });

  it("scopes each submission to its own form key and pet", () => {
    const formStatuses: FormStatusRow[] = [
      { formKey: "owner", petId: null, submittedAt: fresh },
      { formKey: "pet_care", petId: PET_ID, submittedAt: old },
      // Another pet's walk profile must not satisfy this pet's requirement.
      { formKey: "pet_walk", petId: USER_ID, submittedAt: fresh },
    ];

    const requirements = deriveBookingRequirements({
      pricingType: "walk",
      assignedPets: [{ id: PET_ID, species: "dog" }],
      formStatuses,
      now,
    });

    expect(requirements).toEqual([
      { formKey: "owner", status: "complete" },
      { formKey: "pet_care", petId: PET_ID, petName: "", status: "stale" },
      { formKey: "pet_walk", petId: PET_ID, petName: "", status: "missing" },
    ]);
  });

  it("does not ask a cat for the dog-only walk profile", () => {
    const requirements = deriveBookingRequirements({
      pricingType: "walk",
      assignedPets: [{ id: PET_ID, species: "cat" }],
      formStatuses: [],
      now,
    });

    expect(requirements.map((r) => r.formKey)).toEqual(["owner", "pet_care"]);
  });
});

describe("computeBookingArtifacts validation branch", () => {
  it("returns a clean static message and does not leak zod's serialized issues", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Invalid input: fails safeParse before any deps/DB access is reached.
    const result = await computeBookingArtifacts(
      {} as never,
      {} as CreateBookingInput,
      CLIENT_POLICY,
    );
    expect(result.kind).toBe("validation_error");
    if (result.kind !== "validation_error") throw new Error("wrong kind");
    expect(result.message).toBe(
      "Please check your booking details and try again.",
    );
    // The old bug leaked JSON with these tokens; assert they are gone.
    expect(result.message).not.toMatch(/"code"|"path"|"pattern"|\[/);
    expect(errorSpy).toHaveBeenCalled(); // raw issues logged server-side
    errorSpy.mockRestore();
  });
});
