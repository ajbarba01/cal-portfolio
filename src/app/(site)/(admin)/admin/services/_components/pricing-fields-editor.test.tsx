// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PricingFieldsEditor } from "./pricing-fields-editor";
import type { ServicePricingConfig } from "@/features/pricing";

const WALK: ServicePricingConfig = {
  modifiers: [
    { kind: "base_per_hour", cents: 2500 },
    { kind: "min_floor", cents: 1500 },
  ],
  constraints: {
    intervalMin: 15,
    minDurationMin: 30,
    maxDurationMin: 180,
    maxDogs: 2,
    allowedSpecies: ["dog"],
  },
};

const HOUSE_SIT: ServicePricingConfig = {
  modifiers: [{ kind: "base_per_night", cents: 6000 }],
  constraints: { intervalMin: 15, allowedSpecies: ["dog", "cat"] },
};

function setup(errors: Record<string, string> = {}) {
  const onConfigChange = vi.fn<(next: ServicePricingConfig) => void>();
  const onDefaultDurationChange = vi.fn();
  render(
    <PricingFieldsEditor
      config={WALK}
      pricingType="walk"
      defaultDurationMin={60}
      onConfigChange={onConfigChange}
      onDefaultDurationChange={onDefaultDurationChange}
      errors={errors}
    />,
  );
  return { onConfigChange, onDefaultDurationChange };
}

describe("PricingFieldsEditor", () => {
  it("renders the base rate in dollars and the limits", () => {
    setup();
    expect(
      (screen.getByLabelText("Base rate (per hour)") as HTMLInputElement).value,
    ).toBe("25");
    expect(screen.getByLabelText("Max dogs")).toBeInTheDocument();
    // allowedSpecies is read-only text, not an input.
    expect(screen.queryByLabelText("Allowed species")).toBeNull();
    expect(screen.getByText("dog")).toBeInTheDocument();
  });

  it("converts a dollar edit back to cents via onConfigChange", () => {
    const { onConfigChange } = setup();
    fireEvent.change(screen.getByLabelText("Base rate (per hour)"), {
      target: { value: "30" },
    });
    const next = onConfigChange.mock.calls[0]?.[0];
    expect(next?.modifiers[0]).toMatchObject({ cents: 3000 });
  });

  it("shows a field error from the errors map", () => {
    setup({ "c.maxDogs": "Must be at least 1." });
    expect(screen.getByText("Must be at least 1.")).toBeInTheDocument();
  });

  it("renders the column-backed default duration field", () => {
    const { onDefaultDurationChange } = setup();
    fireEvent.change(screen.getByLabelText("Default duration"), {
      target: { value: "45" },
    });
    expect(onDefaultDurationChange).toHaveBeenCalledWith(45);
  });

  it("omits the default duration for a per-night service", () => {
    render(
      <PricingFieldsEditor
        config={HOUSE_SIT}
        pricingType="house_sitting"
        defaultDurationMin={null}
        onConfigChange={vi.fn()}
        onDefaultDurationChange={vi.fn()}
        errors={{}}
      />,
    );
    expect(screen.queryByLabelText("Default duration")).toBeNull();
    expect(screen.getByLabelText("Base rate (per night)")).toBeInTheDocument();
  });
});
