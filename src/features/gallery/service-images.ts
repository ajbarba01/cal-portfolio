import { readdir } from "node:fs/promises";
import path from "node:path";
import placeholders from "@/content/image-placeholders.json";

const blurMap = placeholders as Record<string, string>;

const IMAGE_EXT = /\.(jpe?g|png|webp|avif)$/i;
const SERVICES_DIR = path.join(process.cwd(), "public", "services");

export type ServiceImage = {
  src: string;
  /** Base64 blur from the gallery-sync pipeline (image-placeholders.json). */
  blurDataURL?: string;
};

/**
 * IO: read the per-service photo folder `public/services/<slug>` (gallery-sync
 * output) and return its images sorted stably. Server-only (used by the Services
 * RSC). Missing folder (service with no photos yet / fresh clone) → []. No
 * dimensions needed: the strip renders each photo in a fixed-aspect box.
 */
export async function getServiceImages(slug: string): Promise<ServiceImage[]> {
  let entries: string[];
  try {
    entries = await readdir(path.join(SERVICES_DIR, slug));
  } catch {
    return [];
  }
  return entries
    .filter((f) => IMAGE_EXT.test(f))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((file) => ({
      src: `/services/${slug}/${file}`,
      blurDataURL: blurMap[file],
    }));
}
