import { describe, expect, it } from "vitest";
import type { PublicService } from "@/features/booking/services-repo";
import {
  serviceCardDescription,
  serviceCardDurationLabel,
} from "./service-card-display";

// ---------------------------------------------------------------------------
// meet_greet fixture (mirrors check_in shape — single-day timed visit)
// ---------------------------------------------------------------------------

const MEET_GREET_SERVICE = {
  slug: "meet-greet",
  name: "Meet & Greet",
  description: null,
  concurrency: "exclusive",
  default_duration_min: 30,
  max_pets: null,
  pricingType: "meet_greet",
  pricingConfig: {},
} satisfies PublicService;

const HOUSE_SITTING_SERVICE = {
  slug: "house-sitting",
  name: "House Sitting",
  description: null,
  concurrency: "resident",
  default_duration_min: null,
  max_pets: null,
  pricingType: "house_sitting",
  pricingConfig: {
    base_dog_cents_per_night: 5000,
    base_cat_cents_per_night: 3000,
    extra_dog_cents_per_night: 1500,
    extra_cat_cents_per_night: 1000,
    cant_be_left_alone_cents_per_day: 1000,
    extra_walk_15min_cents_per_day: 500,
    holiday_cents_per_day: 1000,
    kiche_discount_pct: 20,
  },
} satisfies PublicService;

const CHECK_IN_SERVICE = {
  slug: "check-in",
  name: "Check-in",
  description: null,
  concurrency: "exclusive",
  default_duration_min: 30,
  max_pets: null,
  pricingType: "check_in",
  pricingConfig: {
    rate_cents_per_hour: 3000,
    minimum_cents: 1500,
  },
} satisfies PublicService;

const WALK_SERVICE = {
  slug: "walk",
  name: "Walk",
  description: null,
  concurrency: "exclusive",
  default_duration_min: 45,
  max_pets: null,
  pricingType: "walk",
  pricingConfig: {
    rate_cents_per_hour: 2500,
    per_dog_cents: 1000,
    kiche_discount_pct: 25,
  },
} satisfies PublicService;

const TRAINING_SERVICE = {
  slug: "training",
  name: "Training",
  description: null,
  concurrency: "exclusive",
  default_duration_min: 60,
  max_pets: 1,
  pricingType: "training",
  pricingConfig: {
    rate_cents_per_hour: 3500,
  },
} satisfies PublicService;

describe("serviceCardDescription", () => {
  it("preserves a real non-empty description", () => {
    const service = {
      ...WALK_SERVICE,
      description: "  Walks and drop-ins with a steady routine.  ",
    };

    expect(serviceCardDescription(service)).toBe(
      "  Walks and drop-ins with a steady routine.  ",
    );
  });

  it.each([
    [
      HOUSE_SITTING_SERVICE,
      "[[BODY: short house-sitting service description]]",
    ],
    [CHECK_IN_SERVICE, "[[BODY: short check-in service description]]"],
    [WALK_SERVICE, "[[BODY: short walk service description]]"],
    [TRAINING_SERVICE, "[[BODY: short training service description]]"],
  ])("falls back for an absent description on %s", (service, expected) => {
    expect(serviceCardDescription(service)).toBe(expected);
  });

  it.each([
    [
      HOUSE_SITTING_SERVICE,
      "[[BODY: short house-sitting service description]]",
    ],
    [CHECK_IN_SERVICE, "[[BODY: short check-in service description]]"],
    [WALK_SERVICE, "[[BODY: short walk service description]]"],
    [TRAINING_SERVICE, "[[BODY: short training service description]]"],
  ])(
    "falls back for whitespace-only description on %s",
    (service, expected) => {
      expect(serviceCardDescription({ ...service, description: "   " })).toBe(
        expected,
      );
    },
  );
});

describe("serviceCardDurationLabel", () => {
  it("returns Overnight for house sitting", () => {
    expect(serviceCardDurationLabel(HOUSE_SITTING_SERVICE)).toBe("Overnight");
  });

  it.each([
    [CHECK_IN_SERVICE, "30 min"],
    [WALK_SERVICE, "45 min"],
    [TRAINING_SERVICE, "60 min"],
  ])("returns the configured duration for %s", (service, expected) => {
    expect(serviceCardDurationLabel(service)).toBe(expected);
  });

  it.each([
    { ...CHECK_IN_SERVICE, default_duration_min: null },
    { ...WALK_SERVICE, default_duration_min: null },
    { ...TRAINING_SERVICE, default_duration_min: null },
  ])("returns null when no duration is configured for %s", (service) => {
    expect(serviceCardDurationLabel(service)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// meet_greet — behaves like check_in (single-day timed visit)
// ---------------------------------------------------------------------------

describe("serviceCardDescription meet_greet", () => {
  it("falls back to a placeholder description", () => {
    expect(serviceCardDescription(MEET_GREET_SERVICE)).toBe(
      "[[BODY: short meet-and-greet service description]]",
    );
  });

  it("preserves a real non-empty description", () => {
    expect(
      serviceCardDescription({
        ...MEET_GREET_SERVICE,
        description: "A free intro visit.",
      }),
    ).toBe("A free intro visit.");
  });
});

describe("serviceCardDurationLabel meet_greet", () => {
  it("returns the configured duration in minutes", () => {
    expect(serviceCardDurationLabel(MEET_GREET_SERVICE)).toBe("30 min");
  });

  it("returns null when no duration is configured", () => {
    expect(
      serviceCardDurationLabel({
        ...MEET_GREET_SERVICE,
        default_duration_min: null,
      }),
    ).toBeNull();
  });
});
