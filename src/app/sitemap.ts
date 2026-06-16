// src/app/sitemap.ts
import type { MetadataRoute } from "next";
import { buildSitemap } from "@/features/seo";
import { createStaticClient } from "@/lib/supabase/static";
import { listActiveServices } from "@/features/booking";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let serviceSlugs: string[] = [];
  try {
    const services = await listActiveServices(createStaticClient());
    serviceSlugs = services.map((s) => s.slug);
  } catch {
    // Degrade to the static route set if the services read fails.
    serviceSlugs = [];
  }
  return buildSitemap({ serviceSlugs, now: new Date() });
}
