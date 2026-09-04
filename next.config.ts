import type { NextConfig } from "next";

import { isPaymentsEnabled } from "./src/lib/payments-enabled";
import { buildSecurityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  images: {
    // Serve modern formats; the optimizer transcodes the JPEG outputs on demand.
    formats: ["image/avif", "image/webp"],
    // Allowed `quality` values (Next 16 requires explicit allow-listing).
    qualities: [68, 70, 75],
    // Cache optimized variants for 31 days (assets are content-hashed).
    minimumCacheTTL: 2678400,
  },
  // Security headers on every response. Set here rather than in `src/proxy.ts`
  // so they also cover the prerendered public pages, which the proxy matcher
  // deliberately skips. The policy itself is built in src/lib/security-headers.ts.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          paymentsEnabled: isPaymentsEnabled(
            process.env.NEXT_PUBLIC_PAYMENTS_ENABLED,
          ),
          development: process.env.NODE_ENV === "development",
        }),
      },
    ];
  },
  async redirects() {
    return [
      // The home page lives at "/"; alias "/home" to it.
      { source: "/home", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
