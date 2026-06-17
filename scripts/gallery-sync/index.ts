/**
 * gallery:sync — re-encode raw camera originals into web-ready images.
 *
 * Reads from gitignored source folders (`gallery-originals/`, `bg-originals/`,
 * `services-originals/<slug>/`), writes optimized JPEGs into `public/`, and emits
 * blur placeholders. Run it after adding/removing originals; commit the
 * regenerated outputs + placeholders.
 *
 * Pipeline per image: resize to ≤1600px long edge (no upscaling), JPEG q≈80
 * (mozjpeg), strip EXIF (sharp default). Gallery + per-service outputs get
 * content-hashed names (`IMG_0592.<hash>.jpg`) so swaps bust caches; bg outputs
 * keep stable basenames (referenced directly in code). The services job is
 * nested: each `services-originals/<slug>/` folder maps to `public/services/<slug>/`.
 * Idempotent: unchanged source → skip; orphaned output (no source) → delete;
 * new/changed → process.
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
  /** Gallery/services: content-hashed output names. bg: stable basenames. */
  hashed: boolean;
  /** Nested: srcDir holds per-key subfolders mirrored under outDir (e.g. services/<slug>). */
  nested?: boolean;
}

const JOBS: Job[] = [
  {
    srcDir: "gallery-originals",
    outDir: path.join("public", "gallery"),
    hashed: true,
  },
  { srcDir: "bg-originals", outDir: path.join("public", "bg"), hashed: false },
  {
    srcDir: "services-originals",
    outDir: path.join("public", "services"),
    hashed: true,
    nested: true,
  },
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

interface Counts {
  processed: number;
  skipped: number;
  removed: number;
}

/**
 * Process one flat source→output directory pair. Mutates `manifest` and
 * `placeholders`; records every kept output basename in `kept` and every
 * orphan-removed basename in `removed`. A placeholder is pruned only when its
 * output was actually removed this run (in `removed`) and isn't `kept` by any
 * other subfolder — so running without source folders present (fresh clone:
 * originals are gitignored) never wipes committed placeholders.
 *
 * Manifest keys are prefixed (`<keyPrefix><outName>`) to stay unambiguous across
 * nested subfolders; placeholder keys stay bare output basenames (the basename is
 * what the runtime accessors look up). `label` is the public-relative dir for logs.
 */
async function processDir(
  srcDir: string,
  outDir: string,
  hashed: boolean,
  keyPrefix: string,
  label: string,
  manifest: Manifest,
  placeholders: Placeholders,
  kept: Set<string>,
  removed: Set<string>,
): Promise<Counts> {
  await mkdir(outDir, { recursive: true });
  const counts: Counts = { processed: 0, skipped: 0, removed: 0 };

  const srcEntries = existsSync(srcDir)
    ? (await readdir(srcDir)).filter((f) => IMAGE_EXT.test(f))
    : [];

  const expectedOuts = new Set<string>();

  for (const file of srcEntries) {
    const srcBuf = await readFile(path.join(srcDir, file));
    const hash = contentHash(srcBuf);
    const base = path.parse(file).name;
    const outName = hashed ? `${base}.${hash}.jpg` : file;
    expectedOuts.add(outName);
    kept.add(outName);

    const outPath = path.join(outDir, outName);
    if (manifest[`${keyPrefix}${outName}`] === hash && existsSync(outPath)) {
      counts.skipped++;
      continue;
    }

    const encoded = await encode(srcBuf);
    await writeFile(outPath, encoded);
    placeholders[outName] = await blurDataUrl(srcBuf);
    manifest[`${keyPrefix}${outName}`] = hash;
    counts.processed++;
    console.log(`  process  ${label}/${outName}`);
  }

  // Delete orphan outputs (image files we manage that no longer have a source).
  // Never touch non-image assets (e.g. the topography SVGs in public/bg).
  for (const existing of await readdir(outDir)) {
    if (!IMAGE_EXT.test(existing)) continue;
    if (expectedOuts.has(existing)) continue;
    // Only delete files we previously produced (tracked in the manifest).
    if (!(`${keyPrefix}${existing}` in manifest)) continue;
    await unlink(path.join(outDir, existing));
    delete manifest[`${keyPrefix}${existing}`];
    removed.add(existing);
    counts.removed++;
    console.log(`  remove   ${label}/${existing}`);
  }

  return counts;
}

async function main() {
  const manifest = await readJson<Manifest>(MANIFEST_PATH, {});
  const placeholders = await readJson<Placeholders>(PLACEHOLDERS_PATH, {});

  let processed = 0;
  let skipped = 0;
  let removed = 0;
  const kept = new Set<string>(); // bare output basenames still backed by a source
  const removedNames = new Set<string>(); // bare basenames orphan-removed this run

  for (const job of JOBS) {
    const srcRoot = path.join(ROOT, job.srcDir);
    const outRoot = path.join(ROOT, job.outDir);

    if (job.nested) {
      await mkdir(outRoot, { recursive: true });
      const subs = existsSync(srcRoot)
        ? (await readdir(srcRoot, { withFileTypes: true }))
            .filter((d) => d.isDirectory())
            .map((d) => d.name)
        : [];
      const expectedSubs = new Set(subs);

      for (const sub of subs) {
        const c = await processDir(
          path.join(srcRoot, sub),
          path.join(outRoot, sub),
          job.hashed,
          `${job.outDir.replace(/\\/g, "/")}/${sub}/`,
          `${job.outDir}/${sub}`,
          manifest,
          placeholders,
          kept,
          removedNames,
        );
        processed += c.processed;
        skipped += c.skipped;
        removed += c.removed;
      }

      // Remove orphaned subfolders (a slug whose source folder is gone).
      if (existsSync(outRoot)) {
        for (const entry of await readdir(outRoot, { withFileTypes: true })) {
          if (!entry.isDirectory() || expectedSubs.has(entry.name)) continue;
          const orphanDir = path.join(outRoot, entry.name);
          for (const f of await readdir(orphanDir)) {
            if (!IMAGE_EXT.test(f)) continue;
            await unlink(path.join(orphanDir, f));
            delete manifest[
              `${job.outDir.replace(/\\/g, "/")}/${entry.name}/${f}`
            ];
            removedNames.add(f);
            removed++;
            console.log(`  remove   ${job.outDir}/${entry.name}/${f}`);
          }
        }
      }
    } else {
      const c = await processDir(
        srcRoot,
        outRoot,
        job.hashed,
        "",
        job.outDir,
        manifest,
        placeholders,
        kept,
        removedNames,
      );
      processed += c.processed;
      skipped += c.skipped;
      removed += c.removed;
    }
  }

  // Prune placeholders only for outputs orphan-removed this run that no other
  // (byte-identical) source still keeps. Never touches placeholders when a
  // source folder is simply absent — see processDir docblock.
  for (const name of removedNames) {
    if (!kept.has(name)) delete placeholders[name];
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
