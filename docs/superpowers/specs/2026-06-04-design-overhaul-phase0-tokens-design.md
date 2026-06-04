# Design Overhaul — Phase 0: Tokens & Type (Spec)

> Status: **approved-direction, pending spec review** · 2026-06-04
> Umbrella roadmap: `~/.claude/plans/ok-sure-lets-try-splendid-plum.md` (5-phase, foundation-first).
> This spec covers **Phase 0 only**: the swappable design foundation every later phase inherits.

## Context & goal

The site is a functional wireframe on a neutral grayscale placeholder palette + the default Geist
font. This phase replaces that placeholder foundation with the locked brand — a **warm, restrained,
document-like** look ("a warm document") — expressed entirely through the existing **two-layer token
system**, so later phases (chrome, marketing, account, admin) build on real tokens and so palette +
type stay swappable in one place (FRONTEND.md "Modular theming").

**No components or pages change in Phase 0** beyond the root layout's font wiring. This is tokens,
type, and docs only. Re-palettability is the acceptance bar: flipping a primitive re-skins the whole
app with zero component edits.

## Locked decisions (from the visual-companion session)

- **Palette — "Trail":** warm sand/stone/cream neutrals + a **clay / terracotta** accent. Status
  tones (sage green / muted blue / warm gray) reconciled to the warm base.
- **Type:** **Fraunces** (variable, optical-size axis) for headings + **Public Sans** for body.
  Serif display + humanist sans; deliberately non-generic (no Inter/Roboto/Open Sans).
- **Brand mark:** type-driven "Cal Barba" wordmark in Fraunces (no logo asset).
- Light-first; dark mode kept correct (warm-dark, not pure neutral).

## Token design

All values live in `src/app/globals.css` as the two layers already established. Hex anchors below are
the **targets**; convert to `oklch()` at implementation (the file is oklch-based) and tune to meet
the contrast bar in Acceptance. No component references raw values — only semantic roles.

### 1. Primitive palette (the swap layer)

**Warm neutrals** (replace the chroma-0 `--neutral-*` ramp with warm, low-chroma equivalents):

| Token        | Target  | Role anchor                          |
| ------------ | ------- | ------------------------------------ |
| `--sand-0`   | #FFFFFF | pure white (cards in light)          |
| `--sand-50`  | #FAF6F0 | app background (cream)               |
| `--sand-100` | #F2ECE1 | muted/secondary surface              |
| `--sand-200` | #E7DECF | borders / inputs                     |
| `--sand-400` | #B6A88F | ring / disabled                      |
| `--sand-500` | #8A7E6C | muted foreground (meets AA on cream) |
| `--sand-700` | #5A5044 | strong muted                         |
| `--sand-900` | #2B2520 | foreground (warm near-black)         |
| `--sand-950` | #1C1813 | darkest / dark-mode base             |

**Clay accent ramp** (new brand primitive):

| Token           | Target  | Role anchor                                       |
| --------------- | ------- | ------------------------------------------------- |
| `--clay-fill`   | #B5613C | brand fills (button bg) with light text only      |
| `--clay-strong` | #8A4226 | **brand text/links on light** (AA ≥ 4.5 on cream) |
| `--clay-soft`   | #E7D8CC | tints / subtle backgrounds                        |
| `--clay-onfill` | #FFF8F2 | text on `--clay-fill`                             |

> **Contrast note (must-fix):** `#B5613C` on cream is ~3.x:1 — fails AA for normal text. So bright
> clay is for **fills + large text only**; all small clay text (links, eyebrows, active nav) uses
> `--clay-strong`. Encoded as two roles below.

**Status primitives** (reconcile the existing `--green-soft/-deep`, `--blue-soft/-deep` to the warm
base): available sage `#E3E7D2` / `#4F5B33`; booked blue `#D9E2E8` / `#3C5566`; unavailable warm gray
reuses `--sand-100` / `--sand-500`. Keep "gray, not red" for unavailable; red stays `--destructive`.

### 2. Semantic roles (what components reference — unchanged names + new brand role)

Remap existing roles to the warm primitives; **add a dedicated brand role** so clay is used
intentionally, not on every default button:

- `--background`=`--sand-50` · `--foreground`=`--sand-900` · `--card`=`--sand-0` · `--popover`=`--sand-0`
- `--primary`=`--sand-900` / `--primary-foreground`=`--sand-50` — **stays neutral near-black** (most
  buttons, admin actions). Keeps the low-chrome restraint; clay is not the default action color.
- **`--brand`=`--clay-fill` / `--brand-foreground`=`--clay-onfill`** (hero CTAs, primary marketing
  actions, fills) and **`--brand-strong`=`--clay-strong`** (links, eyebrows, active-nav, focus accent
  — anything that is clay _text/Icon on a light surface_). **New roles; add to `SEMANTIC_COLORS`.**
- `--secondary`=`--sand-100` · `--muted`=`--sand-100` / `--muted-foreground`=`--sand-500` ·
  `--accent`=`--sand-100` (neutral hover; unchanged purpose) · `--border`/`--input`=`--sand-200` ·
  `--ring`=`--clay-strong` (branded focus ring) · `--destructive` unchanged.
- `--status-available/-foreground`, `--status-booked/-foreground`, `--status-unavailable/-foreground`
  → the reconciled status primitives above.

### 3. Dark mode (`.dark`)

Warm-dark, mirroring the light intent: `--background`=`--sand-950`, `--foreground`=`--sand-50`,
`--card`=`#241F19`, surfaces warm. Brand: lighten clay for fills (`#C9764E`) and use a still-lighter
clay for `--brand-strong` text to hold AA on dark. Status roles get desaturated warm-dark fills with
lighter foregrounds (same pattern as today's inlined `.dark` status overrides).

### 4. Typography

- Replace Geist in `src/app/layout.tsx`: load **Fraunces** (`next/font/google`, variable, weights
  400–700, opsz axis) → CSS var consumed by `--font-heading`; load **Public Sans** (400/500/600) →
  consumed by `--font-sans`. **Fix the wiring gap:** today the layout exposes `--font-geist-sans` but
  `globals.css`/Tailwind read `--font-sans` (undefined). Bind the new fonts to the vars the system
  actually references (`--font-sans`, `--font-heading`). Keep a mono var for code (`--font-mono`).
- **Type scale** (documented; pages pick a step — Standard 2): real size + weight contrast, not 1.5×.
  Headings Fraunces 600; body Public Sans 400/500.

  | Step            | Size / line-height                | Family · weight                |
  | --------------- | --------------------------------- | ------------------------------ |
  | display         | 3.0rem / 1.05                     | Fraunces 600                   |
  | h1              | 2.25rem / 1.1                     | Fraunces 600                   |
  | h2              | 1.5rem / 1.2                      | Fraunces 600                   |
  | h3              | 1.175rem / 1.3                    | Fraunces 600                   |
  | body            | 1.0rem / 1.6                      | Public Sans 400                |
  | small           | 0.875rem / 1.5                    | Public Sans 400/500            |
  | caption/eyebrow | 0.72rem / 1.4, tracked, uppercase | Public Sans 600 (brand-strong) |

- **Reading measure:** marketing/reading content capped ~65ch (a `prose`-width token/utility);
  app/admin content wider. (Measure utility defined here; applied to shells in Phase 1.)

### 5. Spacing & rhythm (consistent whitespace)

Whitespace is a **token, not a per-page choice** — this is the root cause of the audit's 4 padding
rhythms / 6 container widths. Phase 0 fixes the _scale_; Phase 1 shells apply it.

- **One spacing scale.** Adopt Tailwind's 4px base step as the **only** allowed unit for gaps,
  padding, and margins. No arbitrary `px-[…]` / magic values anywhere in the site.
- **Semantic spacing tokens** (named, in `design-tokens.ts`, so intent is explicit and tunable in one
  place): `space.pageX` (responsive container horizontal padding), `space.sectionY` (vertical gap
  between page sections), `space.stack` (default gap within a content stack), `space.field` (gap
  between form controls). Shells + pages reference these, never raw values.
- **Vertical rhythm.** Section spacing and heading top/bottom margins derive from the type scale, so
  every page breathes identically. One content measure per zone (the ~65ch reading width above).
- **Enforcement** lands in Phase 1 (`PageContainer` / `PageHeader` / `Section` primitives consume
  these tokens), but the scale + token names are **fixed here** so every later phase uses the same
  steps — uniform whitespace across marketing, account, and admin by construction.

### 6. Radius / motion / z-index

Keep `--radius: 0.625rem` and the derived radius scale; keep `motion` + `zIndex` in
`design-tokens.ts` unchanged.

## Files touched (Phase 0)

- `src/app/globals.css` — primitive ramp (warm + clay + status), semantic remap, new `--brand*`
  roles, `.dark` rebuild, status reconciliation.
- `src/app/layout.tsx` — swap Geist → Fraunces + Public Sans; fix font-var wiring.
- `src/lib/design-tokens.ts` — add `brand`, `brand-foreground`, `brand-strong` to `SEMANTIC_COLORS`;
  add the named **spacing tokens** (`space.pageX/sectionY/stack/field`) + measure.
- `docs/DESIGN.md` — fill the **Brand / visual direction** section with the concrete Trail palette +
  Fraunces/Public Sans decision (replaces the "set later in a Claude Design session" placeholder).
- `docs/FRONTEND.md` — document the brand role + type scale + status-reconciliation note + measure.
  (Same-commit doc rule.)

## Out of scope (later phases)

Shell primitives, nav, feedback system, new input components, page restyles, scheduler Layer-3 —
all Phase 1+. Phase 0 introduces tokens the others consume; it does not apply them to pages.

## Acceptance criteria & verification

1. **Build/lint clean** — `npm run build` (or `tsc --noEmit`) + `npm run lint`; strict, no `any`.
2. **Re-palette proof** — change `--clay-fill`/`--clay-strong` primitives only; the whole UI accent
   shifts with **zero component edits** (proves the swap layer; Standard 9).
3. **Contrast (AA)** — verify: body `--foreground` on `--background`; `--muted-foreground` on
   background; `--brand-foreground` on `--brand` (button); `--brand-strong` link text on `--card` and
   `--background`; status `-foreground` on each status fill. All ≥ 4.5 (normal) / 3.0 (large).
   Repeat for `.dark`.
4. **Type applied** — confirm Fraunces renders on headings and Public Sans on body (no Geist/Inter
   fallback); the old `--font-geist-sans`-only wiring is gone.
5. **Docs** — DESIGN.md brand section + FRONTEND.md system rules (incl. spacing scale) updated in
   the same commit.
6. **Spacing tokens present** — the named spacing scale + measure exist and are documented; no
   arbitrary spacing values introduced in this phase (enforcement on pages lands in Phase 1).

## Risks / notes

- Clay-on-cream contrast (handled via the two clay roles — do not regress by using `--brand` for
  small text).
- oklch conversion: tune lightness to hit the contrast bar rather than matching hex exactly.
- Keep changes token-only so Phase 1 can restyle components against a stable role vocabulary.
