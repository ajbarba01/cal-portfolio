import { describe, it, expect } from "vitest";
import {
  diffBookingPatch,
  type EditPatchInitial,
  type EditPatchCurrent,
} from "./diff-booking-patch";

const START_ISO = "2025-08-01T14:00:00.000Z";
const END_ISO = "2025-08-01T15:00:00.000Z";

const BASE_INITIAL: EditPatchInitial = {
  startsAtIso: START_ISO,
  endsAtIso: END_ISO,
  petIds: ["pet-1", "pet-2"],
  quantities: { type: "walk", qty: { hours: 1, leashManners: false } },
  comments: "hello",
};

// House-sitting initial: 3-night stay (2025-08-10 → 2025-08-13 = 3 days = 3 nights)
const HS_START_ISO = "2025-08-10T06:00:00.000Z"; // Denver midnight-ish for Aug 10
const HS_END_ISO = "2025-08-13T06:00:00.000Z"; // Aug 13 = 3 nights
const HS_INITIAL: EditPatchInitial = {
  startsAtIso: HS_START_ISO,
  endsAtIso: HS_END_ISO,
  petIds: ["pet-1"],
  quantities: {
    type: "house_sitting",
    qty: { walkMinutesPerDay: 0, maxHoursAway: 8 },
  },
  comments: "",
};

const BASE_CURRENT: EditPatchCurrent = {
  startsAt: new Date(START_ISO),
  endsAt: new Date(END_ISO),
  selectedPetIds: ["pet-1", "pet-2"],
  quantities: { type: "walk", qty: { hours: 1, leashManners: false } },
  nights: null,
  comments: "hello",
  petAware: true,
};

describe("diffBookingPatch", () => {
  it("returns {} when nothing changed (no-op)", () => {
    const patch = diffBookingPatch(BASE_INITIAL, BASE_CURRENT);
    expect(patch).toEqual({});
  });

  it("includes startsAt and endsAt when time changes", () => {
    const newStart = new Date("2025-08-02T14:00:00.000Z");
    const newEnd = new Date("2025-08-02T15:00:00.000Z");
    const patch = diffBookingPatch(BASE_INITIAL, {
      ...BASE_CURRENT,
      startsAt: newStart,
      endsAt: newEnd,
    });
    expect(patch.startsAt).toEqual(newStart);
    expect(patch.endsAt).toEqual(newEnd);
    expect(patch.petIds).toBeUndefined();
    expect(patch.quantities).toBeUndefined();
    expect(patch.comments).toBeUndefined();
  });

  it("does NOT include petIds when same ids reordered (order-independent)", () => {
    const patch = diffBookingPatch(BASE_INITIAL, {
      ...BASE_CURRENT,
      selectedPetIds: ["pet-2", "pet-1"],
    });
    expect(patch.petIds).toBeUndefined();
    expect(patch).toEqual({});
  });

  it("includes petIds when the pet set changes", () => {
    const patch = diffBookingPatch(BASE_INITIAL, {
      ...BASE_CURRENT,
      selectedPetIds: ["pet-1", "pet-3"],
    });
    expect(patch.petIds).toEqual(["pet-1", "pet-3"]);
  });

  it("does NOT include petIds when petAware is false even if ids differ", () => {
    const patch = diffBookingPatch(BASE_INITIAL, {
      ...BASE_CURRENT,
      selectedPetIds: ["pet-3"],
      petAware: false,
    });
    expect(patch.petIds).toBeUndefined();
  });

  it("includes quantities when they change", () => {
    const patch = diffBookingPatch(BASE_INITIAL, {
      ...BASE_CURRENT,
      quantities: { type: "walk", qty: { hours: 2, leashManners: false } },
    });
    expect(patch.quantities).toEqual({ hours: 2, leashManners: false });
  });

  it("includes comments when they change", () => {
    const patch = diffBookingPatch(BASE_INITIAL, {
      ...BASE_CURRENT,
      comments: "updated notes",
    });
    expect(patch.comments).toBe("updated notes");
  });

  // ── U24: overnight (house_sitting) reschedule tests ───────────────────────

  it("U24: overnight date change includes patch.quantities with new nights", () => {
    // User changes a 3-night stay to 5 nights. The quantities diff must detect
    // the nights change and include quantities in the patch (was silently dropped,
    // causing stale nights in the merged input → Zod failure).
    const newStart = new Date("2025-08-15T06:00:00.000Z");
    const newEnd = new Date("2025-08-20T06:00:00.000Z"); // 5 nights
    const patch = diffBookingPatch(HS_INITIAL, {
      startsAt: newStart,
      endsAt: newEnd,
      selectedPetIds: ["pet-1"],
      quantities: {
        type: "house_sitting",
        qty: {
          walkMinutesPerDay: 0,
          maxHoursAway: 8,
          holidayDays: 0,
        },
      },
      nights: 5,
      comments: "",
      petAware: true,
    });
    // startsAt + endsAt should be in the patch (time changed)
    expect(patch.startsAt).toEqual(newStart);
    expect(patch.endsAt).toEqual(newEnd);
    // quantities MUST be present and contain the new nights value
    expect(patch.quantities).toBeDefined();
    expect(patch.quantities?.nights).toBe(5);
  });

  it("U24: overnight no-change returns empty patch", () => {
    // When the date range is unchanged (nights = 3, same as initial), no patch.
    const patch = diffBookingPatch(HS_INITIAL, {
      startsAt: new Date(HS_START_ISO),
      endsAt: new Date(HS_END_ISO),
      selectedPetIds: ["pet-1"],
      quantities: {
        type: "house_sitting",
        qty: {
          walkMinutesPerDay: 0,
          maxHoursAway: 8,
          holidayDays: 0,
        },
      },
      nights: 3,
      comments: "",
      petAware: true,
    });
    expect(patch).toEqual({});
  });

  it("U24: overnight extras change without date change includes quantities with initial nights", () => {
    // User changes walkMinutesPerDay. Dates unchanged → nights stays 3.
    // patch.quantities must NOT contain nights: 0 (old bug: current.nights was null).
    const patch = diffBookingPatch(HS_INITIAL, {
      startsAt: new Date(HS_START_ISO),
      endsAt: new Date(HS_END_ISO),
      selectedPetIds: ["pet-1"],
      quantities: {
        type: "house_sitting",
        qty: { walkMinutesPerDay: 30, maxHoursAway: 8 },
      },
      nights: 3,
      comments: "",
      petAware: true,
    });
    expect(patch.quantities).toBeDefined();
    // nights must be the real initial nights (3), NOT 0
    expect(patch.quantities?.nights).toBe(3);
    expect(patch.quantities?.walkMinutesPerDay).toBe(30);
  });

  it("includes all changed dimensions in a combined change", () => {
    const newStart = new Date("2025-08-03T10:00:00.000Z");
    const newEnd = new Date("2025-08-03T11:00:00.000Z");
    const patch = diffBookingPatch(BASE_INITIAL, {
      ...BASE_CURRENT,
      startsAt: newStart,
      endsAt: newEnd,
      selectedPetIds: ["pet-3"],
      quantities: { type: "walk", qty: { hours: 2, leashManners: false } },
      comments: "combined",
    });
    expect(patch.startsAt).toEqual(newStart);
    expect(patch.endsAt).toEqual(newEnd);
    expect(patch.petIds).toEqual(["pet-3"]);
    expect(patch.quantities).toEqual({ hours: 2, leashManners: false });
    expect(patch.comments).toBe("combined");
  });
});
