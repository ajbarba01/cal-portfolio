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

function setup(errors: Record<string, string> = {}) {
  const onConfigChange = vi.fn();
  const onDefaultDurationChange = vi.fn();
  render(
    <PricingFieldsEditor
      config={WALK}
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
    const next = onConfigChange.mock.calls[0][0] as ServicePricingConfig;
    expect((next.modifiers[0] as { cents: number }).cents).toBe(3000);
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
});
