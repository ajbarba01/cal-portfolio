import { describe, expect, it } from "vitest";

import { plural } from "./plural";

describe("plural", () => {
  it("keeps the singular noun for exactly one", () => {
    expect(plural(1, "star")).toBe("1 star");
  });

  it("appends an s for every other count", () => {
    expect(plural(0, "star")).toBe("0 stars");
    expect(plural(2, "star")).toBe("2 stars");
    expect(plural(5, "star")).toBe("5 stars");
  });

  it("uses an explicit plural form for irregular nouns", () => {
    expect(plural(1, "inquiry", "inquiries")).toBe("1 inquiry");
    expect(plural(3, "inquiry", "inquiries")).toBe("3 inquiries");
  });

  it("treats a fractional count as plural", () => {
    expect(plural(1.5, "hour")).toBe("1.5 hours");
  });
});
