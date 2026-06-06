# Phase 2 — Marketing / Portfolio Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose the seven marketing page bodies onto the shipped desk+sheet shell + component kit, add a real-photo hero (IMG_7869) and Gallery (masonry + accessible lightbox), and apply two deliberate site-wide shell adjustments (sheet width 1152, content-darker-than-nav tone).

**Architecture:** Presentational/structural only — no business logic changes. Two pure helpers get TDD (`stepIndex` for lightbox nav, `listGalleryFiles` for gallery filtering); one IO reader (`getGalleryImages`) reads `public/gallery` dims via `image-size`; everything else is JSX recomposition verified by `lint`/`typecheck`/`build` + a manual desktop+390px+keyboard walk. Components reference semantic tokens only; whitespace from `space.*`; type from `typeScale`.

**Tech Stack:** Next.js App Router (RSC), TypeScript strict, Tailwind v4 + `@base-ui/react`, `next/image`, `image-size`, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-05-design-overhaul-phase2-marketing-design.md`

**Standing constraints:** TS strict / no `any`; internal nav = `<Link>`; `[[ ]]` copy preserved; Colorado-only, no invented claims; mobile parity is a per-page acceptance criterion ([[mobile-parity-standard]]); commit **subject-line only** (Conventional Commits, no body/trailer); stage **by name**; **DO NOT push** (Alex batches the overhaul push). base-ui gotchas: eslint bans `react-hooks/set-state-in-effect` (manage state via handlers, not effects); dialog parts = `Dialog.Root/Portal/Backdrop/Popup/Close/Title`.

---

## File structure

**Modify (shell, Task 1):**

- `src/components/layout/page-shell.tsx` — width 5xl→6xl; sheet body `bg-card`→`bg-background`.
- `src/components/site-header.tsx` — add `bg-card`; inner `max-w-5xl`→`max-w-6xl`.
- `src/components/layout/page-container.tsx` — `app` width `max-w-5xl`→`max-w-6xl`.
- `docs/FRONTEND.md` — width + tonal-hierarchy rule + `--destructive-warm` token.

**Create (shared, Tasks 2–4):**

- `src/components/marketing/eyebrow.tsx` — small uppercase clay label, reused across pages.
- `src/components/ui/lightbox-nav.ts` — pure `stepIndex` (TDD).
- `src/components/ui/lightbox-nav.test.ts` — its test.
- `src/components/ui/lightbox.tsx` — accessible image lightbox (base-ui Dialog).
- `src/features/gallery/gallery-images.ts` — `listGalleryFiles` (pure, TDD) + `getGalleryImages` (IO).
- `src/features/gallery/gallery-images.test.ts` — `listGalleryFiles` test.

**Modify (pages, Tasks 5–11):** `src/app/(marketing)/page.tsx` (+ co-located `_components/hero.tsx`), `about/page.tsx`, `services/page.tsx`, `gallery/page.tsx`, `reviews/page.tsx`, `resources/page.tsx`, `book/page.tsx`.

**Assets (Task 9 commit):** `public/gallery/*.JPG` (52) + `public/bg/IMG_7869.JPG`.

**Docs (Task 12):** `docs/DESIGN.md`.

---

## Task 1: Site-wide shell adjustments (width 1152 + tonal hierarchy)

**Files:**

- Modify: `src/components/layout/page-shell.tsx`
- Modify: `src/components/site-header.tsx:59-60`
- Modify: `src/components/layout/page-container.tsx:11-14`
- Modify: `docs/FRONTEND.md`

- [ ] **Step 1: Widen + tone the sheet in `page-shell.tsx`**

Change the sheet wrapper line. Replace `max-w-5xl` with `max-w-6xl` and `bg-card` with `bg-background` (header re-adds its own `bg-card` in Step 2, so the body+footer become the toned surface):

```tsx
      <div className="bg-background dark:border-border relative mx-auto flex w-full max-w-6xl flex-1 flex-col sm:shadow-[0_4px_40px_-8px_rgba(28,24,19,0.16)] dark:shadow-none dark:sm:border-x">
```

- [ ] **Step 2: Give the header a `bg-card` masthead + matching width in `site-header.tsx`**

Line 59 — add `bg-card`:

```tsx
    <header className="bg-card border-border border-b">
```

Line 60 — match the sheet width:

```tsx
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
```

- [ ] **Step 3: Widen the `app` container in `page-container.tsx`**

```tsx
const widths = {
  read: "max-w-[65ch]",
  app: "max-w-6xl",
} as const;
```

- [ ] **Step 4: Document in FRONTEND.md (same-commit rule)**

In the "Shared chrome + component kit" → "Shell" bullet, update the sheet width to **`max-w-6xl` (1152px)** and add a sentence to the brand-tokens / shell area:

> **Tonal hierarchy.** Desk ▸ content ▸ nav, lightest on top: `SiteHeader` is `bg-card` (white / dark `sand-925`); the `PageShell` sheet body + footer are `bg-background` (`sand-50` / dark `sand-950`); cards stay `bg-card` so they lift off the toned surface. The sidebar (`--sidebar`) is excluded. Achieved with existing tokens (no new role) — `background` is darker than `card` in both themes.

In the brand-token list, add:

> - **`--destructive-warm` / `--danger-warm`** — warm clay-leaning red for sign-out / soft-destructive affordances (sidebar sign-out), distinct from the pure `--destructive`.

- [ ] **Step 5: Verify build + typecheck**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS; build still reports its existing page count.

- [ ] **Step 6: Visual check (desktop + dark)**

Run `npm run dev`, open `/` and `/account` (or any account/admin route). Confirm: header reads white/masthead, content surface is a touch darker (sand-50), cards/sheet still distinct, desk gutters narrower but present, dark mode keeps header lighter than content. No horizontal scroll at 390px.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/page-shell.tsx src/components/site-header.tsx src/components/layout/page-container.tsx docs/FRONTEND.md
git commit -m "feat(shell): widen sheet to 1152 and tone content below the nav masthead"
```

---

## Task 2: `Eyebrow` marketing label

**Files:**

- Create: `src/components/marketing/eyebrow.tsx`

- [ ] **Step 1: Create the component**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Small uppercase clay label that sits above headings across marketing pages
 * (the "field journal" eyebrow). Defaults to brand-strong; pass `className` to
 * recolor (e.g. on the dark hero overlay).
 */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      data-slot="eyebrow"
      className={cn(
        "text-brand-strong text-xs font-semibold tracking-[0.14em] uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/marketing/eyebrow.tsx
git commit -m "feat(marketing): add Eyebrow label primitive"
```

---

## Task 3: Lightbox index helper (TDD)

**Files:**

- Create: `src/components/ui/lightbox-nav.ts`
- Test: `src/components/ui/lightbox-nav.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { stepIndex } from "./lightbox-nav";

describe("stepIndex", () => {
  it("advances within range", () => {
    expect(stepIndex(2, 1, 5)).toBe(3);
  });
  it("wraps forward past the end to the start", () => {
    expect(stepIndex(4, 1, 5)).toBe(0);
  });
  it("wraps backward past the start to the end", () => {
    expect(stepIndex(0, -1, 5)).toBe(4);
  });
  it("returns 0 for an empty set", () => {
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx vitest run src/components/ui/lightbox-nav.test.ts`
Expected: FAIL — `stepIndex` not defined / module not found.

- [ ] **Step 3: Implement**

```ts
/**
 * Pure circular step for the lightbox. Given the current index, a delta
 * (+1/-1), and the count, returns the wrapped next index. Empty set → 0.
 */
export function stepIndex(
  current: number,
  delta: number,
  length: number,
): number {
  if (length <= 0) return 0;
  return (((current + delta) % length) + length) % length;
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npx vitest run src/components/ui/lightbox-nav.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/lightbox-nav.ts src/components/ui/lightbox-nav.test.ts
git commit -m "feat(ui): add pure stepIndex helper for lightbox nav"
```

---

## Task 4: `Lightbox` component (base-ui Dialog)

**Files:**

- Create: `src/components/ui/lightbox.tsx`
- Reference: `src/components/feedback/confirm-dialog.tsx` (established base-ui Dialog pattern), `node_modules/@base-ui/react/esm/dialog/index.parts.d.ts`

**Interface (consumed by the Gallery in Task 9):**

```ts
type LightboxImage = {
  src: string;
  width: number;
  height: number;
  alt: string;
};
// <Lightbox images={images} index={openIndex} onIndexChange={setOpenIndex} onClose={() => setOpenIndex(null)} />
// `index === null` means closed.
```

- [ ] **Step 1: Read the base-ui dialog parts**

Run: `sed -n '1,40p' node_modules/@base-ui/react/esm/dialog/index.parts.d.ts` and confirm parts `Root, Portal, Backdrop, Popup, Close, Title` exist (they do). Note `Dialog.Root` takes `open` + `onOpenChange`.

- [ ] **Step 2: Create the component**

```tsx
"use client";

import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { stepIndex } from "./lightbox-nav";

export type LightboxImage = {
  src: string;
  width: number;
  height: number;
  alt: string;
};

/**
 * Accessible image lightbox over base-ui Dialog. `index === null` is closed.
 * Keyboard: Esc closes (base-ui), ArrowLeft/Right step. Touch: horizontal
 * swipe steps. Click-out closes (backdrop). Index state lives in the parent;
 * this component never uses an effect to set state (eslint: no set-state-in-effect).
 */
export function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: LightboxImage[];
  index: number | null;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const open = index !== null;
  const current = open ? images[index] : null;
  const touchStartX = React.useRef<number | null>(null);

  function step(delta: number) {
    if (index === null) return;
    onIndexChange(stepIndex(index, delta, images.length));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[#1c1813]/92 backdrop-blur-[2px]" />
        <Dialog.Popup
          data-slot="lightbox"
          aria-label="Photo viewer"
          onKeyDown={onKeyDown}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 outline-none select-none sm:p-10"
        >
          {current ? (
            <>
              <Image
                key={current.src}
                src={current.src}
                alt={current.alt}
                width={current.width}
                height={current.height}
                sizes="100vw"
                className="max-h-[82vh] w-auto max-w-[92vw] rounded-sm object-contain shadow-2xl"
              />
              <p className="mt-4 text-xs tracking-[0.14em] text-[var(--sand-200)]">
                {String((index ?? 0) + 1).padStart(2, "0")} / {images.length}
              </p>

              <Dialog.Close
                aria-label="Close"
                className="absolute top-4 right-4 flex size-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <X className="size-5" />
              </Dialog.Close>

              {images.length > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label="Previous photo"
                    onClick={() => step(-1)}
                    className={cn(
                      "absolute top-1/2 left-3 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-6",
                    )}
                  >
                    <ChevronLeft className="size-6" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next photo"
                    onClick={() => step(1)}
                    className="absolute top-1/2 right-3 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-6"
                  >
                    <ChevronRight className="size-6" />
                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 3: Verify it compiles + lints (no set-state-in-effect)**

Run: `npm run typecheck && npm run lint`
Expected: PASS. If `Dialog.Popup` rejects `onKeyDown`/`onTouchStart`, check the d.ts for the prop name and use `render`-passthrough props as documented there.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/lightbox.tsx
git commit -m "feat(ui): add accessible image lightbox with keyboard + swipe nav"
```

---

## Task 5: Gallery image reader (`listGalleryFiles` TDD + `getGalleryImages` IO)

**Files:**

- Create: `src/features/gallery/gallery-images.ts`
- Test: `src/features/gallery/gallery-images.test.ts`
- Modify: `package.json` (add `image-size`)

- [ ] **Step 1: Add the dependency**

Run: `npm install image-size`
Then check the major version: `node -p "require('image-size/package.json').version"`.

- v2.x exports a named `imageSize(input: Uint8Array)`.
- v1.x exports a default `sizeOf(input)` accepting a Buffer.
  Use the matching import in Step 4 (both accept a Buffer of the file bytes).

- [ ] **Step 2: Write the failing test for the pure filter**

```ts
import { describe, it, expect } from "vitest";
import { listGalleryFiles } from "./gallery-images";

describe("listGalleryFiles", () => {
  it("keeps only image files, case-insensitive", () => {
    expect(
      listGalleryFiles(["a.JPG", "b.jpeg", "c.png", "notes.txt", ".DS_Store"]),
    ).toEqual(["a.JPG", "b.jpeg", "c.png"]);
  });
  it("sorts stably and case-insensitively", () => {
    expect(listGalleryFiles(["B.JPG", "a.jpg", "C.JPG"])).toEqual([
      "a.jpg",
      "B.JPG",
      "C.JPG",
    ]);
  });
});
```

- [ ] **Step 3: Run it; verify it fails**

Run: `npx vitest run src/features/gallery/gallery-images.test.ts`
Expected: FAIL — `listGalleryFiles` not defined.

- [ ] **Step 4: Implement the module**

Use the import line matching the installed version (Step 1). Example shown for **v2** (named export); for v1 swap to `import sizeOf from "image-size"` and call `sizeOf(buf)`.

```ts
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { imageSize } from "image-size"; // v1: `import sizeOf from "image-size"` and use sizeOf(buf)

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
    const buf = await readFile(path.join(GALLERY_DIR, file));
    const { width, height } = imageSize(buf); // v1: sizeOf(buf)
    if (!width || !height) continue;
    images.push({
      src: `/gallery/${file}`,
      width,
      height,
      alt: "A dog in Cal's care",
    });
  }
  return images;
}
```

- [ ] **Step 5: Run the test; verify it passes**

Run: `npx vitest run src/features/gallery/gallery-images.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit (code only; the 52 images commit with the Gallery page in Task 9)**

```bash
git add src/features/gallery/gallery-images.ts src/features/gallery/gallery-images.test.ts package.json package-lock.json
git commit -m "feat(gallery): read gallery image dimensions for layout-stable masonry"
```

---

## Task 6: Home page (hero + lean body)

**Files:**

- Create: `src/app/(marketing)/_components/hero.tsx`
- Modify: `src/app/(marketing)/page.tsx`
- Reference: `public/bg/IMG_7869.JPG` (3:2 crop, already on disk)

- [ ] **Step 1: Create the Hero (desktop overlay / mobile stacked)**

```tsx
import Link from "next/link";
import Image from "next/image";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Hero text block, reused for the desktop overlay (onDark) and the mobile stack. */
function HeroCopy({ onDark }: { onDark: boolean }) {
  return (
    <div className="flex flex-col items-start gap-5">
      <Eyebrow className={onDark ? "text-[var(--sand-50)]" : undefined}>
        Dog walking · house sitting · Colorado
      </Eyebrow>
      <h1
        className={cn(
          "font-heading max-w-[18ch] text-4xl leading-[1.04] font-semibold tracking-tight sm:text-5xl lg:text-6xl",
          onDark ? "text-white" : "text-foreground",
        )}
      >
        [[HEADER: hero hook]]
      </h1>
      <p
        className={cn(
          "max-w-[42ch] leading-relaxed",
          onDark ? "text-white/85" : "text-muted-foreground",
        )}
      >
        [[BODY: services overview and what sets Cal apart]]
      </p>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Link
          href="/book"
          className={cn(
            buttonVariants({ variant: "brand", size: "lg" }),
            "w-full sm:w-auto",
          )}
        >
          Book a service
        </Link>
        <Link
          href="/services"
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "w-full sm:w-auto",
          )}
        >
          See services
        </Link>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section aria-labelledby="hero-heading">
      {/* Desktop: text overlaid on the 3:2 photo with a left scrim */}
      <div className="relative hidden aspect-[3/2] w-full sm:block">
        <Image
          src="/bg/IMG_7869.JPG"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="from-foreground/70 via-foreground/30 absolute inset-0 bg-gradient-to-r to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-center px-8 lg:px-16">
          <div className="max-w-[60%]">
            <HeroCopy onDark />
          </div>
        </div>
      </div>

      {/* Mobile: photo on top, copy stacked beneath on the toned surface */}
      <div className="sm:hidden">
        <div className="relative aspect-[3/2] w-full">
          <Image
            src="/bg/IMG_7869.JPG"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
        <div className="px-5 py-8">
          <HeroCopy onDark={false} />
        </div>
      </div>
    </section>
  );
}
```

Note: the visually-hidden `id="hero-heading"` target — the `<h1>` carries the page heading; add `id="hero-heading"` to the `<h1>` if `aria-labelledby` linkage is desired. (Two `<h1>`s render but only one is visible per breakpoint; acceptable, both identical. If lint/a11y flags duplicate ids, drop the `aria-labelledby` and rely on the `<h1>`.)

- [ ] **Step 2: Rewrite `page.tsx` (hero → Why Cal → CTA)**

```tsx
/**
 * Home page — photographic hero + lean document body.
 * Server component.
 */
import Link from "next/link";
import { Hero } from "./_components/hero";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { PageContainer } from "@/components/layout/page-container";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const trustPoints = [
  {
    title: "[[HEADER: trust point 1]]",
    body: "[[BODY: trust point 1 detail]]",
  },
  {
    title: "[[HEADER: trust point 2]]",
    body: "[[BODY: trust point 2 detail]]",
  },
  {
    title: "[[HEADER: trust point 3]]",
    body: "[[BODY: trust point 3 detail]]",
  },
];

export default function HomePage() {
  return (
    <>
      <Hero />

      {/* Why Cal */}
      <PageContainer width="app" className="py-12 sm:py-16">
        <div className="mx-auto mb-10 max-w-[34ch] text-center">
          <Eyebrow>Why Cal</Eyebrow>
          <h2 className="font-heading mt-2 text-2xl font-semibold sm:text-3xl">
            [[HEADER: why-Cal section]]
          </h2>
        </div>
        <ul className="grid gap-8 sm:grid-cols-3" role="list">
          {trustPoints.map((p) => (
            <li
              key={p.title}
              className="flex flex-col gap-2 text-center sm:text-left"
            >
              <span className="font-heading text-foreground text-lg font-semibold">
                {p.title}
              </span>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {p.body}
              </p>
            </li>
          ))}
        </ul>
      </PageContainer>

      {/* Closing CTA */}
      <section aria-label="Get started" className="border-border border-t">
        <PageContainer width="read" className="py-12 text-center sm:py-16">
          <h2 className="font-heading text-2xl font-semibold sm:text-3xl">
            [[HEADER: closing CTA]]
          </h2>
          <p className="text-muted-foreground mx-auto mt-3 max-w-[44ch] leading-relaxed">
            [[BODY: short prompt to book]]
          </p>
          <Link
            href="/book"
            className={cn(
              buttonVariants({ variant: "brand", size: "lg" }),
              "mt-6",
            )}
          >
            Book a service
          </Link>
        </PageContainer>
      </section>
    </>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS. (Hero `priority` image may warn if dimensions unknown — `fill` avoids it.)

- [ ] **Step 4: Visual walk (desktop + 390px + dark)**

`npm run dev`, open `/`. Desktop: photo hero with readable overlaid headline; trust row 3-up; CTA band. 390px: photo on top, copy stacked beneath, full-width buttons, no h-scroll. Dark mode correct.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(marketing)/_components/hero.tsx" "src/app/(marketing)/page.tsx"
git commit -m "feat(marketing): redesign home with photographic hero and lean body"
```

---

## Task 7: About page

**Files:**

- Modify: `src/app/(marketing)/about/page.tsx`

- [ ] **Step 1: Rewrite using read container + PageHeader + one framed photo**

Pick any Cal-with-dog file from `public/gallery` for the inset (replace `IMG_0048.JPG` below with a chosen one).

```tsx
/**
 * About page — bio + approach + references, document-calm read column.
 * Server component.
 */
import Link from "next/link";
import Image from "next/image";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

const approach = [
  { title: "[[Item 1: approach principle]]", detail: "[[Item 1: detail]]" },
  { title: "[[Item 2: approach principle]]", detail: "[[Item 2: detail]]" },
  { title: "[[Item 3: approach principle]]", detail: "[[Item 3: detail]]" },
];

export default function AboutPage() {
  return (
    <PageContainer width="read" className="py-12 sm:py-16">
      <PageHeader title="About" subtitle="[[BODY: one-line about summary]]" />

      <figure className="border-border my-8 overflow-hidden rounded-lg border">
        <Image
          src="/gallery/IMG_0048.JPG"
          alt="Cal with a dog in their care"
          width={1200}
          height={800}
          sizes="(max-width: 680px) 100vw, 65ch"
          className="h-auto w-full object-cover"
        />
      </figure>

      <section aria-labelledby="bio-heading" className="mb-10">
        <h2
          id="bio-heading"
          className="font-heading mb-3 text-xl font-semibold"
        >
          What I do
        </h2>
        <div className="text-muted-foreground flex flex-col gap-4 leading-relaxed">
          <p>[[BODY: bio paragraph 1 — background/experience]]</p>
          <p>[[BODY: bio paragraph 2 — services offered]]</p>
          <p>[[BODY: bio paragraph 3 — additional context]]</p>
        </div>
      </section>

      <section aria-labelledby="approach-heading" className="mb-10">
        <h2
          id="approach-heading"
          className="font-heading mb-3 text-xl font-semibold"
        >
          My approach
        </h2>
        <ul className="text-muted-foreground flex flex-col gap-3 leading-relaxed">
          {approach.map((a) => (
            <li key={a.title}>
              <strong className="text-foreground">{a.title}</strong> —{" "}
              {a.detail}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="references-heading">
        <h2
          id="references-heading"
          className="font-heading mb-3 text-xl font-semibold"
        >
          References
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          [[BODY: pointer to references — see the]]{" "}
          <Link
            href="/reviews"
            className="text-brand-strong underline underline-offset-4 hover:opacity-70"
          >
            Reviews
          </Link>{" "}
          [[page]].
        </p>
      </section>
    </PageContainer>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS. Confirm the raw `<a href="/reviews">` is gone (now `<Link>`).

- [ ] **Step 3: Visual walk (desktop + 390px)** — read column centered, framed photo scales to column, link works without full reload.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(marketing)/about/page.tsx"
git commit -m "feat(marketing): recompose about onto read column with framed photo"
```

---

## Task 8: Services page

**Files:**

- Modify: `src/app/(marketing)/services/page.tsx`
- Reference: existing `headlineRate`, `listActiveServices`, `PublicService`, `Card`/`CardHeader`/`CardTitle`/`CardContent`.

- [ ] **Step 1: Rewrite using app container + kit cards + sliding-scale CTA**

```tsx
/**
 * Services page — active services with headline pricing + sliding-scale CTA.
 * Server component.
 */
import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { listActiveServices } from "@/features/booking/services-repo";
import { headlineRate } from "@/features/pricing/display";
import type { PublicService } from "@/features/booking/services-repo";

function ServiceCard({ service }: { service: PublicService }) {
  const rate = headlineRate(service.pricingType, service.pricingConfig);
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-heading">{service.name}</CardTitle>
        <p className="text-brand-strong text-sm font-medium">{rate}</p>
      </CardHeader>
      {service.description ? (
        <CardContent className="text-muted-foreground leading-relaxed">
          {service.description}
        </CardContent>
      ) : null}
      {service.default_duration_min !== null || service.max_pets !== null ? (
        <dl className="text-muted-foreground mt-auto flex flex-wrap gap-x-6 gap-y-1 text-xs">
          {service.default_duration_min !== null ? (
            <>
              <dt className="sr-only">Default duration</dt>
              <dd>{service.default_duration_min} min</dd>
            </>
          ) : null}
          {service.max_pets !== null ? (
            <>
              <dt className="sr-only">Max pets</dt>
              <dd>
                Up to {service.max_pets} pet{service.max_pets !== 1 ? "s" : ""}
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </Card>
  );
}

export default async function ServicesPage() {
  const supabase = await createClient();
  const services = await listActiveServices(supabase);

  return (
    <PageContainer width="app" className="py-12 sm:py-16">
      <PageHeader title="Services" subtitle="[[BODY: services overview]]" />

      {services.length === 0 ? (
        <p className="text-muted-foreground">
          Services coming soon — check back shortly.
        </p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" role="list">
          {services.map((service) => (
            <li key={service.slug}>
              <ServiceCard service={service} />
            </li>
          ))}
        </ul>
      )}

      {/* Sliding-scale CTA — a CTA, not a pricing feature (DESIGN.md) */}
      <section
        aria-labelledby="sliding-scale-heading"
        className="border-border bg-card mt-12 rounded-lg border p-6 sm:p-8"
      >
        <Eyebrow>Sliding cost scale</Eyebrow>
        <h2
          id="sliding-scale-heading"
          className="font-heading mt-2 mb-2 text-xl font-semibold"
        >
          [[HEADER: pricing flexibility section]]
        </h2>
        <p className="text-muted-foreground mb-6 max-w-[60ch] text-sm leading-relaxed">
          [[BODY: pricing accessibility statement]]
        </p>
        <Link
          href="/book"
          className={cn(buttonVariants({ variant: "brand", size: "lg" }))}
        >
          Book a service
        </Link>
      </section>
    </PageContainer>
  );
}
```

- [ ] **Step 2: Verify** — `npm run typecheck && npm run lint && npm run build` → PASS.

- [ ] **Step 3: Visual walk (desktop + 390px)** — cards 3-up→2→1; rates in clay; CTA band reads; full-width-ish CTA on mobile.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(marketing)/services/page.tsx"
git commit -m "feat(marketing): recompose services onto kit cards with sliding-scale CTA"
```

---

## Task 9: Gallery page (masonry + lightbox) + commit photos

**Files:**

- Modify: `src/app/(marketing)/gallery/page.tsx`
- Create: `src/app/(marketing)/gallery/_components/gallery-grid.tsx` (client; owns lightbox open state)
- Assets: `public/gallery/*.JPG`, `public/bg/IMG_7869.JPG`

- [ ] **Step 1: Create the client grid (masonry + lightbox state)**

```tsx
"use client";

import * as React from "react";
import Image from "next/image";
import { Lightbox, type LightboxImage } from "@/components/ui/lightbox";

export function GalleryGrid({ images }: { images: LightboxImage[] }) {
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);

  return (
    <>
      <ul
        className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>li]:mb-4"
        role="list"
      >
        {images.map((img, i) => (
          <li key={img.src} className="break-inside-avoid">
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label={`Open photo ${i + 1} of ${images.length}`}
              className="group focus-visible:ring-ring/50 block w-full overflow-hidden rounded-lg shadow-sm outline-none focus-visible:ring-3"
            >
              <Image
                src={img.src}
                alt={img.alt}
                width={img.width}
                height={img.height}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                loading="lazy"
                quality={70}
                className="h-auto w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
            </button>
          </li>
        ))}
      </ul>

      <Lightbox
        images={images}
        index={openIndex}
        onIndexChange={setOpenIndex}
        onClose={() => setOpenIndex(null)}
      />
    </>
  );
}
```

- [ ] **Step 2: Rewrite the Gallery RSC to feed real images**

```tsx
/**
 * Gallery — real-photo masonry with lightbox. Server component reads the
 * photo set + intrinsic dimensions; the client grid owns the lightbox.
 */
import { PageContainer } from "@/components/layout/page-container";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { getGalleryImages } from "@/features/gallery/gallery-images";
import { EmptyState } from "@/components/feedback/empty-state";
import { GalleryGrid } from "./_components/gallery-grid";

export default async function GalleryPage() {
  const images = await getGalleryImages();

  return (
    <PageContainer width="app" className="py-12 sm:py-16">
      <div className="mb-8">
        <Eyebrow>Out on the trail</Eyebrow>
        <h1 className="font-heading mt-2 text-4xl font-semibold tracking-tight">
          Gallery
        </h1>
        <p className="text-muted-foreground mt-2 max-w-[60ch] leading-relaxed">
          [[BODY: one line about the photos]]
        </p>
      </div>

      {images.length === 0 ? (
        <EmptyState title="Photos coming soon" message="Check back shortly." />
      ) : (
        <GalleryGrid images={images} />
      )}
    </PageContainer>
  );
}
```

- [ ] **Step 3: Verify build (images must exist + measure)**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS; Gallery renders 52 images. If `image-size` throws on any file, log the filename and skip (the reader already skips zero-dim entries).

- [ ] **Step 4: Visual walk (desktop + 390px + keyboard)**

`/gallery`: masonry 3→2→1, whole photos (no crop), hover zoom. Click → lightbox; **Tab** to arrows/close, **ArrowLeft/Right** step, **Esc** closes, click-out closes. 390px: 1–2 cols, **swipe** steps, focus trapped, no h-scroll.

- [ ] **Step 5: Commit (page + the photo assets, staged by path)**

```bash
git add "src/app/(marketing)/gallery/page.tsx" "src/app/(marketing)/gallery/_components/gallery-grid.tsx" public/gallery public/bg
git commit -m "feat(marketing): real-photo gallery with masonry and lightbox"
```

---

## Task 10: Reviews page

**Files:**

- Modify: `src/app/(marketing)/reviews/page.tsx`
- Reference: existing `ReviewForm` (`isSignedIn` prop), `listPublishedReviews`, `PublishedReview`, `EmptyState`.

- [ ] **Step 1: Rewrite using read container + PageHeader + EmptyState**

```tsx
/**
 * Reviews — published reviews + submission form, read column.
 * Server component.
 */
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { createClient } from "@/lib/supabase/server";
import { listPublishedReviews } from "@/features/reviews/reviews-repo";
import { ReviewForm } from "./_components/review-form";
import type { PublishedReview } from "@/features/reviews/reviews-repo";

function StarRating({ rating }: { rating: number }) {
  return (
    <span
      aria-label={`${rating} out of 5 stars`}
      role="img"
      className="text-brand-strong"
    >
      {"★".repeat(rating)}
      {"☆".repeat(5 - rating)}
    </span>
  );
}

function ReviewCard({ review }: { review: PublishedReview }) {
  const date = new Date(review.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <Card>
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-heading text-foreground font-semibold">
            {review.author_name}
          </p>
          <p className="text-muted-foreground text-sm">{date}</p>
        </div>
        <p className="shrink-0 text-base">
          <StarRating rating={review.rating} />
        </p>
      </header>
      <p className="text-muted-foreground text-sm leading-relaxed">
        {review.body}
      </p>
    </Card>
  );
}

export default async function ReviewsPage() {
  const supabase = await createClient();
  const [
    reviews,
    {
      data: { user },
    },
  ] = await Promise.all([
    listPublishedReviews(supabase),
    supabase.auth.getUser(),
  ]);

  return (
    <PageContainer width="read" className="py-12 sm:py-16">
      <PageHeader
        title="Reviews"
        subtitle="[[BODY: reviews section purpose]]"
      />

      <section aria-labelledby="reviews-list-heading" className="mb-14">
        <h2 id="reviews-list-heading" className="sr-only">
          Published reviews
        </h2>
        {reviews.length === 0 ? (
          <EmptyState
            title="No reviews yet"
            message="Be the first to share your experience."
          />
        ) : (
          <ul className="flex flex-col gap-4" role="list">
            {reviews.map((review) => (
              <li key={review.id}>
                <ReviewCard review={review} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="submit-review-heading">
        <h2
          id="submit-review-heading"
          className="font-heading mb-4 text-xl font-semibold"
        >
          Leave a review
        </h2>
        <ReviewForm isSignedIn={user !== null} />
      </section>
    </PageContainer>
  );
}
```

- [ ] **Step 2: Verify** — `npm run typecheck && npm run lint && npm run build` → PASS.

- [ ] **Step 3: Visual walk (desktop + 390px)** — cards stack; stars clay; empty state friendly; form full-width.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(marketing)/reviews/page.tsx"
git commit -m "feat(marketing): recompose reviews onto read column with empty state"
```

---

## Task 11: Resources page (PageHeader + FAQ accordion)

**Files:**

- Modify: `src/app/(marketing)/resources/page.tsx`
- Reference: `node_modules/@base-ui/react/esm/accordion/index.parts.d.ts` (parts: `Root, Item, Header, Trigger, Panel`).

- [ ] **Step 1: Read accordion parts**

Run: `sed -n '1,40p' node_modules/@base-ui/react/esm/accordion/index.parts.d.ts`. Confirm `Accordion.Root/Item/Header/Trigger/Panel`. `Root` accepts `openMultiple` (boolean).

- [ ] **Step 2: Rewrite the page (external links stay `<a>`; FAQ → accordion)**

```tsx
/**
 * Resources — local/emergency resources + FAQ accordion. Read column.
 * Server component (accordion is base-ui; it is a client primitive but renders
 * fine in an RSC tree as a leaf).
 */
import { ChevronDown } from "lucide-react";
import { Accordion } from "@base-ui/react/accordion";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

const localResources = [
  {
    title: "[[Resource 1: name]]",
    description: "[[Resource 1: one-line description]]",
    href: "#",
  },
  {
    title: "[[Resource 2: name]]",
    description: "[[Resource 2: one-line description]]",
    href: "#",
  },
  {
    title: "Animal Emergency & Referral Center of Northern Colorado",
    description: "24/7 emergency veterinary care in Colorado.",
    href: "https://aercnc.com",
  },
  {
    title: "ASPCA Poison Control Hotline",
    description: "(888) 426-4435 — available 24/7 for pet poison emergencies.",
    href: "https://www.aspca.org/pet-care/animal-poison-control",
  },
];

const faqItems = [
  { question: "[[FAQ 1: question]]", answer: "[[FAQ 1: answer]]" },
  { question: "[[FAQ 2: question]]", answer: "[[FAQ 2: answer]]" },
  { question: "[[FAQ 3: question]]", answer: "[[FAQ 3: answer]]" },
  { question: "[[FAQ 4: question]]", answer: "[[FAQ 4: answer]]" },
  { question: "[[FAQ 5: question]]", answer: "[[FAQ 5: answer]]" },
];

export default function ResourcesPage() {
  return (
    <PageContainer width="read" className="py-12 sm:py-16">
      <PageHeader title="Resources" />

      <section aria-labelledby="local-resources-heading" className="mb-12">
        <h2
          id="local-resources-heading"
          className="font-heading mb-4 text-xl font-semibold"
        >
          Local dog resources
        </h2>
        <ul className="flex flex-col gap-4" role="list">
          {localResources.map(({ title, description, href }) => (
            <li
              key={href}
              className="border-border border-b pb-4 last:border-0"
            >
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-strong font-medium underline underline-offset-4 hover:opacity-70"
              >
                {title}
              </a>
              <p className="text-muted-foreground mt-0.5 text-sm">
                {description}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="faq-heading">
        <h2
          id="faq-heading"
          className="font-heading mb-4 text-xl font-semibold"
        >
          Frequently asked questions
        </h2>
        <Accordion.Root className="flex flex-col">
          {faqItems.map((item) => (
            <Accordion.Item
              key={item.question}
              className="border-border border-b"
            >
              <Accordion.Header>
                <Accordion.Trigger className="group flex w-full items-center justify-between gap-4 py-4 text-left outline-none">
                  <span className="text-foreground font-medium">
                    {item.question}
                  </span>
                  <ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-180" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Panel className="text-muted-foreground pb-4 text-sm leading-relaxed">
                {item.answer}
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </section>
    </PageContainer>
  );
}
```

Note: confirm the open-state data attribute on `Accordion.Trigger`/`Item` from the d.ts (likely `data-panel-open` or `data-open`); fix the `group-data-[...]` selector to match. If the accordion requires `"use client"`, add it at the top of the file.

- [ ] **Step 3: Verify** — `npm run typecheck && npm run lint && npm run build` → PASS.

- [ ] **Step 4: Visual walk (desktop + 390px + keyboard)** — FAQ expands/collapses on click and Enter/Space; chevron rotates; external links open new tab.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(marketing)/resources/page.tsx"
git commit -m "feat(marketing): recompose resources with PageHeader and FAQ accordion"
```

---

## Task 12: Book hub + final docs

**Files:**

- Modify: `src/app/(marketing)/book/page.tsx`
- Modify: `docs/DESIGN.md`

- [ ] **Step 1: Rewrite the book hub (app container + kit cards + ErrorState/EmptyState)**

```tsx
/**
 * /book — service chooser. Cards link to the per-service booking flow.
 * Server component; loaded via the service role.
 */
import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/feedback/error-state";
import { EmptyState } from "@/components/feedback/empty-state";
import { createServiceClient } from "@/lib/supabase/service";

interface ServiceCardData {
  slug: string;
  name: string;
  description: string | null;
}

export default async function BookPage() {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("services")
    .select("slug, name, description")
    .eq("active", true)
    .order("sort_order");

  return (
    <PageContainer width="app" className="py-12 sm:py-16">
      <PageHeader
        title="Book a service"
        subtitle="Choose a service to see Cal's availability and book."
      />

      {error ? (
        <ErrorState
          title="Couldn't load services"
          message="Please try again in a moment."
        />
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="No services available" message="Check back soon." />
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" role="list">
          {(data ?? []).map((row) => {
            const s: ServiceCardData = {
              slug: row.slug as string,
              name: row.name as string,
              description:
                typeof row.description === "string" ? row.description : null,
            };
            return (
              <li key={s.slug}>
                <Link
                  href={`/book/${s.slug}`}
                  className="focus-visible:ring-ring/50 block h-full rounded-xl outline-none focus-visible:ring-3"
                >
                  <Card className="hover:border-foreground/40 h-full transition-colors">
                    <CardHeader>
                      <CardTitle className="font-heading">{s.name}</CardTitle>
                    </CardHeader>
                    {s.description ? (
                      <CardContent className="text-muted-foreground leading-relaxed">
                        {s.description}
                      </CardContent>
                    ) : null}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
```

Note: `ErrorState` is a client component with no required handler — rendering it from this RSC without `onRetry` is fine (no retry button shows).

- [ ] **Step 2: Update DESIGN.md (same-commit rule)**

In the "Brand / visual direction" → "Layout" area, add a sentence: the **home hero** uses `public/bg/IMG_7869.JPG` (3:2), the **Gallery** is real photos from `public/gallery` (masonry + lightbox), and the marketing pages now compose the shell system (`PageContainer`/`PageHeader`/kit). Keep it to 1–2 sentences (no path dumps).

- [ ] **Step 3: Verify** — `npm run typecheck && npm run lint && npm run build` → PASS. Confirm the raw `Could not load services.` string is gone.

- [ ] **Step 4: Visual walk (desktop + 390px)** — chooser cards 3→2→1, hover border, keyboard focus ring; error/empty states render the friendly components.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(marketing)/book/page.tsx" docs/DESIGN.md
git commit -m "feat(marketing): recompose book hub with kit cards and friendly states"
```

---

## Task 13: Full-site verification pass (Definition of Done)

**Files:** none (verification only).

- [ ] **Step 1: Gate green**

Run: `npm run lint && npm run typecheck && npm run build && npm test`
Expected: all PASS; build page count unchanged (still 28 pages); test count ≥ prior (568) + the 2 new specs (`stepIndex`, `listGalleryFiles`).

- [ ] **Step 2: `/code-review`** on the branch diff; triage findings via `superpowers:receiving-code-review`.

- [ ] **Step 3: Mobile + a11y walk (the deferred 390px + keyboard walk, folded in here)**

For **each** of `/ /about /services /gallery /reviews /resources /book` at **390px** and desktop, **light + dark**:

- No horizontal scroll; content fills the toned sheet; desk gutters read on wide.
- Hero: desktop overlay legible; mobile photo-on-top + stacked copy; buttons ≥44px full-width.
- Gallery: masonry reflows 3→2→1; lightbox opens, **swipe** + **Arrow** nav, **Esc**/click-out close, focus trapped.
- FAQ accordion: keyboard oper(Enter/Space), visible focus.
- Nav drawer (from shell): still focus-trapped + Esc; `aria-current` on the active tab; sheet shadow reads in dark.

- [ ] **Step 4: Re-palette contract intact** — grep the touched files for hardcoded hex/`rgb(`/`oklch(` in component classes (the lightbox backdrop `#1c1813` and hero gradient via `--foreground` are the only intentional raw values; everything else references semantic tokens). Confirm no new hardcoded brand colors leaked into pages.

- [ ] **Step 5: Report** completion with the gate output. **Do not push** — tell Alex the branch is ready and batched for his push.

---

## Self-review (against the spec)

- **Spec coverage:** site-wide width+tone → Task 1; aesthetic eyebrow → Task 2; lightbox (logic+component) → Tasks 3–4; gallery dims/`image-size` → Task 5; home hero overlay/stack → Task 6; about+photo+`<Link>` → Task 7; services+sliding-scale → Task 8; gallery masonry+lightbox+assets → Task 9; reviews+EmptyState → Task 10; resources+accordion → Task 11; book+Error/Empty states+DESIGN.md → Task 12; FRONTEND.md+`--destructive-warm` → Task 1 Step 4; mobile/keyboard walk → Task 13. All spec sections mapped.
- **Type consistency:** `LightboxImage`/`GalleryImage` share `{src,width,height,alt}`; `stepIndex(current,delta,length)` used identically in Task 3 + 4; `getGalleryImages()` → `GalleryGrid images` → `Lightbox images`. Consistent.
- **Placeholder scan:** all code steps contain full code; the only `[[ ]]` are intentional copy placeholders (per DESIGN.md), not plan gaps. Two flagged "confirm the data-attr / version" notes point at specific d.ts/version checks with concrete fallbacks — not vague TODOs.

```

```
