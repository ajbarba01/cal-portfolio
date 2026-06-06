# Design Overhaul — Phase 2: Marketing / Portfolio (Spec)

> Status: **approved-direction, pending spec review** · 2026-06-05
> Umbrella roadmap: `~/.claude/plans/ok-sure-lets-try-splendid-plum.md` (5-phase, foundation-first).
> Builds on Phase 0 (Trail tokens, Fraunces/Public Sans, `space.*`/`measure`/`typeScale`/`--brand*`),
> Phase 1 (`PageContainer`/`PageHeader`, header, `AppShell`, feedback + component kit), and the
> Shell-Unification phase (`PageShell` desk+sheet, global `SiteHeader`, interaction language).
> This phase redesigns the **marketing page bodies only**. It does **not** touch Scheduler Layers
> 1–2 (booking `book/[serviceSlug]` Layer-3 restyle is **Phase 3**, not here).

## Context & goal

The seven marketing routes are still functional wireframes: full-bleed `bg-background`/`bg-muted`
bands, ad-hoc `max-w-2xl…5xl`, hand-rolled `<h1 text-3xl>`, raw `<a href>` (about/resources),
`picsum` placeholder gallery. Inside the new desk+sheet shell they read awkwardly. Phase 2 recomposes
each body onto the shipped system (`PageShell` → `PageContainer` → `PageHeader` + `typeScale` +
kit), introduces real photography at the two surfaces where it earns its place (hero + Gallery), and
makes two deliberate **site-wide** shell adjustments Alex directed during brainstorming.

Presentational/structural only: TS strict, no `any`; two-layer tokens (components reference semantic
roles only); whitespace from `space.*` only; a11y floor; **mobile-first authored, with mobile parity
as a per-page acceptance criterion** (Alex: every page must be "just as fluid, dynamic, and
intentional" on mobile as desktop).

## Aesthetic POV — "a warm field journal"

Editorial-document bones: generous negative space, Fraunces used as real **display moments** (big
size/weight contrast, not timid), clay as a **sharp** accent (eyebrow labels, links, one CTA) never
evenly spread, the grain desk + floating sheet for quiet depth. Photography earns its keep at the
**home hero** (warmth at the front door) and the **Gallery** (the photo-rich payoff); everything
between stays calm type + space. Anti-slop guardrails: no uniform card-grid-everywhere, no
everything-centered; asymmetry only where it carries meaning.

## Site-wide shell changes (deliberate, cross-zone; same-commit doc update)

These two are the **only** edits outside marketing page bodies. They affect account/admin too —
intentional, per Alex.

1. **Sheet width `max-w-5xl` (1024) → `max-w-6xl` (1152).** In `PageShell`. `PageContainer`
   `width="app"` bumps `max-w-5xl` → `max-w-6xl` to match; `width="read"` stays `65ch`. Desk gutters
   shrink but persist on wide viewports.
2. **Tonal hierarchy (content darker than nav).** Desk ▸ content ▸ nav, lightest at top.
   Achieved with **existing tokens, no new role**: `SiteHeader` gets explicit `bg-card`
   (light = `sand-0` white / dark = `sand-925`); the `PageShell` sheet body + footer switch
   `bg-card` → `bg-background` (light = `sand-50` / dark = `sand-950`). Cards stay `bg-card`, so they
   lift off the toned surface. Verified both modes keep `background` darker than `card`. Sidebar
   (`--sidebar` = `sand-100`) is **excluded** by Alex's rule and unchanged.

## Page-body authoring rules (all 7 pages)

- Compose `PageContainer` (`read` for prose, `app` for wider) + `PageHeader` (the single `<h1>`,
  from `typeScale`). No page sets its own max-width, horizontal padding, or ad-hoc `<h1>`.
- Whitespace only from `space.*`; type only from `typeScale`. No arbitrary `text-2xl`/`p-7`/`max-w-*`.
- **All internal navigation → `next/link` `<Link>`** (removes raw `<a href>` in about/resources).
  External links (resource list, emergency lines) keep `<a target="_blank" rel="noopener noreferrer">`.
- `[[ ]]` copy placeholders preserved; **Colorado-only**, no towns/cities, no invented claims.
- Mobile-first authored; each page lists explicit mobile behavior (below).

## Locked visual decisions (from the visual-companion session)

- **Hero:** real photo `public/bg/IMG_7869.JPG`, cropped **3:2 landscape**, rendered at its **true
  3:2** (not a fixed tall band). Left-weighted dark scrim; eyebrow + Fraunces headline + body + two
  CTAs overlaid on desktop. `next/image` with `fill` inside an `aspect-[3/2]` wrapper, `priority`,
  `sizes="100vw"`.
- **Gallery:** **masonry** (CSS `columns`, 3→2→1) so every photo stays whole (no crop); hover lift +
  subtle zoom; click → accessible **lightbox**.
- **Content tone:** nav white, content `sand-50`, cards white (decision A, "subtle").
- **Width:** 1152 sheet site-wide.

## Per-page designs

### Home (`(marketing)/page.tsx`) — lean

Hero → "Why Cal" trust row → closing CTA. (Alex chose lean: no gallery/services preview section.)

- **Hero:** as locked. Desktop overlays text on the 3:2 photo. **Mobile:** 3:2 at phone width is too
  short to hold headline + 2 buttons over it → **photo on top (3:2), eyebrow/headline/body/CTAs
  stacked beneath on the `sand-50` surface**; buttons full-width, ≥44px. (Shown + approved in
  companion as the intentional mobile pattern.)
- **Why Cal:** eyebrow + 3 `[[ ]]` points. Desktop 3-up centered; mobile stacked.
- **Closing CTA:** Fraunces line + `brand` "Book a service" on a hairline-topped band; mobile
  full-width button.

### About (`about/page.tsx`)

`width="read"`. `PageHeader` "About". Bio paragraphs, approach list, references → **`<Link>`** to
`/reviews`. **One framed photo** (a Cal-with-dog shot from the set), restrained, inset in the read
column. Mobile: single fluid read column; photo scales to full column width.

### Services (`services/page.tsx`)

`width="app"`. `PageHeader` + `[[BODY]]` subtitle. Active services as kit **`card`**s with headline
rates (existing `headlineRate(pricingType, pricingConfig)`), duration/max-pets meta. **Sliding-scale
CTA** = its own warm band/card (`[[HEADER]]`/`[[BODY]]`) + `brand` CTA → `/book` (a CTA, not a pricing
feature — per DESIGN.md). Empty → "services coming soon" stays. Mobile: cards 1-up; CTA full-width.

### Gallery (`gallery/page.tsx`)

`width="app"` (or full sheet width for the grid). `PageHeader` "Gallery" + eyebrow. **Masonry**
`columns-2 sm:columns-3` (1 col at smallest), `next/image` per photo at real intrinsic ratio.
Server component reads `public/gallery` filenames **+ dimensions** (`image-size`) → no layout shift;
`loading="lazy"`, `sizes` per breakpoint, `quality≈70`. Click opens **lightbox** (new component).
Mobile: 2→1 cols, **tap-to-open, swipe + arrow nav**, Esc/back to close.

### Reviews (`reviews/page.tsx`)

`width="read"`. `PageHeader` + `[[BODY]]`. Published reviews as kit cards with star rating;
`EmptyState` (kit) when none (replaces bare sentence). Existing `ReviewForm` aligned to `FormField`/
kit (inline validation, no layout invention). Mobile: cards stack; form full-width.

### Resources (`resources/page.tsx`)

`width="read"`. `PageHeader` "Resources". Local/emergency resources list (external `<a>` retained;
real emergency entries allowed, generic local ones stay `[[ ]]`). **FAQ = base-ui Accordion**
(`@base-ui/react` `accordion` confirmed present) — semantic, keyboard-operable, mobile tap-expand.
Mobile: single column.

### Book hub (`book/page.tsx`)

`width="app"`. `PageHeader` "Book a service" + subtitle. Service chooser as kit cards → `/book/[slug]`
(`<Link>`). Replace the raw `Could not load services` / empty strings with kit **`ErrorState`** /
**`EmptyState`**. **`book/[serviceSlug]` (Scheduler) is untouched — Phase 3.** Mobile: cards stack.

## Shared mechanics

- **Lightbox** — new reusable client component (e.g. `src/components/ui/lightbox.tsx`) over base-ui
  **Dialog** (read `node_modules/@base-ui/react/esm/dialog/*.d.ts` before wrapping). Requirements:
  focus-trap, Esc + click-out close, prev/next (buttons + ArrowLeft/Right), **touch swipe on mobile**,
  `aria-modal` + labelled, `next/image` for the active photo, `NN / 52` counter, warm-dark backdrop.
  Repo eslint bans `react-hooks/set-state-in-effect` — manage index by event handlers, not effects.
- **Images** — `next/image` everywhere. Hero uses `fill`+`aspect-[3/2]` (no intrinsic dims needed).
  Gallery uses real width/height from `image-size` (**add dep**). The **52 `public/gallery` + the
  `public/bg/IMG_7869.JPG`** files are committed (staged by path).
- **Alt text** — no captions yet; generic non-claim alt (placeholder convention), real captions later.
- **Accordion** — base-ui `accordion`, token-styled; native `<details>` only if a blocker appears.

## Mobile audit (acceptance, per page — re-verified in verification)

Folds in the **deferred 390px + keyboard-a11y walk** from the shell-unification phase. At ≤390px:
no horizontal scroll; hero readable (stacked pattern); masonry reflows to 1–2 cols; lightbox
swipeable + Esc/back closes + focus-trapped; FAQ accordion tap-expands; all buttons ≥44px + full-width
where stacked; nav drawer focus-trap/Esc intact; visible focus + `aria-current`; light **and** dark;
sheet shadow reads in dark.

## Out of scope

Scheduler Layers 1–2; `book/[serviceSlug]` Layer-3 restyle (Phase 3); account/admin page bodies;
admin input humanization (Phase 4); real copy (stays `[[ ]]`); real captions; account/auth bodies.

## Doc updates (same-commit rule)

- **FRONTEND.md** — record the 1152 sheet width, the nav/content tonal hierarchy rule, the lightbox
  pattern, and the gallery image-dimension approach. Add `--destructive-warm`/`--danger-warm` to the
  brand-token list (outstanding carry-forward from shell-unification).
- **DESIGN.md** — note the home hero photo (`public/bg/IMG_7869.JPG`), Gallery = real photos
  (`public/gallery`, masonry+lightbox), and the marketing pages now compose the system.

## Verification (per WORKFLOW Definition of Done)

- `npm run lint` + `npm run typecheck` + `npm run build` (page count holds) + `npm test` green —
  strict, no `any`.
- `/code-review` clean; then **manual `verify`**: walk all 7 routes on desktop **and** 390px mobile,
  light **and** dark; run the full **mobile audit** checklist above; confirm masonry/lightbox,
  keyboard nav, visible focus, `aria-current`, no h-scroll.
- Re-palette contract intact (no hardcoded color introduced; components reference semantic roles).

## Decomposition / next step

This spec is Phase 2 of the umbrella roadmap and is sized for **one** implementation plan. Next:
`writing-plans` → dependency-ordered plan (shell tweaks + shared mechanics first, then pages),
executed via `subagent-driven-development` (default), in-session on `main`. **Do not push** (Alex
batches the overhaul push to avoid a half-done prod deploy).
