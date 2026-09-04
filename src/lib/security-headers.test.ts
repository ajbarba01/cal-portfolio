import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  type SecurityHeaderOptions,
} from "./security-headers";

/** Production shape: hosted Supabase, payments off, not `next dev`. */
const BASE: SecurityHeaderOptions = {
  supabaseUrl: "https://project.supabase.co",
  paymentsEnabled: false,
  development: false,
};

/** Splits the policy into a directive-name → source-list map. */
function directives(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy.split("; ").map((part) => {
      const [name, ...sources] = part.split(" ");
      return [name, sources];
    }),
  );
}

describe("buildContentSecurityPolicy", () => {
  it("locks down the directives that are exact under a static build", () => {
    const d = directives(buildContentSecurityPolicy(BASE));

    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
    expect(d["form-action"]).toEqual(["'self'"]);
    expect(d["default-src"]).toEqual(["'self'"]);
    expect(d["font-src"]).toEqual(["'self'"]);
  });

  it("allows the Supabase origin over both HTTP and its WebSocket scheme", () => {
    const d = directives(buildContentSecurityPolicy(BASE));

    expect(d["connect-src"]).toContain("https://project.supabase.co");
    expect(d["connect-src"]).toContain("wss://project.supabase.co");
    expect(d["img-src"]).toContain("https://project.supabase.co");
    // Realtime is a WebSocket, not an image request.
    expect(d["img-src"]).not.toContain("wss://project.supabase.co");
  });

  it("downgrades the Realtime scheme to ws: for the local http stack", () => {
    const d = directives(
      buildContentSecurityPolicy({
        ...BASE,
        supabaseUrl: "http://127.0.0.1:54321",
      }),
    );

    expect(d["connect-src"]).toContain("http://127.0.0.1:54321");
    expect(d["connect-src"]).toContain("ws://127.0.0.1:54321");
  });

  it("emits no Supabase source when the URL is missing or unparseable", () => {
    for (const supabaseUrl of [undefined, "not-a-url"]) {
      const d = directives(
        buildContentSecurityPolicy({ ...BASE, supabaseUrl }),
      );

      expect(d["connect-src"]).toEqual(["'self'"]);
      expect(d["img-src"]).toEqual(["'self'", "data:", "blob:"]);
    }
  });

  it("omits every Stripe origin while the payments kill-switch is off", () => {
    const policy = buildContentSecurityPolicy(BASE);

    expect(policy).not.toContain("stripe.com");
    expect(directives(policy)["frame-src"]).toEqual(["'self'"]);
  });

  it("adds Stripe's script, frame, connect and image origins when payments are on", () => {
    const d = directives(
      buildContentSecurityPolicy({ ...BASE, paymentsEnabled: true }),
    );

    expect(d["script-src"]).toContain("https://js.stripe.com");
    expect(d["frame-src"]).toEqual([
      "'self'",
      "https://js.stripe.com",
      "https://hooks.stripe.com",
    ]);
    expect(d["connect-src"]).toContain("https://api.stripe.com");
    expect(d["img-src"]).toContain("https://*.stripe.com");
  });

  it("keeps the inline allowances a static build needs, and 'unsafe-eval' out of production", () => {
    const d = directives(buildContentSecurityPolicy(BASE));

    // Forced by the App Router's inline flight scripts and the layout's
    // <noscript> style — see the module header.
    expect(d["script-src"]).toContain("'unsafe-inline'");
    expect(d["style-src"]).toContain("'unsafe-inline'");
    expect(d["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("grants 'unsafe-eval' to the dev server only", () => {
    const d = directives(
      buildContentSecurityPolicy({ ...BASE, development: true }),
    );

    expect(d["script-src"]).toContain("'unsafe-eval'");
  });
});

describe("buildSecurityHeaders", () => {
  it("ships the policy alongside its companions and leaves Vercel's HSTS alone", () => {
    const keys = buildSecurityHeaders(BASE).map((h) => h.key);

    expect(keys).toEqual([
      "Content-Security-Policy",
      "Referrer-Policy",
      "X-Content-Type-Options",
      "Permissions-Policy",
    ]);
    // Vercel already sends HSTS; X-Frame-Options adds nothing over frame-ancestors.
    expect(keys).not.toContain("Strict-Transport-Security");
    expect(keys).not.toContain("X-Frame-Options");
  });
});
