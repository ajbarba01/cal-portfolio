import { describe, it, expect } from "vitest";
import { visibleFields } from "./profile-fields";

const fields = [
  { name: "friendly_strangers", label: "With strangers", max: 100 },
  {
    name: "friendly_dogs",
    label: "With other dogs",
    max: 100,
    species: ["dog"] as const,
  },
];

describe("visibleFields", () => {
  it("hides dog-only fields for a cat", () => {
    expect(visibleFields(fields, "cat").map((f) => f.name)).toEqual([
      "friendly_strangers",
    ]);
  });
  it("shows dog-only fields for a dog", () => {
    expect(visibleFields(fields, "dog").map((f) => f.name)).toEqual([
      "friendly_strangers",
      "friendly_dogs",
    ]);
  });
  it("shows all fields when species is unknown (account-scoped forms)", () => {
    expect(visibleFields(fields, undefined).map((f) => f.name)).toEqual([
      "friendly_strangers",
      "friendly_dogs",
    ]);
  });
});
