import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONSTRAINTS,
  SERVICE_DETAIL_COLUMNS,
  toServiceDetail,
  type ServiceDetailRow,
} from "./service-detail";

const walkConfig = {
  modifiers: [],
  constraints: { intervalMin: 30, allowedSpecies: ["dog"], maxDogs: 2 },
};

const walkRow: ServiceDetailRow = {
  id: "service-1",
  slug: "walk",
  name: "Dog Walk",
  description: "A walk",
  pricing_type: "walk",
  pricing_config: walkConfig,
  default_duration_min: 30,
};

describe("DEFAULT_CONSTRAINTS", () => {
  it("is a permissive dog/cat fallback used when a service has no parseable config", () => {
    expect(DEFAULT_CONSTRAINTS.intervalMin).toBeGreaterThan(0);
    expect(DEFAULT_CONSTRAINTS.allowedSpecies).toEqual(["dog", "cat"]);
    expect(DEFAULT_CONSTRAINTS.maxDogs).toBeUndefined();
  });
});

describe("toServiceDetail", () => {
  it("maps a services row onto the descriptor the booking UI consumes", () => {
    expect(toServiceDetail(walkRow)).toEqual({
      slug: "walk",
      name: "Dog Walk",
      description: "A walk",
      pricingType: "walk",
      defaultDurationMin: 30,
      constraints: walkConfig.constraints,
    });
  });

  it("falls back to the permissive constraints when pricing_config will not parse", () => {
    expect(
      toServiceDetail({ ...walkRow, pricing_config: { nope: true } })
        .constraints,
    ).toEqual(DEFAULT_CONSTRAINTS);
  });

  it("carries a null description and duration through unchanged", () => {
    const detail = toServiceDetail({
      ...walkRow,
      description: null,
      default_duration_min: null,
    });

    expect(detail.description).toBeNull();
    expect(detail.defaultDurationMin).toBeNull();
  });

  it("selects every column it maps, so a caller's select cannot drift from it", () => {
    const selected = SERVICE_DETAIL_COLUMNS.split(",").map((c) => c.trim());

    // `id` is not on ServiceDetail, but every caller keys further queries by it.
    expect(selected).toContain("id");
    for (const column of Object.keys(walkRow)) {
      expect(selected).toContain(column);
    }
  });
});
