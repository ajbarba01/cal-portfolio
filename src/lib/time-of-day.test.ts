import { describe, expect, it } from "vitest";
import { minutesToClock, clockToMinutes } from "./time-of-day";

describe("time-of-day", () => {
  it("splits minutes-since-midnight into 12h parts", () => {
    expect(minutesToClock(390)).toEqual({
      hour12: 6,
      minute: 30,
      meridiem: "AM",
    });
    expect(minutesToClock(0)).toEqual({
      hour12: 12,
      minute: 0,
      meridiem: "AM",
    });
    expect(minutesToClock(720)).toEqual({
      hour12: 12,
      minute: 0,
      meridiem: "PM",
    });
    expect(minutesToClock(1320)).toEqual({
      hour12: 10,
      minute: 0,
      meridiem: "PM",
    });
  });
  it("round-trips", () => {
    for (const m of [0, 1, 390, 719, 720, 721, 1320, 1439]) {
      const c = minutesToClock(m);
      expect(clockToMinutes(c.hour12, c.minute, c.meridiem)).toBe(m);
    }
  });
});
