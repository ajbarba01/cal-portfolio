// @vitest-environment jsdom
import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NavBadge } from "./nav-badge";

it("renders the count with an accessible label when positive", () => {
  render(<NavBadge count={3} label="items need attention" />);
  expect(screen.getByText("3")).toBeTruthy();
  expect(screen.getByLabelText("3 items need attention")).toBeTruthy();
});

it("renders nothing when the count is zero (no noise)", () => {
  const { container } = render(<NavBadge count={0} label="x" />);
  expect(container.firstChild).toBeNull();
});
