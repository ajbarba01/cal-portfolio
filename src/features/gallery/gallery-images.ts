import { readdir } from "node:fs/promises";
import path from "node:path";
import { imageSizeFromFile } from "image-size/fromFile";
import placeholders from "@/content/image-placeholders.json";

/** Filenames are content-hashed by gallery-sync, so a lookup can miss between a
 *  re-hash and the next sync — `undefined` is a real outcome, not a cast away. */
const blurMap: Record<string, string | undefined> = placeholders;

export type GalleryImage = {
  src: string;
  width: number;
  height: number;
  /**
   * Always empty. The wall is decorative: each photo sits inside a button that
   * names itself ("Open photo 3 of 67") and the lightbox that opens is labelled
   * "Photo viewer", so the picture itself carries no information a description
   * would add. An empty alt is the markup that says exactly that — assistive
   * technology skips the image instead of reading a filler sentence once per
   * photo. Owner decision, 2026-09-04: no per-photo descriptions, no default.
   */
  alt: "";
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
 *
 * `imageSizeFromFile` reads only the header bytes it needs; loading each photo
 * whole to measure it pulled the entire folder (tens of MB) through the build.
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
      const { width, height } = await imageSizeFromFile(
        path.join(GALLERY_DIR, file),
      );
      if (!width || !height) continue;
      images.push({
        src: `/gallery/${file}`,
        width,
        height,
        alt: "",
        blurDataURL: blurMap[file],
      });
    } catch (err) {
      console.warn(`Skipping unreadable gallery image: ${file}`, err);
    }
  }
  return images;
}
