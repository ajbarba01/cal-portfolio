// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ErrorState } from "./error-state";

describe("ErrorState", () => {
  it("falls back to the generic load-failure pair when given no copy", () => {
    render(<ErrorState />);

    expect(
      screen.getByRole("heading", { name: "Couldn't load this" }),
    ).toBeTruthy();
    expect(
      screen.getByText("We couldn't load this right now. Please try again."),
    ).toBeTruthy();
  });

  it("keeps a caller's own title and message", () => {
    render(<ErrorState title="Couldn't load bookings" message="Try later." />);

    expect(
      screen.getByRole("heading", { name: "Couldn't load bookings" }),
    ).toBeTruthy();
    expect(screen.getByText("Try later.")).toBeTruthy();
    expect(screen.queryByText(/right now/)).toBeNull();
  });
});
