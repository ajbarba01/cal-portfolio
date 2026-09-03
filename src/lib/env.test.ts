import { describe, it, expect } from "vitest";
import { requireEnv } from "./env";

describe("requireEnv", () => {
  it("returns the value when it is set", () => {
    expect(requireEnv("SOME_KEY", "sk_live_abc")).toBe("sk_live_abc");
  });

  it.each([undefined, ""])("throws naming the variable for %o", (value) => {
    expect(() => requireEnv("SOME_KEY", value)).toThrow(
      "Missing SOME_KEY — set it in .env.local before starting the server.",
    );
  });

  it("uses the caller's hint when the dev server is not the answer", () => {
    expect(() =>
      requireEnv("SOME_KEY", undefined, "run via `npm run db:seed`"),
    ).toThrow("Missing SOME_KEY — run via `npm run db:seed`.");
  });
});
