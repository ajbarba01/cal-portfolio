import { describe, it, expect } from "vitest";
import { assertLocalDbUrl } from "./client";

describe("assertLocalDbUrl", () => {
  it.each(["http://127.0.0.1:54321", "http://localhost:54321"])(
    "allows %s",
    (url) => {
      expect(() => assertLocalDbUrl(url)).not.toThrow();
    },
  );

  it.each([
    "https://mvrbmrzrifamkbnjfrvd.supabase.co",
    "https://example.com",
    "http://192.168.1.10:54321",
  ])("refuses %s", (url) => {
    expect(() => assertLocalDbUrl(url)).toThrow(/local-only/);
  });
});
