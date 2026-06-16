// src/app/robots.ts
import type { MetadataRoute } from "next";
import { buildRobots } from "@/features/seo";

export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}
