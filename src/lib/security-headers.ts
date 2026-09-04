// src/lib/security-headers.ts

/**
 * Builds the security response headers applied to every route by the
 * `headers()` block in `next.config.ts`. Pure — every input is passed in, so
 * the policy can be asserted for each deploy shape without a build.
 *
 * The policy is deliberately NOT nonce-based. A nonce has to be minted per
 * request, which forces every page that carries one to render dynamically, and
 * this site's public routes are required to prerender (see ENGINEERING #13 and
 * the `next build` route table). So the script and style directives fall back
 * to `'unsafe-inline'` and the value of this policy is in the directives that
 * are still exact under a static build: `frame-ancestors`, `object-src`,
 * `base-uri`, `form-action`, and the origin allow-lists for `connect-src`,
 * `img-src`, `frame-src` and `font-src`. Those bound where a compromised or
 * injected script could send data, not whether it can run.
 */

/** A single response header, in the shape Next's `headers()` expects. */
export interface HttpHeader {
  readonly key: string;
  readonly value: string;
}

/** Deploy-shape inputs the policy varies on. */
export interface SecurityHeaderOptions {
  /** `NEXT_PUBLIC_SUPABASE_URL`. Undefined/unparseable → no Supabase origin is allowed. */
  readonly supabaseUrl: string | undefined;
  /** Whether this deploy exposes the Stripe surfaces (`NEXT_PUBLIC_PAYMENTS_ENABLED`). */
  readonly paymentsEnabled: boolean;
  /** True under `next dev`, whose HMR client evaluates compiled chunks with `eval`. */
  readonly development: boolean;
}

/**
 * Stripe's documented CSP requirements. Only added when payments are enabled —
 * with the kill-switch off no Stripe code is ever loaded, so allowing these
 * origins would widen the policy for a surface that does not exist.
 */
const STRIPE_SCRIPT = "https://js.stripe.com";
const STRIPE_FRAMES = ["https://js.stripe.com", "https://hooks.stripe.com"];
const STRIPE_CONNECT = ["https://api.stripe.com", "https://maps.stripe.com"];
/** Stripe serves telemetry pixels from several subdomains (q.stripe.com and friends). */
const STRIPE_IMAGES = ["https://*.stripe.com"];

/**
 * The Supabase origins the browser talks to directly: REST/auth/storage over
 * HTTP, and Realtime over a WebSocket on the same host (`http:` → `ws:`,
 * `https:` → `wss:`). Returns an empty pair when the URL is missing or invalid
 * rather than emitting a broken source expression.
 */
function supabaseOrigins(supabaseUrl: string | undefined): string[] {
  if (!supabaseUrl) return [];
  let parsed: URL;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    return [];
  }
  const socketScheme = parsed.protocol === "https:" ? "wss:" : "ws:";
  return [parsed.origin, `${socketScheme}//${parsed.host}`];
}

/** Renders one directive: its name followed by its source expressions. */
function directive(name: string, sources: readonly string[]): string {
  return [name, ...sources].join(" ");
}

/** The Content-Security-Policy value alone — exported for tests and reuse. */
export function buildContentSecurityPolicy({
  supabaseUrl,
  paymentsEnabled,
  development,
}: SecurityHeaderOptions): string {
  // `[origin, socketOrigin]`, or empty when no Supabase URL is configured.
  const supabaseBoth = supabaseOrigins(supabaseUrl);
  // Images come over HTTP only — the socket origin has no business in img-src.
  const supabaseHttpOnly = supabaseBoth.slice(0, 1);

  return [
    directive("default-src", ["'self'"]),

    // Exact under a static build: no plugins, no <base> rewrite, no third-party
    // framing, and forms may only post back to this origin (server actions).
    directive("object-src", ["'none'"]),
    directive("base-uri", ["'self'"]),
    directive("frame-ancestors", ["'none'"]),
    directive("form-action", ["'self'"]),

    // `'unsafe-inline'` is forced: Next's App Router writes the RSC flight
    // payload into inline <script> tags on every prerendered page, and their
    // content differs per page so neither a hash list nor a static nonce can
    // cover them. `'unsafe-eval'` is dev-only — Turbopack's HMR client needs
    // it; the production bundle does not.
    directive("script-src", [
      "'self'",
      "'unsafe-inline'",
      ...(development ? ["'unsafe-eval'"] : []),
      ...(paymentsEnabled ? [STRIPE_SCRIPT] : []),
    ]),

    // Also forced inline: the <noscript> reveal fallback in the root layout is
    // an inline <style>, and next/image writes the blur placeholder into a
    // style attribute (covered by style-src via style-src-attr's fallback).
    directive("style-src", ["'self'", "'unsafe-inline'"]),

    // `data:` — next/image blur placeholders. `blob:` — the pet photo crop
    // field previews its canvas output from an object URL. The Supabase origin
    // serves signed pet-photo URLs, rendered by a plain <img>.
    directive("img-src", [
      "'self'",
      "data:",
      "blob:",
      ...supabaseHttpOnly,
      ...(paymentsEnabled ? STRIPE_IMAGES : []),
    ]),

    // next/font self-hosts the Google families at build time, so the font files
    // are same-origin and no external font host is needed.
    directive("font-src", ["'self'"]),

    // Supabase REST/auth/storage plus the Realtime WebSocket. `'self'` covers
    // server actions and the Vercel Speed Insights beacon, which is same-origin.
    directive("connect-src", [
      "'self'",
      ...supabaseBoth,
      ...(paymentsEnabled ? STRIPE_CONNECT : []),
    ]),

    // Stripe Elements renders its fields in iframes from these origins.
    directive("frame-src", [
      "'self'",
      ...(paymentsEnabled ? STRIPE_FRAMES : []),
    ]),
  ].join("; ");
}

/**
 * The full header set. HSTS is deliberately absent: Vercel already sends
 * `Strict-Transport-Security: max-age=63072000` on every response, and a second
 * one here would be a duplicate owner of the same policy.
 *
 * `X-Frame-Options` is likewise absent — `frame-ancestors 'none'` above says
 * the same thing, is honoured by every browser this site supports, and unlike
 * `X-Frame-Options` is not ignored when both are present.
 */
export function buildSecurityHeaders(
  options: SecurityHeaderOptions,
): HttpHeader[] {
  return [
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(options),
    },
    // Send the full URL only to this origin; cross-origin requests see the
    // origin alone, and downgrades see nothing.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Only the powerful features this site has no use for. `payment` is left at
    // its default (`self`) so Stripe's iframe can still be delegated a wallet.
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    },
  ];
}
