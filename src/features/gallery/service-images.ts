import { readdir } from "node:fs/promises";
import path from "node:path";
import placeholders from "@/content/image-placeholders.json";
import { listGalleryFiles } from "./gallery-images";

/** Filenames are content-hashed by gallery-sync, so a lookup can miss between a
 *  re-hash and the next sync — `undefined` is a real outcome, not a cast away. */
const blurMap: Record<string, string | undefined> = placeholders;

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
  return listGalleryFiles(entries).map((file) => ({
    src: `/services/${slug}/${file}`,
    blurDataURL: blurMap[file],
  }));
}
