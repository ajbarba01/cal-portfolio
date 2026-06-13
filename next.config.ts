import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Serve modern formats; the optimizer transcodes the JPEG outputs on demand.
    formats: ["image/avif", "image/webp"],
    // Allowed `quality` values (Next 16 requires explicit allow-listing).
    qualities: [68, 70, 75],
    // Cache optimized variants for 31 days (assets are content-hashed).
    minimumCacheTTL: 2678400,
  },
};

export default nextConfig;
