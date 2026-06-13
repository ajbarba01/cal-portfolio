/**
 * gallery:sync — re-encode raw camera originals into web-ready images.
 *
 * Reads from gitignored source folders (`gallery-originals/`, `bg-originals/`),
 * writes optimized JPEGs into `public/`, and emits blur placeholders. Run it
 * after adding/removing originals; commit the regenerated outputs + placeholders.
 *
 * Pipeline per image: resize to ≤1600px long edge (no upscaling), JPEG q≈80
 * (mozjpeg), strip EXIF (sharp default). Gallery outputs get content-hashed
 * names (`IMG_0592.<hash>.jpg`) so swaps bust caches; bg outputs keep stable
 * basenames (referenced directly in code). Idempotent: unchanged source → skip;
 * orphaned output (no source) → delete; new/changed → process.
 *
 * See docs/FRONTEND.md "Image pipeline" and .claude/skills/gallery-sync.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const MAX_EDGE = 1600;
const QUALITY = 80;
const BLUR_WIDTH = 16;

const PLACEHOLDERS_PATH = path.join(
  ROOT,
  "src",
  "content",
  "image-placeholders.json",
);
const MANIFEST_PATH = path.join(
  ROOT,
  "scripts",
  "gallery-sync",
  ".sync-manifest.json",
);

interface Job {
  srcDir: string;
  outDir: string;
  /** Gallery: content-hashed output names. bg: stable basenames. */
  hashed: boolean;
}

const JOBS: Job[] = [
  {
    srcDir: "gallery-originals",
    outDir: path.join("public", "gallery"),
    hashed: true,
  },
  { srcDir: "bg-originals", outDir: path.join("public", "bg"), hashed: false },
];

type Manifest = Record<string, string>; // outName → source content hash
type Placeholders = Record<string, string>; // outName → base64 blur data URL

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function contentHash(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 8);
}

async function encode(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .rotate() // bake in EXIF orientation before stripping metadata
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toBuffer();
}

async function blurDataUrl(buf: Buffer): Promise<string> {
  const small = await sharp(buf)
    .resize({ width: BLUR_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 50 })
    .toBuffer();
  return `data:image/jpeg;base64,${small.toString("base64")}`;
}

async function main() {
  const manifest = await readJson<Manifest>(MANIFEST_PATH, {});
  const placeholders = await readJson<Placeholders>(PLACEHOLDERS_PATH, {});

  let processed = 0;
  let skipped = 0;
  let removed = 0;

  for (const job of JOBS) {
    const srcDir = path.join(ROOT, job.srcDir);
    const outDir = path.join(ROOT, job.outDir);
    await mkdir(outDir, { recursive: true });

    const srcEntries = existsSync(srcDir)
      ? (await readdir(srcDir)).filter((f) => IMAGE_EXT.test(f))
      : [];

    const expectedOuts = new Set<string>();

    for (const file of srcEntries) {
      const srcBuf = await readFile(path.join(srcDir, file));
      const hash = contentHash(srcBuf);
      const base = path.parse(file).name;
      const outName = job.hashed ? `${base}.${hash}.jpg` : file;
      expectedOuts.add(outName);

      const outPath = path.join(outDir, outName);
      if (manifest[outName] === hash && existsSync(outPath)) {
        skipped++;
        continue;
      }

      const encoded = await encode(srcBuf);
      await writeFile(outPath, encoded);
      placeholders[outName] = await blurDataUrl(srcBuf);
      manifest[outName] = hash;
      processed++;
      console.log(`  process  ${job.outDir}/${outName}`);
    }

    // Delete orphan outputs (image files we manage that no longer have a source).
    // Never touch non-image assets (e.g. the topography SVGs in public/bg).
    for (const existing of await readdir(outDir)) {
      if (!IMAGE_EXT.test(existing)) continue;
      if (expectedOuts.has(existing)) continue;
      // Only delete files we previously produced (tracked in the manifest).
      if (!(existing in manifest)) continue;
      await unlink(path.join(outDir, existing));
      delete manifest[existing];
      delete placeholders[existing];
      removed++;
      console.log(`  remove   ${job.outDir}/${existing}`);
    }
  }

  // Write placeholders sorted for stable diffs.
  const sortedPlaceholders: Placeholders = {};
  for (const key of Object.keys(placeholders).sort()) {
    sortedPlaceholders[key] = placeholders[key];
  }
  await writeFile(
    PLACEHOLDERS_PATH,
    JSON.stringify(sortedPlaceholders, null, 2) + "\n",
  );
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

  console.log(
    `\ngallery:sync — ${processed} processed, ${skipped} skipped, ${removed} removed.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
