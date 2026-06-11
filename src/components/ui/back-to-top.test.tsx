// @vitest-environment jsdom
import { it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { BackToTop } from "./back-to-top";

function scrollTo(y: number) {
  act(() => {
    Object.defineProperty(window, "scrollY", { value: y, writable: true });
    window.dispatchEvent(new Event("scroll"));
  });
}

it("shows past the threshold and hides again when scrolled back below it", () => {
  render(<BackToTop />);
  expect(screen.queryByRole("button", { name: /back to top/i })).toBeNull();

  scrollTo(800);
  expect(screen.getByRole("button", { name: /back to top/i })).toBeTruthy();

  // Scrolling back above the threshold must hide it again (the core contract —
  // guards against a regression that pins it permanently visible).
  scrollTo(0);
  expect(screen.queryByRole("button", { name: /back to top/i })).toBeNull();
});
