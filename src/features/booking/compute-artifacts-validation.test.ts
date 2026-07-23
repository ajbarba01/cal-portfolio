import { describe, expect, it, vi } from "vitest";
import { computeBookingArtifacts } from "./booking-service-shared";
import { CLIENT_POLICY } from "./mutation-policy";
import type { CreateBookingInput } from "./booking-service-shared";

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
