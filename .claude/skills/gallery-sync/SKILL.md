---
name: gallery-sync
description: Use when adding, replacing, or removing gallery photos or hero/background images — re-encoding raw camera originals into web-ready outputs with blur placeholders. Triggers on "/gallery-sync", "add gallery photos", "new hero image", or "optimize images".
---

# gallery-sync

Re-encodes raw camera originals into web-ready images. Source folders are
gitignored; outputs + blur placeholders are committed. See the "Image pipeline"
subsection in `docs/FRONTEND.md` for the full rationale.

## Workflow

1. **Add/remove originals** in the gitignored source folders:
   - `gallery-originals/` → grid photos (output to `public/gallery/`, content-hashed names).
   - `bg-originals/` → hero/background images (output to `public/bg/`, stable basenames referenced in code).
   - `services-originals/<slug>/` → per-service photos (output to `public/services/<slug>/`, content-hashed). The subfolder name **must** be the service slug (`walk`, `house-sitting`, `check-in`, `training`).
     Never put raw camera files directly in `public/`.
2. **Run** `npm run gallery:sync`. It resizes to ≤1600px long edge (no upscaling),
   encodes JPEG q≈80 (mozjpeg), strips EXIF, and emits blur placeholders to
   `src/content/image-placeholders.json`. Idempotent: unchanged → skip;
   orphaned output (no source) → delete; new/changed → process. Prints a summary.
3. **Wire new images** if needed:
   - Gallery grid auto-discovers `public/gallery/*` via `getGalleryImages()` — no code change.
   - Service photos auto-discover `public/services/<slug>/*` via `getServiceImages(slug)`,
     rendered by `ServicePhotoStrip` on the services page — no code change for a like-for-like swap.
   - A new hero/bg: reference `/bg/<name>` and pass `blurDataURL={placeholders["<name>"]}`
     to `MarketingHero` (see `about/page.tsx`).
4. **Verify + commit**: run `npm run gallery:sync` again (should be all skips),
   `npm run build`, then commit the re-encoded outputs in `public/` together with
   `src/content/image-placeholders.json` and any code wiring.

## Hard rules

- Raw camera files live ONLY in the gitignored `*-originals/` folders, never committed to `public/`.
- `public/gallery/` and `public/services/<slug>/` outputs are content-hashed (cache-busting); `public/bg/` outputs keep stable basenames (they're referenced by path in code).
- Service subfolders are named by **slug**, not display name — keep them in sync with the seeded service slugs.
- Commit the re-encoded `public/` outputs and `image-placeholders.json` in the same commit.
- Don't hand-edit `image-placeholders.json` or `public/gallery|bg|services` outputs — regenerate via the script.
