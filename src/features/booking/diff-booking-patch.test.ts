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
  quantities: { type: "walk", qty: { hours: 1 } },
  comments: "hello",
};

const BASE_CURRENT: EditPatchCurrent = {
  startsAt: new Date(START_ISO),
  endsAt: new Date(END_ISO),
  selectedPetIds: ["pet-1", "pet-2"],
  quantities: { type: "walk", qty: { hours: 1 } },
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
      quantities: { type: "walk", qty: { hours: 2 } },
    });
    expect(patch.quantities).toEqual({ hours: 2 });
  });

  it("includes comments when they change", () => {
    const patch = diffBookingPatch(BASE_INITIAL, {
      ...BASE_CURRENT,
      comments: "updated notes",
    });
    expect(patch.comments).toBe("updated notes");
  });

  it("includes all changed dimensions in a combined change", () => {
    const newStart = new Date("2025-08-03T10:00:00.000Z");
    const newEnd = new Date("2025-08-03T11:00:00.000Z");
    const patch = diffBookingPatch(BASE_INITIAL, {
      ...BASE_CURRENT,
      startsAt: newStart,
      endsAt: newEnd,
      selectedPetIds: ["pet-3"],
      quantities: { type: "walk", qty: { hours: 2 } },
      comments: "combined",
    });
    expect(patch.startsAt).toEqual(newStart);
    expect(patch.endsAt).toEqual(newEnd);
    expect(patch.petIds).toEqual(["pet-3"]);
    expect(patch.quantities).toEqual({ hours: 2 });
    expect(patch.comments).toBe("combined");
  });
});
