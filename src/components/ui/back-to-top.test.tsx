// @vitest-environment jsdom
import { it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { BackToTop } from "./back-to-top";

// The component rAF-throttles its scroll handler, so the state update lands in
// the next animation frame — await one inside act() or the assertion runs
// against the pre-scroll render.
async function scrollTo(y: number) {
  await act(async () => {
    Object.defineProperty(window, "scrollY", { value: y, writable: true });
    window.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
}

it("shows past the threshold and hides again when scrolled back below it", async () => {
  render(<BackToTop />);
  expect(screen.queryByRole("button", { name: /back to top/i })).toBeNull();

  await scrollTo(800);
  expect(screen.getByRole("button", { name: /back to top/i })).toBeTruthy();

  // Scrolling back above the threshold must hide it again (the core contract —
  // guards against a regression that pins it permanently visible).
  await scrollTo(0);
  expect(screen.queryByRole("button", { name: /back to top/i })).toBeNull();
});
