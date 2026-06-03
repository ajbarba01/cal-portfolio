import { describe, it, expect } from "vitest";
import { deriveTimeApproval } from "./time-gate";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-06-03T12:00:00Z");
const cfg = { autoConfirmHorizonDays: 30, hardMaxAdvanceDays: 365 };

/** Returns a Date `days` ahead of `now`. */
function daysOut(days: number): Date {
  return new Date(now.getTime() + days * MS_PER_DAY);
}

describe("deriveTimeApproval", () => {
  it("returns 'auto' for today (0 days ahead)", () => {
    expect(deriveTimeApproval(now, now, cfg)).toBe("auto");
  });

  it("returns 'auto' within the confirm horizon (day 14)", () => {
    expect(deriveTimeApproval(daysOut(14), now, cfg)).toBe("auto");
  });

  it("returns 'auto' at exactly the confirm horizon (boundary: > not >=)", () => {
    expect(deriveTimeApproval(daysOut(30), now, cfg)).toBe("auto");
  });

  it("returns 'pending' just past the confirm horizon", () => {
    expect(deriveTimeApproval(daysOut(31), now, cfg)).toBe("pending");
  });

  it("returns 'pending' in the soft band (2 months out)", () => {
    expect(deriveTimeApproval(daysOut(60), now, cfg)).toBe("pending");
  });

  it("returns 'pending' at exactly the hard cap (boundary: > not >=)", () => {
    expect(deriveTimeApproval(daysOut(365), now, cfg)).toBe("pending");
  });

  it("returns 'refuse' just past the hard cap", () => {
    expect(deriveTimeApproval(daysOut(366), now, cfg)).toBe("refuse");
  });

  it("returns 'refuse' far beyond the hard cap", () => {
    expect(deriveTimeApproval(daysOut(500), now, cfg)).toBe("refuse");
  });

  it("returns 'auto' for a start in the past (lead-time guard owns too-soon)", () => {
    expect(deriveTimeApproval(daysOut(-5), now, cfg)).toBe("auto");
  });
});
