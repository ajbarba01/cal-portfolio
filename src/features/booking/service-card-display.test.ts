import { describe, expect, it } from "vitest";
import type { PublicService } from "@/features/booking/services-repo";
import type { ServicePricingConfig } from "@/features/pricing";
import {
  serviceCardDescription,
  serviceCardDurationLabel,
} from "./service-card-display";
import { copy } from "@/content/marketing";

// These display helpers consult only pricingType / description / duration — the
// pricingConfig content is irrelevant, so every fixture reuses one minimal
// valid modifier config.
const MINIMAL_CONFIG: ServicePricingConfig = {
  modifiers: [{ kind: "base_per_hour", cents: 2500 }],
  constraints: { intervalMin: 15, allowedSpecies: ["dog"] },
};

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
  pricingConfig: MINIMAL_CONFIG,
} satisfies PublicService;

const HOUSE_SITTING_SERVICE = {
  slug: "house-sitting",
  name: "House Sitting",
  description: null,
  concurrency: "resident",
  default_duration_min: null,
  max_pets: null,
  pricingType: "house_sitting",
  pricingConfig: MINIMAL_CONFIG,
} satisfies PublicService;

const CHECK_IN_SERVICE = {
  slug: "check-in",
  name: "Check-in",
  description: null,
  concurrency: "exclusive",
  default_duration_min: 30,
  max_pets: null,
  pricingType: "check_in",
  pricingConfig: MINIMAL_CONFIG,
} satisfies PublicService;

const WALK_SERVICE = {
  slug: "walk",
  name: "Walk",
  description: null,
  concurrency: "exclusive",
  default_duration_min: 45,
  max_pets: null,
  pricingType: "walk",
  pricingConfig: MINIMAL_CONFIG,
} satisfies PublicService;

const TRAINING_SERVICE = {
  slug: "training",
  name: "Training",
  description: null,
  concurrency: "exclusive",
  default_duration_min: 60,
  max_pets: 1,
  pricingType: "training",
  pricingConfig: MINIMAL_CONFIG,
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
    [HOUSE_SITTING_SERVICE, copy["service.house_sitting.card.body"]],
    [CHECK_IN_SERVICE, copy["service.check_in.card.body"]],
    [WALK_SERVICE, copy["service.walk.card.body"]],
    [TRAINING_SERVICE, copy["service.training.card.body"]],
  ])("falls back for an absent description on %s", (service, expected) => {
    expect(serviceCardDescription(service)).toBe(expected);
  });

  it.each([
    [HOUSE_SITTING_SERVICE, copy["service.house_sitting.card.body"]],
    [CHECK_IN_SERVICE, copy["service.check_in.card.body"]],
    [WALK_SERVICE, copy["service.walk.card.body"]],
    [TRAINING_SERVICE, copy["service.training.card.body"]],
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
      copy["service.meet_greet.card.body"],
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
