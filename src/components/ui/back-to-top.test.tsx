// @vitest-environment jsdom
import { it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { BackToTop } from "./back-to-top";

it("is hidden until the page is scrolled past the threshold", () => {
  render(<BackToTop />);
  expect(screen.queryByRole("button", { name: /back to top/i })).toBeNull();
  act(() => {
    Object.defineProperty(window, "scrollY", { value: 800, writable: true });
    window.dispatchEvent(new Event("scroll"));
  });
  expect(screen.getByRole("button", { name: /back to top/i })).toBeTruthy();
});
