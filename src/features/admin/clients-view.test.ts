/**
 * TDD tests for clients-view.ts pure helpers.
 * applyClientFilter + sortClients.
 */

import { describe, expect, it } from "vitest";
import { applyClientFilter, sortClients } from "./clients-view";
import type { ClientListRow } from "./clients-actions";
import type { OnboardingStatus } from "@/features/booking";

function makeClient(
  overrides: Partial<ClientListRow> & { id: string },
): ClientListRow {
  return {
    full_name: null,
    email: null,
    phone: null,
    petCount: 0,
    bookingCount: 0,
    outstandingCents: 0,
    onboardingStatus: "info_pending" as OnboardingStatus,
    meetGreetUpcoming: false,
    ...overrides,
  };
}

const alice = makeClient({
  id: "a",
  full_name: "Alice",
  outstandingCents: 1000,
  bookingCount: 5,
  onboardingStatus: "approved",
});
const bob = makeClient({
  id: "b",
  full_name: "Bob",
  outstandingCents: 0,
  bookingCount: 2,
  onboardingStatus: "info_pending",
});
const carol = makeClient({
  id: "c",
  full_name: "Carol",
  outstandingCents: 0,
  bookingCount: 10,
  onboardingStatus: "meet_greet_pending",
});
const dave = makeClient({
  id: "d",
  full_name: "Dave",
  outstandingCents: 500,
  bookingCount: 0,
  onboardingStatus: "declined",
});

const all = [alice, bob, carol, dave];

// ──────────────────────────────────────────────────────────────────────────────
// applyClientFilter
// ──────────────────────────────────────────────────────────────────────────────
describe("applyClientFilter", () => {
  it("all — returns every row unchanged", () => {
    expect(applyClientFilter(all, "all")).toEqual(all);
  });

  it("owing — returns only rows with outstandingCents > 0", () => {
    const result = applyClientFilter(all, "owing");
    expect(result.map((r) => r.id)).toEqual(["a", "d"]);
  });

  it("owing — excludes zero-balance rows", () => {
    const result = applyClientFilter(all, "owing");
    expect(result.every((r) => r.outstandingCents > 0)).toBe(true);
  });

  it("needs_onboarding — includes info_pending and meet_greet_pending", () => {
    const result = applyClientFilter(all, "needs_onboarding");
    const ids = result.map((r) => r.id);
    expect(ids).toContain("b"); // info_pending
    expect(ids).toContain("c"); // meet_greet_pending
  });

  it("needs_onboarding — excludes approved and declined", () => {
    const result = applyClientFilter(all, "needs_onboarding");
    const ids = result.map((r) => r.id);
    expect(ids).not.toContain("a"); // approved
    expect(ids).not.toContain("d"); // declined
  });

  it("active — returns only approved rows", () => {
    const result = applyClientFilter(all, "active");
    expect(result.map((r) => r.id)).toEqual(["a"]);
  });

  it("active — excludes non-approved rows", () => {
    const result = applyClientFilter(all, "active");
    expect(result.every((r) => r.onboardingStatus === "approved")).toBe(true);
  });

  it("returns empty array when no rows match", () => {
    const empty: ClientListRow[] = [];
    expect(applyClientFilter(empty, "owing")).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [...all];
    applyClientFilter(input, "owing");
    expect(input).toEqual(all);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// sortClients
// ──────────────────────────────────────────────────────────────────────────────
describe("sortClients — name", () => {
  it("asc — sorts A→Z by full_name (case-insensitive)", () => {
    const result = sortClients(all, "name", "asc");
    expect(result.map((r) => r.full_name)).toEqual([
      "Alice",
      "Bob",
      "Carol",
      "Dave",
    ]);
  });

  it("desc — sorts Z→A by full_name", () => {
    const result = sortClients(all, "name", "desc");
    expect(result.map((r) => r.full_name)).toEqual([
      "Dave",
      "Carol",
      "Bob",
      "Alice",
    ]);
  });

  it("falls back to email when full_name is null", () => {
    const noName = makeClient({
      id: "e",
      full_name: null,
      email: "z@test.com",
    });
    const result = sortClients([alice, noName], "name", "asc");
    expect(result[0]!.id).toBe("a"); // Alice < z@test.com
  });

  it("is case-insensitive", () => {
    const lower = makeClient({ id: "x", full_name: "aaron" });
    const result = sortClients([alice, lower], "name", "asc");
    expect(result[0]!.id).toBe("x"); // aaron < Alice
  });

  it("does not mutate the input array", () => {
    const input = [...all];
    sortClients(input, "name", "asc");
    expect(input).toEqual(all);
  });
});

describe("sortClients — balance", () => {
  it("asc — sorts by outstandingCents ascending", () => {
    const result = sortClients(all, "balance", "asc");
    // bob=0, carol=0, dave=500, alice=1000
    expect(result.map((r) => r.outstandingCents)).toEqual([0, 0, 500, 1000]);
  });

  it("desc — sorts by outstandingCents descending", () => {
    const result = sortClients(all, "balance", "desc");
    expect(result.map((r) => r.outstandingCents)).toEqual([1000, 500, 0, 0]);
  });

  it("tie-handling — stable relative order preserved for equal cents", () => {
    const result = sortClients(all, "balance", "asc");
    const zeros = result.filter((r) => r.outstandingCents === 0);
    // bob comes before carol in original; stable sort preserves that
    expect(zeros.map((r) => r.id)).toEqual(["b", "c"]);
  });
});

describe("sortClients — bookings", () => {
  it("asc — sorts by bookingCount ascending", () => {
    const result = sortClients(all, "bookings", "asc");
    expect(result.map((r) => r.bookingCount)).toEqual([0, 2, 5, 10]);
  });

  it("desc — sorts by bookingCount descending", () => {
    const result = sortClients(all, "bookings", "desc");
    expect(result.map((r) => r.bookingCount)).toEqual([10, 5, 2, 0]);
  });
});
