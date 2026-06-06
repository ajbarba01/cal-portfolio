import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { imageSize } from "image-size";

export type GalleryImage = {
  src: string;
  width: number;
  height: number;
  alt: string;
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
  const entries = await readdir(GALLERY_DIR);
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
      });
    } catch (err) {
      console.warn(`Skipping unreadable gallery image: ${file}`, err);
    }
  }
  return images;
}
