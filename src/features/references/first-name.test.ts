import { describe, it, expect } from "vitest";
import { referenceFirstName } from "./first-name";

describe("referenceFirstName", () => {
  it("leaves a one-name household alone", () => {
    expect(referenceFirstName("Bugaboo")).toBe("Bugaboo");
  });

  it("drops the rest of an 'X and Y' household", () => {
    expect(referenceFirstName("Abby and Sloane")).toBe("Abby");
  });

  it("drops the rest of a comma list", () => {
    expect(referenceFirstName("Madeleine, Apollo, Anabella")).toBe("Madeleine");
  });

  it("handles a comma list whose last item is joined with 'and'", () => {
    expect(referenceFirstName("Ginna, Bill and Niko")).toBe("Ginna");
  });

  it("keeps a two-word leading name whole", () => {
    expect(referenceFirstName("Mary Jane and Rex")).toBe("Mary Jane");
  });

  it("does not split on 'and' inside a word", () => {
    expect(referenceFirstName("Sandy")).toBe("Sandy");
  });

  it("trims surrounding whitespace", () => {
    expect(referenceFirstName("  Carol and Millie ")).toBe("Carol");
  });

  it("returns an empty string when there is no name", () => {
    expect(referenceFirstName("   ")).toBe("");
  });
});
