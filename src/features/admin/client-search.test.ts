import { describe, expect, it } from "vitest";

import { matchesClientQuery, type ClientSearchable } from "./client-search";

const client: ClientSearchable = {
  full_name: "Jamie Rivera",
  email: "jamie@example.com",
  phone: "720-555-0143",
};

describe("matchesClientQuery", () => {
  it("matches case-insensitively on name, email, or phone substring", () => {
    expect(matchesClientQuery(client, "rivera")).toBe(true);
    expect(matchesClientQuery(client, "JAMIE@")).toBe(true);
    expect(matchesClientQuery(client, "0143")).toBe(true);
  });

  it("empty/whitespace query matches everything", () => {
    expect(matchesClientQuery(client, "")).toBe(true);
    expect(matchesClientQuery(client, "   ")).toBe(true);
  });

  it("returns false on no match and tolerates null fields", () => {
    expect(matchesClientQuery(client, "zzz")).toBe(false);
    expect(
      matchesClientQuery({ full_name: null, email: null, phone: null }, "x"),
    ).toBe(false);
  });
});
