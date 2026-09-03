// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { quantitiesToRecord } from "../quantities";
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

describe("quantitiesToRecord", () => {
  it("emits a zeroed walk add-on so an edit can drop it", () => {
    // An edit patch is spread over the booking's stored quantities, so omitting
    // the key at 0 would leave the previous minutes in place — the client could
    // never remove the walk add-on.
    expect(quantitiesToRecord(hsState, 4)).toEqual({
      nights: 4,
      walkMinutesPerDay: 0,
      maxHoursAway: 8,
    });
  });
});
