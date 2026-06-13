import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { imageSize } from "image-size";
import placeholders from "@/content/image-placeholders.json";

const blurMap = placeholders as Record<string, string>;

export type GalleryImage = {
  src: string;
  width: number;
  height: number;
  alt: string;
  /** Base64 blur from the gallery-sync pipeline (image-placeholders.json). */
  blurDataURL?: string;
};

const IMAGE_EXT = /\.(jpe?g|png|webp|avif)$/i;
const GALLERY_DIR = path.join(process.cwd(), "public", "gallery");

/** Pure: keep image files only, sorted case-insensitively (stable). */
export function listGalleryFiles(filenames: string[]): string[] {
  return filenames
    .filter((f) => IMAGE_EXT.test(f))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

/**
 * IO: read public/gallery, measure each image's intrinsic dimensions so the
 * masonry has no layout shift. Server-only (used by the Gallery RSC).
 * Generic non-claim alt until Cal supplies captions.
 */
export async function getGalleryImages(): Promise<GalleryImage[]> {
  let entries: string[];
  try {
    entries = await readdir(GALLERY_DIR);
  } catch {
    // No gallery dir (fresh clone / CI / preview) → let the page show its EmptyState.
    return [];
  }
  const files = listGalleryFiles(entries);
  const images: GalleryImage[] = [];
  for (const file of files) {
    try {
      const buf = await readFile(path.join(GALLERY_DIR, file));
      const { width, height } = imageSize(buf);
      if (!width || !height) continue;
      images.push({
        src: `/gallery/${file}`,
        width,
        height,
        alt: "A dog in Cal's care",
        blurDataURL: blurMap[file],
      });
    } catch (err) {
      console.warn(`Skipping unreadable gallery image: ${file}`, err);
    }
  }
  return images;
}
