import { describe, expect, it } from "vitest";
import { navUnderline, NAV_UNDERLINE_BASE } from "./nav-underline";

describe("navUnderline", () => {
  it("always includes the animated underline base", () => {
    expect(navUnderline(false)).toContain("after:scale-x-0");
    expect(navUnderline(false)).toContain("after:transition-transform");
  });

  it("active link is brand-strong, semibold, underline shown", () => {
    const cls = navUnderline(true);
    expect(cls).toContain("text-brand-strong");
    expect(cls).toContain("font-semibold");
    expect(cls).toContain("after:scale-x-100");
  });

  it("inactive link is muted with hover-reveal underline (not shown by default)", () => {
    const cls = navUnderline(false);
    expect(cls).toContain("text-muted-foreground");
    expect(cls).toContain("hover:after:scale-x-100");
    expect(cls).not.toContain("font-semibold");
  });

  it("exposes the base for non-link callers (e.g. admin wordmark)", () => {
    expect(NAV_UNDERLINE_BASE).toContain("after:bg-brand-strong");
  });
});
