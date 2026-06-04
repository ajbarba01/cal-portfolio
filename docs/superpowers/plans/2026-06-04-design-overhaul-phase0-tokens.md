# Design Overhaul — Phase 0: Tokens & Type — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the grayscale placeholder palette + default Geist font with the locked "Trail" brand (warm sand/stone/cream neutrals + clay accent, Fraunces + Public Sans), expressed entirely through the two-layer token system, plus a spacing scale — so later phases inherit a stable, swappable foundation.

**Architecture:** Pure presentational/token change. Edit the primitive + semantic layers in `globals.css`, wire fonts in the root layout, extend the TS token list, and document the system. **No component or page logic changes** beyond the root layout's font wiring and a base heading-font rule. Because there is no pure logic here, verification is **build + WCAG contrast + visual re-palette proof**, not unit tests (the project's testable core — pricing/booking — is untouched).

**Tech Stack:** Next.js 16 App Router, Tailwind v4 (`@theme inline` in `globals.css`), `next/font/google`, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-06-04-design-overhaul-phase0-tokens-design.md`

**Conventions:** Commit messages are **subject-line only**, Conventional Commits, no body/trailer (repo CLAUDE.md). `husky` runs `lint-staged` (eslint+prettier) and `tsc --noEmit` on commit; let them run.

---

## File map

- `src/app/globals.css` — primitive palette (warm + clay + status), semantic remap, new `--brand*` roles, `@theme` brand-color + font-heading mappings, base heading-font rule, `.measure` utility, `.dark` rebuild. (One file owns color + radius; keep it that way.)
- `src/app/layout.tsx` — swap Geist sans → Fraunces (`--font-heading`) + Public Sans (`--font-sans`); keep Geist Mono (`--font-geist-mono`).
- `src/lib/design-tokens.ts` — add `brand*` to `SEMANTIC_COLORS`; add `space`, `typeScale`, `measure` tokens.
- `docs/DESIGN.md` — concrete brand section. `docs/FRONTEND.md` — system rules (brand role, type scale, status reconcile, spacing, measure).

---

## Task 1: Warm primitive palette (the swap layer)

**Files:** Modify `src/app/globals.css` — the `:root` block, primitive section only (currently lines ~65–85, the `--neutral-*` ramp + `--danger` + `--green/blue-soft/deep` + `--radius`).

- [ ] **Step 1: Replace the primitive palette.** Replace the entire primitive comment block + tokens (from `/* ── 1. Primitive palette ... */` down to and including `--radius: 0.625rem;`) with:

```css
/* ── 1. Primitive palette (swap here to re-palette) ──────────────── */
/* Warm neutrals — "sand/stone/cream" */
--sand-0: #ffffff;
--sand-50: #faf6f0;
--sand-100: #f2ece1;
--sand-200: #e7decf;
--sand-400: #b6a88f;
--sand-500: #8a7e6c;
--sand-700: #5a5044;
--sand-800: #322b22;
--sand-900: #2b2520;
--sand-950: #1c1813;

/* Clay / terracotta accent (two roles: bright fill vs AA-safe text) */
--clay-fill: #b5613c; /* fills + large text only */
--clay-strong: #8a4226; /* small clay text/links on light (AA ≥ 4.5 on cream) */
--clay-soft: #e7d8cc; /* subtle tints */
--clay-onfill: #ffffff; /* text on --clay-fill */

--danger: oklch(0.577 0.245 27.325);

/* Status primitives, reconciled to the warm base (light) */
--green-soft: #e3e7d2;
--green-deep: #4f5b33;
--blue-soft: #d9e2e8;
--blue-deep: #3c5566;

--radius: 0.625rem;
```

- [ ] **Step 2: Verify the dev server still compiles.** Run: `npm run build`
      Expected: build succeeds (semantic roles still reference old `--neutral-*` names → they're now undefined, but CSS tolerates it; colors may look wrong until Task 2). If build **fails**, it's a syntax error in the block above — fix and re-run.

- [ ] **Step 3: Commit.**

```bash
git add src/app/globals.css
git commit -m "feat(tokens): add warm sand + clay primitive palette"
```

---

## Task 2: Light semantic roles + brand roles + theme mappings

**Files:** Modify `src/app/globals.css` — the `:root` semantic section (the `/* ── 2. Semantic roles ... */` block through the end of `:root`) and the `@theme inline { … }` block.

- [ ] **Step 1: Replace the `:root` semantic roles.** Replace everything from `/* ── 2. Semantic roles (components reference only these) ─── */` down to the closing `}` of `:root` with:

```css
/* ── 2. Semantic roles (components reference only these) ─────────── */
--background: var(--sand-50);
--foreground: var(--sand-900);
--card: var(--sand-0);
--card-foreground: var(--sand-900);
--popover: var(--sand-0);
--popover-foreground: var(--sand-900);
--primary: var(--sand-900);
--primary-foreground: var(--sand-50);
--secondary: var(--sand-100);
--secondary-foreground: var(--sand-900);
--muted: var(--sand-100);
--muted-foreground: var(--sand-500);
--accent: var(--sand-100);
--accent-foreground: var(--sand-900);
/* Brand (clay) — intentional accent, NOT the default action color */
--brand: var(--clay-fill);
--brand-foreground: var(--clay-onfill);
--brand-strong: var(--clay-strong);
--destructive: var(--danger);
--border: var(--sand-200);
--input: var(--sand-200);
--ring: var(--clay-strong);
--chart-1: var(--clay-fill);
--chart-2: var(--sand-500);
--chart-3: var(--sand-700);
--chart-4: var(--green-deep);
--chart-5: var(--blue-deep);
/* ── Status roles (scheduler cell states) ───────────────────────── */
--status-available: var(--green-soft);
--status-available-foreground: var(--green-deep);
--status-booked: var(--blue-soft);
--status-booked-foreground: var(--blue-deep);
--status-unavailable: var(--sand-100);
--status-unavailable-foreground: var(--sand-500);
--sidebar: var(--sand-100);
--sidebar-foreground: var(--sand-900);
--sidebar-primary: var(--sand-900);
--sidebar-primary-foreground: var(--sand-50);
--sidebar-accent: var(--sand-200);
--sidebar-accent-foreground: var(--sand-900);
--sidebar-border: var(--sand-200);
--sidebar-ring: var(--clay-strong);
```

- [ ] **Step 2: Expose brand utilities + fix the heading-font mapping in `@theme`.** In the `@theme inline { … }` block, (a) change the heading line and (b) add three brand lines. Find:

```css
--font-heading: var(--font-sans);
```

Replace with:

```css
--font-heading: var(--font-heading);
```

Then directly below the existing `--color-accent: var(--accent);` line, add:

```css
--color-brand: var(--brand);
--color-brand-foreground: var(--brand-foreground);
--color-brand-strong: var(--brand-strong);
```

- [ ] **Step 3: Verify build + visually check light mode.** Run: `npm run build` then `npm run dev` and open `http://localhost:3000`.
      Expected: build passes; the site now renders on a cream background with warm-near-black text. A default `Button` is still near-black (neutral) — clay is not yet used anywhere (correct; brand utilities exist but aren't applied until later phases). The marketing footer/header use warm neutrals.

- [ ] **Step 4: Commit.**

```bash
git add src/app/globals.css
git commit -m "feat(tokens): remap light semantic roles to warm base + add brand role"
```

---

## Task 3: Dark mode rebuild (warm-dark)

**Files:** Modify `src/app/globals.css` — the entire `.dark { … }` block.

- [ ] **Step 1: Replace the `.dark` block** with a warm-dark mirror:

```css
.dark {
  --background: var(--sand-950);
  --foreground: var(--sand-50);
  --card: #241f19;
  --card-foreground: var(--sand-50);
  --popover: #241f19;
  --popover-foreground: var(--sand-50);
  --primary: var(--sand-200);
  --primary-foreground: var(--sand-900);
  --secondary: var(--sand-800);
  --secondary-foreground: var(--sand-50);
  --muted: var(--sand-800);
  --muted-foreground: var(--sand-400);
  --accent: var(--sand-800);
  --accent-foreground: var(--sand-50);
  /* Brand: same clay fill (white text passes), lighter clay for text-on-dark */
  --brand: var(--clay-fill);
  --brand-foreground: var(--clay-onfill);
  --brand-strong: #e5946b;
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: #e5946b;
  --chart-1: #c9764e;
  --chart-2: var(--sand-400);
  --chart-3: var(--sand-200);
  --chart-4: #c7d3ac;
  --chart-5: #afc6d6;
  /* ── Status roles (warm-dark overrides) ─────────────────────────── */
  --status-available: #2e3a22;
  --status-available-foreground: #c7d3ac;
  --status-booked: #25323b;
  --status-booked-foreground: #afc6d6;
  --status-unavailable: var(--sand-800);
  --status-unavailable-foreground: var(--sand-400);
  --sidebar: #241f19;
  --sidebar-foreground: var(--sand-50);
  --sidebar-primary: var(--sand-200);
  --sidebar-primary-foreground: var(--sand-900);
  --sidebar-accent: var(--sand-800);
  --sidebar-accent-foreground: var(--sand-50);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: #e5946b;
}
```

- [ ] **Step 2: Verify dark mode.** With `npm run dev` running, add `class="dark"` to `<html>` temporarily in the browser devtools (or toggle your OS theme if a theme switch exists). Confirm: warm-dark background (not pure black), legible text, status pills readable.

- [ ] **Step 3: Commit.**

```bash
git add src/app/globals.css
git commit -m "feat(tokens): rebuild dark mode on warm-dark base"
```

---

## Task 4: Fonts (Fraunces + Public Sans) + base heading rule + measure

**Files:** Modify `src/app/layout.tsx` (font loading) and `src/app/globals.css` (base layer + utility).

- [ ] **Step 1: Swap the fonts in `layout.tsx`.** Replace the imports + font consts (lines ~1–13) with:

```tsx
import type { Metadata } from "next";
import { Fraunces, Public_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
});

const publicSans = Public_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
```

- [ ] **Step 2: Update the `<html>` className** to expose all three font variables. Replace:

```tsx
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
```

with:

```tsx
      className={`${fraunces.variable} ${publicSans.variable} ${geistMono.variable} h-full antialiased`}
```

- [ ] **Step 3: Make headings use the heading font + add the measure utility.** In `src/app/globals.css`, replace the `@layer base { … }` block with:

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
    font-optical-sizing: auto;
  }
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    font-family: var(--font-heading);
    font-optical-sizing: auto;
  }
}

@layer utilities {
  /* Reading measure for marketing/long-form content (applied by shells in Phase 1) */
  .measure {
    max-width: 65ch;
  }
}
```

- [ ] **Step 4: Verify fonts applied.** Run: `npm run build` then `npm run dev`. Open `http://localhost:3000`, inspect an `<h1>` (e.g. the About page heading) → computed `font-family` is **Fraunces**; inspect body `<p>` → **Public Sans**. No Geist on text (Geist Mono only if code/mono is used).
      Expected: PASS. If headings still show a sans fallback, the `@theme` `--font-heading` mapping (Task 2 Step 2) or the `--font-heading` variable name mismatch is the cause — confirm both read `--font-heading`.

- [ ] **Step 5: Commit.**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat(type): wire Fraunces headings + Public Sans body, add reading measure"
```

---

## Task 5: TS tokens — brand roles, spacing scale, type scale

**Files:** Modify `src/lib/design-tokens.ts`.

- [ ] **Step 1: Add brand roles to `SEMANTIC_COLORS`.** In the `SEMANTIC_COLORS` array, directly after the `"accent",` entry, add:

```ts
  "brand",
  "brand-foreground",
  "brand-strong",
```

- [ ] **Step 2: Add spacing + type-scale + measure tokens.** At the end of the file (after the `zIndex` const), append:

```ts
/**
 * Spacing scale — whitespace is a token, not a per-page choice. These are the ONLY
 * approved gap/padding conventions; shells (Phase 1) consume them so marketing,
 * account, and admin breathe identically. All values are Tailwind 4px-base steps.
 */
export const space = {
  /** Responsive container horizontal padding. */
  pageX: "px-5 sm:px-8",
  /** Vertical gap between major page sections. */
  sectionY: "py-12 sm:py-16",
  /** Default gap within a vertical content stack. */
  stack: "gap-6",
  /** Gap between a label and its form control. */
  field: "gap-1.5",
} as const;

/** Reading measure for long-form/marketing content (also the `.measure` CSS utility). */
export const measure = "65ch";

/**
 * Type scale — one documented set of steps. Headings use Fraunces (var `--font-heading`),
 * body uses Public Sans (var `--font-sans`). Pages pick a step; never ad-hoc sizes.
 */
export const typeScale = {
  display: { size: "3rem", leading: "1.05", font: "heading", weight: 600 },
  h1: { size: "2.25rem", leading: "1.1", font: "heading", weight: 600 },
  h2: { size: "1.5rem", leading: "1.2", font: "heading", weight: 600 },
  h3: { size: "1.175rem", leading: "1.3", font: "heading", weight: 600 },
  body: { size: "1rem", leading: "1.6", font: "sans", weight: 400 },
  small: { size: "0.875rem", leading: "1.5", font: "sans", weight: 400 },
  eyebrow: { size: "0.72rem", leading: "1.4", font: "sans", weight: 600 },
} as const;
```

- [ ] **Step 3: Verify types.** Run: `npm run typecheck`
      Expected: PASS (no errors). The `SemanticColor` union now includes the brand roles.

- [ ] **Step 4: Commit.**

```bash
git add src/lib/design-tokens.ts
git commit -m "feat(tokens): add brand roles, spacing scale, and type scale tokens"
```

---

## Task 6: Documentation (same-commit doc rule)

**Files:** Modify `docs/DESIGN.md` (Brand / visual direction) and `docs/FRONTEND.md` (Design system).

- [ ] **Step 1: Update DESIGN.md brand section.** In `docs/DESIGN.md`, under `## Brand / visual direction`, replace the sentence beginning "Concrete palette + typography are set later in a **Claude Design** session…" with:

```markdown
Concrete brand is **set** (Phase 0 of the design overhaul, 2026-06-04): palette **"Trail"** — warm
sand/stone/cream neutrals (`--sand-*`) + a **clay/terracotta** accent split into `--brand` (bright
fill) and `--brand-strong` (AA-safe text/links). Type: **Fraunces** (serif headings) + **Public
Sans** (body), wired via `next/font` → `--font-heading` / `--font-sans`. Status colors (sage/blue/
warm-gray) reconciled to the warm base. Tokens live in `src/app/globals.css`; the swap layer is the
`--sand-*` / `--clay-*` primitives. Full rationale: `docs/superpowers/specs/2026-06-04-design-overhaul-phase0-tokens-design.md`.
```

- [ ] **Step 2: Update FRONTEND.md design-system section.** In `docs/FRONTEND.md` under `## C. Design system`, after the "Anti-generic rules" list, add a new subsection:

```markdown
**Brand tokens (set 2026-06-04):**

- **Palette "Trail":** `--sand-0…950` warm neutrals (the re-palette swap layer) + clay accent.
  Clay is **two roles**: `--brand` (bright `#B5613C` fill — fills + large text only) and
  `--brand-strong` (`#8A4226` — AA-safe small text/links/active-nav/focus ring). `--primary` stays
  warm near-black: clay is a deliberate accent, never the default button color.
- **Type:** Fraunces (`--font-heading`) headings, Public Sans (`--font-sans`) body. Documented type
  scale + spacing scale + `65ch` reading measure live in `src/lib/design-tokens.ts` (`typeScale`,
  `space`, `measure`); the `.measure` utility is in `globals.css`.
- **Whitespace is a token:** only the `space.*` steps (Tailwind 4px base) are used for padding/gaps;
  no arbitrary values. Shells apply them so all zones share one rhythm.
- **Status reconciliation:** `--status-*` fills were re-tuned to the warm base; unavailable stays
  warm gray (not red); red is reserved for `--destructive`.
```

- [ ] **Step 3: Bump the `_Last reviewed_` footer** in both `docs/DESIGN.md` and `docs/FRONTEND.md` to `2026-06-04` (if not already).

- [ ] **Step 4: Commit.**

```bash
git add docs/DESIGN.md docs/FRONTEND.md
git commit -m "docs: record Trail palette + type/spacing tokens (Phase 0)"
```

---

## Task 7: Acceptance verification (build, contrast, re-palette proof)

**Files:** none (verification only) — except a temporary edit reverted in Step 3.

- [ ] **Step 1: Full build + lint + typecheck.** Run each and confirm clean:

```bash
npm run lint
npm run typecheck
npm run build
```

Expected: all pass, no errors.

- [ ] **Step 2: WCAG AA contrast check.** Using any contrast checker, verify these pairs are **≥ 4.5:1** (normal text) / **≥ 3:1** (large/UI), light mode:
  - `--foreground` `#2B2520` on `--background` `#FAF6F0` → ~13:1 ✓
  - `--muted-foreground` `#8A7E6C` on `#FAF6F0` → ~3.4:1 (acceptable for secondary/large only; if a checker flags body use of muted, that's a Phase 2 usage concern, not a token defect)
  - `--brand-foreground` `#FFFFFF` on `--brand` `#B5613C` (button) → must be **≥ 4.5**. If it lands below, darken `--clay-fill` to `#A9542F` and re-check.
  - `--brand-strong` `#8A4226` link text on `#FAF6F0` and on `--card` `#FFFFFF` → ~6:1 ✓
  - status `-foreground` on each `-` fill (available/booked) → ≥ 4.5 ✓
    Repeat spot-checks for `.dark` (`--brand-strong` `#E5946B` on `#1C1813`; foreground on background).

- [ ] **Step 3: Re-palette proof (the core acceptance bar).** Temporarily change ONLY the primitive `--clay-fill` in `globals.css` to `#2E6F6A` (a test teal) and reload `http://localhost:3000`. Confirm every brand-accent surface (focus rings, any `bg-brand`/`text-brand-strong` once present, charts) shifts **without touching any component**. Then **revert** the change:

```bash
git checkout -- src/app/globals.css
```

Expected: one-line primitive edit re-skins the accent; revert restores clay.

- [ ] **Step 4: Visual walk (desktop + mobile).** With `npm run dev`, view `/`, `/about`, `/services`, `/login`, `/account`, `/admin/settings` at a desktop width and a ~390px mobile width. Confirm warm palette + Fraunces headings + Public Sans body everywhere, light and dark. (Layout/nav incoherence is expected — that's Phase 1; here we only confirm the **tokens + type** landed globally.)

- [ ] **Step 5: Final confirmation commit (if any footer/tweak remains uncommitted).**

```bash
git status   # should be clean after Task 6; if a tuning tweak was made, commit it:
git add -A && git commit -m "fix(tokens): tune brand-fill for AA contrast"
```

---

## Self-review (completed)

- **Spec coverage:** primitives (T1) · semantic+brand roles + theme exposure (T2) · dark (T3) · fonts + wiring-gap fix + measure (T4) · `SEMANTIC_COLORS` brand + spacing + type scale (T5) · DESIGN.md/FRONTEND.md (T6) · AA contrast + re-palette proof + build (T7). All spec sections mapped.
- **No placeholders:** every color/value is concrete; the one contingent value (`--clay-fill` AA) has a concrete fallback `#A9542F`.
- **Type consistency:** role names (`--brand`, `--brand-foreground`, `--brand-strong`) identical across globals.css `:root`/`.dark`/`@theme` and `SEMANTIC_COLORS`; font vars (`--font-heading`, `--font-sans`, `--font-geist-mono`) consistent between `layout.tsx` and `globals.css` `@theme`.
