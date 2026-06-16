// src/features/seo/robots.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { buildRobots } from "./robots";

const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
});

describe("buildRobots", () => {
  it("allows root, disallows private trees, and points at the sitemap", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const r = buildRobots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule.allow).toBe("/");
    expect(rule.disallow).toEqual(
      expect.arrayContaining([
        "/admin",
        "/account",
        "/login",
        "/auth",
        "/showcase",
      ]),
    );
    expect(r.sitemap).toBe("https://calbarba.com/sitemap.xml");
  });
});
