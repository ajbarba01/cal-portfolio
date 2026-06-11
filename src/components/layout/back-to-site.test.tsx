// @vitest-environment jsdom
import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BackToSite } from "./back-to-site";

it("renders a labeled link to home by default", () => {
  render(<BackToSite />);
  const link = screen.getByRole("link", { name: /back to site/i });
  expect(link.getAttribute("href")).toBe("/");
});
