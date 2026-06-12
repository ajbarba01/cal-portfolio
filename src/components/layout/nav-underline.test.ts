import { describe, expect, it } from "vitest";
import { navUnderline, navTab, NAV_UNDERLINE_BASE } from "./nav-underline";

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

  it("inactive link is legible foreground with hover-reveal underline (not shown by default)", () => {
    const cls = navUnderline(false);
    expect(cls).toContain("text-foreground/80");
    expect(cls).toContain("hover:after:scale-x-100");
    expect(cls).not.toContain("font-semibold");
  });

  it("exposes the base for non-link callers (e.g. admin wordmark)", () => {
    expect(NAV_UNDERLINE_BASE).toContain("after:bg-brand-strong");
  });

  it("hoverReveal=false omits the inactive hover-underline (dropdown trigger)", () => {
    const cls = navUnderline(false, false);
    expect(cls).toContain("text-foreground/80");
    expect(cls).not.toContain("hover:after:scale-x-100");
  });

  it("hoverReveal=false still shows the underline when active", () => {
    expect(navUnderline(true, false)).toContain("after:scale-x-100");
  });
});

describe("navTab", () => {
  it("includes pill geometry: horizontal padding, rounded-lg, transition", () => {
    const cls = navTab(false);
    expect(cls).toContain("px-[11px]");
    expect(cls).toContain("rounded-lg");
    expect(cls).toContain("transition-colors");
  });

  it("active tab: brand-strong text, semibold, underline visible", () => {
    const cls = navTab(true);
    expect(cls).toContain("text-brand-strong");
    expect(cls).toContain("font-semibold");
    expect(cls).toContain("after:opacity-100");
  });

  it("inactive tab: subdued text, hover bg, underline hidden", () => {
    const cls = navTab(false);
    expect(cls).toContain("text-foreground/70");
    expect(cls).toContain("hover:bg-muted");
    expect(cls).toContain("after:opacity-0");
    expect(cls).not.toContain("font-semibold");
  });

  it("underline is tucked to label width via left/right inset matching horizontal padding", () => {
    const cls = navTab(false);
    expect(cls).toContain("after:left-[11px]");
    expect(cls).toContain("after:right-[11px]");
    expect(cls).toContain("after:bottom-[2px]");
    expect(cls).toContain("after:h-[2px]");
  });

  it("has visible focus ring", () => {
    expect(navTab(false)).toContain("focus-visible:outline-2");
    expect(navTab(true)).toContain("focus-visible:outline-2");
  });
});
