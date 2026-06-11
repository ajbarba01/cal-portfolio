// @vitest-environment jsdom
import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NavBadge } from "./nav-badge";

it("renders the visible count (aria-hidden) and sr-only accessible text when positive", () => {
  render(<NavBadge count={3} label="items need attention" />);
  // Visible pill is aria-hidden — find by text content
  const pill = screen.getByText("3");
  expect(pill).toBeTruthy();
  expect(pill.getAttribute("aria-hidden")).toBe("true");
  // sr-only sibling carries the full accessible label
  expect(screen.getByText("3 items need attention")).toBeTruthy();
});

it("caps the visible count at 99+", () => {
  render(<NavBadge count={100} label="things" />);
  expect(screen.getByText("99+")).toBeTruthy();
  // sr-only still shows the real count
  expect(screen.getByText("100 things")).toBeTruthy();
});

it("renders nothing when the count is zero (no noise)", () => {
  const { container } = render(<NavBadge count={0} label="x" />);
  expect(container.firstChild).toBeNull();
});
