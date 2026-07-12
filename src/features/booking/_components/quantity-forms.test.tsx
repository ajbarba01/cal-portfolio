// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuantityForm } from "./quantity-forms";

const hsState = {
  type: "house_sitting" as const,
  qty: { walkMinutesPerDay: 0, maxHoursAway: 8 },
};

describe("QuantityForm walk stepper gate", () => {
  it("hides the walk stepper when no dog is assigned", () => {
    render(<QuantityForm state={hsState} onChange={() => {}} hasDog={false} />);
    expect(screen.queryByText("Walk time per day")).not.toBeInTheDocument();
  });
  it("shows the walk stepper when a dog is assigned", () => {
    render(<QuantityForm state={hsState} onChange={() => {}} hasDog={true} />);
    expect(screen.getByText("Walk time per day")).toBeInTheDocument();
  });
});
